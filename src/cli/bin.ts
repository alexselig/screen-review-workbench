#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { main } from "./index";

// In the package this file is dist/cli.js and the built client sits beside it
// in dist/client. From source there is none, so serve falls back to Vite.
const clientRoot = fileURLToPath(new URL("./client/", import.meta.url));

const code = await main(process.argv.slice(2), {
  ...(existsSync(`${clientRoot}index.html`) ? { clientRoot } : {}),
});
if (code !== "running") process.exitCode = code;
