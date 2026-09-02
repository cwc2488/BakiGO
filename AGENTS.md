<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Production baseline (required)

Before branching or promoting, read `docs/PRODUCTION_BASELINE.md`.

- Branch new work from the **current integrated Production baseline**, not stale `main` or old feature branches.
- Never promote a candidate whose ancestry does not include fixes already on Production.
- Cross-branch regressions (e.g. Radar branch missing Home fixes) are deployment failures — integrate with cherry-pick/rebase, do not re-patch symptoms only.

