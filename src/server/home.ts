import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME_DIR_NAME = ".screencheck";
// The tool was called Screen Review Workbench; its folder is still read when
// no ~/.screencheck exists yet, so renaming never strands saved feedback.
export const LEGACY_HOME_DIR_NAME = ".screen-review-workbench";

export function appHome(home = homedir(), exists = existsSync) {
  const current = join(home, HOME_DIR_NAME);
  const legacy = join(home, LEGACY_HOME_DIR_NAME);
  if (!exists(current) && exists(legacy)) return legacy;
  return current;
}
