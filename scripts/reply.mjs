#!/usr/bin/env node
// Kept so existing instructions keep working; the command now lives in the
// CLI as `screencheck reply` (src/cli/reply.ts). Same flags as before.
//
//   node scripts/reply.mjs --project shop --list
import { tsImport } from "tsx/esm/api";

const { runReply } = await tsImport("../src/cli/reply.ts", import.meta.url);

try {
  process.exitCode = await runReply(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
