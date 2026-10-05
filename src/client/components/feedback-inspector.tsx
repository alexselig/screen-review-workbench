import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  createPinNumbers,
  serializeJson,
  serializeMarkdown,
} from "../../shared/export";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  feedbackCategorySchema,
  feedbackPrioritySchema,
  normalizedCoordinateSchema,
  type CreateFeedbackInput,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackRecord,
  type FeedbackStatus,
  type UpdateFeedbackInput,
} from "../../shared/feedback";
import type { ReviewScreen } from "../../shared/manifest";
import { z } from "zod";

type Pin = { x: number; y: number };

const recoveryEntrySchema = z.object({
  kind: z.enum(["create", "update"]),
  screenId: z.string().min(1),
  version: z.string().min(1),
  feedbackId: z.string().optional(),
  x: normalizedCoordinateSchema.optional(),
  y: normalizedCoordinateSchema.optional(),
  note: z.string(),
  category: feedbackCategorySchema,
  priority: feedbackPrioritySchema,
});

type RecoveryEntry = z.infer<typeof recoveryEntrySchema>;

type RecoveryEntries = Record<string, RecoveryEntry>;

type EditorState = {
  note: string;
  category: FeedbackCategory;
  priority: FeedbackPriority;
  status: FeedbackStatus;
};

type Filters = {
  category: FeedbackCategory | "";
  priority: FeedbackPriority | "";
  status: FeedbackStatus | "";
};

const EMPTY_EDITOR: EditorState = {
  note: "",
  category: "LAYOUT",
  priority: "IMPORTANT",
  status: "OPEN",
};

const EMPTY_FILTERS: Filters = {
  category: "",
  priority: "",
  status: "",
};

const RECOVERY_PREFIX = "screen-review-workbench.feedback-recovery.v1:";
const NOTE_SAVE_DELAY_MS = 500;

function readable(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function recoveryStorageKey(projectId: string) {
  return `${RECOVERY_PREFIX}${projectId}`;
}

function createRecoveryKey(version: string, screenId: string) {
  return `create:${version}:${screenId}`;
}

function updateRecoveryKey(id: string) {
  return `update:${id}`;
}

function readRecoveryEntries(projectId: string): RecoveryEntries {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(recoveryStorageKey(projectId));
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    // Drop malformed entries one by one so a single bad draft cannot break
    // the editor or hide the others.
    const entries: RecoveryEntries = {};
    for (const [key, value] of Object.entries(parsed)) {
      const entry = recoveryEntrySchema.safeParse(value);
      if (entry.success) entries[key] = entry.data;
    }
    return entries;
  } catch {
    return {};
  }
}

function recoveryPin(entry: RecoveryEntry | undefined): Pin | null {
  return entry?.kind === "create" &&
    typeof entry.x === "number" &&
    typeof entry.y === "number"
    ? { x: entry.x, y: entry.y }
    : null;
}

function writeRecovery(
  projectId: string,
  key: string,
  entry: RecoveryEntry | null,
) {
  const entries = readRecoveryEntries(projectId);
  if (entry) entries[key] = entry;
  else delete entries[key];
  const storageKey = recoveryStorageKey(projectId);
  if (Object.keys(entries).length === 0) {
    window.localStorage.removeItem(storageKey);
  } else {
    window.localStorage.setItem(storageKey, JSON.stringify(entries));
  }
}

