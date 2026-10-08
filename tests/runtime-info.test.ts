import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  clearRuntimeInfo,
  readRuntimeInfo,
  resolveOrigin,
  shouldRecordRuntime,
  writeRuntimeInfo,
} from "../src/server/runtime";

const info = {
  origin: "http://127.0.0.1:4183",
  pid: 4242,
  startedAt: "2026-10-08T00:00:00.000Z",
  dataRoot: "/d",
  projectsRoot: "/p",
};

function tempFile() {
  return join(mkdtempSync(join(tmpdir(), "sc-runtime-")), "server.json");
}

describe("runtime info", () => {
  it("round-trips while the process is alive", () => {
    const file = tempFile();
    writeRuntimeInfo(info, file);
    expect(readRuntimeInfo(file, () => true)).toEqual(info);
  });

  it("ignores a record left by a dead process or a damaged file", () => {
    const file = tempFile();
    writeRuntimeInfo(info, file);
    expect(readRuntimeInfo(file, () => false)).toBeNull();
    writeFileSync(file, "{not json");
    expect(readRuntimeInfo(file, () => true)).toBeNull();
    expect(readRuntimeInfo(join(tmpdir(), "missing-sc.json"))).toBeNull();
  });

  it("only clears its own record", () => {
    const file = tempFile();
    writeRuntimeInfo(info, file);
    clearRuntimeInfo(1, file);
    expect(JSON.parse(readFileSync(file, "utf8")).pid).toBe(4242);
    clearRuntimeInfo(4242, file);
    expect(readRuntimeInfo(file, () => true)).toBeNull();
  });

  it("resolves the origin: explicit, env, runtime file, default", () => {
    const none = () => null;
    expect(resolveOrigin("http://127.0.0.1:9/", {}, none)).toBe(
      "http://127.0.0.1:9",
    );
    expect(
      resolveOrigin(undefined, { SCREENCHECK_URL: "http://127.0.0.1:1" }, none),
    ).toBe("http://127.0.0.1:1");
    expect(
      resolveOrigin(
        undefined,
        { SCREEN_REVIEW_URL: "http://127.0.0.1:2" },
        none,
      ),
    ).toBe("http://127.0.0.1:2");
    expect(resolveOrigin(undefined, {}, () => info)).toBe(info.origin);
    expect(resolveOrigin(undefined, { PORT: "5000" }, none)).toBe(
      "http://127.0.0.1:5000",
    );
    expect(resolveOrigin(undefined, {}, none)).toBe("http://127.0.0.1:4173");
  });

  it("lets throwaway servers opt out of recording themselves", () => {
    expect(shouldRecordRuntime({})).toBe(true);
    expect(shouldRecordRuntime({ SCREENCHECK_RECORD: "1" })).toBe(true);
    expect(shouldRecordRuntime({ SCREENCHECK_RECORD: "0" })).toBe(false);
  });
});
