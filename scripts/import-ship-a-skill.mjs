#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function argument(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}

function titleize(id) {
  return id
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function metadataFromCatalog(source) {
  const records = new Map();
  const pattern =
    /"([^"]+)":\s*\{\s*title:\s*"([^"]+)",\s*journey:\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    records.set(match[1], { title: match[2], group: match[3] });
  }
  return records;
}

export async function buildShipASkillRegistration({
  repo,
  feedbackPath,
  liveOrigin = "http://127.0.0.1:3000",
}) {
  const resolvedRepo = path.resolve(repo);
  const manifestPath = path.join(
    resolvedRepo,
    "public",
    "design-review",
    "screens",
    "2026-09-29-v3",
    "manifest.json",
  );
  const catalogPath = path.join(
    resolvedRepo,
    "src",
    "design-review",
    "catalog.ts",
  );
  const [manifestRaw, catalogSource] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(catalogPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestRaw);
  const metadata = metadataFromCatalog(catalogSource);
  const captureRoot = path.dirname(manifestPath);

  return {
    id: "ship-a-skill",
    name: "Ship a Skill",
    sourceRoot: resolvedRepo,
    feedbackPath: path.resolve(feedbackPath),
    proxy: {
      targetOrigin: liveOrigin,
      injectedHeaders: {
        "x-ship-a-skill-e2e": {
          environment: "SHIP_A_SKILL_E2E_SECRET",
        },
      },
    },
    versions: [
      {
        id: manifest.version,
        captureRoot,
      },
    ],
    screens: manifest.screens.map((screen, index) => {
      const item = metadata.get(screen.id);
      return {
        id: screen.id,
        ordinal: index + 1,
        title: item?.title ?? titleize(screen.id),
        group: item?.group ?? "Ship a Skill",
        liveUrl: `${liveOrigin}/design-review#tab=current&screen=${encodeURIComponent(screen.id)}`,
        capturePath: path.join(captureRoot, screen.file),
        viewport: {
          width: screen.width,
          height: screen.height,
        },
      };
    }),
  };
}

async function main() {
  const repo = argument("--repo");
  const feedbackPath = argument("--feedback");
  const output =
    argument("--out") ??
    path.join(
      homedir(),
      ".screen-review-workbench",
      "projects",
      "ship-a-skill.json",
    );
  if (!repo || !feedbackPath) {
    throw new Error(
      "Usage: import-ship-a-skill.mjs --repo <path> --feedback <path> [--out <path>]",
    );
  }
  const registration = await buildShipASkillRegistration({
    repo,
    feedbackPath,
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(registration, null, 2)}\n`, "utf8");
  console.log(output);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
