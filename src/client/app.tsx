import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  FeedbackInspector,
  feedbackPinId,
  pinDotClassName,
} from "./components/feedback-inspector";
import { FullscreenReview } from "./components/fullscreen-review";
import { ScreenRail, type RailMode } from "./components/screen-rail";
import { createPinNumbers } from "../shared/export";
import {
  normalizePinCoordinates,
  type CreateFeedbackInput,
  type FeedbackRecord,
  type UpdateFeedbackInput,
} from "../shared/feedback";
import type { ReviewScreen } from "../shared/manifest";
import {
  FeedbackApiError,
  fetchFeedback,
  migrateLegacyFeedback,
  patchFeedback,
  postFeedback,
  removeFeedback,
} from "./feedback-api";

const projectId = "example";
const version = "live";

const screens: ReviewScreen[] = [
  { id: "landing", ordinal: 1, title: "Public landing", group: "Access", viewport: { width: 1440, height: 1000 } },
  { id: "bootstrap", ordinal: 2, title: "Session bootstrap", group: "Access", viewport: { width: 1440, height: 1000 } },
  { id: "dashboard", ordinal: 3, title: "Populated dashboard", group: "Portfolio", viewport: { width: 1440, height: 1000 } },
];

type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function App() {
  const [railMode, setRailMode] = useState<RailMode>("wide");
  const [selectedId, setSelectedId] = useState(screens[0].id);
  const [fullscreen, setFullscreen] = useState(false);
  const [feedbackRecords, setFeedbackRecords] = useState<FeedbackRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
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
  const ready = loadState.kind === "ready";

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: "loading" });
    (async () => {
      try {
        const warning = await migrateLegacyFeedback(projectId);
        const records = await fetchFeedback(projectId);
        if (cancelled) return;
        setFeedbackRecords(records);
        setNotice(warning);
        setLoadState({ kind: "ready" });
      } catch (error) {
        if (cancelled) return;
        setLoadState({
          kind: "error",
          message:
            error instanceof Error ? error.message : "Feedback could not load.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!draftPin) return;
    document
      .querySelector<HTMLTextAreaElement>('textarea[aria-label="Feedback note"]')
      ?.focus();
  }, [draftPin]);

  const upsertRecord = useCallback((record: FeedbackRecord) => {
    setFeedbackRecords((current) =>
      current.some((item) => item.id === record.id)
        ? current.map((item) => (item.id === record.id ? record : item))
        : [...current, record],
    );
  }, []);

  // Writes run one at a time. Each records the revision it replaced, so a
  // write queued behind this tab's own save is rebased onto that save instead
  // of failing; a change made elsewhere still surfaces as a 409 conflict.
  const mutationChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const ownRevisionsRef = useRef(new Map<string, string>());

  const enqueue = useCallback(<T,>(operation: () => Promise<T>) => {
    const run = mutationChainRef.current.catch(() => undefined).then(operation);
    mutationChainRef.current = run;
    return run;
  }, []);

  const latestOwnRevision = useCallback((id: string, expected: string) => {
    let revision = expected;
    while (ownRevisionsRef.current.has(`${id}@${revision}`)) {
      revision = ownRevisionsRef.current.get(`${id}@${revision}`)!;
    }
    return revision;
  }, []);

  const withConflictRefresh = useCallback(
    async <T,>(operation: () => Promise<T>) => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof FeedbackApiError && error.current) {
          upsertRecord(error.current);
        }
        throw error;
      }
    },
    [upsertRecord],
  );

  const createFeedback = useCallback(
    (input: CreateFeedbackInput) =>
      enqueue(async () => {
        const created = await postFeedback(projectId, input);
        upsertRecord(created);
        return created;
      }),
    [enqueue, upsertRecord],
  );

  const updateFeedback = useCallback(
    (id: string, input: UpdateFeedbackInput) =>
      enqueue(() =>
        withConflictRefresh(async () => {
          const expectedUpdatedAt = latestOwnRevision(id, input.expectedUpdatedAt);
          const updated = await patchFeedback(projectId, id, {
            ...input,
            expectedUpdatedAt,
          });
          ownRevisionsRef.current.set(`${id}@${expectedUpdatedAt}`, updated.updatedAt);
          upsertRecord(updated);
          return updated;
        }),
      ),
    [enqueue, latestOwnRevision, upsertRecord, withConflictRefresh],
  );

  const deleteFeedback = useCallback(
    (id: string, expectedUpdatedAt: string) =>
      enqueue(() =>
        withConflictRefresh(async () => {
          await removeFeedback(
            projectId,
            id,
            latestOwnRevision(id, expectedUpdatedAt),
          );
          setFeedbackRecords((current) =>
            current.filter((item) => item.id !== id),
          );
          setSelectedFeedbackId((current) => (current === id ? null : current));
        }),
      ),
    [enqueue, latestOwnRevision, withConflictRefresh],
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
      ready={ready}
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
      onDelete={deleteFeedback}
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
    >
      <button
        className="canvas-fullscreen-button"
        onClick={() => setFullscreen(true)}
        type="button"
      >
        View fullscreen
      </button>
      <div
        className="screen-frame"
        data-testid="screen-frame"
        onClick={(event) => {
          if (
            !addingFeedback ||
            !ready ||
            (event.target instanceof HTMLElement &&
              event.target.closest("button"))
          ) {
            return;
          }
          // Pins are stored relative to the screen frame, which keeps the
          // screen's aspect ratio, so they land on the same spot at any size.
          const rect = event.currentTarget.getBoundingClientRect();
          setDraftPin(
            normalizePinCoordinates(event.clientX, event.clientY, rect),
          );
          setSelectedFeedbackId(null);
        }}
        style={
          {
            "--screen-ratio": `${selected.viewport.width} / ${selected.viewport.height}`,
            "--screen-ratio-value":
              selected.viewport.width / selected.viewport.height,
          } as CSSProperties
        }
      >
        <div className="empty-canvas">
          <span className="eyebrow">
            {String(selected.ordinal).padStart(2, "0")} / {screens.length}
          </span>
          <h2>{selected.title}</h2>
          <span className="screen-frame-size">
            {selected.viewport.width} × {selected.viewport.height}
          </span>
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
                className={`feedback-pin ${pinDotClassName(item, item.id === selectedFeedbackId)}`}
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
              className="feedback-pin pin-dot feedback-pin-draft"
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
      {loadState.kind === "loading" ? (
        <p className="workbench-banner" role="status">
          Loading feedback…
        </p>
      ) : null}
      {loadState.kind === "error" ? (
        <div className="workbench-banner workbench-banner-error" role="alert">
          <span>Feedback could not load: {loadState.message}</span>
          <button onClick={() => setLoadAttempt((n) => n + 1)} type="button">
            Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="workbench-banner workbench-banner-error" role="alert">
          {notice}
        </p>
      ) : null}
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
