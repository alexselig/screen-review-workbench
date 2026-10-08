# ScreenCheck

A localhost-only Bauhausian workbench for reviewing live application screens
and versioned captures with durable pin feedback.

The repository contains generic tooling and example data only. Project source,
captures, injected headers, feedback, and identities live in ignored local
configuration under `~/.screencheck`.

> **Renamed from Screen Review Workbench.** Existing data keeps working: if
> `~/.screencheck` does not exist yet, ScreenCheck reads
> `~/.screen-review-workbench`. To move it, stop the server and run
> `mv ~/.screen-review-workbench ~/.screencheck`. The old `SCREEN_REVIEW_DATA`,
> `SCREEN_REVIEW_PROJECTS` and `SCREEN_REVIEW_URL` variables still work, and
> unsaved drafts and panel settings in the browser carry over automatically.

**Site:** https://alexselig.github.io/screencheck/ (feature tour
with screenshots).

## Development

```bash
npm install
npm test
npm run dev
```

The server binds to `http://127.0.0.1:4173`.

## Current implementation

- Wide and compact numbered navigation with hover/focus expansion and pinning.
- Fullscreen review: a slim numbered screen strip on the left that expands to
  names on hover, and a feedback edge panel on the right.
- Stable screen manifests, registered from local JSON files.
- Screen pins placed on an aspect-locked screen frame, so they stay put at any
  window size. Each comment card leads with the same numbered dot as its pin.
- Free-text tags with suggested P0/P1/P2 priorities (one at a time; new pins
  default to P1), a status of Backlog, In progress, Fixed or Won't fix,
  autosaved notes and two-step delete. Fixed pins turn teal with a check badge
  so new feedback stands out from what has already been addressed.
- **Replies close the loop.** Whoever fixes a comment (usually an agent) can
  attach a reply saying what was done, or why not, and set its status in the
  same call. The reply shows under the note on the card and in the editor,
  survives later status changes, and appears in exports.
- **Export** in the action bar opens a dialog: Markdown or JSON, all screens or
  this screen only, and which statuses to include. Exports are deterministic,
  state their scope, and keep on-screen pin numbers.
- The feedback panel chunks comments by status, then by priority. Empty chunks
  are hidden and untagged comments sit under their status with no heading.
  A card being edited stays where it is while you type, even after autosave,
  retagging or a status change; it moves to its new group when collapsed.
  A new comment always starts in Backlog and keeps the compact create form
  through its first autosave, so the editor never grows under your cursor;
  the status picker appears once you reopen it.
  Each status section has a **Hide pins / Show pins** switch on its right;
  Fixed pins are hidden by default and the choice is remembered per browser.
- **Approve screen** is pinned to the foot of the feedback panel. One click
  approves the screen (teal, "Screen approved"); click again to unapprove.
  Approvals are saved per version and screen in `approvals.json`. Approved
  screens carry a teal check left of their number in the screen index, expanded,
  collapsed and fullscreen. The open-comment count is a matching orange badge
  in the same spot. Numbers stay dead center; badges hang off their left edge,
  and a screen that is approved and still has open comments stacks the check
  above the count so both fit the collapsed rail.
- A **Showing** strip above each capture says exactly what it shows (for
  example "Step 3 of 5, manual path selected"). Click it to edit; Enter saves,
  Esc cancels. Text is saved per version and screen in `captions.json`; a
  screen's optional manifest `description` is the default, and clearing an
  edit restores it.
- Older feedback files are migrated on read: priority Blocking/Important/Polish
  becomes P0/P1/P2 and the category becomes a tag.
- Responsive layout: at 900px and below, screens become a numbered strip and
  the feedback panel stacks under the canvas.
- Real captures: registered projects are read from
  `~/.screencheck/projects/*.json` (override with
  `SCREENCHECK_PROJECTS`) and each screen's capture is shown at full width.
  The frame takes each capture's own proportions (never stretched to the
  registered viewport), so tall captures make the page longer; the page is the
  scroll area, the screen
  list keeps its place, and the feedback panel follows along.
- A fixed action bar keeps the fullscreen toggle (left), Prev/Next and the
  current screen (centre), and **Export** and **Add feedback** (right) in reach at the bottom
  of the window. The address bar records the project,
  version, and screen, so a reload or shared link opens the same place.

