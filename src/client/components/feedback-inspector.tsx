import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { createPinNumbers } from "../../shared/export";
import {
  FEEDBACK_STATUSES,
  STATUS_LABELS,
  PRIORITY_TAGS,
  migrateLegacyTags,
  normalizeTags,
  normalizedCoordinateSchema,
  priorityTag,
  type CreateFeedbackInput,
  type FeedbackRecord,
  type FeedbackStatus,
  type UpdateFeedbackInput,
} from "../../shared/feedback";
import type { ReviewScreen } from "../../shared/manifest";
import { z } from "zod";

type Pin = { x: number; y: number };

const recoveryEntrySchema = z.preprocess(
  migrateLegacyTags,
  z.object({
    kind: z.enum(["create", "update"]),
    screenId: z.string().min(1),
    version: z.string().min(1),
    feedbackId: z.string().optional(),
    x: normalizedCoordinateSchema.optional(),
    y: normalizedCoordinateSchema.optional(),
    note: z.string(),
    tags: z.array(z.string()),
  }),
);

type RecoveryEntry = z.infer<typeof recoveryEntrySchema>;

type RecoveryEntries = Record<string, RecoveryEntry>;

type EditorState = {
  note: string;
  tags: string[];
  status: FeedbackStatus;
};

const EMPTY_EDITOR: EditorState = {
  note: "",
  tags: ["P1"],
  status: "OPEN",
};

// The pane is chunked by status, then by priority tag; empty chunks are hidden.
const STATUS_SECTIONS = FEEDBACK_STATUSES.map((status) => ({
  status,
  label: STATUS_LABELS[status],
}));

function isPriority(tag: string) {
  return (PRIORITY_TAGS as readonly string[]).includes(tag);
}

function sameTags(left: readonly string[], right: readonly string[]) {
  return left.join("\0") === right.join("\0");
}

const RECOVERY_PREFIX = "screen-review-workbench.feedback-recovery.v1:";
const NOTE_SAVE_DELAY_MS = 500;

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

