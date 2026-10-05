import { useMemo, useState } from "react";

import { FullscreenReview } from "./components/fullscreen-review";
import { ScreenRail, type RailMode } from "./components/screen-rail";
import type { ReviewScreen } from "../shared/manifest";

const screens: ReviewScreen[] = [
  { id: "landing", ordinal: 1, title: "Public landing", group: "Access", viewport: { width: 1440, height: 1000 } },
  { id: "bootstrap", ordinal: 2, title: "Session bootstrap", group: "Access", viewport: { width: 1440, height: 1000 } },
  { id: "dashboard", ordinal: 3, title: "Populated dashboard", group: "Portfolio", viewport: { width: 1440, height: 1000 } },
];

export function App() {
  const [railMode, setRailMode] = useState<RailMode>("wide");
  const [selectedId, setSelectedId] = useState(screens[0].id);
  const [fullscreen, setFullscreen] = useState(false);
  const selected = useMemo(
    () => screens.find((screen) => screen.id === selectedId) ?? screens[0],
    [selectedId],
  );
  const navigation = (
    <ScreenRail
      mode={railMode}
      onModeChange={setRailMode}
      onSelect={setSelectedId}
      screens={screens}
      selectedId={selectedId}
    />
  );
  const feedback = (
    <aside className="feedback-panel">
      <span className="eyebrow">Feedback</span>
      <p>Comments and pins for {selected.title} will appear here.</p>
    </aside>
  );
  const canvas = (
    <section className="review-canvas" data-testid="canvas">
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
