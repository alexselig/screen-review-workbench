import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { migrateLegacyStorage } from "../src/client/storage-migration";
import { appHome } from "../src/server/home";

const temps: string[] = [];
afterEach(async () => {
  localStorage.clear();
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true })));
});

async function tempHome() {
  const dir = await mkdtemp(join(tmpdir(), "screencheck-home-"));
  temps.push(dir);
  return dir;
}

describe("rename to ScreenCheck", () => {
  it("uses ~/.screencheck for a new install", async () => {
    const home = await tempHome();
    expect(appHome(home)).toBe(join(home, ".screencheck"));
  });

  it("keeps reading the old folder until ~/.screencheck exists", async () => {
    const home = await tempHome();
    await mkdir(join(home, ".screen-review-workbench"));
    expect(appHome(home)).toBe(join(home, ".screen-review-workbench"));

    await mkdir(join(home, ".screencheck"));
    expect(appHome(home)).toBe(join(home, ".screencheck"));
  });

  it("moves browser state to the new key names without overwriting newer values", () => {
    localStorage.setItem(
      "screen-review-workbench.feedback-recovery.v1:demo",
      "draft",
    );
    localStorage.setItem("screen-review-workbench:hidden-pin-statuses", "old");
    localStorage.setItem("screencheck:hidden-pin-statuses", "new");
    localStorage.setItem("unrelated", "kept");

    migrateLegacyStorage();

    expect(localStorage.getItem("screencheck.feedback-recovery.v1:demo")).toBe(
      "draft",
    );
    expect(localStorage.getItem("screencheck:hidden-pin-statuses")).toBe("new");
    expect(localStorage.getItem("unrelated")).toBe("kept");
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith("screen-review-workbench"),
      ),
    ).toEqual([]);
  });
});
