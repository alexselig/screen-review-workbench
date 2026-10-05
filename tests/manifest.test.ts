import { describe, expect, it } from "vitest";

import { parseScreens } from "../src/shared/manifest";

describe("screen manifest", () => {
  it("requires unique stable ordinals", () => {
    expect(() =>
      parseScreens([
        { id: "a", ordinal: 1, title: "A", group: "One", viewport: { width: 1440, height: 1000 } },
        { id: "b", ordinal: 1, title: "B", group: "One", viewport: { width: 1440, height: 1000 } },
      ]),
    ).toThrow(/ordinal/i);
  });
});
