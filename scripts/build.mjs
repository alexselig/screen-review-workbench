// Builds the publishable package: the client with Vite into dist/client, the
// Node entry points with esbuild into dist/, and types for screencheck/capture.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const bin = (name) => path.join(ROOT, "node_modules/.bin", name);
const run = (command, args) =>
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit" });

rmSync(DIST, { recursive: true, force: true });

run(bin("vite"), ["build"]);

const entryPoints = {
  cli: "src/cli/bin.ts",
  capture: "src/capture/full-page.ts",
};
// The MCP server is optional on a branch; bundle it whenever it exists.
for (const name of ["server", "main"]) {
  const file = `src/mcp/${name}.ts`;
  if (existsSync(path.join(ROOT, file))) entryPoints[`mcp/${name}`] = file;
}

await build({
  absWorkingDir: ROOT,
  entryPoints,
  outdir: DIST,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  // Dependencies (zod, the MCP SDK, sharp, optional playwright, dev-only vite)
  // are resolved from node_modules at runtime, never inlined.
  packages: "external",
  chunkNames: "chunks/[name]-[hash]",
  logLevel: "info",
});
chmodSync(path.join(DIST, "cli.js"), 0o755);

run(bin("tsc"), [
  "src/capture/full-page.ts",
  "--declaration",
  "--emitDeclarationOnly",
  "--outDir",
  "dist/types",
  "--target",
  "ES2022",
  "--module",
  "ESNext",
  "--moduleResolution",
  "Bundler",
  "--lib",
  "ES2022,DOM,DOM.Iterable",
  "--skipLibCheck",
]);
