import { useEffect, useRef, useState } from "react";

import type { ReviewScreen } from "../../shared/manifest";

export type RailMode = "wide" | "compact";

export function ScreenRail({
  screens,
  selectedId,
  openCounts,
  approvedIds,
  mode,
  onModeChange,
  onSelect,
}: {
  screens: ReviewScreen[];
  selectedId: string;
  openCounts?: ReadonlyMap<string, number>;
  approvedIds?: ReadonlySet<string>;
  mode: RailMode;
  // Omitted where the container controls collapse (the fullscreen drawer).
  onModeChange?: (mode: RailMode) => void;
  onSelect: (id: string) => void;
}) {
  const [temporaryExpanded, setTemporaryExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = mode === "wide" || temporaryExpanded || pinned;
  let previousGroup = "";
  let groupIndex = -1;
  const navRef = useRef<HTMLElement>(null);

  // Keep the current screen visible in the list without moving the page.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const strip = current.closest("ol");
    if (strip && strip.scrollWidth > strip.clientWidth) {
      const left = current.offsetLeft - strip.offsetLeft;
      if (
        left < strip.scrollLeft ||
        left + current.offsetWidth > strip.scrollLeft + strip.clientWidth
      ) {
        strip.scrollLeft = Math.max(0, left - 16);
      }
    }
    if (nav.scrollHeight <= nav.clientHeight) return;
    const top = current.offsetTop - nav.offsetTop;
    if (top < nav.scrollTop + 48) {
      nav.scrollTop = Math.max(0, top - 96);
    } else if (top + current.offsetHeight > nav.scrollTop + nav.clientHeight) {
      nav.scrollTop = top + current.offsetHeight - nav.clientHeight + 48;
    }
  }, [selectedId]);

  return (
    <nav
      aria-label="Screen navigation"
      ref={navRef}
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
        {expanded ? <h2 className="rail-title">Screen index</h2> : null}
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
        {onModeChange ? (
          <button
            aria-label={
              mode === "wide" ? "Collapse screen index" : "Expand screen index"
            }
            aria-expanded={mode === "wide"}
            className="rail-mode-button"
            title={
              mode === "wide" ? "Collapse to numbers" : "Expand screen index"
            }
            onClick={() => {
              setPinned(false);
              setTemporaryExpanded(false);
              onModeChange(mode === "wide" ? "compact" : "wide");
            }}
            type="button"
          >
            <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
              <path
                d={
                  mode === "wide"
                    ? "M9 3 4 8l5 5M13 3 8 8l5 5"
                    : "M3 3l5 5-5 5M7 3l5 5-5 5"
                }
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              />
            </svg>
          </button>
        ) : null}
      </div>
      <ol>
        {screens.map((screen) => {
          const showGroup = screen.group !== previousGroup;
          if (showGroup) groupIndex += 1;
          previousGroup = screen.group;
          const approved = approvedIds?.has(screen.id) ?? false;
          return (
            <li key={screen.id}>
              {showGroup ? (
                <h2 data-tone={groupIndex % 4} title={screen.group}>
                  <span className="group-full">{screen.group}</span>
                </h2>
              ) : null}
              <button
                aria-current={screen.id === selectedId ? "page" : undefined}
                aria-label={`${String(screen.ordinal).padStart(2, "0")}. ${screen.title}${approved ? " (approved)" : ""}`}
                onClick={() => onSelect(screen.id)}
                title={approved ? `${screen.title} · Approved` : screen.title}
                type="button"
              >
                <span className="screen-number">
                  {String(screen.ordinal).padStart(2, "0")}
                  {approved ? (
                    <svg
                      aria-hidden="true"
                      className="screen-approved-mark"
                      data-testid="screen-approved-mark"
                      viewBox="0 0 12 12"
                    >
                      <circle cx="6" cy="6" r="6" />
                      <path d="M3.2 6.2 5.2 8.1 8.9 4.2" />
                    </svg>
                  ) : null}
                </span>
                <span className="screen-name">{screen.title}</span>
                {openCounts?.get(screen.id) ? (
                  <span
                    aria-label={`${openCounts.get(screen.id)} open`}
                    className="feedback-marker has-open"
                    title={`${openCounts.get(screen.id)} open`}
                  >
                    {openCounts.get(screen.id)}
                  </span>
                ) : (
                  <span
                    aria-label="No open feedback"
                    className="feedback-marker"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
