import { describe, expect, it } from "vitest";
import {
  feedbackRecordSchema,
  normalizeTags,
  priorityTag,
} from "../src/shared/feedback";

const legacy = {
  id: "a",
  projectId: "p",
  screenId: "s",
  version: "live",
  x: 0.5,
  y: 0.5,
  note: "Legacy",
  status: "OPEN",
  createdAt: "2026-10-05T19:00:00.000Z",
  updatedAt: "2026-10-05T19:00:00.000Z",
};

describe("tags", () => {
  it.each([
    ["BLOCKING", "P0"],
    ["IMPORTANT", "P1"],
    ["POLISH", "P2"],
  ])(
    "migrates legacy priority %s to %s and keeps category as a tag",
    (priority, tag) => {
      const record = feedbackRecordSchema.parse({
        ...legacy,
        priority,
        category: "LAYOUT",
      });
      expect(record.tags).toEqual([tag, "Layout"]);
      expect(record).not.toHaveProperty("priority");
      expect(record).not.toHaveProperty("category");
    },
  );

  it("leaves records that already have tags alone", () => {
    expect(
      feedbackRecordSchema.parse({ ...legacy, tags: ["Copy"] }).tags,
    ).toEqual(["Copy"]);
  });

  it("normalizes priority case and drops duplicates", () => {
    expect(normalizeTags(["p0", "Copy", "copy", "P0"])).toEqual(["P0", "Copy"]);
    expect(priorityTag(["Copy", "P2"])).toBe("P2");
    expect(priorityTag(["Copy"])).toBeNull();
  });
});
