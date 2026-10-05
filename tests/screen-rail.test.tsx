import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScreenRail } from "../src/client/components/screen-rail";

const screens = [
  { id: "one", ordinal: 1, title: "Public landing", group: "Access", viewport: { width: 1440, height: 1000 } },
  { id: "two", ordinal: 2, title: "Dashboard", group: "Portfolio", viewport: { width: 1440, height: 1000 } },
];

describe("ScreenRail", () => {
  it("expands compact navigation on hover and keeps numbered accessible names", () => {
    render(
      <ScreenRail
        mode="compact"
        onModeChange={vi.fn()}
        onSelect={vi.fn()}
        screens={screens}
        selectedId="one"
      />,
    );
    const rail = screen.getByRole("navigation", { name: "Screen navigation" });
    expect(rail).toHaveAttribute("data-expanded", "false");
    expect(screen.getByRole("button", { name: "01. Public landing" })).toBeInTheDocument();
    fireEvent.mouseEnter(rail);
    expect(rail).toHaveAttribute("data-expanded", "true");
    fireEvent.mouseLeave(rail);
    expect(rail).toHaveAttribute("data-expanded", "false");
  });
});
