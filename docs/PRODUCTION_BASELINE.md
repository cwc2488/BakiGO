# Production baseline integration rule

## Current verified baseline

After each Production promotion, record the integrated commit SHA here and branch from it for new work.

**Integrated RC (pending promotion):** `cursor/integrated-production-baseline-f161` — merges Home/Calendar (`4e5195e`), Retail House (`3dcc14d`), Radar Score→Rank (`ca658d9`).

**Production at mission start:** `ca658d99943ad5948cefb29adf94b416af63bfcf` (Radar only — missing Home/Calendar/Retail fixes).

## Branching rule

1. **Never** branch new feature/fix work from `main` or stale feature branches unless their ancestry includes the current verified Production baseline.
2. Before marking a PR promotable, compare against current Production (`git merge-base --is-ancestor` or diff critical paths).
3. If a branch deletes or regresses fixes already on Production, reject or re-integrate — do not promote.

## Pre-promotion checklist

```bash
# Replace BASE with current Production SHA
BASE=ca658d99
git fetch origin
git merge-base --is-ancestor $BASE HEAD && echo "baseline included" || echo "MISSING BASELINE"
```

Spot-check paths after integration:

- `src/lib/home/`, `src/components/home/`
- `src/lib/calendar/`, `src/components/calendar/`
- `src/lib/retail-house/`, `src/components/retail-house/`
- `src/lib/radar/jobs/rank-integrity.ts`, `src/lib/radar/repository/score-snapshot-date.ts`

## Integration order (when branches diverged)

1. Start from the newest verified **application** baseline (Home/Calendar).
2. Cherry-pick Retail House loading/bootstrap commits.
3. Cherry-pick Radar fixes on top.
4. Run focused tests + mobile smoke scripts before opening RC PR.
