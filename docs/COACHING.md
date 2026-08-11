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