function download(contents: string, fileName: string, type: string) {
  if (!URL.createObjectURL) return;
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Shared by canvas pins and comment cards so a number reads as the same
// object in both places.
export function pinDotClassName(item: FeedbackRecord, selected: boolean) {
  return [
    "pin-dot",
    `priority-${item.priority.toLowerCase()}`,
    item.status === "RESOLVED" || item.status === "WONT_FIX" ? "is-closed" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function feedbackPinId(id: string) {
  return `feedback-pin-${id}`;
}

function feedbackCommentId(id: string) {
  return `feedback-comment-${id}`;
}

export function FeedbackInspector({
  projectId,
  screens,
  selectedScreenId,
  version,
  feedback,
  draftPin,
  selectedFeedbackId,
  onCancelDraft,
  onRecoverDraft,
  onSelectFeedback,
  onCreate,
  onUpdate,
  onDelete,
  onExport,
  onVisibleFeedbackChange,
  ready = true,
  adding = false,
}: {
  projectId: string;
  screens: ReviewScreen[];
  selectedScreenId: string;
  version: string;
  feedback: FeedbackRecord[];
  draftPin: Pin | null;
  selectedFeedbackId: string | null;
  onCancelDraft: () => void;
  onRecoverDraft: (pin: Pin) => void;
  onSelectFeedback: (id: string | null) => void;
  onCreate: (input: CreateFeedbackInput) => Promise<FeedbackRecord>;
  onUpdate: (id: string, input: UpdateFeedbackInput) => Promise<FeedbackRecord>;
  onDelete?: (id: string, expectedUpdatedAt: string) => Promise<void>;
  onExport?: (format: "json" | "markdown", contents: string) => void;
  onVisibleFeedbackChange?: (feedback: FeedbackRecord[]) => void;
  ready?: boolean;
  adding?: boolean;
}) {
  const initialRecoveries = useMemo(
    () => readRecoveryEntries(projectId),
    [projectId],
  );
  const initialCreateRecovery =
    initialRecoveries[createRecoveryKey(version, selectedScreenId)];
  const [recoveredPin, setRecoveredPin] = useState<Pin | null>(() =>
    recoveryPin(initialCreateRecovery),
  );
  const recoveryScopeRef = useRef(`${version}:${selectedScreenId}`);
  const [editor, setEditor] = useState<EditorState>(() => {
    const selected = feedback.find((item) => item.id === selectedFeedbackId);
    const recovery = selected
      ? initialRecoveries[updateRecoveryKey(selected.id)]
      : initialCreateRecovery;
    return recovery
      ? {
          note: recovery.note,
          category: recovery.category,
          priority: recovery.priority,
          status: selected?.status ?? "OPEN",
        }
      : selected
        ? {
            note: selected.note,
            category: selected.category,
            priority: selected.priority,
            status: selected.status,
          }
        : EMPTY_EDITOR;
  });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [saveMessage, setSaveMessage] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [deleteMessage, setDeleteMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const latestRecordRef = useRef<FeedbackRecord | null>(null);
  const effectiveDraftPin = draftPin ?? recoveredPin;

  const screenFeedback = useMemo(
    () =>
      feedback.filter(
        (item) =>
          item.screenId === selectedScreenId && item.version === version,
      ),
    [feedback, selectedScreenId, version],
  );
  const pinNumbers = useMemo(() => createPinNumbers(feedback), [feedback]);
  const visibleFeedback = useMemo(
    () =>
      screenFeedback
        .filter(
          (item) =>
            (!filters.category || item.category === filters.category) &&
            (!filters.priority || item.priority === filters.priority) &&
            (!filters.status || item.status === filters.status),
        )
        .sort(
          (a, b) => (pinNumbers.get(a.id) ?? 0) - (pinNumbers.get(b.id) ?? 0),
        ),
    [filters, pinNumbers, screenFeedback],
  );
  const selectedRecord =
    screenFeedback.find((item) => item.id === selectedFeedbackId) ?? null;
  const visibleSelectedRecord =
    visibleFeedback.find((item) => item.id === selectedFeedbackId) ?? null;

  latestRecordRef.current = selectedRecord;

  useEffect(() => {
    setConfirmingDeleteId(null);
    setDeleteMessage("");
  }, [selectedFeedbackId]);

  useEffect(() => {
    onVisibleFeedbackChange?.(visibleFeedback);
  }, [onVisibleFeedbackChange, visibleFeedback]);

  // A recovered draft belongs to one screen and version; re-read it whenever
  // either changes so it never follows the reviewer to another screen.
  useEffect(() => {
    const scope = `${version}:${selectedScreenId}`;
    if (recoveryScopeRef.current === scope) return;
    recoveryScopeRef.current = scope;
    setRecoveredPin(
      recoveryPin(
        readRecoveryEntries(projectId)[
          createRecoveryKey(version, selectedScreenId)
        ],
      ),
    );
  }, [projectId, selectedScreenId, version]);

  useEffect(() => {
    if (recoveredPin) onRecoverDraft(recoveredPin);
  }, [onRecoverDraft, recoveredPin]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current === document.activeElement) return;
    const recoveries = readRecoveryEntries(projectId);
    const recovery = selectedRecord
      ? recoveries[updateRecoveryKey(selectedRecord.id)]
      : recoveries[createRecoveryKey(version, selectedScreenId)];
    if (recovery) {
      setEditor({
        note: recovery.note,
        category: recovery.category,
        priority: recovery.priority,
        status: selectedRecord?.status ?? "OPEN",
      });
    } else if (selectedRecord) {
      setEditor({
        note: selectedRecord.note,
        category: selectedRecord.category,
        priority: selectedRecord.priority,
        status: selectedRecord.status,
      });
    } else if (!effectiveDraftPin) {
      setEditor(EMPTY_EDITOR);
    }
  }, [effectiveDraftPin, projectId, selectedRecord, selectedScreenId, version]);

  function currentRecoveryKey() {
    return selectedRecord
      ? updateRecoveryKey(selectedRecord.id)
      : createRecoveryKey(version, selectedScreenId);
  }

  function persistLocal(nextEditor: EditorState) {
    const record = latestRecordRef.current;
    const pin = effectiveDraftPin;
    if (!record && !pin) return;
    writeRecovery(projectId, currentRecoveryKey(), {
      kind: record ? "update" : "create",
      screenId: selectedScreenId,
      version,
      feedbackId: record?.id,
      x: pin?.x,
      y: pin?.y,
      note: nextEditor.note,
      category: nextEditor.category,
      priority: nextEditor.priority,
    });
    setSaveMessage("Unsaved locally");
  }

  async function saveEditor(revision: number, nextEditor: EditorState) {
    const record = latestRecordRef.current;
    const pin = effectiveDraftPin;
    if (!nextEditor.note.trim() || (!record && !pin)) return;
    setSaveMessage("Saving…");
    try {
      if (record) {
        const patch: UpdateFeedbackInput["patch"] = {};
        const note = nextEditor.note.trim();
        if (note !== record.note) patch.note = note;
        if (nextEditor.category !== record.category) {
          patch.category = nextEditor.category;
        }
        if (nextEditor.priority !== record.priority) {
          patch.priority = nextEditor.priority;
        }
        if (Object.keys(patch).length === 0) {
          writeRecovery(projectId, updateRecoveryKey(record.id), null);
          setSaveMessage("Saved");
          return;
        }
        const updated = await onUpdate(record.id, {
          expectedUpdatedAt: record.updatedAt,
          patch,
        });
        latestRecordRef.current = updated;
        if (revision === revisionRef.current) {
          writeRecovery(projectId, updateRecoveryKey(record.id), null);
          setSaveMessage("Saved");
          if (textareaRef.current !== document.activeElement) {
            setEditor({
              note: updated.note,
              category: updated.category,
              priority: updated.priority,
              status: updated.status,
            });
          }
        }
      } else if (pin) {
        const created = await onCreate({
          clientMutationId: crypto.randomUUID(),
          screenId: selectedScreenId,
          version,
          x: pin.x,
          y: pin.y,
          note: nextEditor.note.trim(),
          category: nextEditor.category,
          priority: nextEditor.priority,
          status: "OPEN",
        });
        if (revision === revisionRef.current) {
          writeRecovery(
            projectId,
            createRecoveryKey(version, selectedScreenId),
            null,
          );
          setRecoveredPin(null);
          onSelectFeedback(created.id);
          onCancelDraft();
          setSaveMessage("Saved");
        }
      }
    } catch (error) {
      setSaveMessage(
        error instanceof Error
          ? `Retry required: ${error.message}`
          : "Retry required",
      );
    }
  }

  function scheduleSave(nextEditor: EditorState) {
    persistLocal(nextEditor);
    const revision = ++revisionRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveEditor(revision, nextEditor);
    }, NOTE_SAVE_DELAY_MS);
  }

  function updateEditor(
    patch: Partial<Pick<EditorState, "note" | "category" | "priority">>,
  ) {
    const next = { ...editor, ...patch };
    setEditor(next);
    scheduleSave(next);
  }

  async function flushStatus(status: FeedbackStatus) {
    const record = latestRecordRef.current;
    if (!record || status === record.status) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSaveMessage("Saving…");
    try {
      const updated = await onUpdate(record.id, {
        expectedUpdatedAt: record.updatedAt,
        patch: { status },
      });
      latestRecordRef.current = updated;
      setSaveMessage("Saved");
      if (
        editor.note !== updated.note ||
        editor.category !== updated.category ||
        editor.priority !== updated.priority
      ) {
        scheduleSave({ ...editor, status });
      }
    } catch (error) {
      setSaveMessage(
        error instanceof Error
          ? `Retry required: ${error.message}`
          : "Retry required",
      );
    }
  }

  function changeStatus(event: ChangeEvent<HTMLSelectElement>) {
    const status = event.target.value as FeedbackStatus;
    setEditor((current) => ({ ...current, status }));
    if (filters.status && filters.status !== status) {
      setFilters((current) => ({ ...current, status: "" }));
    }
    void flushStatus(status);
  }

  const matchesFilters = (item: FeedbackRecord) =>
    (!filters.category || item.category === filters.category) &&
    (!filters.priority || item.priority === filters.priority) &&
    (!filters.status || item.status === filters.status);
  const versionFeedback = feedback.filter((item) => item.version === version);
  const exportRecords = versionFeedback.filter(matchesFilters);
  const activeFilters = [
    filters.category && `category ${readable(filters.category)}`,
    filters.priority && `priority ${readable(filters.priority)}`,
    filters.status && `status ${readable(filters.status)}`,
  ].filter(Boolean);
  const exportScope = `All ${screens.length} screens · version ${version} · ${
    activeFilters.length
      ? `filtered by ${activeFilters.join(", ")}`
      : "no filters"
  } · ${exportRecords.length} item${exportRecords.length === 1 ? "" : "s"}`;

  function exportFeedback(format: "json" | "markdown") {
    const input = {
      projectId,
      screens,
      feedback: exportRecords,
      allFeedback: versionFeedback,
      scope: exportScope,
    };
    const contents =
      format === "json" ? serializeJson(input) : serializeMarkdown(input);
    if (onExport) {
      onExport(format, contents);
      return;
    }
    download(
      contents,
      `${projectId}-feedback.${format === "json" ? "json" : "md"}`,
      format === "json" ? "application/json" : "text/markdown",
    );
  }

  async function confirmDelete(id: string) {
    const isSelected = latestRecordRef.current?.id === id;
    const record = isSelected
      ? latestRecordRef.current
      : (feedback.find((item) => item.id === id) ?? null);
    if (!record || !onDelete) return;
    if (isSelected && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDeleteMessage("Deleting…");
    try {
      await onDelete(record.id, record.updatedAt);
      writeRecovery(projectId, updateRecoveryKey(record.id), null);
      setConfirmingDeleteId(null);
      setDeleteMessage("");
      setSaveMessage("Deleted");
    } catch (error) {
      setDeleteMessage(
        error instanceof Error
          ? `Retry required: ${error.message}`
          : "Retry required",
      );
    }
  }

  function deleteButton(item: FeedbackRecord) {
    if (!onDelete) return null;
    return (
      <button
        aria-expanded={confirmingDeleteId === item.id}
        aria-label={`Delete comment ${pinNumbers.get(item.id) ?? 0}`}
        className="feedback-delete-x"
        onClick={() => {
          setDeleteMessage("");
          setConfirmingDeleteId(item.id);
        }}
        title="Delete comment"
        type="button"
      >
        <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
          <path
            d="M2 2l10 10M12 2 2 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          />
        </svg>
      </button>
    );
  }

  function deleteConfirm(item: FeedbackRecord) {
    if (confirmingDeleteId !== item.id) return null;
    return (
      <div
        aria-label="Confirm delete"
        className="feedback-delete-confirm"
        role="group"
      >
        <span>Delete pin {pinNumbers.get(item.id) ?? 0} and its comment?</span>
        <button
          className="feedback-delete-button"
          onClick={() => void confirmDelete(item.id)}
          type="button"
        >
          Confirm delete
        </button>
        <button onClick={() => setConfirmingDeleteId(null)} type="button">
          Keep
        </button>
        {deleteMessage ? (
          <span aria-live="polite" role="status">
            {deleteMessage}
          </span>
        ) : null}
      </div>
    );
  }

  const showEditor = Boolean(effectiveDraftPin || visibleSelectedRecord);
  // The comment being edited renders as the editor in its own list slot, so it
  // never appears twice (once as a saved card and again in the editor).
  const editingRecord = effectiveDraftPin ? null : visibleSelectedRecord;
  const editorSection = (
    <section className="feedback-editor" aria-label="Feedback editor">
      <header className="feedback-editor-header">
        {editingRecord ? (
          <span
            aria-label={`Pin ${pinNumbers.get(editingRecord.id) ?? 0}`}
            className={pinDotClassName(editingRecord, true)}
          >
            {pinNumbers.get(editingRecord.id) ?? 0}
          </span>
        ) : (
          <span aria-hidden="true" className="pin-dot feedback-pin-draft">
            +
          </span>
        )}
        <span className="feedback-comment-meta">
          {editingRecord
            ? `Editing pin ${pinNumbers.get(editingRecord.id) ?? 0}`
            : "New pin"}
        </span>
        {editingRecord ? deleteButton(editingRecord) : null}
      </header>
      <label>
        Feedback note
        <textarea
          aria-label="Feedback note"
          onChange={(event) => updateEditor({ note: event.target.value })}
          ref={textareaRef}
          value={editor.note}
        />
      </label>
      <div className="feedback-editor-taxonomy">
        <label>
          Category
          <select
            aria-label="Feedback category"
            onChange={(event) =>
              updateEditor({
                category: event.target.value as FeedbackCategory,
              })
            }
            value={editor.category}
          >
            {FEEDBACK_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {readable(category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            aria-label="Feedback priority"
            onChange={(event) =>
              updateEditor({
                priority: event.target.value as FeedbackPriority,
              })
            }
            value={editor.priority}
          >
            {FEEDBACK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {readable(priority)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visibleSelectedRecord ? (
        <label>
          Status
          <select
            aria-label="Feedback status"
            onChange={changeStatus}
            value={editor.status}
          >
            {FEEDBACK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {readable(status)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {effectiveDraftPin ? (
        <button
          className="feedback-cancel-button"
          onClick={() => {
            writeRecovery(
              projectId,
              createRecoveryKey(version, selectedScreenId),
              null,
            );
            setRecoveredPin(null);
            setEditor(EMPTY_EDITOR);
            onCancelDraft();
          }}
          type="button"
        >
          Cancel pin
        </button>
      ) : null}
      <span aria-live="polite" className="feedback-save-state" role="status">
        {saveMessage}
      </span>
    </section>
  );

  return (
    <aside className="feedback-panel" aria-label="Feedback inspector">
      <header className="feedback-inspector-header">
        <div>
          <span className="eyebrow">Feedback</span>
          <strong>{visibleFeedback.length} visible</strong>
        </div>
      </header>

      <div className="feedback-filters" aria-label="Feedback filters">
        <label>
          Category
          <select
            aria-label="Category filter"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                category: event.target.value as Filters["category"],
              }))
            }
            value={filters.category}
          >
            <option value="">All</option>
            {FEEDBACK_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {readable(category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            aria-label="Priority filter"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                priority: event.target.value as Filters["priority"],
              }))
            }
            value={filters.priority}
          >
            <option value="">All</option>
            {FEEDBACK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {readable(priority)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Status filter"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as Filters["status"],
              }))
            }
            value={filters.status}
          >
            <option value="">All</option>
            {FEEDBACK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {readable(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleFeedback.length === 0 ? (
        <p className="feedback-empty">
          {screenFeedback.length === 0
            ? "No feedback on this screen yet. Choose Add feedback, then click the screen to drop pin 1."
            : "No comments on this screen match these filters."}
        </p>
      ) : null}

      <ol className="feedback-list">
        {visibleFeedback.map((item) =>
          item.id === editingRecord?.id ? (
            <li className="is-editing" key={item.id}>
              {editorSection}
              {deleteConfirm(item)}
            </li>
          ) : (
            <li key={item.id}>
              <button
                aria-controls={feedbackPinId(item.id)}
                aria-pressed={item.id === selectedFeedbackId}
                className={`feedback-comment status-${item.status.toLowerCase()}`}
                id={feedbackCommentId(item.id)}
                onClick={() => {
                  onSelectFeedback(item.id);
                  document.getElementById(feedbackPinId(item.id))?.focus();
                }}
                type="button"
              >
                <span
                  aria-label={`Pin ${pinNumbers.get(item.id) ?? 0}`}
                  className={pinDotClassName(
                    item,
                    item.id === selectedFeedbackId,
                  )}
                >
                  {pinNumbers.get(item.id) ?? 0}
                </span>
                <span className="feedback-comment-meta">
                  {readable(item.priority)} · {readable(item.category)}
                </span>
                <strong>{item.note}</strong>
                <span className="feedback-comment-meta">
                  {readable(item.status)}
                </span>
              </button>
              {deleteButton(item)}
              {deleteConfirm(item)}
            </li>
          ),
        )}
      </ol>

      {showEditor && !editingRecord ? editorSection : null}

      <footer className="feedback-export-actions">
        <p className="feedback-export-scope">
          <strong>Export</strong> {exportScope}
        </p>
        <button
          aria-label="Export JSON"
          onClick={() => exportFeedback("json")}
          type="button"
        >
          JSON
        </button>
        <button
          aria-label="Export Markdown"
          onClick={() => exportFeedback("markdown")}
          type="button"
        >
          Markdown
        </button>
      </footer>
    </aside>
  );
}
