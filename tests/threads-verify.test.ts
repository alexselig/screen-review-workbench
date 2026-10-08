// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleApi } from "../src/server/api";
import { createFeedbackStorage } from "../src/server/storage";
import { serializeJson, serializeMarkdown } from "../src/shared/export";
import {
  feedbackRecordSchema,
  type FeedbackRecord,
} from "../src/shared/feedback";

const legacy = {
  id: "a",
  projectId: "demo",
  screenId: "landing",
  version: "live",
  x: 0.5,
  y: 0.5,
  note: "Footer floats.",
  tags: ["P1"],
  status: "RESOLVED",
  createdAt: "2026-10-05T19:00:00.000Z",
  updatedAt: "2026-10-05T19:00:00.000Z",
};
const legacyReply = {
  note: "Pinned it to the end.",
  author: "Copilot",
  at: "2026-10-05T20:00:00.000Z",
};

describe("thread migration", () => {
  it("reads a legacy reply as the first agent message", () => {
    const record = feedbackRecordSchema.parse({
      ...legacy,
      reply: legacyReply,
    });
    expect(record.thread).toEqual([
      {
        id: "legacy-reply",
        role: "agent",
        author: "Copilot",
        note: "Pinned it to the end.",
        at: "2026-10-05T20:00:00.000Z",
      },
    ]);
    expect(record.reply).toEqual(legacyReply);
  });

  it("reads a record without reply or thread as an empty thread", () => {
    const record = feedbackRecordSchema.parse(legacy);
    expect(record.thread).toEqual([]);
    expect(record).not.toHaveProperty("reply");
  });

  it("derives reply from the latest agent message, ignoring a stale one", () => {
    const record = feedbackRecordSchema.parse({
      ...legacy,
      reply: { ...legacyReply, note: "Stale" },
      thread: [
        {
          id: "1",
          role: "agent",
          author: "Copilot",
          note: "First",
          at: legacyReply.at,
        },
        {
          id: "2",
          role: "reviewer",
          author: "Reviewer",
          note: "Still broken",
          at: "2026-10-05T21:00:00.000Z",
          status: "OPEN",
        },
      ],
    });
    expect(record.reply).toEqual({ ...legacyReply, note: "First" });
    expect(record.thread).toHaveLength(2);
  });
});

describe("feedback.json schema version", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(process.cwd(), "tests/.feedback-data-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeV1(records: unknown[]) {
    await mkdir(join(root, "demo"), { recursive: true });
    const file = join(root, "demo", "feedback.json");
    const contents = `${JSON.stringify({ version: 1, feedback: records })}\n`;
    await writeFile(file, contents);
    return { file, contents };
  }

  it("reads v1 files in memory without rewriting them", async () => {
    const { file, contents } = await writeV1([
      { ...legacy, reply: legacyReply },
    ]);
    const storage = createFeedbackStorage({ dataRoot: root });
    const [record] = await storage.listFeedback("demo");
    expect(record!.thread).toHaveLength(1);
    expect(await readFile(file, "utf8")).toBe(contents);
  });

  it("writes schemaVersion 2 with the thread on the next mutation", async () => {
    const { file } = await writeV1([{ ...legacy, reply: legacyReply }]);
    const storage = createFeedbackStorage({
      dataRoot: root,
      newId: () => "m-1",
      now: () => new Date("2026-10-06T10:00:00.000Z"),
    });
    await storage.updateFeedback("demo", "a", {
      expectedUpdatedAt: legacy.updatedAt,
      patch: { note: "Footer floats mid-page." },
    });
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.version).toBe(1);
    expect(saved.schemaVersion).toBe(2);
    expect(saved.feedback[0].thread).toEqual([
      { id: "legacy-reply", role: "agent", ...legacyReply },
    ]);
  });

  it("refuses files from a newer schema instead of overwriting them", async () => {
    await mkdir(join(root, "demo"), { recursive: true });
    await writeFile(
      join(root, "demo", "feedback.json"),
      JSON.stringify({ version: 1, schemaVersion: 3, feedback: [] }),
    );
    const storage = createFeedbackStorage({ dataRoot: root });
    await expect(storage.listFeedback("demo")).rejects.toThrow(
      /newer ScreenCheck/,
    );
  });
});

