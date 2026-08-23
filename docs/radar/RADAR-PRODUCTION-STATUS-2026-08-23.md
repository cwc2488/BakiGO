# RADAR PRODUCTION STATUS — 2026-08-23

Read-only production status check.

**Check time:** 2026-08-23 13:42 Asia/Taipei (UTC 05:42)

**Scope:** Production runtime / database / API verification only. No code changes, DB writes, job retries, cron triggers, or deploys were performed during this audit.

---

## Deployment

- **GitHub Production deployment (queryable)**
  - commit SHA: `70f576db81c876b617cb0fbaaae65cbe771f7bf0` (short: `70f576d`)
  - deployment time: `2026-08-20T14:53:56Z` (Taipei: 2026-08-20 22:53:56)
  - status: **success** (GitHub Deployments API)
- **Actual Production runtime (`bakigo.tw`)**
  - `/radar` → HTTP 200
  - `/api/radar/feed` → HTTP 401 `{"ok":false,"error":"Unauthorized"}` (**endpoint exists**)
  - `/api/radar/today` → HTTP 401 `{"error":"Unauthorized"}`
  - `/api/radar/jobs/process` → HTTP 401 `{"error":"Unauthorized"}`
- **Important discrepancy:** `/api/radar/feed` is deployed in production but is **not present** in GitHub commit `70f576d`. Actual live code may differ from the latest GitHub-tracked Production deployment SHA.
- **Actual live commit SHA:** **UNKNOWN** (Vercel headers / JS bundles did not expose git SHA; Vercel CLI was not authenticated)

---

## Today Run

- **UNKNOWN** (no `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ACCESS_TOKEN`; cannot query `radar_pipeline_runs`)
- Supplement: anon key query on `radar_pipeline_runs` returned `42501 permission denied` → **table exists**, but data is not readable

---

## Queue

- **UNKNOWN** (cannot query `radar_jobs`)
- Supplement: `radar_jobs` table exists (permission denied, not table-not-found)

---

## Stuck Jobs (run `92e7e520-cdd3-44f1-89f3-008f374a195a`)

- **UNKNOWN** (cannot query running jobs for that run)

---

## Worker

- **UNKNOWN** (cannot query `radar_pipeline_job_runs` or worker invocation logs)
- Supplement: current time is past today's designed windows (cron 06:00, safety kick 07:30 Asia/Taipei), but **runtime evidence of worker execution is unavailable**

---

## Pipeline Stage

| Stage | Status |
|---|---|
| ingestion | **UNKNOWN** |
| normalization | **UNKNOWN** |
| analysis | **UNKNOWN** |
| scoring/ranking | **UNKNOWN** |
| recommendation persistence | **UNKNOWN** |

Supplement: the following production tables **all exist** (anon SELECT denied):

- `candidate_pool`
- `candidate_content_snapshots_raw`
- `candidate_analysis_runs`
- `member_daily_top20`
- `member_recommendation_occurrences`
- `source_fetch_audit_log`
- `radar_pipeline_job_runs`

---

## Recommendations

- count: **UNKNOWN**
- run_id: **UNKNOWN**
- latest `created_at`: **UNKNOWN**
- if count is 0, pipeline stop layer: **UNKNOWN** (requires service role queries across stage tables)

---

## API /radar/today

- Without member auth → **HTTP 401** `{"error":"Unauthorized"}`
- `/api/radar/feed` also returns **HTTP 401**
- Per audit rules, auth was **not bypassed**; response body could **not be directly verified**
- Supplement: production UI bundle contains empty-state copy **「今天還沒有推薦名單」** (`/_next/static/immutable/chunks/1ul5yl9-q7fjj.js`). This only proves the UI logic is deployed, not today's API payload.

---

## Primary Blocker

This Cloud Agent environment had **no Production DB read credentials** (only anon/publishable key; `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, and Vercel CLI were unavailable). Radar tables are service-role only, so run / queue / worker / recommendation state could not be verified from real production data.

Secondary concern: latest GitHub Production deployment (`70f576d`, 2026-08-20) may be out of sync with live runtime (which includes `/api/radar/feed`).

---

## Recommended Next Action

Run the following **read-only SQL** in Supabase SQL Editor or via `npx vercel env run --environment=production` (service role required):

```sql
-- 1) Today run
SELECT id, run_date, status, started_at, finished_at, counts
FROM radar_pipeline_runs
WHERE run_date = '2026-08-23'
ORDER BY started_at DESC;

-- 2) Queue summary
SELECT status, COUNT(*) FROM radar_jobs GROUP BY status ORDER BY status;

-- 3) Running jobs detail
SELECT id, job_type, started_at, pipeline_run_id
FROM radar_jobs WHERE status = 'running'
ORDER BY started_at;

-- 4) Old run stuck check
SELECT id, job_type, status, started_at, finished_at
FROM radar_jobs
WHERE pipeline_run_id = '92e7e520-cdd3-44f1-89f3-008f374a195a'
  AND status = 'running';

-- 5) Worker activity today (Asia/Taipei)
SELECT status, COUNT(*), MAX(started_at), MAX(finished_at)
FROM radar_pipeline_job_runs
WHERE started_at >= '2026-08-22T16:00:00Z'  -- 2026-08-23 00:00 Taipei
GROUP BY status;

-- 6) Recommendations today
SELECT COUNT(*), MAX(created_at), array_agg(DISTINCT pipeline_run_id)
FROM member_recommendation_occurrences
WHERE snapshot_date = '2026-08-23';
```

Then verify API-layer results with an authenticated member session:

- `GET /api/radar/today`
- `GET /api/radar/feed`

---

## Production PASS

**NO**

**Reasons:**

1. Could not confirm today's pipeline / worker / recommendations from Production DB
2. Could not verify `/api/radar/today` actual response (member auth required)
3. GitHub deployment SHA may not match live runtime
4. User report of empty recommendations today is **not contradicted** by this audit, but also **not disproven** by DB evidence

---

## Audit Evidence Summary

| Check | Method | Result |
|---|---|---|
| Production site live | `https://bakigo.tw` | 200 |
| Radar API routes exist | unauthenticated probe | 401 (not 404) |
| Supabase project | client bundle / env | `ubdrkrvyyrqdvlehzhsz.supabase.co` |
| Radar tables exist | anon REST probe | `42501 permission denied` |
| GitHub latest Production deploy | GitHub Deployments API | `70f576d`, success, 2026-08-20 |
| DB run/queue/worker state | service role required | **UNKNOWN** |
