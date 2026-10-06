import { useEffect, useRef, useState } from "react";

import { CAPTION_MAX_LENGTH } from "../../shared/captions";

type ScreenCaptionProps = {
  // Reviewer-saved text for this version, if any.
  saved?: string;
  // Fallback from the project manifest.
  manifest?: string;
  disabled?: boolean;
  onSave: (text: string) => void;
};

// A strip above the capture saying exactly what it shows, so a reviewer knows
// which step, path or state they are looking at (and which they are not).
export function ScreenCaption({
  saved,
  manifest,
  disabled = false,
  onSave,
}: ScreenCaptionProps) {
  const text = saved ?? manifest ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [editing, text]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    // Saving the manifest text unchanged would only pin a copy of it.
    if (next === text.trim()) return;
    onSave(next === (manifest ?? "").trim() ? "" : next);
  };

  if (editing) {
    return (
      <div className="screen-caption" data-editing="true">
        <label className="screen-caption-label" htmlFor="screen-caption-input">
          Showing
        </label>
        <textarea
          aria-describedby="screen-caption-hint"
          id="screen-caption-input"
          maxLength={CAPTION_MAX_LENGTH}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(text);
              setEditing(false);
            }
          }}
          placeholder="e.g. Step 3 of 5, manual path selected"
          ref={inputRef}
          rows={1}
          value={draft}
        />
        <span className="screen-caption-hint" id="screen-caption-hint">
          Enter to save · Esc to cancel
          {saved && manifest ? " · clear to restore the default" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="screen-caption" data-empty={!text}>
      <span className="screen-caption-label">Showing</span>
      <button
        aria-label={
          text ? `What this shows: ${text}. Edit` : "Describe what this shows"
        }
        className="screen-caption-text"
        data-testid="screen-caption"
        disabled={disabled}
        onClick={() => setEditing(true)}
        type="button"
      >
        {text || "Describe what this screenshot shows: step, path, state"}
      </button>
    </div>
  );
}
