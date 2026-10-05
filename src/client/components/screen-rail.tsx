import { useState } from "react";

import type { ReviewScreen } from "../../shared/manifest";

export type RailMode = "wide" | "compact";

export function ScreenRail({
  screens,
  selectedId,
  mode,
  onModeChange,
  onSelect,
}: {
  screens: ReviewScreen[];
  selectedId: string;
  mode: RailMode;
  onModeChange: (mode: RailMode) => void;
  onSelect: (id: string) => void;
}) {
  const [temporaryExpanded, setTemporaryExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = mode === "wide" || temporaryExpanded || pinned;
  let previousGroup = "";

  return (
    <nav
      aria-label="Screen navigation"
      className="screen-rail"
      data-expanded={expanded}
      data-mode={mode}
      onFocus={() => mode === "compact" && setTemporaryExpanded(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !pinned) {
          setTemporaryExpanded(false);
        }
      }}
      onMouseEnter={() => mode === "compact" && setTemporaryExpanded(true)}
      onMouseLeave={() => !pinned && setTemporaryExpanded(false)}
    >
      <div className="rail-toolbar">
        <button
          aria-label={mode === "wide" ? undefined : "Show screen names"}
          className="rail-mode-button"
          title={mode === "wide" ? "Show numbers only" : "Show screen names"}
          onClick={() => {
            setPinned(false);
            setTemporaryExpanded(false);
            onModeChange(mode === "wide" ? "compact" : "wide");
          }}
          type="button"
        >
          {mode === "wide" ? (
            <>
              <span aria-hidden="true">«</span> Numbers only
            </>
          ) : (
            <span aria-hidden="true">»</span>
          )}
        </button>
        {mode === "compact" && expanded ? (
          <button
            aria-pressed={pinned}
            className="rail-pin-button"
            onClick={() => setPinned((value) => !value)}
            type="button"
          >
            {pinned ? "Unpin" : "Pin"}
          </button>
        ) : null}
      </div>
      <ol>
        {screens.map((screen) => {
          const showGroup = screen.group !== previousGroup;
          previousGroup = screen.group;
          return (
            <li key={screen.id}>
              {showGroup ? <h2>{screen.group}</h2> : null}
              <button
                aria-current={screen.id === selectedId ? "page" : undefined}
                aria-label={`${String(screen.ordinal).padStart(2, "0")}. ${screen.title}`}
                onClick={() => onSelect(screen.id)}
                title={screen.title}
                type="button"
              >
                <span className="screen-number">
                  {String(screen.ordinal).padStart(2, "0")}
                </span>
                <span className="screen-name">{screen.title}</span>
                <span aria-label="No open feedback" className="feedback-marker" />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
