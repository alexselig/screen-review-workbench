export function App() {
  return (
    <main className="workbench-shell">
      <header className="workbench-header">
        <div>
          <span className="eyebrow">Design review</span>
          <h1>Screen Review Workbench</h1>
        </div>
        <span className="status-pill">Local</span>
      </header>
      <section className="workbench-grid" aria-label="Review workspace">
        <nav className="screen-rail" aria-label="Screen navigation">
          <strong>01</strong>
          <span>Example screen</span>
        </nav>
        <section className="review-canvas">
          <div className="empty-canvas">
            <span className="eyebrow">No project selected</span>
            <h2>Register a project to begin reviewing live screens.</h2>
          </div>
        </section>
        <aside className="feedback-panel">
          <span className="eyebrow">Feedback</span>
          <p>Comments and pins will appear here.</p>
        </aside>
      </section>
    </main>
  );
}
