import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FullscreenReview } from "../src/client/components/fullscreen-review";

describe("FullscreenReview", () => {
  it("keeps navigation on the edge and closes the feedback panel before exiting", () => {
    const onExit = vi.fn();
    render(
      <FullscreenReview
        feedback={<p>Feedback contents</p>}
        navigation={<p>Navigation contents</p>}
        onExit={onExit}
      >
        <div>Canvas</div>
      </FullscreenReview>,
    );
    expect(screen.getByText("Navigation contents")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Open navigation panel" }),
    ).toBeNull();
    const feedback = screen.getByRole("button", {
      name: "Open feedback panel",
    });
    fireEvent.mouseEnter(feedback.parentElement!);
    expect(feedback).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
