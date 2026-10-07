// Full-page captures without mid-page footers.
//
// Playwright's full-page screenshot grows the capture, not the viewport, so a
// `position: fixed` or stuck `position: sticky` bar with `bottom:` is painted
// where the first screenful ends, in the middle of a long page. Before the
// shot, captureFullPage re-pins those bars to where they belong on a page
// that tall: fixed bars to the document's bottom edge, sticky bars back to
// their place in the flow. Afterwards the page is restored exactly.
//
// Usage from any Playwright script or spec:
//   import { captureFullPage } from "screencheck/capture";
//   await captureFullPage(page, { path: "screen.webp", type: "webp" });

export type PinnedChromeReport = {
  // Bars moved for the capture, described as "tag.class" for logs.
  pinned: string[];
};

// Runs in the page; must stay self-contained because Playwright serialises it.
export function pinBottomChromeInPage(): PinnedChromeReport {
  type Saved = { element: HTMLElement; style: string | null };
  const store = window as unknown as Record<string, Saved[] | undefined>;
  const key = "__screenReviewPinnedChrome";

  function describe(element: Element) {
    const className =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).join(".")}`
        : "";
    return `${element.tagName.toLowerCase()}${className}`;
  }

  if (store[key]) {
    return { pinned: store[key]!.map(({ element }) => describe(element)) };
  }

  window.scrollTo(0, 0);
  const viewportHeight = window.innerHeight;
  const root = document.scrollingElement ?? document.documentElement;
  const documentHeight = Math.max(
    root.scrollHeight,
    document.body?.scrollHeight ?? 0,
  );
  const saved: Saved[] = [];
  store[key] = saved;
  if (documentHeight <= viewportHeight + 1) return { pinned: [] };

  // Computed `bottom` resolves to pixels even when it was `auto`, so probe:
  // a bar held by its bottom edge moves once that edge is released.
  function heldByBottom(element: HTMLElement) {
    const before = element.getBoundingClientRect().top;
    const style = element.getAttribute("style");
    element.style.setProperty("bottom", "auto", "important");
    const after = element.getBoundingClientRect().top;
    element.getAttribute("style"); // flush pending CSSOM writes so the removal sticks
    if (style === null) element.removeAttribute("style");
    else element.setAttribute("style", style);
    return Math.abs(after - before) > 0.5;
  }

  const bars: { element: HTMLElement; sticky: boolean }[] = [];
  for (const element of document.querySelectorAll<HTMLElement>("body *")) {
    const style = getComputedStyle(element);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    const rect = element.getBoundingClientRect();
    if (rect.height === 0 || rect.width === 0) continue;
    // Bars only: overlays and dialogs that fill the viewport stay put.
    if (rect.height > viewportHeight / 2) continue;
    // A bar inside another moved bar travels with its parent.
    if (bars.some((bar) => bar.element.contains(element))) continue;
    if (!heldByBottom(element)) continue;
    bars.push({ element, sticky: style.position === "sticky" });
  }

  for (const { element, sticky } of bars) {
    const rect = element.getBoundingClientRect();
    const bottom = parseFloat(getComputedStyle(element).bottom) || 0;
    saved.push({ element, style: element.getAttribute("style") });
    const set = (property: string, value: string) =>
      element.style.setProperty(property, value, "important");
    if (sticky) {
      // Unstuck, a sticky bar sits where the layout puts it.
      set("position", "relative");
      set("top", "auto");
      set("bottom", "auto");
      continue;
    }
    set("position", "absolute");
    set("top", "0px");
    set("bottom", "auto");
    set("left", "0px");
    set("right", "auto");
    set("width", `${rect.width}px`);
    // Measure the containing block's origin, then place the bar so its
    // bottom edge is `bottom` px above the end of the document.
    const origin = element.getBoundingClientRect();
    set("top", `${documentHeight - bottom - rect.height - origin.top}px`);
    set("left", `${rect.left - origin.left}px`);
  }
  return { pinned: bars.map(({ element }) => describe(element)) };
}

// Runs in the page; undoes pinBottomChromeInPage.
export function restoreBottomChromeInPage() {
  type Saved = { element: HTMLElement; style: string | null };
  const store = window as unknown as Record<string, Saved[] | undefined>;
  const key = "__screenReviewPinnedChrome";
  for (const { element, style } of store[key] ?? []) {
    element.getAttribute("style"); // flush pending CSSOM writes so the removal sticks
    if (style === null) element.removeAttribute("style");
    else element.setAttribute("style", style);
  }
  delete store[key];
}

// The parts of a Playwright Page this needs, so any Playwright version works.
export type CapturePage = {
  evaluate<R>(pageFunction: () => R): Promise<R>;
  screenshot(options?: object): Promise<Uint8Array>;
};

export async function captureFullPage(
  page: CapturePage,
  options: object = {},
): Promise<PinnedChromeReport & { image: Uint8Array }> {
  const { pinned } = await page.evaluate(pinBottomChromeInPage);
  try {
    const image = await page.screenshot({ ...options, fullPage: true });
    return { image, pinned };
  } finally {
    await page.evaluate(restoreBottomChromeInPage);
  }
}
