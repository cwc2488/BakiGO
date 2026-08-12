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
- Customer may report **today / yesterday / day-before-yesterday** only (`Asia/Taipei` calendar days). Server validates the same 3-day allowlist.
- Each `log_date` has its own daily log, photos, AI output, fingerprint, and generation job. Backfill must not overwrite another day's AI output.
- Rolling 14-day memory naturally includes backfilled days on the next generation; completed today AI is not force-regenerated.

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

**Authority:** System owns priorities / evidence / recurring / improved / coach attention / final intervention. AI owns wording only (`coaching_daily_v2d` + `gpt-4o-mini-2024-07-18`).

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
| **Coach Action Memory** | Coach-only resolution context (`coaching_coach_actions`) — distinct from Directives |
| **Relevant Coach Action Context** | Deterministic Known Context subset for active issues (`buildRelevantCoachActionContext`) — carry forward when discussing matching reasons |
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

## Phase 3a — Coach Attention Engine (deterministic)

**Status:** Engine + contracts + golden tests (CC-A～CC-L). Command Center UI / Timeline / persistence wire-up come in 3b–3e.

### Authority

| Owns | Does not own |
|------|----------------|
| Attention tier, reason codes, evidence, measurement reminder flag, recommended action type | GPT ranking / severity invention |
| Derives from Phase 2 `final_intervention_level`, signals, outcome, rolling memory | Replacing Phase 2 intervention / outcome engines |

Positive progress **never** overrides `coach_attention` or `watch`.

### Data contract

- Types: `src/types/coaching-attention.ts` → `CoachingAttentionAssessment`
- Policy constants: `src/lib/coaching/attention/coach-attention-policy.ts` (centralized; provisional flags explicit)
- Engine: `src/lib/coaching/attention/assess-coach-attention.ts`

### Attention precedence (high → low)

1. `coach_attention` — Phase 2 `final_intervention_level === coach_attention` / `coachAttention.required` / extreme sustained non-reporting
2. `watch` — intervention watch, recurring patterns, sustained/short non-reporting (after grace), two-period flat, recurring hunger, etc.
3. `positive_progress` — improving body outcome + stable execution, and no higher issue
4. `routine` — default

`measurementReminder` is orthogonal: `baseline_only` past provisional follow-up window → Command Center section `measurement_due`. Copy must say waiting for retest — never “沒有進步”.

### Non-reporting (product-confirmed)

- Before Taipei `todayGraceHourTaipei` (20:00): missing today = `today_not_yet_reported` only
- Short gap / sustained use **dense** completed-day misses + rolling `submission_inconsistent`
- Thresholds live only in `COACHING_NON_REPORTING_POLICY`
- Same UI tier (`watch`) may apply to 2-day and 4-day gaps, but **rankScore** must prefer longer gaps

### Measurement reminder (product-confirmed)

- `measurement_due` when latest valid measurement is **≥ 14 days** ago
- Copy =「建議安排回測」— never overdue / failure / flat
- `baseline_only` alone is **not** a failure state

### Coach Action Memory (proposal)

- Directives table ≠ action / acknowledgement log
- Proposed schema: `docs/proposals/031_coaching_coach_actions.proposal.sql`
- Engine already accepts `recentCoachActions` for CC-K/CC-L (suppress duplicate recommendation for 48h; does **not** permanently clear underlying tier)
- Persist + GenerationInput hook = Phase 3d / 3e

### Relevant Coach Action Context (Phase 3d)

- Selects **recent + material + reason-relevant + unresolved/currently-relevant** notes only
- Prompt exposes `relevantCoachActionContext.knownContexts` as Known Context (not the full recent dump)
- Schema limitation: no `confirmed_customer_context` vs `coach_internal_note` distinction yet — material notes matching active reasons are treated as coaching Known Context until a later migration
- Prompt version: `coaching_daily_v3d2`


### Out of scope for 3a

Command Center UI, Timeline, notifications, agents, production migrate of coach actions.

## Phase 3b — Coach Command Center

**Status:** Batch read + dense calendar + ranking + UI. No OpenAI on page load.

| Piece | Location |
|-------|----------|
| Batch loader | `src/lib/coaching/attention/load-command-center-batch.ts` (≤5 queries, no N+1) |
| Assemble / search / filter | `src/lib/coaching/attention/assemble-command-center.ts` |
| Dense calendar | `src/lib/coaching/attention/build-dense-submission-calendar.ts` |
| API | `GET /api/coaching/command-center` |
| UI | `/coaching` → `CoachingCommandCenterPage` |

Detail navigation reuses `/coaching/[enrollmentId]`. Timeline / Coach Actions = Phase 3c / 3d.

## Phase 3c — Customer Timeline & Evidence Traceability

**Status:** Derived timeline (no event table) + evidence deep-link from Command Center.

| Piece | Location |
|-------|----------|
| Contract | `src/types/coaching-timeline.ts` |
| Event builder | `src/lib/coaching/timeline/build-timeline-events.ts` |
| Batch loader | `src/lib/coaching/timeline/load-coaching-timeline.ts` (ownership + ≤4 queries) |
| APIs | `GET .../timeline`, `GET .../meal-photos` (lazy sign) |
| UI | Detail tabs `總覽｜歷史紀錄` + `CoachingTimelinePanel` |
| Deep link | Command Center `查看原因` → `?tab=timeline&focusDates=&reasonCodes=` |

**Intervention history:** derived only from consecutive completed `coaching_ai_outputs.final_intervention_level` changes. No fake history when outputs are missing.

**Coach Action events:** contract reserved; not emitted until Phase 3d persistence.
