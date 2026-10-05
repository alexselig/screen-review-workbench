import { useEffect, useState, type ReactNode } from "react";

type OpenPanel = "navigation" | "feedback" | null;

export function FullscreenReview({
  children,
  navigation,
  feedback,
  onExit,
}: {
  children: ReactNode;
  navigation: ReactNode;
  feedback: ReactNode;
  onExit: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [pinnedPanel, setPinnedPanel] = useState<OpenPanel>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openPanel) {
        setOpenPanel(null);
        setPinnedPanel(null);
      } else {
        onExit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit, openPanel]);

  const panel = (side: Exclude<OpenPanel, null>, content: ReactNode) => (
    <div
      className={`fullscreen-edge fullscreen-edge-${side}`}
      data-open={openPanel === side}
      onFocus={() => setOpenPanel(side)}
      onMouseEnter={() => setOpenPanel(side)}
      onMouseLeave={() => {
        if (pinnedPanel !== side) setOpenPanel(null);
      }}
    >
      <button
        aria-expanded={openPanel === side}
        aria-label={`Open ${side} panel`}
        className="fullscreen-edge-handle"
        onClick={() => {
          const next = pinnedPanel === side ? null : side;
          setPinnedPanel(next);
          setOpenPanel(next);
        }}
        type="button"
      >
        {side === "navigation" ? "Screens" : "Feedback"}
      </button>
      <section className="fullscreen-edge-panel">{content}</section>
    </div>
  );

  return (
    <div className="fullscreen-review" data-testid="fullscreen-review">
      {panel("navigation", navigation)}
      <div className="fullscreen-canvas">{children}</div>
      {panel("feedback", feedback)}
    </div>
  );
}
