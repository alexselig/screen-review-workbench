import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildShipASkillRegistration } from "../scripts/import-ship-a-skill.mjs";

describe("Ship a Skill importer", () => {
  it("registers external captures without copying work assets", async () => {
    const root = path.join(tmpdir(), `ship-import-${process.pid}-${Date.now()}`);
    const manifestRoot = path.join(
      root,
      "public/design-review/screens/2026-09-29-v3",
    );
    const sourceRoot = path.join(root, "src/design-review");
    await mkdir(manifestRoot, { recursive: true });
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(
      path.join(manifestRoot, "manifest.json"),
      JSON.stringify({
        version: "2026-09-29-v3",
        screens: [
          { id: "public-landing", file: "public.webp", width: 1440, height: 1000 },
          { id: "dashboard", file: "dashboard.webp", width: 1440, height: 1000 },
        ],
      }),
    );
    await writeFile(
      path.join(sourceRoot, "catalog.ts"),
      `const SCREEN_METADATA = {
        "public-landing": { title: "Public landing", journey: "Access", realRoute: null },
        "dashboard": { title: "Dashboard", journey: "Portfolio", realRoute: null },
      };`,
    );

    const registration = await buildShipASkillRegistration({
      repo: root,
      feedbackPath: path.join(root, "feedback.json"),
    });

    expect(registration.screens).toHaveLength(2);
    expect(registration.screens[0]).toMatchObject({
      ordinal: 1,
      title: "Public landing",
      group: "Access",
    });
    expect(registration.screens[0].capturePath).toBe(
      path.join(manifestRoot, "public.webp"),
    );
    expect(JSON.stringify(registration)).not.toContain("local-design-review");
    await expect(readFile(path.join(root, "public.webp"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
