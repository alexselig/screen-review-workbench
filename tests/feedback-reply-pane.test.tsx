import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedbackInspector } from "../src/client/components/feedback-inspector";
import type { FeedbackRecord } from "../src/shared/feedback";

function record(overrides: Partial<FeedbackRecord>): FeedbackRecord {
  return {
    id: "a",
    projectId: "demo",
    screenId: "landing",
    version: "live",
    x: 0.5,
    y: 0.5,
    note: "Note",
    tags: ["P1"],
    status: "RESOLVED",
    createdAt: "2026-10-05T20:00:00.000Z",
    updatedAt: "2026-10-05T20:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("feedback replies in the pane", () => {
  it("shows the reply on a card and in the editor", () => {
    const reply = (note: string) => ({
      note,
      author: "Copilot",
      at: "2026-10-05T21:00:00.000Z",
    });
    render(
      <FeedbackInspector
        draftPin={null}
        feedback={[
          record({ id: "a", note: "Selected", reply: reply("Fixed the gap.") }),
          record({
            id: "b",
            note: "Other",
            createdAt: "2026-10-05T20:01:00.000Z",
            reply: reply("Moved the footer."),
          }),
          record({
            id: "c",
            note: "No reply",
            createdAt: "2026-10-05T20:02:00.000Z",
          }),
        ]}
        onCancelDraft={vi.fn()}
        onCreate={vi.fn()}
        onRecoverDraft={vi.fn()}
        onSelectFeedback={vi.fn()}
        onUpdate={vi.fn()}
        projectId="demo"
        screens={[]}
        selectedFeedbackId="a"
        selectedScreenId="landing"
        version="live"
      />,
    );
    const editor = screen.getByRole("region", { name: "Feedback editor" });
    expect(within(editor).getByTestId("feedback-reply")).toHaveTextContent(
      "Reply · Copilot ·",
    );
    expect(within(editor).getByText("Fixed the gap.")).toBeInTheDocument();

    const replies = screen.getAllByTestId("feedback-reply");
    expect(replies).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Other.*Moved the footer\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Pin 3 No reply$/ }),
    ).toBeInTheDocument();
  });
});
