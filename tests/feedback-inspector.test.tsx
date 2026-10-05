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
import type {
  CreateFeedbackInput,
  FeedbackRecord,
  UpdateFeedbackInput,
} from "../src/shared/feedback";

const reviewScreens = [
  {
    id: "landing",
    ordinal: 1,
    title: "Public landing",
    group: "Access",
    viewport: { width: 1440, height: 1000 },
  },
];

function feedback(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: "feedback-1",
    projectId: "demo",
    screenId: "landing",
    version: "live",
    x: 0.25,
    y: 0.75,
    note: "Clarify the primary action.",
    category: "LAYOUT",
    priority: "IMPORTANT",
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

function renderInspector({
  initialFeedback = [feedback()],
  draftPin = null as { x: number; y: number } | null,
  onCreate = vi.fn(async (input: CreateFeedbackInput) =>
    feedback({
      id: input.clientMutationId,
      x: input.x,
      y: input.y,
      note: input.note,
      category: input.category,
      priority: input.priority,
    }),
  ),
  onUpdate = vi.fn(async (id: string, input: UpdateFeedbackInput) =>
    feedback({ id, ...input.patch, updatedAt: "2026-10-05T20:00:01.000Z" }),
  ),
  onRecoverDraft = vi.fn(),
}: {
  initialFeedback?: FeedbackRecord[];
  draftPin?: { x: number; y: number } | null;
  onCreate?: (input: CreateFeedbackInput) => Promise<FeedbackRecord>;
  onUpdate?: (
    id: string,
    input: UpdateFeedbackInput,
  ) => Promise<FeedbackRecord>;
  onRecoverDraft?: (pin: { x: number; y: number }) => void;
} = {}) {
  function Fixture() {
    const [records, setRecords] = useState(initialFeedback);
    const [selectedId, setSelectedId] = useState<string | null>(
      initialFeedback[0]?.id ?? null,
    );
    return (
      <FeedbackInspector
        draftPin={draftPin}
        feedback={records}
        onCancelDraft={vi.fn()}
        onCreate={async (input) => {
          const created = await onCreate(input);
          setRecords((current) => [...current, created]);
          return created;
        }}
        onRecoverDraft={onRecoverDraft}
        onSelectFeedback={setSelectedId}
        onUpdate={async (id, input) => {
          const updated = await onUpdate(id, input);
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
  return { ...render(<Fixture />), onCreate, onUpdate, onRecoverDraft };
}

describe("FeedbackInspector", () => {
  it("debounces note saves for 500ms", async () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn(async (id: string, input: UpdateFeedbackInput) =>
      feedback({ id, ...input.patch, updatedAt: "2026-10-05T20:00:01.000Z" }),
    );
    renderInspector({ onUpdate });

    fireEvent.change(screen.getByRole("textbox", { name: "Feedback note" }), {
      target: { value: "Use a direct call to action." },
    });
    await act(async () => vi.advanceTimersByTime(499));
    expect(onUpdate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));

    expect(onUpdate).toHaveBeenCalledWith("feedback-1", {
      expectedUpdatedAt: "2026-10-05T20:00:00.000Z",
      patch: { note: "Use a direct call to action." },
    });
  });

  it("flushes status immediately and clears a filter that would hide it", async () => {
    const onUpdate = vi.fn(async (id: string, input: UpdateFeedbackInput) =>
      feedback({ id, ...input.patch, updatedAt: "2026-10-05T20:00:01.000Z" }),
    );
    renderInspector({ onUpdate });
    fireEvent.change(screen.getByRole("combobox", { name: "Status filter" }), {
      target: { value: "OPEN" },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Feedback status" }), {
      target: { value: "RESOLVED" },
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("feedback-1", {
      expectedUpdatedAt: "2026-10-05T20:00:00.000Z",
      patch: { status: "RESOLVED" },
    });
    expect(screen.getByRole("combobox", { name: "Status filter" })).toHaveValue(
      "",
    );
  });

  it("rebases a pending note debounce after an immediate status flush", async () => {
    vi.useFakeTimers();
    const onUpdate = vi
      .fn<
        (
          id: string,
          input: UpdateFeedbackInput,
        ) => Promise<FeedbackRecord>
      >()
      .mockResolvedValueOnce(
        feedback({
          status: "IN_PROGRESS",
          updatedAt: "2026-10-05T20:00:01.000Z",
        }),
      )
      .mockResolvedValueOnce(
        feedback({
          note: "Pending note",
          status: "IN_PROGRESS",
          updatedAt: "2026-10-05T20:00:02.000Z",
        }),
      );
    renderInspector({ onUpdate });
    fireEvent.change(screen.getByRole("textbox", { name: "Feedback note" }), {
      target: { value: "Pending note" },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Feedback status" }), {
      target: { value: "IN_PROGRESS" },
    });
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTime(500));

    expect(onUpdate).toHaveBeenNthCalledWith(1, "feedback-1", {
      expectedUpdatedAt: "2026-10-05T20:00:00.000Z",
      patch: { status: "IN_PROGRESS" },
    });
    expect(onUpdate).toHaveBeenNthCalledWith(2, "feedback-1", {
      expectedUpdatedAt: "2026-10-05T20:00:01.000Z",
      patch: { note: "Pending note" },
    });
  });

  it("never repaints a focused textarea from an external record update", () => {
    let refreshRecords = () => {};
    function Fixture() {
      const [records, setRecords] = useState([feedback()]);
      refreshRecords = () =>
        setRecords([
          feedback({
            note: "Server replacement",
            updatedAt: "2026-10-05T20:00:05.000Z",
          }),
        ]);
      return (
        <FeedbackInspector
          draftPin={null}
          feedback={records}
          onCancelDraft={vi.fn()}
          onCreate={vi.fn()}
          onRecoverDraft={vi.fn()}
          onSelectFeedback={vi.fn()}
          onUpdate={vi.fn()}
          projectId="demo"
          screens={reviewScreens}
          selectedFeedbackId="feedback-1"
          selectedScreenId="landing"
          version="live"
        />
      );
    }
    render(<Fixture />);
    const note = screen.getByRole("textbox", { name: "Feedback note" });
    note.focus();
    fireEvent.change(note, { target: { value: "My in-progress edit" } });

    act(() => refreshRecords());

    expect(note).toHaveValue("My in-progress edit");
    expect(note).toHaveFocus();
  });

  it("recovers a locally saved draft after reload", () => {
    localStorage.setItem(
      "screen-review-workbench.feedback-recovery.v1:demo",
      JSON.stringify({
        "create:live:landing": {
          kind: "create",
          screenId: "landing",
          version: "live",
          x: 0.4,
          y: 0.6,
          note: "Recovered note",
          category: "CONTENT",
          priority: "POLISH",
        },
      }),
    );
    const onRecoverDraft = vi.fn();

    renderInspector({ initialFeedback: [], onRecoverDraft });

    expect(onRecoverDraft).toHaveBeenCalledWith({ x: 0.4, y: 0.6 });
    expect(screen.getByRole("textbox", { name: "Feedback note" })).toHaveValue(
      "Recovered note",
    );
  });

  it("filters comments and exports the filtered result", () => {
    const onExport = vi.fn();
    render(
      <FeedbackInspector
        draftPin={null}
        feedback={[
          feedback(),
          feedback({
            id: "feedback-2",
            category: "INTERACTION",
            note: "Fix hover behavior.",
          }),
        ]}
        onCancelDraft={vi.fn()}
        onCreate={vi.fn()}
        onExport={onExport}
        onRecoverDraft={vi.fn()}
        onSelectFeedback={vi.fn()}
        onUpdate={vi.fn()}
        projectId="demo"
        screens={reviewScreens}
        selectedFeedbackId={null}
        selectedScreenId="landing"
        version="live"
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Category filter" }), {
      target: { value: "INTERACTION" },
    });
    expect(screen.queryByText("Clarify the primary action.")).not.toBeInTheDocument();
    expect(screen.getByText("Fix hover behavior.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export Markdown" }));
    expect(onExport).toHaveBeenCalledWith(
      "markdown",
      expect.stringContaining("Fix hover behavior."),
    );
    expect(onExport.mock.calls[0][1]).not.toContain("Clarify the primary action.");
  });
});
