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
