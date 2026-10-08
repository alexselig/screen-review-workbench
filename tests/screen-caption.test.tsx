import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "../src/client/app";
import { ScreenCaption } from "../src/client/components/screen-caption";
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

async function captionButton() {
  const button = await screen.findByTestId("screen-caption");
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("screen caption", () => {
  it("describes the capture, saves on Enter and survives a reload", async () => {
    const first = render(<App />);
    fireEvent.click(await captionButton());
    const input = screen.getByRole("textbox", { name: "Showing" });
    fireEvent.change(input, {
      target: { value: "Step 3 of 5, manual path selected" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("screen-caption")).toHaveTextContent(
      "Step 3 of 5, manual path selected",
    );
    await waitFor(async () =>
      expect(await api.storage.listCaptions("example")).toEqual([
        expect.objectContaining({
          screenId: "landing",
          text: "Step 3 of 5, manual path selected",
        }),
      ]),
    );

    first.unmount();
    render(<App />);
    await waitFor(async () =>
      expect(await captionButton()).toHaveTextContent("Step 3 of 5"),
    );
  });

  it("Escape cancels without saving", async () => {
    render(<App />);
    const before = (await captionButton()).textContent;
    fireEvent.click(await captionButton());
    const input = screen.getByRole("textbox", { name: "Showing" });
    fireEvent.change(input, { target: { value: "Throwaway" } });
    fireEvent.keyDown(input, { key: "Escape" });
    const after = screen.getByTestId("screen-caption");
    expect(after.textContent).toBe(before);
    expect(after).not.toHaveTextContent("Throwaway");
    expect(await api.storage.listCaptions("example")).toEqual([]);
  });

  it("falls back to the manifest description and clearing restores it", () => {
    const saves: string[] = [];
    const { rerender } = render(
      <ScreenCaption
        manifest="Step 2 of 5, nothing selected"
        onSave={(text) => saves.push(text)}
        saved="Step 2 of 5, manual path"
      />,
    );
    expect(screen.getByTestId("screen-caption")).toHaveTextContent(
      "Step 2 of 5, manual path",
    );
    fireEvent.click(screen.getByTestId("screen-caption"));
    const input = screen.getByRole("textbox", { name: "Showing" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(saves).toEqual([""]);

    rerender(
      <ScreenCaption
        manifest="Step 2 of 5, nothing selected"
        onSave={(text) => saves.push(text)}
      />,
    );
    expect(screen.getByTestId("screen-caption")).toHaveTextContent(
      "Step 2 of 5, nothing selected",
    );
    // Opening and leaving the default untouched saves nothing.
    fireEvent.click(screen.getByTestId("screen-caption"));
    fireEvent.blur(screen.getByRole("textbox", { name: "Showing" }));
    expect(saves).toEqual([""]);
  });
});
