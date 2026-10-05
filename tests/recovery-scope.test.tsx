import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedbackInspector } from "../src/client/components/feedback-inspector";

const screens = ["landing", "dashboard"].map((id, index) => ({
  id,
  ordinal: index + 1,
  title: id,
  group: "Access",
  viewport: { width: 1440, height: 1000 },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function inspector(selectedScreenId: string, onRecoverDraft = vi.fn()) {
  return (
    <FeedbackInspector
      draftPin={null}
      feedback={[]}
      onCancelDraft={vi.fn()}
      onCreate={vi.fn()}
      onRecoverDraft={onRecoverDraft}
      onSelectFeedback={vi.fn()}
      onUpdate={vi.fn()}
      projectId="demo"
      screens={screens}
      selectedFeedbackId={null}
      selectedScreenId={selectedScreenId}
      version="live"
    />
  );
}

describe("recovered draft scope", () => {
  it("keeps a recovered draft on its own screen", () => {
    localStorage.setItem(
      "screen-review-workbench.feedback-recovery.v1:demo",
      JSON.stringify({
        "create:live:landing": {
          kind: "create",
          screenId: "landing",
          version: "live",
          x: 0.4,
          y: 0.6,
          note: "Landing-only draft",
          tags: ["P2"],
        },
      }),
    );
    const onRecoverDraft = vi.fn();
    const view = render(inspector("landing", onRecoverDraft));
    expect(screen.getByRole("textbox", { name: "Feedback note" })).toHaveValue(
      "Landing-only draft",
    );

    view.rerender(inspector("dashboard", onRecoverDraft));
    expect(
      screen.queryByRole("textbox", { name: "Feedback note" }),
    ).not.toBeInTheDocument();

    onRecoverDraft.mockClear();
    view.rerender(inspector("landing", onRecoverDraft));
    expect(onRecoverDraft).toHaveBeenCalledWith({ x: 0.4, y: 0.6 });
    expect(screen.getByRole("textbox", { name: "Feedback note" })).toHaveValue(
      "Landing-only draft",
    );
  });
});
