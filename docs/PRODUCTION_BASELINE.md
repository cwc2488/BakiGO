# Production Baseline (Authoritative)

> **DO NOT ASSUME `main` IS PRODUCTION BASELINE.**
>
> Always read this file before starting a Cursor / Cloud Agent mission.
> Branch new work from the **Authoritative Production commit** recorded below.

## Authoritative Production

| Field | Value |
|---|---|
| **Authoritative branch** | `main` (after PRODUCTION-BASELINE-RECONCILE-01) |
| **Reconcile source tip** | `7ef61c8` (`cursor/go21-coach-console-f161`) — last Production deploy before stale-`main` regression |
| **Reconcile date** | 2026-09-02 |
| **Cleanup mission** | Production Cleanup + Calendar Sync (Radar / lists / quiz hub / partner care / life / cleaning-roster retired) |
| **Must preserve** | See inventory below |

### How this was chosen

GitHub Production deployments before PR #38/#39:

1. `e9f9dc1` — integrated-production-baseline (Radar recovery)
2. `9b1eb6d` — customer-calendar-participants
3. `df43222` — next-activity-picker-alliance
4. `7ef61c8` — go21-coach-console ← **last good Production**
5. `dae4264` / `0b008c6` — stale `main` merges that **regressed** Radar/Home/Customer

`main` had diverged (~63 ahead / ~101 behind the f161 stack) and still contained Radar as「開發中」placeholder. Merging consultation fixes from that stale `main` overwrote the f161 Production lineage.

## Must-preserve modules

- **App shell / nav** — 我的｜顧客｜行事曆
- **Home** — current Home UI, Taipei month rollover, quota-safe metrics
- **Customer Hub** — 我的顧客 (retired: AI Radar / 我的名單 / 名單追蹤 / 心理測驗 hub / 陪跑 dashboard / 轉介紹中心)
- **Calendar** — V2 UX, recurring, shared Google Calendar, participants, cloud write-through sync
- **Consultation** — single-event lifecycle + **one-tap**「完成諮詢」(PR #38/#39 semantics)
- **Quick Consultation** — Home / Daily Action only (not Calendar scheduled completion)
- **Measurement** — Calendar result-capture UX unchanged
- **Retail House / points / leaderboard / learning / recognition / 21D portal / lose2kg**
- **Organization tree** — 我的組織 retained (夥伴關懷 retired)
- **Public funnels** — `/join`, `/transform`, `/quiz/fat-loss`, `/q`, `/analysis`, `/experience` retained

## Intentionally excluded (Preview / Do-not-Promote only)

Do **not** promote additional open Preview work unless explicitly accepted. Stack through `7ef61c8` already includes PRs that were actually Production-deployed (#35–#37 lineage). Newer unaccepted Preview-only work stays out.

## Branching rules for future agents

1. Read this file first.
2. `git fetch origin && git checkout main && git pull`
3. Confirm HEAD includes authoritative markers via `npm run check:production-baseline`
4. Create feature branch: `cursor/<name>-XXXX` **from current `main`**
5. **Never** branch from stale feature branches that do not contain this baseline
6. Before merge: run `npm run check:production-baseline` + targeted regressions for any shared-layer touch (`AppNav`, `HomePage`, `CustomerJourneyHub*`, `CalendarPage`, `globals.css`)
7. Shared-layer conflicts: semantic review only — never blind `ours`/`theirs`

## Pre-merge checklist

```bash
npm run check:production-baseline
npm test -- src/lib/calendar/
npx tsc --noEmit
npm run build
```

## Related scripts

- `npm run check:production-baseline` → `scripts/assert-production-baseline.ts`
- `npx tsx scripts/smoke-consultation-lifecycle.ts`
