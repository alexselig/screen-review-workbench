// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleApi } from "../src/server/api";
import { createFeedbackStorage } from "../src/server/storage";

let server: Server;
let root: string;
let base: string;
let origin: string;

beforeEach(async () => {
  root = await mkdtemp(join(process.cwd(), "tests/.feedback-data-"));
  const storage = createFeedbackStorage({
    dataRoot: root,
    now: () => new Date("2026-10-05T22:00:00.000Z"),
  });
  let port = 0;
  server = createServer(async (request, response) => {
    if (!(await handleApi(request, response, { storage, port }))) {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  base = `${origin}/api/projects/demo/captions`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

function put(body: unknown, headers: Record<string, string> = { origin }) {
  return fetch(base, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("screen captions API", () => {
  it("saves, replaces and clears a caption in captions.json", async () => {
    expect((await (await fetch(base)).json()).captions).toEqual([]);

    const saved = await put({
      version: "v1",
      screenId: "landing",
      text: "  Step 3 of 5, manual path selected  ",
    });
    expect(saved.status).toBe(200);
    const record = {
      version: "v1",
      screenId: "landing",
      text: "Step 3 of 5, manual path selected",
      updatedAt: "2026-10-05T22:00:00.000Z",
    };
    expect((await saved.json()).captions).toEqual([record]);
    expect(
      JSON.parse(await readFile(join(root, "demo", "captions.json"), "utf8")),
    ).toEqual({ version: 1, captions: [record] });

    await put({ version: "v1", screenId: "landing", text: "Step 4 of 5" });
    const { captions } = await (await fetch(base)).json();
    expect(captions.map((item: { text: string }) => item.text)).toEqual([
      "Step 4 of 5",
    ]);

    const cleared = await put({
      version: "v1",
      screenId: "landing",
      text: " ",
    });
    expect((await cleared.json()).captions).toEqual([]);
  });

  it("keeps captions per version and leaves feedback.json alone", async () => {
    await mkdir(join(root, "demo"), { recursive: true });
    const feedback = '{"version":1,"feedback":[]}\n';
    await writeFile(join(root, "demo", "feedback.json"), feedback);
    await put({ version: "v1", screenId: "landing", text: "Old capture" });
    await put({ version: "v2", screenId: "landing", text: "New capture" });
    const { captions } = await (await fetch(base)).json();
    expect(captions.map((item: { version: string }) => item.version)).toEqual([
      "v1",
      "v2",
    ]);
    expect(await readFile(join(root, "demo", "feedback.json"), "utf8")).toBe(
      feedback,
    );
  });

  it("rejects cross-origin writes and overlong text", async () => {
    const foreign = await put(
      { version: "v1", screenId: "landing", text: "Hi" },
      { origin: "https://evil.example" },
    );
    expect(foreign.status).toBe(403);
    const long = await put({
      version: "v1",
      screenId: "landing",
      text: "x".repeat(501),
    });
    expect(long.status).toBe(400);
    expect((await (await fetch(base)).json()).captions).toEqual([]);
  });
});
