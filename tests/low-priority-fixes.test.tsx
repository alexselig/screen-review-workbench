import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/client/app";
import { ExportDialog } from "../src/client/components/export-dialog";
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
    tags: ["P1"],
  });
}

async function selectComment(note: string) {
  fireEvent.click(await screen.findByText(note));
  return screen.findByRole("combobox", { name: "Feedback status" });
}

describe("export scope", () => {
  const twoScreens = [
    {
      id: "landing",
      ordinal: 1,
      title: "Landing",
      description: "Landing review state.",
      group: "A",
      viewport: { width: 1440, height: 1000 },
    },
    {
      id: "dashboard",
      ordinal: 2,
      title: "Dashboard",
      description: "Dashboard review state.",
      group: "A",
      viewport: { width: 1440, height: 1000 },
    },
  ];

  it("exports from a footer dialog with format, screen and status options", async () => {
    await seed("landing", "Landing one", 0);
    await seed("landing", "Landing two", 1);
    await seed("dashboard", "Dashboard one", 2);
    const records = await api.storage.listFeedback("example");
    await api.storage.updateFeedback("example", records[0].id, {
      expectedUpdatedAt: records[0].updatedAt,
      patch: {
        status: "RESOLVED",
        reply: { note: "Completed the landing update.", author: "Agent" },
      },
    });
    const all = await api.storage.listFeedback("example");
    const exported: [string, string][] = [];
    const onClose = vi.fn();
    render(
      <ExportDialog
        feedback={all}
        onClose={onClose}
        onExport={(format, contents) => exported.push([format, contents])}
        projectId="example"
        screens={twoScreens}
        selectedScreenId="landing"
        version="live"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Export feedback" });
    expect(
      within(dialog).getByRole("radio", { name: "Markdown" }),
    ).toBeChecked();
    expect(dialog).toHaveTextContent("All 2 screens · version live · 3 items");

    fireEvent.click(
      within(dialog).getByRole("radio", { name: "This screen only" }),
    );
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Fixed" }));
    expect(dialog).toHaveTextContent(
      "Screen 01 Landing · version live · Backlog, In progress, Verified, Won't fix · 1 item",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));

    expect(onClose).toHaveBeenCalled();
    const [format, markdown] = exported[0];
    expect(format).toBe("markdown");
    // Pin numbers come from the full set, so pin 2 stays pin 2.
    expect(markdown).toContain("**Pin 2 ");
    expect(markdown).toContain("Landing two");
    expect(markdown).not.toContain("Landing one");
    expect(markdown).not.toContain("Dashboard one");
  });

  it("disables Download when nothing matches and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ExportDialog
        feedback={[]}
        onClose={onClose}
        projectId="example"
        screens={twoScreens}
        selectedScreenId="landing"
        version="live"
      />,
    );
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("opens the dialog from the footer Export button", async () => {
    await seed("landing", "Landing one", 0);
    render(<App />);
    const button = await screen.findByRole("button", { name: "Export" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Export feedback" });
    expect(dialog).toHaveTextContent("1 item");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Export Markdown" }),
    ).toBeNull();
  });

  it("numbers filtered exports from the full set", () => {
    const base = {
      projectId: "p",
      screenId: "s",
      version: "live",
      x: 0,
      y: 0,
      tags: ["P2"] as string[],
      status: "OPEN",
      updatedAt: "2026-10-05T20:00:00.000Z",
    } as const;
    const first: FeedbackRecord = {
      ...base,
      id: "a",
      note: "A",
      createdAt: "2026-10-05T19:00:00.000Z",
    };
    const second: FeedbackRecord = {
      ...base,
      id: "b",
      note: "B",
      createdAt: "2026-10-05T19:30:00.000Z",
    };
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
  it("collapses an open card with a chevron and deletes from a wide button", async () => {
    await seed("landing", "Keep me", 0);
    await seed("landing", "Drop me", 1);
    render(<App />);

    await selectComment("Keep me");
    fireEvent.change(screen.getByRole("textbox", { name: "Feedback note" }), {
      target: { value: "Kept and edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Collapse comment 1" }));
    expect(screen.queryByRole("textbox", { name: "Feedback note" })).toBeNull();
    await waitFor(async () => {
      const records = await api.storage.listFeedback("example");
      expect(records.map((r) => r.note)).toContain("Kept and edited");
    });

    // Collapsed cards keep the corner X as the delete entry point.
    expect(
      screen.getByRole("button", { name: "Delete comment 2" }),
    ).toHaveClass("feedback-delete-x");

    await selectComment("Drop me");
    expect(
      screen.queryByRole("button", { name: "Delete comment 1" }),
    ).toHaveClass("feedback-delete-x");
    const wide = screen.getByRole("button", { name: "Delete comment 2" });
    expect(wide).toHaveClass("feedback-delete-wide");
    fireEvent.click(wide);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(async () => {
      expect(await api.storage.listFeedback("example")).toHaveLength(1);
    });
  });

  it("deletes a comment from disk after a second confirmation", async () => {
    await seed("landing", "Remove me", 0);
    render(<App />);
    await selectComment("Remove me");

    fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(await api.storage.listFeedback("example")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
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
    fireEvent.change(screen.getByRole("textbox", { name: "Change summary" }), {
      target: { value: "Completed the requested edit." },
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

    fireEvent.change(screen.getByRole("textbox", { name: "Change summary" }), {
      target: { value: "Completed the requested edit." },
    });
    fireEvent.change(status, { target: { value: "RESOLVED" } });

    expect(await screen.findByText(/Retry required/)).toBeInTheDocument();
  });
});

describe("recovery validation", () => {
  it("ignores malformed recovery entries and keeps valid ones", async () => {
    localStorage.setItem(
      "screencheck.feedback-recovery.v1:example",
      JSON.stringify({
        "create:live:landing": {
          kind: "create",
          screenId: "landing",
          version: "live",
          x: 0.4,
          y: 0.6,
          note: "Valid draft",
          tags: ["P2"],
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