describe("thread and Verified API", () => {
  let server: Server;
  let root: string;
  let origin: string;
  let base: string;
  let ids: number;

  beforeEach(async () => {
    root = await mkdtemp(join(process.cwd(), "tests/.feedback-data-"));
    ids = 0;
    const storage = createFeedbackStorage({
      dataRoot: root,
      newId: () => `m-${++ids}`,
    });
    let port = 0;
    server = createServer(async (request, response) => {
      if (!(await handleApi(request, response, { storage, port }))) {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
    origin = `http://127.0.0.1:${port}`;
    base = `${origin}/api/projects/demo/feedback`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  function send(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return fetch(url, {
      method,
      headers: { "content-type": "application/json", origin, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function create(): Promise<FeedbackRecord> {
    const response = await send("POST", base, {
      clientMutationId: crypto.randomUUID(),
      screenId: "landing",
      version: "live",
      x: 0.5,
      y: 0.5,
      note: "Footer floats.",
    });
    return (await response.json()).feedback;
  }

  async function patch(
    item: FeedbackRecord,
    body: unknown,
    headers?: Record<string, string>,
  ) {
    const response = await send(
      "PATCH",
      `${base}/${item.id}`,
      { expectedUpdatedAt: item.updatedAt, patch: body },
      headers,
    );
    return { status: response.status, body: await response.json() };
  }

  it("appends each reply as an agent message and keeps reply as the latest", async () => {
    const item = await create();
    expect(item.thread).toEqual([]);
    const first = await patch(item, {
      status: "RESOLVED",
      reply: { note: "Pinned it.", author: "Copilot" },
    });
    expect(first.status).toBe(200);
    const fixed = first.body.feedback;
    expect(fixed.thread).toEqual([
      {
        id: "m-1",
        role: "agent",
        author: "Copilot",
        note: "Pinned it.",
        at: fixed.updatedAt,
        status: "RESOLVED",
      },
    ]);

    const second = (
      await patch(fixed, { reply: { note: "Also fixed the gap." } })
    ).body.feedback;
    expect(second.thread.map((m: { note: string }) => m.note)).toEqual([
      "Pinned it.",
      "Also fixed the gap.",
    ]);
    expect(second.thread[1]).not.toHaveProperty("status");
    expect(second.reply).toEqual({
      note: "Also fixed the gap.",
      author: "Agent",
      at: second.updatedAt,
    });
  });

  it("appends a reviewer message and records the status it set", async () => {
    const item = await create();
    const fixed = (
      await patch(item, { status: "RESOLVED", reply: { note: "Done." } })
    ).body.feedback;
    const reopened = await patch(fixed, {
      status: "OPEN",
      message: { note: "Still floats on mobile." },
    });
    expect(reopened.status).toBe(200);
    const record = reopened.body.feedback;
    expect(record.status).toBe("OPEN");
    expect(record.thread[1]).toEqual({
      id: "m-2",
      role: "reviewer",
      author: "Reviewer",
      note: "Still floats on mobile.",
      at: record.updatedAt,
      status: "OPEN",
    });
    // The derived reply stays the agent's.
    expect(record.reply.note).toBe("Done.");

    const agent = (
      await patch(record, {
        message: { note: "Looking again.", role: "agent", author: "Copilot" },
      })
    ).body.feedback;
    expect(agent.thread[2]).toMatchObject({ role: "agent", author: "Copilot" });
    expect(agent.reply.note).toBe("Looking again.");
  });

  it("lets a message close feedback but still needs some note", async () => {
    const item = await create();
    expect((await patch(item, { status: "WONT_FIX" })).status).toBe(400);
    const closed = await patch(item, {
      status: "WONT_FIX",
      message: { note: "Out of scope." },
    });
    expect(closed.status).toBe(200);
    expect(
      (await patch(item, { reply: { note: "x" }, message: { note: "y" } }))
        .status,
    ).toBe(400);
  });

  it("reply: null removes only the latest agent message", async () => {
    const item = await create();
    let record = (await patch(item, { reply: { note: "One" } })).body.feedback;
    record = (await patch(record, { message: { note: "Why?" } })).body.feedback;
    record = (await patch(record, { reply: { note: "Two" } })).body.feedback;
    record = (await patch(record, { reply: null })).body.feedback;
    expect(record.thread.map((m: { note: string }) => m.note)).toEqual([
      "One",
      "Why?",
    ]);
    expect(record.reply.note).toBe("One");
    record = (await patch(record, { reply: null })).body.feedback;
    expect(record.thread.map((m: { note: string }) => m.note)).toEqual([
      "Why?",
    ]);
    expect(record).not.toHaveProperty("reply");
  });

  it("refuses Verified without the reviewer header", async () => {
    const item = await create();
    const fixed = (
      await patch(item, { status: "RESOLVED", reply: { note: "Done." } })
    ).body.feedback;
    const refused = await patch(fixed, { status: "VERIFIED" });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(
      /Only a reviewer can mark feedback Verified/,
    );
    expect(
      (
        await patch(
          fixed,
          { status: "VERIFIED" },
          { "x-screencheck-actor": "agent" },
        )
      ).status,
    ).toBe(403);

    const created = await send("POST", base, {
      clientMutationId: crypto.randomUUID(),
      screenId: "landing",
      version: "live",
      x: 0.1,
      y: 0.1,
      note: "Pre-verified",
      status: "VERIFIED",
    });
    expect(created.status).toBe(403);

    const verified = await patch(
      fixed,
      { status: "VERIFIED" },
      { "x-screencheck-actor": "reviewer" },
    );
    expect(verified.status).toBe(200);
    expect(verified.body.feedback.status).toBe("VERIFIED");
    expect(verified.body.feedback.thread).toHaveLength(1);
  });
});

describe("export with threads", () => {
  const record: FeedbackRecord = {
    ...legacy,
    status: "VERIFIED",
    thread: [
      {
        id: "1",
        role: "agent",
        author: "Copilot",
        note: "Pinned it.",
        at: "2026-10-05T20:00:00.000Z",
        status: "RESOLVED",
      },
      {
        id: "2",
        role: "reviewer",
        author: "Reviewer",
        note: "Still floats on *mobile*.",
        at: "2026-10-05T21:00:00.000Z",
        status: "OPEN",
      },
      {
        id: "3",
        role: "agent",
        author: "Copilot",
        note: "Fixed on mobile too.",
        at: "2026-10-05T22:00:00.000Z",
        status: "RESOLVED",
      },
    ],
  } as FeedbackRecord;

  it("lists every message in order in Markdown", () => {
    const markdown = serializeMarkdown({
      projectId: "demo",
      screens: [],
      feedback: [record],
    });
    expect(markdown).toContain("- [x] **Pin 1 · P1 · Verified**");
    expect(markdown).toContain(
      [
        "  - Reply (Copilot, 2026-10-05 20:00 UTC) → Fixed: Pinned it.",
        "  - Reviewer (Reviewer, 2026-10-05 21:00 UTC) → Backlog: Still floats on \\*mobile\\*.",
        "  - Reply (Copilot, 2026-10-05 22:00 UTC) → Fixed: Fixed on mobile too.",
      ].join("\n"),
    );
    expect(
      serializeMarkdown({ projectId: "demo", screens: [], feedback: [record] }),
    ).toBe(markdown);
  });

  it("includes the full thread in JSON, and an empty one when there is none", () => {
    const json = JSON.parse(
      serializeJson({
        projectId: "demo",
        screens: [],
        feedback: [
          record,
          { ...legacy, id: "b", status: "OPEN" } as FeedbackRecord,
        ],
      }),
    );
    expect(json.feedback[0].thread.map((m: { id: string }) => m.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(json.feedback[1].thread).toEqual([]);
  });
});
