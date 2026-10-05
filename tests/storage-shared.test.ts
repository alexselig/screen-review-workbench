import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createFeedback,
  listFeedback,
  sharedFeedbackStorage,
} from "../src/server/storage";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("shared feedback storage", () => {
  it("keeps every concurrent create made through the module helpers", async () => {
    const root = await mkdtemp(join(process.cwd(), "tests/.feedback-data-"));
    roots.push(root);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        createFeedback(root, "demo", {
          clientMutationId: randomUUID(),
          screenId: "landing",
          version: "live",
          x: 0.1,
          y: 0.1,
          note: `Note ${index}`,
          category: "LAYOUT",
          priority: "POLISH",
        }),
      ),
    );

    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    expect(await listFeedback(root, "demo")).toHaveLength(20);
  });

  it("returns one instance per resolved data root", () => {
    expect(sharedFeedbackStorage("/tmp/srw-a")).toBe(
      sharedFeedbackStorage("/tmp/srw-a/../srw-a"),
    );
  });
});
