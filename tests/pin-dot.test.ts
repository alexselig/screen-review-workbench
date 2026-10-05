import { describe, expect, it } from "vitest";

import { pinDotClassName } from "../src/client/components/feedback-inspector";
import type { FeedbackRecord } from "../src/shared/feedback";

const item = (status: FeedbackRecord["status"]) =>
  ({ status, tags: ["P1"] }) as unknown as FeedbackRecord;

describe("pinDotClassName", () => {
  it("gives fixed pins their own style, apart from every other stage", () => {
    expect(pinDotClassName(item("RESOLVED"), false)).toContain("is-fixed");
    for (const status of ["OPEN", "IN_PROGRESS", "WONT_FIX"] as const) {
      expect(pinDotClassName(item(status), false)).not.toContain("is-fixed");
    }
    expect(pinDotClassName(item("WONT_FIX"), false)).toContain("is-closed");
    expect(pinDotClassName(item("RESOLVED"), false)).not.toContain("is-closed");
  });
});
