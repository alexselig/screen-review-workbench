import { describe, expect, it } from "vitest";

import { serializeJson, serializeMarkdown } from "../src/shared/export";
import type { FeedbackRecord } from "../src/shared/feedback";

const screens = [
  {
    id: "landing",
    ordinal: 1,
    title: "Public landing",
    description: "Public sign-in landing page before authentication.",
    group: "Access",
    viewport: { width: 1440, height: 1000 },
  },
  {
    id: "dashboard",
    ordinal: 3,
    title: "Populated dashboard",
    description: "Dashboard populated with skills and workflow states.",
    group: "Portfolio",
    viewport: { width: 1440, height: 1000 },
  },
];

function feedback(overrides: Partial<FeedbackRecord>): FeedbackRecord {
  return {
    id: "feedback-1",
    projectId: "demo",
    screenId: "landing",
    version: "live",
    x: 0.25,
    y: 0.75,
    note: "Primary note",
    tags: ["P1"],
    status: "OPEN",
    createdAt: "2026-10-05T20:00:00.000Z",
    updatedAt: "2026-10-05T20:00:00.000Z",
    ...overrides,
  };
}

describe("feedback exports", () => {
  it("sorts deterministically by screen ordinal, pin number, and creation time", () => {
    const records = [
      feedback({
        id: "dashboard-pin",
        screenId: "dashboard",
        createdAt: "2026-10-05T19:00:00.000Z",
        note: "Dashboard note",
      }),
      feedback({
        id: "landing-second",
        createdAt: "2026-10-05T21:00:00.000Z",
        note: "Landing second",
      }),
      feedback({
        id: "landing-first",
        createdAt: "2026-10-05T20:00:00.000Z",
        note: "Landing first",
      }),
    ];

    const json = serializeJson({
      projectId: "demo",
      screens,
      feedback: records,
    });
    const markdown = serializeMarkdown({
      projectId: "demo",
      screens,
      feedback: records,
    });

    expect(
      JSON.parse(json).feedback.map((item: { id: string }) => item.id),
    ).toEqual(["landing-first", "landing-second", "dashboard-pin"]);
    expect(JSON.parse(json).feedback[0]).toMatchObject({
      screenTitle: "Public landing",
      screenDescription: "Public sign-in landing page before authentication.",
    });
    expect(markdown).toContain(
      "_Screen: Public sign\\-in landing page before authentication._",
    );
    expect(markdown.indexOf("Landing first")).toBeLessThan(
      markdown.indexOf("Landing second"),
    );
    expect(markdown.indexOf("Landing second")).toBeLessThan(
      markdown.indexOf("Dashboard note"),
    );
    expect(
      serializeJson({ projectId: "demo", screens, feedback: records }),
    ).toBe(json);
  });
});
