import { describe, expect, it } from "vitest";

import { parseScreens } from "../src/shared/manifest";

describe("screen manifest", () => {
  it("requires a description of the state shown on every screen", () => {
    expect(() =>
      parseScreens([
        {
          id: "a",
          ordinal: 1,
          title: "A",
          group: "One",
          viewport: { width: 1440, height: 1000 },
        },
      ]),
    ).toThrow(/description/i);
  });

  it("requires unique stable ordinals", () => {
    expect(() =>
      parseScreens([
        {
          id: "a",
          ordinal: 1,
          title: "A",
          description: "Shows state A.",
          group: "One",
          viewport: { width: 1440, height: 1000 },
        },
        {
          id: "b",
          ordinal: 1,
          title: "B",
          description: "Shows state B.",
          group: "One",
          viewport: { width: 1440, height: 1000 },
        },
      ]),
    ).toThrow(/ordinal/i);
  });
});
