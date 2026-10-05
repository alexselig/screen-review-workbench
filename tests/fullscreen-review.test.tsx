import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FullscreenReview } from "../src/client/components/fullscreen-review";

describe("FullscreenReview", () => {
  it("reveals edge panels and closes a panel before exiting", () => {
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
    const navigation = screen.getByRole("button", {
      name: "Open navigation panel",
    });
    fireEvent.mouseEnter(navigation.parentElement!);
    expect(navigation).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
