import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { vi } from "vitest";
import { z } from "zod";

import {
  FeedbackConflictError,
  FeedbackNotFoundError,
  createFeedbackStorage,
} from "../../src/server/storage";

const ROUTE = /^\/api\/projects\/([^/]+)\/feedback(?:\/(import)|\/([^/]+))?$/;

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Routes the client's relative /api calls to a real storage instance on disk.
export async function installFakeFeedbackApi() {
  const root = await mkdtemp(join(process.cwd(), "tests/.feedback-data-"));
  const storage = createFeedbackStorage({ dataRoot: root });
  const requests: { method: string; path: string }[] = [];
  let failNext: { status: number; error: string } | null = null;
  let gate: Promise<void> | null = null;

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = new URL(url, "http://127.0.0.1").pathname;
    requests.push({ method, path });
    if (gate) await gate;
    if (failNext) {
      const failure = failNext;
      failNext = null;
      return reply(failure.status, { error: failure.error });
    }
    const match = ROUTE.exec(path);
    if (!match) return reply(404, { error: "Not found." });
    const projectId = decodeURIComponent(match[1]!);
    const id = match[3] ? decodeURIComponent(match[3]) : undefined;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    try {
      if (match[2] === "import") {
        return reply(200, await storage.importFeedback(projectId, body.records));
      }
      if (!id && method === "GET") {
        return reply(200, { feedback: await storage.listFeedback(projectId) });
      }
      if (!id && method === "POST") {
        return reply(201, { feedback: await storage.createFeedback(projectId, body) });
      }
      if (id && method === "PATCH") {
        return reply(200, {
          feedback: await storage.updateFeedback(projectId, id, body),
        });
      }
      if (id && method === "DELETE") {
        await storage.deleteFeedback(projectId, id, body.expectedUpdatedAt);
        return reply(200, { deleted: id });
      }
      return reply(405, { error: "Method not allowed." });
    } catch (error) {
      if (error instanceof FeedbackConflictError) {
        return reply(409, { error: error.message, current: error.current });
      }
      if (error instanceof FeedbackNotFoundError) {
        return reply(404, { error: error.message });
      }
      if (error instanceof z.ZodError) return reply(400, { error: "Invalid." });
      return reply(500, { error: (error as Error).message });
    }
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    root,
    storage,
    requests,
    failNext(status: number, error: string) {
      failNext = { status, error };
    },
    hold() {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = null;
        release();
      };
    },
    async dispose() {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    },
  };
}
