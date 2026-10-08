import { describe, expect, it } from "vitest";

import {
  describeElement,
  elementLabel,
  elementMapPathFor,
  elementMapSchema,
  formatElementSource,
  resolvePinElement,
  type ElementMap,
  type MappedElement,
} from "../src/shared/elements";

function element(
  box: MappedElement["box"],
  rest: Partial<MappedElement> = {},
): MappedElement {
  return { box, tag: "div", selector: "div", ...rest };
}

const footer = element(
  { x: 0, y: 0.9, w: 1, h: 0.1 },
  { tag: "footer", role: "contentinfo", selector: "footer" },
);
const button = element(
  { x: 0.7, y: 0.92, w: 0.2, h: 0.05 },
  {
    tag: "button",
    role: "button",
    name: "Continue to vehicle",
    selector: '[data-testid="continue"]',
    testId: "continue",
    source: { file: "src/booking/Footer.tsx", line: 42, component: "Footer" },
  },
);
const map: ElementMap = {
  version: 1,
  capture: { width: 1440, height: 2400 },
  elements: [
    element({ x: 0, y: 0, w: 1, h: 1 }, { tag: "main", role: "main" }),
    footer,
    button,
  ],
};

describe("resolvePinElement", () => {
  it("picks the innermost element under the pin", () => {
    expect(resolvePinElement(map, { x: 0.8, y: 0.94 })).toBe(button);
    expect(resolvePinElement(map, { x: 0.1, y: 0.95 })).toBe(footer);
    expect(resolvePinElement(map, { x: 0.1, y: 0.1 })?.tag).toBe("main");
  });

  it("counts the box edges as inside", () => {
    expect(resolvePinElement(map, { x: 0.7, y: 0.92 })).toBe(button);
    expect(resolvePinElement(map, { x: 0.9, y: 0.97 })).toBe(button);
  });

  it("prefers the later element in document order when areas tie", () => {
    const outer = element({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { tag: "a" });
    const inner = element({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { tag: "span" });
    expect(
      resolvePinElement({ elements: [outer, inner] }, { x: 0.15, y: 0.15 }),
    ).toBe(inner);
  });

  it("returns null outside every element or without a map", () => {
    const sparse = { elements: [button] };
    expect(resolvePinElement(sparse, { x: 0.1, y: 0.1 })).toBeNull();
    expect(resolvePinElement(null, { x: 0.1, y: 0.1 })).toBeNull();
    expect(resolvePinElement({ elements: [] }, { x: 0.5, y: 0.5 })).toBeNull();
  });
});

describe("describeElement", () => {
  it("names the role, accessible name and source line", () => {
    expect(describeElement(button)).toBe(
      'button "Continue to vehicle" (src/booking/Footer.tsx:42)',
    );
    expect(elementLabel(button)).toBe('button "Continue to vehicle"');
    expect(formatElementSource(button.source, { short: true })).toBe(
      "Footer.tsx:42",
    );
  });

  it("falls back to the tag, test id and component", () => {
    expect(describeElement(element({ x: 0, y: 0, w: 1, h: 1 }))).toBe("div");
    expect(
      describeElement(
        element(
          { x: 0, y: 0, w: 1, h: 1 },
          { testId: "summary", source: { component: "Summary" } },
        ),
      ),
    ).toBe('div [data-testid="summary"] (Summary)');
    expect(
      formatElementSource({ file: "a\\b\\Card.vue" }, { short: true }),
    ).toBe("Card.vue");
    expect(formatElementSource(undefined)).toBeNull();
  });
});

describe("elementMapSchema", () => {
  it("accepts a map and rejects boxes outside the capture", () => {
    expect(elementMapSchema.parse(map)).toEqual(map);
    expect(
      elementMapSchema.safeParse({
        ...map,
        elements: [element({ x: 0, y: 0, w: 1.5, h: 1 })],
      }).success,
    ).toBe(false);
    expect(elementMapSchema.safeParse({ ...map, version: 2 }).success).toBe(
      false,
    );
  });

  it("caps names and needs a file or component in a source", () => {
    expect(
      elementMapSchema.safeParse({
        ...map,
        elements: [
          element({ x: 0, y: 0, w: 1, h: 1 }, { name: "x".repeat(121) }),
        ],
      }).success,
    ).toBe(false);
    expect(
      elementMapSchema.safeParse({
        ...map,
        elements: [
          element({ x: 0, y: 0, w: 1, h: 1 }, { source: { line: 3 } }),
        ],
      }).success,
    ).toBe(false);
  });

  it("stores the map beside the capture", () => {
    expect(elementMapPathFor("/c/build-42/checkout.png")).toBe(
      "/c/build-42/checkout.elements.json",
    );
    expect(elementMapPathFor("shots.v2/home")).toBe(
      "shots.v2/home.elements.json",
    );
  });
});
