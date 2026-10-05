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
- Screen pins with category, priority, status, filters, autosaved notes, and
  deterministic JSON/Markdown exports.
- Atomic file storage with serialized mutations, conflict checks, and restart
  recovery.

The example UI currently persists through a browser `localStorage` adapter.
The next integration step is to expose `src/server/storage.ts` through
loopback-only CRUD/export routes in `src/server/index.ts`, enforce the existing
mutation Origin policy on those routes, and replace the callbacks in
`src/client/app.tsx`. Project registrations, captures, feedback, and injected
headers must remain outside Git.

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
