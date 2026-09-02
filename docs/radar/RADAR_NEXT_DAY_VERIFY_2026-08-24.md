# RADAR-NEXT-DAY-VERIFY-01 — 2026-08-24

Read-only desktop Production check. No workers woken. No deploy. No run recreated.

Replaces the iPad cloud-agent audit, which could not read service-role Radar tables.

| Field | iPad | Desktop Production (proven) |
|---|---|---|
| Today's run exists | UNKNOWN | YES |
| pipeline_run_id | UNKNOWN | `021cd15a-d120-487a-92f6-56ba762ffb6b` |
| created / started | UNKNOWN | `2026-08-23T22:18:09.007Z` (06:18 Asia/Taipei) |
| status | UNKNOWN | `running` |
| last progress | UNKNOWN | `2026-08-24T02:15:30.528Z` (10:15 Asia/Taipei) |
| job counts | UNKNOWN | total 2443 / pending 1979 / running 0 / succeeded 420 / failed 0 / dead_letter 44 |
| rank | UNKNOWN | absent (0 rank jobs) |
| finalize | UNKNOWN | not reached (`finished_at` null) |
| today snapshot | UNKNOWN | no (`recommendation_count` = 0) |
| /radar zero cause | UNKNOWN | rank never ran, so no `member_daily_top20` for 2026-08-24 |

## Check

- Checked at: `2026-08-24T11:38:12+08:00`
- Source: Production `GET /api/radar/jobs/status` (cron-authed, read-only)
- Production: https://bakigo.tw
- Yesterday's completed run (untouched): `e65f60d5-05ef-4cc3-a375-915c6dd01e69`

## 06:00 cron / today's run

A 2026-08-24 pipeline run exists. It was created at 06:18 Asia/Taipei (`2026-08-23T22:18:09.007Z`), in the scheduled daily-pipeline window (Hobby delay from 06:00, not the 07:30 safety kick).

Discover 8/8 and enrich 201/201 already succeeded, so the daily orchestrator did invoke and the worker did process for a period.

## Job counts (`021cd15a-d120-487a-92f6-56ba762ffb6b`)

| | total | pending | running | succeeded | failed | dead_letter |
|---|---:|---:|---:|---:|---:|---:|
| all | 2443 | 1979 | 0 | 420 | 0 | 44 |
| discover | 8 | 0 | 0 | 8 | 0 | 0 |
| enrich | 201 | 0 | 0 | 201 | 0 | 0 |
| normalize | 201 | 23 | 0 | 134 | 0 | 44 |
| analyze | 133 | 56 | 0 | 77 | 0 | 0 |
| score | 1900 | 1900 | 0 | 0 | 0 | 0 |
| rank | 0 | 0 | 0 | 0 | 0 | 0 |

Normalize dead_letter (44): `MISSING_ARTIFACT` / `raw_snapshot_ids` empty — the known SUPPLY-03 leak. Not opened here.

## Rank / finalize / snapshot

- Rank: not executed (`rank_status=absent`, `rank_count=0`)
- Finalize: not executed (`status=running`, `finished_at=null`)
- Today's `member_daily_top20`: no items (`recommendation_count=0`)
- `/radar` 「今天還沒有推薦名單」 is the correct empty feed when this member has no snapshot

## Why /radar is empty

Not A (cron missing) or B (no run).

The run is stalled: **1979 pending, 0 running**, last progress **10:15 Asia/Taipei**. Score has not started (1900 pending). Rank is therefore unreachable, so no snapshot.

Classification:

- **C** worker not processing now
- **D** continuation / process wakes did not drain the queue after 10:15
- Immediate user-visible cause: **F** rank not reached → no snapshot

Not E (not actively processing). Not I (qualification never evaluated).

## Other open runs (context only)

- `92e7e520-cdd3-44f1-89f3-008f374a195a` (2026-08-22): status still `running`, pending 0, last progress 2026-08-23T11:36:41Z
- `6b9b6aed-120e-4e06-8492-a8c098ad60ae` (2026-08-21): status `running`, 0 jobs

## Verdict

- Autonomous next-day PASS: **NO**
- Requires intervention: **YES**
- Recommended next action (NOT executed): after approval, inspect why the process/continue chain stopped with 1979 pending and 0 running; drain **this existing** run `021cd15a-d120-487a-92f6-56ba762ffb6b`. Do not recreate today's run. Do not open SUPPLY-03 in that recovery unless the stall is that leak.
