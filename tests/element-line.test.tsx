import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ElementLine } from "../src/client/components/element-line";
import { ExportDialog } from "../src/client/components/export-dialog";
import { clearElementMapCache } from "../src/client/element-map-api";
import type { ElementMap } from "../src/shared/elements";
import type { FeedbackRecord } from "../src/shared/feedback";

const map: ElementMap = {
  version: 1,
  capture: { width: 1440, height: 2400 },
  elements: [
    {
      box: { x: 0, y: 0, w: 1, h: 1 },
      tag: "main",
      role: "main",
      selector: "main",
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

const fetchMock = vi.fn(async (url: string) =>
  url === "/api/projects/demo/elements/build-42/sailing"
    ? new Response(JSON.stringify(map), { status: 200 })
    : new Response(JSON.stringify({ error: "Element map not found." }), {
        status: 404,
      }),
);

beforeEach(() => {
  clearElementMapCache();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pin = { version: "build-42", screenId: "sailing", x: 0.8, y: 0.94 };

describe("ElementLine", () => {
  it("shows the element under the pin and its source file", async () => {
    render(
      <>
        <ElementLine projectId="demo" pin={pin} />
        <ElementLine projectId="demo" pin={{ ...pin, x: 0.75 }} />
      </>,
    );
    const lines = await screen.findAllByTestId("feedback-element");
    expect(lines[0]).toHaveTextContent(
      '↳ button "Continue to vehicle" · Footer.tsx:42',
    );
    expect(lines[0]).toHaveAttribute("title", "footer > button");
    // One request per screen, however many cards show it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without a map or over a bare container", async () => {
    const { container } = render(
      <>
        <ElementLine projectId="demo" pin={{ ...pin, screenId: "home" }} />
        <ElementLine projectId="demo" pin={{ ...pin, x: 0.1, y: 0.1 }} />
      </>,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ExportDialog element lines", () => {
  it("adds the element to exported comments for screens with a map", async () => {
    const feedback: FeedbackRecord[] = [
      {
        id: "pin-1",
        projectId: "demo",
        screenId: "sailing",
        version: "build-42",
        x: 0.8,
        y: 0.94,
        note: "Repeat the selection here.",
        tags: ["P0"],
        status: "OPEN",
        createdAt: "2026-10-05T20:00:00.000Z",
        updatedAt: "2026-10-05T20:00:00.000Z",
      },
    ];
    const exported: string[] = [];
    render(
      <ExportDialog
        feedback={feedback}
        onClose={() => {}}
        onExport={(_format, contents) => exported.push(contents)}
        projectId="demo"
        screens={[
          {
            id: "sailing",
            ordinal: 1,
            title: "Sailing",
            description: "Step 2.",
            group: "Booking",
            viewport: { width: 1440, height: 1000 },
          },
        ]}
        selectedScreenId="sailing"
        version="build-42"
      />,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(exported[0]).toContain(
      'Element: button "Continue to vehicle" \\(src/booking/Footer.tsx:42\\)',
    );
  });
});
