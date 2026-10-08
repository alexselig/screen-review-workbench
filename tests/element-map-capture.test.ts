// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { captureFullPage } from "../src/capture/full-page";
import {
  elementMapSchema,
  resolvePinElement,
  type ElementMap,
} from "../src/shared/elements";

let browser: Browser;
let root: string;

beforeAll(async () => {
  browser = await chromium.launch();
  root = await mkdtemp(join(process.cwd(), "tests/.feedback-data-capture-"));
});

afterAll(async () => {
  await browser?.close();
  await rm(root, { recursive: true, force: true });
});

const VIEWPORT = { width: 400, height: 300 };

const FIXTURE = `<!doctype html><html><head><style>
  html, body { margin: 0; font: 14px sans-serif; }
  main { height: 1200px; padding: 20px; box-sizing: border-box; }
  .card { margin-top: 400px; padding: 10px; border: 1px solid #ccc; }
  footer { position: fixed; left: 0; right: 0; bottom: 0; height: 40px;
           background: rgb(242, 101, 34); display: flex; align-items: center; }
  footer button { margin-left: 250px; width: 120px; height: 28px; }
</style></head><body>
  <main>
    <h1>Pick a sailing</h1>
    <section class="card" data-testid="sailing" data-source="src/booking/SailingRow.tsx:18:4">
      <p>Arrives 09:35</p>
      <a href="#more">More <span>details</span></a>
    </section>
    <p id="react">React text</p>
    <p id="react19">React 19 text</p>
    <p id="vue">Vue text</p>
    <p id="svelte">Svelte text</p>
    <div style="display:none"><button>Hidden by display</button></div>
    <button style="visibility:hidden">Hidden by visibility</button>
    <div style="opacity:0"><button>Hidden by opacity</button></div>
    <button style="width:0;height:0;padding:0;border:0">Zero</button>
  </main>
  <footer data-testid="footer">
    <button data-source="src/booking/Footer.tsx:42">Continue to vehicle</button>
  </footer>
  <script>
    function Card() {}
    document.getElementById("react").__reactFiber$x1 = {
      type: "p",
      _debugSource: { fileName: "/app/src/Card.tsx", lineNumber: 7, columnNumber: 3 },
      _debugOwner: { type: Card },
    };
    function Summary() {}
    document.getElementById("react19").__reactFiber$x2 = {
      type: "p",
      _debugOwner: { type: Summary },
      _debugStack: { stack: "Error: react-stack-top-frame\\n    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:250:30)\\n    at Summary (http://localhost:5173/src/Summary.tsx?t=1:12:9)" },
    };
    document.getElementById("vue").__vueParentComponent = {
      type: { __file: "/repo/src/Trip.vue", __name: "Trip" },
    };
    document.getElementById("svelte").__svelte_meta = {
      loc: { file: "src/Ticket.svelte", line: 5, column: 2 },
    };
  </script>
</body></html>`;

async function pngHeight(image: Uint8Array) {
  // PNG IHDR: width at byte 16, height at byte 20, big-endian.
  return Buffer.from(image).readUInt32BE(20);
}

