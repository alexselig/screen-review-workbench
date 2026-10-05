import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "../src/client/app";
import { installFakeFeedbackApi } from "./helpers/fake-feedback-api";

let api: Awaited<ReturnType<typeof installFakeFeedbackApi>>;

beforeEach(async () => {
  api = await installFakeFeedbackApi();
});

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await api.dispose();
});

async function approveButton() {
  const button = await screen.findByRole("button", {
    name: /approve screen|screen approved/i,
  });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("approve screen toggle", () => {
  it("approves, persists, and unapproves the current screen", async () => {
    const first = render(<App />);
    const button = await approveButton();
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Approve screen");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Screen approved");
    await waitFor(async () =>
      expect(await api.storage.listApprovals("example")).toHaveLength(1),
    );

    first.unmount();
    render(<App />);
    const reloaded = await approveButton();
    await waitFor(() =>
      expect(reloaded).toHaveAttribute("aria-pressed", "true"),
    );

    fireEvent.click(reloaded);
    expect(reloaded).toHaveAttribute("aria-pressed", "false");
    await waitFor(async () =>
      expect(await api.storage.listApprovals("example")).toEqual([]),
    );
  });

  it("rolls back and says so when the save fails", async () => {
    render(<App />);
    const button = await approveButton();
    api.failNext(500, "Disk full.", /\/approvals/);
    fireEvent.click(button);

    await waitFor(() =>
      expect(button).toHaveAttribute("aria-pressed", "false"),
    );
    expect(await screen.findByText(/Approval was not saved/)).toBeVisible();
  });
});
