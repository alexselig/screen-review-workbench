import { describe, expect, it } from "vitest";

import type { ElementMap } from "../src/shared/elements";
import { serializeJson, serializeMarkdown } from "../src/shared/export";
import type { FeedbackRecord } from "../src/shared/feedback";

const screens = [
  {
    id: "sailing",
    ordinal: 2,
    title: "Pick a sailing",
    description: "Step 2 of 4.",
    group: "Booking",
    viewport: { width: 1440, height: 1000 },
  },
];

const record = (overrides: Partial<FeedbackRecord> = {}): FeedbackRecord => ({
  id: "pin-1",
  projectId: "demo",
  screenId: "sailing",
  version: "build-42",
  x: 0.8,
  y: 0.94,
  note: "Repeat the selected sailing here.",
  tags: ["P0"],
  status: "OPEN",
  createdAt: "2026-10-05T20:00:00.000Z",
  updatedAt: "2026-10-05T20:00:00.000Z",
  ...overrides,
});

const map: ElementMap = {
  version: 1,
  capture: { width: 1440, height: 2400 },
  elements: [
    {
      box: { x: 0, y: 0.9, w: 1, h: 0.1 },
      tag: "footer",
      role: "contentinfo",
      selector: "footer",
    },
    {
      box: { x: 0.7, y: 0.92, w: 0.2, h: 0.05 },
      tag: "button",
      role: "button",
      name: "Continue to vehicle",
      selector: "footer > button",
      source: { file: "src/booking/Footer.tsx", line: 42 },
    },
  ],
};

const base = { projectId: "demo", screens, feedback: [record()] };

describe("exports with element maps", () => {
  it("names the element under each pin when a map is supplied", () => {
    const markdown = serializeMarkdown({
      ...base,
      elements: { "build-42/sailing": map },
    });
    expect(markdown).toContain(
      '  - Element: button "Continue to vehicle" \\(src/booking/Footer.tsx:42\\)',
    );
    const json = JSON.parse(
      serializeJson({ ...base, elements: { "build-42/sailing": map } }),
    );
    expect(json.feedback[0].element).toMatchObject({
      tag: "button",
      selector: "footer > button",
      description: 'button "Continue to vehicle" (src/booking/Footer.tsx:42)',
    });
  });

  it("leaves the element out without a map or a matching element", () => {
    expect(serializeMarkdown(base)).not.toContain("Element:");
    expect(JSON.parse(serializeJson(base)).feedback[0]).not.toHaveProperty(
      "element",
    );
    const elsewhere = serializeMarkdown({
      ...base,
      feedback: [record({ x: 0.1, y: 0.1 })],
      elements: { "build-42/sailing": map },
    });
    expect(elsewhere).not.toContain("Element:");
    const otherVersion = serializeMarkdown({
      ...base,
      elements: { "build-41/sailing": map },
    });
    expect(otherVersion).not.toContain("Element:");
  });
});