// Shared by canvas pins and comment cards so a number reads as the same
// object in both places.
export function pinDotClassName(item: FeedbackRecord, selected: boolean) {
  return [
    "pin-dot",
    `priority-${(priorityTag(item.tags) ?? "none").toLowerCase()}`,
    item.status === "RESOLVED" ? "is-fixed" : "",
    item.status === "WONT_FIX" ? "is-closed" : "",
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
  onVisibleFeedbackChange,
  hiddenPinStatuses = [],
  onTogglePinStatus,
  approval,
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
  onVisibleFeedbackChange?: (feedback: FeedbackRecord[]) => void;
  hiddenPinStatuses?: readonly FeedbackStatus[];
  onTogglePinStatus?: (status: FeedbackStatus) => void;
  approval?: { approved: boolean; ready: boolean; onToggle: () => void };
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
          tags: recovery.tags,
          status: selected?.status ?? "OPEN",
        }
      : selected
        ? {
            note: selected.note,
            tags: selected.tags,
            status: selected.status,
          }
        : EMPTY_EDITOR;
  });
  const [tagDraft, setTagDraft] = useState("");
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
      [...screenFeedback].sort(
        (a, b) => (pinNumbers.get(a.id) ?? 0) - (pinNumbers.get(b.id) ?? 0),
      ),
    [pinNumbers, screenFeedback],
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
        tags: recovery.tags,
        status: selectedRecord?.status ?? "OPEN",
      });
    } else if (selectedRecord) {
      setEditor({
        note: selectedRecord.note,
        tags: selectedRecord.tags,
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
      tags: nextEditor.tags,
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
        if (!sameTags(nextEditor.tags, record.tags)) {
          patch.tags = nextEditor.tags;
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
              tags: updated.tags,
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
          tags: nextEditor.tags,
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

  function updateEditor(patch: Partial<Pick<EditorState, "note" | "tags">>) {
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
        !sameTags(editor.tags, updated.tags)
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
    void flushStatus(status);
  }

  function togglePriority(priority: string) {
    const others = editor.tags.filter((tag) => !isPriority(tag));
    updateEditor({
      tags: editor.tags.includes(priority) ? others : [priority, ...others],
    });
  }

  function addTag(raw: string) {
    const tag = raw.replace(/,/g, " ").trim();
    setTagDraft("");
    if (!tag) return;
    const upper = tag.toUpperCase();
    if (isPriority(upper)) {
      if (!editor.tags.includes(upper)) togglePriority(upper);
      return;
    }
    const tags = normalizeTags([...editor.tags, tag]).slice(0, 12);
    if (!sameTags(tags, editor.tags)) updateEditor({ tags });
  }

  function removeTag(tag: string) {
    updateEditor({ tags: editor.tags.filter((item) => item !== tag) });
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagDraft);
    } else if (event.key === "Backspace" && !tagDraft) {
      const last = editor.tags.filter((tag) => !isPriority(tag)).at(-1);
      if (last) removeTag(last);
    }
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

  function collapseEditor(item: FeedbackRecord) {
    // Save any pending note edit before the card collapses.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      void saveEditor(revisionRef.current, editor);
    }
    setConfirmingDeleteId(null);
    onSelectFeedback(null);
    document.getElementById(feedbackPinId(item.id))?.focus();
  }

  function collapseButton(item: FeedbackRecord) {
    return (
      <button
        aria-label={`Collapse comment ${pinNumbers.get(item.id) ?? 0}`}
        className="feedback-collapse"
        onClick={() => collapseEditor(item)}
        title="Collapse"
        type="button"
      >
        <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
          <path
            d="M2.5 9.5 7 5l4.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          />
        </svg>
      </button>
    );
  }

  function deleteBar(item: FeedbackRecord) {
    if (!onDelete || confirmingDeleteId === item.id) return null;
    return (
      <button
        aria-label={`Delete comment ${pinNumbers.get(item.id) ?? 0}`}
        className="feedback-delete-wide"
        onClick={() => {
          setDeleteMessage("");
          setConfirmingDeleteId(item.id);
        }}
        type="button"
      >
        Delete comment
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

  function renderItem(item: FeedbackRecord) {
    if (item.id === editingRecord?.id) {
      return (
        <li className="is-editing" key={item.id}>
          {editorSection}
          {deleteConfirm(item)}
        </li>
      );
    }
    const otherTags = item.tags.filter((tag) => !isPriority(tag));
    return (
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
            className={pinDotClassName(item, item.id === selectedFeedbackId)}
          >
            {pinNumbers.get(item.id) ?? 0}
          </span>
          <strong>{item.note}</strong>
          {otherTags.length ? (
            <span className="feedback-comment-tags">
              {otherTags.map((tag) => (
                <span className="tag-chip tag-custom" key={tag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </button>
        {deleteButton(item)}
        {deleteConfirm(item)}
      </li>
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
        {editingRecord ? collapseButton(editingRecord) : null}
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
      <fieldset className="feedback-tags">
        <legend>Tags</legend>
        <div className="feedback-tag-row">
          {PRIORITY_TAGS.map((priority) => (
            <button
              aria-pressed={editor.tags.includes(priority)}
              className={`tag-chip tag-suggested tag-${priority.toLowerCase()}`}
              key={priority}
              onClick={() => togglePriority(priority)}
              type="button"
            >
              {priority}
            </button>
          ))}
          {editor.tags
            .filter((tag) => !isPriority(tag))
            .map((tag) => (
              <span className="tag-chip tag-custom" key={tag}>
                {tag}
                <button
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => removeTag(tag)}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    height="10"
                    viewBox="0 0 10 10"
                    width="10"
                  >
                    <path
                      d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              </span>
            ))}
          <input
            aria-label="Add tag"
            className="feedback-tag-input"
            maxLength={32}
            onBlur={() => addTag(tagDraft)}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={onTagKeyDown}
            placeholder="Add tag"
            value={tagDraft}
          />
        </div>
      </fieldset>
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
                {STATUS_LABELS[status]}
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
      {editingRecord ? deleteBar(editingRecord) : null}
    </section>
  );

  return (
    <aside className="feedback-panel" aria-label="Feedback inspector">
      <header className="feedback-inspector-header">
        <div>
          <span className="eyebrow">Feedback</span>
          <strong>
            {visibleFeedback.length} comment
            {visibleFeedback.length === 1 ? "" : "s"}
          </strong>
        </div>
      </header>

      {visibleFeedback.length === 0 ? (
        <p className="feedback-empty">
          No feedback on this screen yet. Choose Add feedback, then click the
          screen to drop pin 1.
        </p>
      ) : null}

      {STATUS_SECTIONS.map((section) => {
        const items = visibleFeedback.filter(
          (item) => item.status === section.status,
        );
        if (items.length === 0) return null;
        // Comments without a priority tag sit after the P groups, unheaded.
        const untagged = items.filter((item) => !priorityTag(item.tags));
        const pinsHidden = hiddenPinStatuses.includes(section.status);
        return (
          <section
            aria-label={section.label}
            className={`feedback-section status-${section.status.toLowerCase()}`}
            key={section.status}
          >
            <h3 className="feedback-section-title">
              {section.label}
              <span className="feedback-count">{items.length}</span>
              {onTogglePinStatus ? (
                <button
                  aria-label={`${pinsHidden ? "Show" : "Hide"} ${section.label} pins`}
                  aria-pressed={pinsHidden}
                  className="feedback-section-pins"
                  onClick={() => onTogglePinStatus(section.status)}
                  type="button"
                >
                  {pinsHidden ? "Show pins" : "Hide pins"}
                </button>
              ) : null}
            </h3>
            {PRIORITY_TAGS.map((priority) => {
              const group = items.filter(
                (item) => priorityTag(item.tags) === priority,
              );
              if (group.length === 0) return null;
              return (
                <div
                  aria-label={`${section.label} ${priority}`}
                  className="feedback-group"
                  key={priority}
                  role="group"
                >
                  <h4
                    className={`feedback-group-title tag-${priority.toLowerCase()}`}
                  >
                    {priority}
                    <span className="feedback-count">{group.length}</span>
                  </h4>
                  <ol className="feedback-list">{group.map(renderItem)}</ol>
                </div>
              );
            })}
            {untagged.length ? (
              <ol className="feedback-list feedback-list-untagged">
                {untagged.map(renderItem)}
              </ol>
            ) : null}
          </section>
        );
      })}

      {showEditor && !editingRecord ? editorSection : null}

      {approval ? (
        <div className="screen-approval">
          <button
            aria-pressed={approval.approved}
            className="screen-approval-toggle"
            disabled={!approval.ready}
            onClick={approval.onToggle}
            title={approval.approved ? "Click to unapprove" : undefined}
            type="button"
          >
            <span aria-hidden="true" className="screen-approval-box">
              {approval.approved ? "✓" : ""}
            </span>
            {approval.approved ? "Screen approved" : "Approve screen"}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
