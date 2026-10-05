# Screen Review Workbench

A localhost-only Bauhausian workbench for reviewing live application screens
and versioned captures with durable pin feedback.

The repository contains generic tooling and example data only. Project source,
captures, injected headers, feedback, and identities live in ignored local
configuration under `~/.screen-review-workbench`.

## Development

```bash
npm install
npm test
npm run dev
```

The server binds to `http://127.0.0.1:4173`.

## Current implementation

- Wide and compact numbered navigation with hover/focus expansion and pinning.
- Fullscreen review with overlay navigation and feedback edge panels.
- Stable screen manifests and a local Ship a Skill registration importer.
- Screen pins placed on an aspect-locked screen frame, so they stay put at any
  window size. Each comment card leads with the same numbered dot as its pin.
- Free-text tags with suggested P0/P1/P2 priorities (one at a time; new pins
  default to P1), a status of Backlog, In progress, Complete or Won't fix,
  autosaved notes, two-step delete, and deterministic JSON/Markdown exports of
  every screen (with the scope stated in the file).
- The feedback panel chunks comments by status, then by priority. Empty chunks
  are hidden and untagged comments sit under their status with no heading.
- Older feedback files are migrated on read: priority Blocking/Important/Polish
  becomes P0/P1/P2 and the category becomes a tag.
- Responsive layout: at 900px and below, screens become a numbered strip and
  the feedback panel stacks under the canvas.
- Real captures: registered projects are read from
  `~/.screen-review-workbench/projects/*.json` (override with
  `SCREEN_REVIEW_PROJECTS`) and each screen's capture is shown at full width.
  Tall captures make the page longer; the page is the scroll area, the screen
  list keeps its place, and the feedback panel follows along.
- A fixed action bar keeps the fullscreen toggle (left), Prev/Next and the
  current screen (centre), and **Add feedback** (right) in reach at the bottom
  of the window. The address bar records the project,
  version, and screen, so a reload or shared link opens the same place.

### Keyboard

| Keys | Action |
|---|---|
| ⌘F / Ctrl+F | Add feedback (replaces the browser's find in this app) |
| ← / → or [ / ] | Previous / next screen (ignored while typing) |
| Esc | Cancel placing a pin |
- Atomic file storage with serialized mutations, conflict checks, and restart
  recovery.

### Where feedback is stored

Feedback is written to disk by the server, never only to the browser:

```
~/.screen-review-workbench/feedback/<projectId>/feedback.json
```

Set `SCREEN_REVIEW_DATA` to use another folder (useful for testing). The
server prints the folder it is using on startup.

| Route | Purpose |
|---|---|
| `GET /api/projects/:projectId/feedback` | List feedback |
| `POST /api/projects/:projectId/feedback` | Create (idempotent on `clientMutationId`) |
| `PATCH /api/projects/:projectId/feedback/:id` | Update; `409` with the current record if `expectedUpdatedAt` is stale |
| `DELETE /api/projects/:projectId/feedback/:id` | Delete the expected revision |
| `GET /api/projects` | Registered projects and screens (no local paths or proxy settings) |
| `GET /api/projects/:projectId/captures/:version/:screenId` | A screen's capture image, only from inside that version's `captureRoot` |
| `POST /api/projects/:projectId/feedback/import` | Merge records saved elsewhere, keeping ids |

Every mutation must carry a loopback `Origin` header and a JSON body (1 MB
max); requests with a non-loopback `Host` header are refused. If
`feedback.json` cannot be parsed, the API returns `500` and the UI shows the
error with a Retry button — it never treats a damaged file as empty or
overwrites it.

Feedback saved by earlier builds in browser `localStorage` is imported on first
load. The browser copy is removed only after every record is accepted; anything
unreadable is left in place and reported. Project registrations, captures,
feedback, and injected headers must remain outside Git.

## Register Ship a Skill locally

Ship a Skill remains in its work repository. Register its local checkout and
external feedback file without copying either into this repository:

```bash
node scripts/import-ship-a-skill.mjs \
  --repo ~/repos/ship-a-skill-tool \
  --feedback ~/.ship-a-skill-preview/design-review-feedback-state.json
```

The registration is written under
`~/.screen-review-workbench/projects/ship-a-skill.json`. Supply the local E2E
header at runtime through `SHIP_A_SKILL_E2E_SECRET`; the secret is never stored
in Git.
