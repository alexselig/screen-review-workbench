import { describe, expect, it } from "vitest";

import {
  assertLoopbackHost,
  assertMutationOrigin,
} from "../src/server/origin";

describe("local server security", () => {
  it("accepts only loopback binding", () => {
    expect(() => assertLoopbackHost("0.0.0.0")).toThrow(/127\.0\.0\.1/);
    expect(assertLoopbackHost("127.0.0.1")).toBe("127.0.0.1");
  });

  it("rejects a foreign mutation origin", () => {
    expect(() =>
      assertMutationOrigin(
        "https://evil.example",
        "http://127.0.0.1:4173",
      ),
    ).toThrow(/origin/i);
    expect(() =>
      assertMutationOrigin(
        "http://127.0.0.1:4173",
        "http://127.0.0.1:4173",
      ),
    ).not.toThrow();
  });
});
