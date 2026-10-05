import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  FeedbackInspector,
  feedbackPinId,
} from "./components/feedback-inspector";
import { FullscreenReview } from "./components/fullscreen-review";
import { ScreenRail, type RailMode } from "./components/screen-rail";
import { createPinNumbers } from "../shared/export";
import {
  createFeedbackInputSchema,
  feedbackRecordSchema,
  normalizePinCoordinates,
  updateFeedbackInputSchema,
  type CreateFeedbackInput,
  type FeedbackRecord,
  type UpdateFeedbackInput,
} from "../shared/feedback";
import type { ReviewScreen } from "../shared/manifest";

const projectId = "example";
const version = "live";
const feedbackStorageKey = `screen-review-workbench.feedback.v1:${projectId}`;

const screens: ReviewScreen[] = [
  { id: "landing", ordinal: 1, title: "Public landing", group: "Access", viewport: { width: 1440, height: 1000 } },
  { id: "bootstrap", ordinal: 2, title: "Session bootstrap", group: "Access", viewport: { width: 1440, height: 1000 } },
  { id: "dashboard", ordinal: 3, title: "Populated dashboard", group: "Portfolio", viewport: { width: 1440, height: 1000 } },
];

function loadFeedback(): FeedbackRecord[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(feedbackStorageKey);
  if (!raw) return [];
  try {
    return feedbackRecordSchema.array().parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function nextUpdatedAt(previous: string) {
  return new Date(
    Math.max(Date.now(), new Date(previous).getTime() + 1),
  ).toISOString();
}

export function App() {
  const [railMode, setRailMode] = useState<RailMode>("wide");
  const [selectedId, setSelectedId] = useState(screens[0].id);
  const [fullscreen, setFullscreen] = useState(false);
  const [feedbackRecords, setFeedbackRecords] =
    useState<FeedbackRecord[]>(loadFeedback);
  const feedbackRecordsRef = useRef(feedbackRecords);
  const [visibleFeedback, setVisibleFeedback] =
    useState<FeedbackRecord[]>(feedbackRecords);
  const [addingFeedback, setAddingFeedback] = useState(false);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(
    null,
  );
  const selected = useMemo(
    () => screens.find((screen) => screen.id === selectedId) ?? screens[0],
    [selectedId],
  );
  const pinNumbers = useMemo(
    () => createPinNumbers(feedbackRecords),
    [feedbackRecords],
  );

  useEffect(() => {
    if (!draftPin) return;
    document
      .querySelector<HTMLTextAreaElement>('textarea[aria-label="Feedback note"]')
      ?.focus();
  }, [draftPin]);

  const persistFeedback = useCallback((records: FeedbackRecord[]) => {
    feedbackRecordsRef.current = records;
    window.localStorage.setItem(feedbackStorageKey, JSON.stringify(records));
    setFeedbackRecords(records);
  }, []);

  const createFeedback = useCallback(
    async (rawInput: CreateFeedbackInput) => {
      const input = createFeedbackInputSchema.parse(rawInput);
      const currentFeedback = feedbackRecordsRef.current;
      const existing = currentFeedback.find(
        (item) => item.id === input.clientMutationId,
      );
      if (existing) return existing;
      const timestamp = new Date().toISOString();
      const created = feedbackRecordSchema.parse({
        id: input.clientMutationId,
        projectId,
        screenId: input.screenId,
        version: input.version,
        x: input.x,
        y: input.y,
        note: input.note,
        category: input.category,
        priority: input.priority,
        status: input.status,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      persistFeedback([...currentFeedback, created]);
      return created;
    },
    [persistFeedback],
  );

  const updateFeedback = useCallback(
    async (id: string, rawInput: UpdateFeedbackInput) => {
      const input = updateFeedbackInputSchema.parse(rawInput);
      const currentFeedback = feedbackRecordsRef.current;
      const current = currentFeedback.find((item) => item.id === id);
      if (!current) throw new Error(`Feedback not found: ${id}`);
      if (current.updatedAt !== input.expectedUpdatedAt) {
        throw new Error("Feedback changed after it was loaded.");
      }
      const updated = feedbackRecordSchema.parse({
        ...current,
        ...input.patch,
        updatedAt: nextUpdatedAt(current.updatedAt),
      });
      persistFeedback(
        currentFeedback.map((item) => (item.id === id ? updated : item)),
      );
      return updated;
    },
    [persistFeedback],
  );

  const selectScreen = useCallback((id: string) => {
    setSelectedId(id);
    setAddingFeedback(false);
    setDraftPin(null);
    setSelectedFeedbackId(null);
  }, []);

  const navigation = (
    <ScreenRail
      mode={railMode}
      onModeChange={setRailMode}
      onSelect={selectScreen}
      screens={screens}
      selectedId={selectedId}
    />
  );
  const feedback = (
    <FeedbackInspector
      draftPin={draftPin}
      feedback={feedbackRecords}
      onCancelDraft={() => {
        setAddingFeedback(false);
        setDraftPin(null);
      }}
      onCreate={createFeedback}
      onRecoverDraft={(pin) => {
        setAddingFeedback(true);
        setDraftPin(pin);
      }}
      onSelectFeedback={setSelectedFeedbackId}
      onStartPin={() => {
        setAddingFeedback(true);
        setDraftPin(null);
        setSelectedFeedbackId(null);
      }}
      onUpdate={updateFeedback}
      onVisibleFeedbackChange={setVisibleFeedback}
      projectId={projectId}
      screens={screens}
      selectedFeedbackId={selectedFeedbackId}
      selectedScreenId={selectedId}
      version={version}
    />
  );
  const canvas = (
    <section
      className="review-canvas"
      data-adding-feedback={addingFeedback}
      data-testid="canvas"
      onClick={(event) => {
        if (
          !addingFeedback ||
          (event.target instanceof HTMLElement &&
            event.target.closest("button"))
        ) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setDraftPin(
          normalizePinCoordinates(event.clientX, event.clientY, rect),
        );
        setSelectedFeedbackId(null);
      }}
    >
      <button
        className="canvas-fullscreen-button"
        onClick={() => setFullscreen(true)}
        type="button"
      >
        View fullscreen
      </button>
      <div className="empty-canvas">
        <span className="eyebrow">
          {String(selected.ordinal).padStart(2, "0")} / {screens.length}
        </span>
        <h2>{selected.title}</h2>
      </div>
      <div className="feedback-pin-layer" aria-label="Screen feedback pins">
        {visibleFeedback
          .filter(
            (item) =>
              item.screenId === selectedId && item.version === version,
          )
          .map((item) => (
            <button
              aria-controls={`feedback-comment-${item.id}`}
              aria-label={`Pin ${pinNumbers.get(item.id) ?? 0}: ${item.note}`}
              aria-pressed={item.id === selectedFeedbackId}
              className={`feedback-pin priority-${item.priority.toLowerCase()}`}
              data-testid="feedback-pin"
              id={feedbackPinId(item.id)}
              key={item.id}
              onClick={() => {
                setSelectedFeedbackId(item.id);
                document.getElementById(`feedback-comment-${item.id}`)?.focus();
              }}
              style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
              type="button"
            >
              {pinNumbers.get(item.id) ?? 0}
            </button>
          ))}
        {draftPin ? (
          <span
            className="feedback-pin feedback-pin-draft"
            data-testid="draft-pin"
            style={{
              left: `${draftPin.x * 100}%`,
              top: `${draftPin.y * 100}%`,
            }}
          >
            +
          </span>
        ) : null}
      </div>
    </section>
  );

  if (fullscreen) {
    return (
      <FullscreenReview
        feedback={feedback}
        navigation={navigation}
        onExit={() => setFullscreen(false)}
      >
        {canvas}
      </FullscreenReview>
    );
  }

  return (
    <main className="workbench-shell">
      <header className="workbench-header">
        <div>
          <span className="eyebrow">Design review</span>
          <h1>Screen Review Workbench</h1>
        </div>
        <span className="status-pill">Local</span>
      </header>
      <section
        className="workbench-grid"
        data-rail-mode={railMode}
        aria-label="Review workspace"
      >
        {navigation}
        {canvas}
        {feedback}
      </section>
    </main>
  );
}
