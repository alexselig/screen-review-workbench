import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedbackInspector } from "../src/client/components/feedback-inspector";
import type { FeedbackRecord } from "../src/shared/feedback";

const reviewScreens = [
  {
    id: "landing",
    ordinal: 1,
    title: "Public landing",
    group: "Access",
    viewport: { width: 1440, height: 1000 },
  },
] as Parameters<typeof FeedbackInspector>[0]["screens"];

function feedback(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: "feedback-1",
    projectId: "demo",
    screenId: "landing",
    version: "live",
    x: 0.25,
    y: 0.75,
    note: "Existing comment.",
    tags: ["P1"],
    status: "OPEN",
    createdAt: "2026-10-05T20:00:00.000Z",
    updatedAt: "2026-10-05T20:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

function Fixture() {
  const [records, setRecords] = useState([feedback()]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>({
    x: 0.4,
    y: 0.6,
  });
  return (
    <FeedbackInspector
      draftPin={draftPin}
      feedback={records}
      onCancelDraft={() => setDraftPin(null)}
      onCreate={async (input) => {
        const created = feedback({
          id: input.clientMutationId,
          x: input.x,
          y: input.y,
          note: input.note,
          tags: input.tags ?? [],
          status: input.status ?? "OPEN",
        });
        setRecords((current) => [...current, created]);
        return created;
      }}
      onRecoverDraft={vi.fn()}
      onSelectFeedback={(id) => {
        setSelectedId(id);
        if (id) setDraftPin(null);
      }}
      onUpdate={async (id, input) => {
        const updated = feedback({
          id,
          ...(input.patch as Partial<FeedbackRecord>),
        });
        setRecords((current) =>
          current.map((item) => (item.id === id ? updated : item)),
        );
        return updated;
      }}
      projectId="demo"
      screens={reviewScreens}
      selectedFeedbackId={selectedId}
      selectedScreenId="landing"
      version="live"
    />
  );
}

describe("fresh comment", () => {
  it("keeps the create layout through the first save and lands in Backlog", async () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    render(<Fixture />);

    expect(screen.queryByLabelText("Feedback status")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Feedback note" }), {
      target: { value: "The header wraps." },
    });
    await act(async () => vi.advanceTimersByTime(600));

    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.queryByLabelText("Feedback status")).toBeNull();
    expect(screen.queryByLabelText(/Change summary/i)).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Feedback note" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Collapse Backlog comments" }),
    ).toBeInTheDocument();
  });
});
