import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "../src/client/app";
import { EXAMPLE_PROJECT } from "../src/server/projects";
import { installFakeFeedbackApi } from "./helpers/fake-feedback-api";

let api: Awaited<ReturnType<typeof installFakeFeedbackApi>>;
let realFetch: typeof fetch;

beforeEach(async () => {
  api = await installFakeFeedbackApi();
  realFetch = globalThis.fetch;
  const withCaptures = {
    ...EXAMPLE_PROJECT,
    screens: EXAMPLE_PROJECT.screens.map((item) => ({
      ...item,
      hasCapture: true,
    })),
  };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (new URL(url, "http://127.0.0.1").pathname === "/api/projects") {
      return new Response(
        JSON.stringify({ projects: [withCaptures], problems: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return realFetch(url, init);
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  cleanup();
  localStorage.clear();
  await api.dispose();
});

describe("capture frame", () => {
  it("takes a tall full-page capture's own proportions instead of squashing it", async () => {
    render(<App />);
    const image = await screen.findByRole("img", { name: /capture$/ });
    const frame = screen.getByTestId("screen-frame");
    const { width, height } = EXAMPLE_PROJECT.screens[0]!.viewport;
    expect(frame.style.getPropertyValue("--screen-ratio")).toBe(
      `${width} / ${height}`,
    );

    Object.defineProperty(image, "naturalWidth", { value: 1440 });
    Object.defineProperty(image, "naturalHeight", { value: 2600 });
    fireEvent.load(image);

    expect(frame.style.getPropertyValue("--screen-ratio")).toBe("1440 / 2600");
    expect(frame.style.getPropertyValue("--screen-width")).toBe("1440px");
  });
});
