// The screenshots on the project site, one entry per image in docs/assets.
// `prepare` puts the workbench in the state the image explains; `clip` crops
// to the part of the window that matters.
const at = (screen) => `#project=tidewater&version=build-42&screen=${screen}`;

export const SHOTS = [
  {
    name: "hero",
    query: at("sailing"),
  },
  {
    name: "pin-editor",
    query: at("vehicle"),
    async prepare(page) {
      await page.getByRole("button", { name: /add feedback/i }).click();
      const shot = page
        .locator(".screen-canvas img, .capture img, main img")
        .first();
      const box = await shot.boundingBox();
      await page.mouse.click(
        box.x + box.width * 0.55,
        box.y + box.height * 0.66,
      );
      await page
        .getByLabel("Feedback note")
        .fill(
          "Children under 4 travel free, so say so next to the counter instead of after payment.",
        );
    },
  },
  {
    name: "statuses",
    query: at("home"),
  },
  {
    name: "agent-reply",
    query: at("route"),
  },
  {
    name: "fullscreen",
    query: at("review-pay"),
    async prepare(page) {
      await page.getByRole("button", { name: "View fullscreen" }).click();
    },
  },
  {
    name: "export",
    query: at("sailing"),
    async prepare(page) {
      await page.getByRole("button", { name: /^export$/i }).click();
    },
  },
  {
    name: "long-page",
    query: at("review-pay"),
  },
  {
    name: "approved",
    query: at("sign-in"),
  },
];