### Keyboard

| Keys           | Action                                                 |
| -------------- | ------------------------------------------------------ |
| ⌘F / Ctrl+F    | Add feedback (replaces the browser's find in this app) |
| ← / → or [ / ] | Previous / next screen (ignored while typing)          |
| Esc            | Cancel placing a pin                                   |

- Atomic file storage with serialized mutations, conflict checks, and restart
  recovery.

### Where feedback is stored

Feedback is written to disk by the server, never only to the browser:

```
~/.screencheck/feedback/<projectId>/feedback.json
```

Set `SCREENCHECK_DATA` to use another folder (useful for testing). The
server prints the folder it is using on startup.

| Route                                                      | Purpose                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/projects/:projectId/feedback`                    | List feedback                                                                                                                                                |
| `POST /api/projects/:projectId/feedback`                   | Create (idempotent on `clientMutationId`)                                                                                                                    |
| `PATCH /api/projects/:projectId/feedback/:id`              | Update; `409` with the current record if `expectedUpdatedAt` is stale. Patch `reply: {note, author?}` to answer (server stamps `at`), `reply: null` to clear |
| `DELETE /api/projects/:projectId/feedback/:id`             | Delete the expected revision                                                                                                                                 |
| `GET /api/projects`                                        | Registered projects and screens (no local paths or proxy settings)                                                                                           |
| `GET /api/projects/:projectId/captures/:version/:screenId` | A screen's capture image, only from inside that version's `captureRoot`                                                                                      |
| `GET /api/projects/:projectId/elements/:version/:screenId` | A screen's element map (`<capture>.elements.json`), only from inside `captureRoot`; `404` when there is none, `500` if malformed                             |
| `POST /api/projects/:projectId/feedback/import`            | Merge records saved elsewhere, keeping ids                                                                                                                   |
| `GET /api/projects/:projectId/approvals`                   | Approved screens (stored beside `feedback.json` in `approvals.json`)                                                                                         |
| `PUT /api/projects/:projectId/approvals`                   | Set `{version, screenId, approved}`; returns the full list                                                                                                   |
| `GET /api/projects/:projectId/captions`                    | Screen descriptions (stored beside `feedback.json` in `captions.json`)                                                                                       |
| `PUT /api/projects/:projectId/captions`                    | Set `{version, screenId, text}`; empty text clears; returns the list                                                                                         |

Every mutation must carry a loopback `Origin` header and a JSON body (1 MB
max); requests with a non-loopback `Host` header are refused. If
`feedback.json` cannot be parsed, the API returns `500` and the UI shows the
error with a Retry button — it never treats a damaged file as empty or
overwrites it.

Feedback saved by earlier builds in browser `localStorage` is imported on first
load. The browser copy is removed only after every record is accepted; anything
unreadable is left in place and reported. Project registrations, captures,
feedback, and injected headers must remain outside Git.

## Closing the loop (for agents)

After working through exported feedback, an agent answers each comment with
`scripts/reply.mjs`, which talks to the running ScreenCheck server:

```bash
# Open comments, tab-separated: id, version/screen pin N, status, tags, note
node scripts/reply.mjs --project shop --port 4173 --list

# Say what was done and mark it Fixed (or --status wont-fix with the reason)
node scripts/reply.mjs --project shop --port 4173 \
  --id <feedbackId> --status fixed --author Copilot \
  --note "Moved the footer to the end of the page."
```

`--status` accepts `fixed`, `wont-fix`, `in-progress` or `backlog` and may be
left out to reply without moving the comment. `--clear` removes a reply.
Markdown exports list each comment's `id` so the agent can address it; if the
reviewer edits a comment at the same moment, the script re-reads and retries
once.

## Register a project

Each project is one JSON file in `~/.screencheck/projects/` (or
`SCREENCHECK_PROJECTS`). Captures stay wherever they already live; each
version points at its folder:

```json
{
  "id": "shop",
  "name": "Shop",
  "versions": [
    { "id": "build-42", "captureRoot": "/path/to/captures/build-42" }
  ],
  "screens": [
    {
      "id": "checkout",
      "ordinal": 1,
      "title": "Checkout",
      "group": "Buy",
      "description": "Step 2 of 3, saved card",
      "capturePath": "checkout.png",
      "viewport": { "width": 1440, "height": 1000 }
    }
  ]
}
```

A capture must sit inside its version's `captureRoot`. To register a project
from its own manifests, keep a small importer script beside the registrations
rather than in this repository.

## Capturing long pages

Playwright's `fullPage` screenshot grows the capture, not the viewport, so a
footer or action bar with `position: fixed; bottom: 0` (or a stuck
`position: sticky; bottom: 0`) is painted at the bottom of the _first screen_,
in the middle of a long page. Capture scripts should use the helper instead:

```ts
import { captureFullPage } from "../screencheck/src/capture/full-page";

await captureFullPage(page, { path: "capture.webp", type: "webp" });
```

It moves bottom-anchored bars (at most half the viewport tall) to the end of the
document, takes the full-page shot, then restores their inline styles exactly.
Headers, full-screen dialogs, and pages shorter than the viewport are left
alone. Apps that scroll an inner container (a `100vh` body with its own
scroller) are not covered; capture those by scrolling the container instead.

## Element map

When `captureFullPage` is given a `path`, it also writes an element map beside
the capture: `checkout.png` gets `checkout.elements.json`. It records the
visible, meaningful elements after the footer adjustments, so the boxes line up
with the full-page shot:

- interactive elements (links, buttons, fields, anything with a `role` or
  `tabindex`), headings, images, `header`/`nav`/`main`/`footer`/`aside` and
  labelled sections and forms, anything with `data-testid`, and blocks that
  hold text directly;
- for each: its box as fractions of the capture (like pin coordinates), role,
  accessible name (120 characters at most), tag, `data-testid`, a short
  selector (test id, then id, then a short CSS path) and, when it can tell,
  the source file.

Hidden, zero-size and `opacity: 0` elements are left out, and a page keeps at
most 2000 (interactive and tagged elements first). Pass `elements: false` to
skip the map or `elements: { path }` to write it elsewhere; the map is also
returned as `result.elements`.

A pin then names the element under it (the smallest box containing it): the
comment card shows `↳ button "Continue to vehicle" · Footer.tsx:42`, and
exports add `Element: button "Continue to vehicle" (src/booking/Footer.tsx:42)`
in Markdown and an `element` object in JSON. Screens without a map simply show
nothing. The shared helpers live in `src/shared/elements.ts`
(`elementMapSchema`, `resolvePinElement`, `describeElement`).

**Source files** are best effort, read in this order, and never required:

1. Attributes on the element or its nearest annotated ancestor:
   `data-source="src/booking/Footer.tsx:42:7"`, react-dev-inspector's
   `data-inspector-relative-path` / `-line` / `-column`,
   `data-source-file` / `-line`, Sentry's `data-sentry-source-file` and
   `data-sentry-component`, or `data-component`.
2. React development builds: `_debugSource` (React 18 and earlier) gives file,
   line and component; React 19 gives the component name and the file from its
   dev stack (no line, since dev-server stacks are not source-mapped).
3. Vue development builds: the component's `__file` and name.
4. Svelte development builds: `__svelte_meta.loc`.

To opt a build in, capture a development build, or add a compile-time plugin
that stamps JSX with a source attribute: for example
`@react-dev-inspector/babel-plugin` (Babel),
`@sentry/babel-plugin-component-annotate`, or an SWC plugin that writes
`data-source="file:line"`. Keep it out of production builds.

## Project site

`docs/` is the GitHub Pages site. Its screenshots come from a made-up ferry app
("Tidewater") so no real project appears in them. To regenerate them:

```bash
node scripts/site/build-shots.mjs          # writes docs/assets/*.png
node scripts/site/build-shots.mjs --serve  # leaves the seeded demo running on :4196
```

The script renders each demo screen through `captureFullPage` (which also
writes each screen's element map; the demo markup carries `data-source`
attributes so cards show a file), registers them
in a temporary folder, starts a server on port 4196 with temporary data, seeds
the comments, replies and approvals through the API, and captures the shots
listed in `scripts/site/shots.mjs`. Nothing touches `~/.screencheck`.
