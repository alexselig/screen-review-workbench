import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScreenRail } from "../src/client/components/screen-rail";

const screens = [
  {
    id: "one",
    ordinal: 1,
    title: "Public landing",
    group: "Access",
    viewport: { width: 1440, height: 1000 },
  },
  {
    id: "two",
    ordinal: 2,
    title: "Dashboard",
    group: "Portfolio",
    viewport: { width: 1440, height: 1000 },
  },
];

afterEach(cleanup);

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
    expect(
      screen.getByRole("button", { name: "01. Public landing" }),
    ).toBeInTheDocument();
    fireEvent.mouseEnter(rail);
    expect(rail).toHaveAttribute("data-expanded", "true");
    fireEvent.mouseLeave(rail);
    expect(rail).toHaveAttribute("data-expanded", "false");
  });

  it("puts the open count beside the number, opposite the approved check", () => {
    render(
      <ScreenRail
        approvedIds={new Set(["one"])}
        mode="compact"
        onModeChange={vi.fn()}
        onSelect={vi.fn()}
        openCounts={new Map([["one", 3]])}
        screens={screens}
        selectedId="one"
      />,
    );
    const first = screen.getByRole("button", {
      name: "01. Public landing (approved), 3 open",
    });
    const number = first.querySelector(".screen-number");
    expect(
      number?.querySelector("[data-testid=screen-approved-mark]"),
    ).not.toBeNull();
    expect(
      number?.querySelector("[data-testid=screen-open-count]"),
    ).toHaveTextContent("3");
    const second = screen.getByRole("button", { name: "02. Dashboard" });
    expect(second.querySelector("[data-testid=screen-open-count]")).toBeNull();
  });
});
