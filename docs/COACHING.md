# AI 陪跑（AI Coaching）

## Status

**Phase 1 — active product module**

Phase 1 establishes the daily reporting loop, Day 1 onboarding, coach dashboard, and meal photo storage. **No AI in Phase 1.**

Consultation Engine remains `experimental_hidden` and is not used by coaching.

## Product philosophy

- **持續 > 完美** — optimize for daily participation, not nutritional perfection.
- Coaching is **not** a calorie tracker or food police.
- Future AI may increase **intervention level** but must not increase **blame or emotional pressure**.
- Core principle: **「要求可以提高，情緒壓力不能提高。」**

## Customer access

- Reuse existing **`customer_portal_tokens`** and `/c/{token}/coaching`.
- Customers are **not** members and do **not** log in.
- Coaching data is **cloud-first only** (no localStorage persistence).

## Phase 1 scope

### In scope

- Coaching enrollment (start / pause / resume / complete)
- Enrollment-level plan snapshot (`plan_snapshot_json`)
- Day 1 onboarding with `onboarding_completed_at`
- Daily logs: meals + water + sleep + exercise + bowel movement + customer note
- Meal photos via private Supabase Storage bucket
- Coach dashboard (objective today status only)
- Reuse `body_composition_records` for weekly results
- Read-only display of existing customer progress photos (base64, coach-managed)

### Out of scope (Phase 2+)

- AI meal analysis or coaching suggestions
- Calorie / macro / nutrition database
- Push notifications, streaks, gamification
- AI risk ranking or trend engine
- Automatic plan modification
- Consultation integration
- Customer member accounts
- Refactoring progress photos off base64

## Phase 2c — Production Daily Coach Integration

**Status:** Wired. Daily submit enqueues generation jobs; service-role worker processes with claim/retry/stale recovery; customer complete page polls customer-facing fields; coach dashboard/detail show deterministic intervention + AI wording.

**Authority:** System owns priorities / evidence / recurring / improved / coach attention / final intervention. AI owns wording only (`coaching_daily_v2b7` + `gpt-4o-mini-2024-07-18`).

**Worker:** `POST|GET /api/coaching/jobs/process` with `Authorization: Bearer $COACHING_CRON_SECRET` (also accepts `CRON_SECRET` / `RADAR_CRON_SECRET`). Default batch limit = 10.

**Cron note:** Vercel Hobby only allows daily Cron Jobs. Minute-level Vercel Cron requires Pro (`* * * * *` on `/api/coaching/jobs/process`). Until then use an external scheduler POSTing the same route every minute, or upgrade to Pro and set `CRON_SECRET` equal to `COACHING_CRON_SECRET` (Vercel Cron GET auto-sends `Authorization: Bearer $CRON_SECRET`).

**Not deployed to Customer AI until product confirmation.** Controlled eval public route removed; build no longer runs eval hook.

## Phase 2a — Memory Architecture + Cost Telemetry

**Status:** Complete (folded into 2c). Schema, types, snapshot builder, cost telemetry, and async generation path.

### Memory layers (`buildCoachingInputSnapshot()`)

| Layer | Contents |
|-------|----------|
| **Profile Memory** | Goal, plan snapshot, customer context, baseline body measurement |
| **Rolling Memory** | 14-day deterministic aggregates + recurring patterns + last 3 days raw summary |
| **Outcome Memory** | Baseline vs latest body measurement, trend deltas (weight, body fat, visceral fat, etc.) |
| **Coach Directives** | Future coach-set focus / priority / instruction (`coaching_coach_directives`) |
| **Today Context** | Today's meals, photo storage refs, water, sleep, exercise, bowel, customer note |

AI memory source is **DB only** — never model chat history.

### Intervention domain rule (non-negotiable)

- **要求可以提高，情緒壓力不能提高。**
- One week flat → **observe first** (`intervention_level: observe`)
- Two consecutive weeks no overall improvement or worsening trend → future AI may raise intervention — **without blame**
- Strictness must combine: execution, 14-day patterns, body data, coach directives — never single meal or single weight alone

### AI output writeback

Structured `output_json` fields: `tomorrow_focus`, `recurring_issue`, `improved_issue`, `coach_attention_required`, `proposed_intervention_level`. Authoritative intervention is `final_intervention_level` on the row (deterministic).

See [COACHING_AI_PHASE2_PLAN.md](./COACHING_AI_PHASE2_PLAN.md) for architecture history.

## Future AI domain rules (Phase 2+ — not implemented)

AI context must include:

1. Today's meals
2. Recent multi-day eating patterns
3. Water, sleep, exercise, bowel movement
4. Customer notes
5. Recent body measurements
6. Visual body changes (future)
7. Goal and coaching plan snapshot
8. Historical adherence

Human coach principles to preserve in AI design:

- Single deviations → light reminder + concrete alternatives
- Do not require perfection every meal
- Repeated issues → higher intervention, one priority change at a time
- Judge outcomes across weight, body fat, muscle, visceral fat, posture, and adherence
- One week flat → observe first
- Two weeks no improvement or worsening trend → increase intervention (water, sleep, cardio, tighter execution) **without blame**

AI must **not**:

- Provide medical diagnosis
- Materially change product plan without coach
- Impose extreme calorie restriction
- Declare success/failure from weight alone

Escalate to human coach when outside safe bounds.

## Timezone

Daily `log_date` uses **`Asia/Taipei`** calendar day via server-side `coachingTodayLogDate()`.
