import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/client/app";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe("feedback workflow integration", () => {
  it("places a normalized pin, persists it, and recovers it after reload", async () => {
    vi.useFakeTimers();
    const firstRender = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add feedback" }));
    const canvas = screen.getByTestId("canvas");
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 100,
        top: 50,
        width: 800,
        height: 600,
        right: 900,
        bottom: 650,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }),
    });
    fireEvent.click(canvas, { clientX: 500, clientY: 350 });
    fireEvent.change(screen.getByRole("textbox", { name: "Feedback note" }), {
      target: { value: "Keep this action above the fold." },
    });
    await act(async () => vi.advanceTimersByTime(500));

    const pin = screen.getByTestId("feedback-pin");
    expect(pin).toHaveStyle({ left: "50%", top: "50%" });
    expect(localStorage.getItem("screen-review-workbench.feedback.v1:example")).toContain(
      "Keep this action above the fold.",
    );

    firstRender.unmount();
    render(<App />);

    expect(screen.getByText("Keep this action above the fold.")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-pin")).toHaveStyle({
      left: "50%",
      top: "50%",
    });
  });
});
