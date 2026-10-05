import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/client/app";
import { FeedbackInspector } from "../src/client/components/feedback-inspector";
import { serializeMarkdown } from "../src/shared/export";
import type { FeedbackRecord } from "../src/shared/feedback";
import { installFakeFeedbackApi } from "./helpers/fake-feedback-api";

let api: Awaited<ReturnType<typeof installFakeFeedbackApi>>;

beforeEach(async () => {
  api = await installFakeFeedbackApi();
});

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await api.dispose();
});

function seed(screenId: string, note: string, minute: number) {
  return api.storage.createFeedback("example", {
    clientMutationId: crypto.randomUUID(),
    screenId,
    version: "live",
    x: 0.5,
    y: 0.5,
    note,
    category: minute % 2 ? "CONTENT" : "LAYOUT",
    priority: "IMPORTANT",
  });
}

async function selectComment(note: string) {
  fireEvent.click(await screen.findByText(note));
  return screen.findByRole("combobox", { name: "Feedback status" });
}

describe("export scope", () => {
  it("exports every screen, states the scope, and keeps on-screen pin numbers", async () => {
    await seed("landing", "Landing one", 0);
    await seed("landing", "Landing two", 1);
    await seed("dashboard", "Dashboard one", 2);
    const exported: string[] = [];
    const records = await api.storage.listFeedback("example");

    render(
      <FeedbackInspector
        draftPin={null}
        feedback={records}
        onCancelDraft={vi.fn()}
        onCreate={vi.fn()}
        onExport={(_format, contents) => exported.push(contents)}
        onRecoverDraft={vi.fn()}
        onSelectFeedback={vi.fn()}
        onStartPin={vi.fn()}
        onUpdate={vi.fn()}
        projectId="example"
        screens={[
          { id: "landing", ordinal: 1, title: "Landing", group: "A", viewport: { width: 1440, height: 1000 } },
          { id: "dashboard", ordinal: 2, title: "Dashboard", group: "A", viewport: { width: 1440, height: 1000 } },
        ]}
        selectedFeedbackId={null}
        selectedScreenId="landing"
        version="live"
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Category filter" }), {
      target: { value: "CONTENT" },
    });
    expect(document.querySelector(".feedback-export-scope")).toHaveTextContent(
      "All 2 screens · version live · filtered by category Content · 1 item",
    );
    fireEvent.click(screen.getByRole("button", { name: "Export Markdown" }));

    expect(exported[0]).toContain("_Scope: All 2 screens");
    expect(exported[0]).toContain("**Pin 2 ");
    expect(exported[0]).toContain("Landing two");
    expect(exported[0]).not.toContain("Landing one");
  });

  it("numbers filtered exports from the full set", () => {
    const base = {
      projectId: "p",
      screenId: "s",
      version: "live",
      x: 0,
      y: 0,
      category: "LAYOUT",
      priority: "POLISH",
      status: "OPEN",
      updatedAt: "2026-10-05T20:00:00.000Z",
    } as const;
    const first: FeedbackRecord = { ...base, id: "a", note: "A", createdAt: "2026-10-05T19:00:00.000Z" };
    const second: FeedbackRecord = { ...base, id: "b", note: "B", createdAt: "2026-10-05T19:30:00.000Z" };
    const markdown = serializeMarkdown({
      projectId: "p",
      screens: [],
      feedback: [second],
      allFeedback: [first, second],
    });
    expect(markdown).toContain("**Pin 2 ");
  });
});

describe("delete", () => {
  it("deletes a comment from disk after a second confirmation", async () => {
    await seed("landing", "Remove me", 0);
    render(<App />);
    await selectComment("Remove me");

    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(await api.storage.listFeedback("example")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(screen.queryByText("Remove me")).toBeNull());
    expect(await api.storage.listFeedback("example")).toEqual([]);
    expect(screen.queryByTestId("feedback-pin")).toBeNull();
  });
});

describe("serialized client writes", () => {
  it("applies a status change made while a note save is still in flight", async () => {
    await seed("landing", "Original", 0);
    render(<App />);
    const status = await selectComment("Original");

    fireEvent.change(screen.getByRole("textbox", { name: "Feedback note" }), {
      target: { value: "Edited note" },
    });
    const release = api.hold();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    fireEvent.change(status, { target: { value: "RESOLVED" } });
    release();

    await waitFor(async () => {
      const [record] = await api.storage.listFeedback("example");
      expect(record).toMatchObject({ note: "Edited note", status: "RESOLVED" });
    });
    expect(screen.getByRole("status")).not.toHaveTextContent(/Retry/);
  });

  it("still reports a conflict when another tab changed the record", async () => {
    const record = await seed("landing", "Shared", 0);
    render(<App />);
    const status = await selectComment("Shared");
    await api.storage.updateFeedback("example", record.id, {
      expectedUpdatedAt: record.updatedAt,
      patch: { note: "Changed in another tab" },
    });

    fireEvent.change(status, { target: { value: "RESOLVED" } });

    expect(await screen.findByText(/Retry required/)).toBeInTheDocument();
  });
});

describe("recovery validation", () => {
  it("ignores malformed recovery entries and keeps valid ones", async () => {
    localStorage.setItem(
      "screen-review-workbench.feedback-recovery.v1:example",
      JSON.stringify({
        "create:live:landing": {
          kind: "create",
          screenId: "landing",
          version: "live",
          x: 0.4,
          y: 0.6,
          note: "Valid draft",
          category: "CONTENT",
          priority: "POLISH",
        },
        "update:x": { kind: "update", note: 5, category: "NOPE" },
      }),
    );
    render(<App />);

    expect(
      await screen.findByRole("textbox", { name: "Feedback note" }),
    ).toHaveValue("Valid draft");
  });
});