describe("element map capture", () => {
  let map: ElementMap;
  let image: Uint8Array;
  const capture = () => join(root, "build-1", "sailing.png");

  beforeAll(async () => {
    const tab = await browser.newPage({ viewport: VIEWPORT });
    await tab.setContent(FIXTURE);
    const result = await captureFullPage(tab, { path: capture() });
    map = result.elements!;
    image = result.image;
    await tab.close();
  });

  it("writes a valid map beside the capture and returns it", async () => {
    const written = JSON.parse(
      await readFile(join(root, "build-1", "sailing.elements.json"), "utf8"),
    );
    expect(elementMapSchema.parse(written)).toEqual(map);
    expect(map.capture).toEqual({ width: 400, height: 1200 });
    expect(await pngHeight(image)).toBe(map.capture.height);
  });

  it("boxes the re-pinned footer at the bottom of the full-page shot", () => {
    const footer = map.elements.find((item) => item.testId === "footer")!;
    expect(footer.tag).toBe("footer");
    expect(footer.selector).toBe('[data-testid="footer"]');
    expect(footer.box.y * 1200).toBeCloseTo(1160, 0);
    expect(footer.box.h * 1200).toBeCloseTo(40, 0);
    expect(footer.box.w).toBe(1);

    const button = resolvePinElement(map, { x: 300 / 400, y: 1180 / 1200 });
    expect(button).toMatchObject({
      tag: "button",
      role: "button",
      name: "Continue to vehicle",
      source: { file: "src/booking/Footer.tsx", line: 42 },
    });
    // Beside the button, the pin lands on the footer itself.
    expect(resolvePinElement(map, { x: 0.1, y: 1180 / 1200 })?.testId).toBe(
      "footer",
    );
  });

  it("resolves nested elements to the innermost one", () => {
    const section = map.elements.find((item) => item.testId === "sailing")!;
    expect(section.source).toEqual({
      file: "src/booking/SailingRow.tsx",
      line: 18,
      column: 4,
    });
    // Containers are not named after all the text inside them.
    expect(section.name).toBeUndefined();
    const link = map.elements.find((item) => item.tag === "a")!;
    expect(link).toMatchObject({ role: "link", name: "More details" });
    // Text inside the section inherits its source attribute.
    const text = map.elements.find((item) => item.name === "Arrives 09:35")!;
    expect(text.tag).toBe("p");
    expect(text.source?.file).toBe("src/booking/SailingRow.tsx");
    const centre = {
      x: text.box.x + text.box.w / 2,
      y: text.box.y + text.box.h / 2,
    };
    expect(resolvePinElement(map, centre)).toBe(text);
    expect(resolvePinElement(map, { x: 0.95, y: centre.y })?.tag).not.toBe("p");
  });

  it("leaves hidden and empty elements out", () => {
    const names = map.elements.map((item) => item.name ?? "");
    for (const hidden of [
      "Hidden by display",
      "Hidden by visibility",
      "Hidden by opacity",
      "Zero",
    ]) {
      expect(names).not.toContain(hidden);
    }
    expect(map.elements.some((item) => item.tag === "script")).toBe(false);
    expect(map.elements.find((item) => item.tag === "h1")).toMatchObject({
      role: "heading",
      name: "Pick a sailing",
    });
  });

  it("reads React, Vue and Svelte dev metadata when present", () => {
    const by = (name: string) =>
      map.elements.find((item) => item.name === name)?.source;
    expect(by("React text")).toEqual({
      file: "/app/src/Card.tsx",
      line: 7,
      column: 3,
      component: "Card",
    });
    // React 19 stacks are not source-mapped, so only the file is kept.
    expect(by("React 19 text")).toEqual({
      file: "src/Summary.tsx",
      component: "Summary",
    });
    expect(by("Vue text")).toEqual({
      file: "/repo/src/Trip.vue",
      component: "Trip",
    });
    expect(by("Svelte text")).toEqual({
      file: "src/Ticket.svelte",
      line: 5,
      column: 2,
    });
  });

  it("restores the page and can skip or relocate the map", async () => {
    const tab = await browser.newPage({ viewport: VIEWPORT });
    await tab.setContent(FIXTURE);
    const skipped = await captureFullPage(tab, {
      path: join(root, "skip.png"),
      elements: false,
    });
    expect(skipped.elements).toBeNull();
    await expect(
      readFile(join(root, "skip.elements.json"), "utf8"),
    ).rejects.toThrow();

    const target = join(root, "maps", "custom.json");
    const moved = await captureFullPage(tab, {
      path: join(root, "moved.png"),
      elements: { path: target },
    });
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual(moved.elements);
    expect(
      await tab.evaluate(
        () => getComputedStyle(document.querySelector("footer")!).position,
      ),
    ).toBe("fixed");
    await tab.close();
  });
});
