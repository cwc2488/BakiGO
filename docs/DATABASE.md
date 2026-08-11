# Baki GO — Database

## Purpose

This document defines the data model, persistence strategy, and conventions for Baki GO. The schema supports a **Network Marketing Business Operating System** with **single entry of data** and **automatic calculation** of all statistics.

## Principles

1. **Source of truth** — Store raw, user-entered activity data; compute aggregates rather than duplicating them.
2. **No redundant fields** — Avoid columns that mirror calculated values unless required for performance and documented here.
3. **Auditability** — Prefer timestamps and clear ownership on mutable records.
4. **Scalability** — Design for growth in organizations, members, downlines, and activity history.
5. **Long-term thinking** — Schema decisions should still make sense five years from now.

## Technology

PostgreSQL via **Supabase**. Coach customer CRM and consultation sessions use dedicated tables with owner-only RLS. Member workspace data uses `member_app_data` JSON blobs.

## Entity Overview

### Organization & members

See migrations `001_cloud_foundation.sql`, `004_member_app_data.sql`.

### Customer CRM (`008_customers.sql`+)

| Table | Purpose |
|-------|---------|
| `customers` | Coach-owned prospect/client profile |
| `body_composition_records` | InBody-style measurements (append-only history) |
| `customer_portal_tokens` | Magic-link read-only portal |
| `customer_progress_photos` | Before/after photos |
| `customer_receipt_photos` | Coach-only receipt photos |

**Customer profile fields:** `display_name`, `phone`, `line_id`, `birth_year` (legacy), `birth_date` (preferred when available), `height_cm`, `sex` (`male` | `female` | `other` | `prefer_not_to_say`, nullable), `region`, `occupation`, `status`, `pipeline_lead_id`, `linked_member_id`, follow-up dates, single `note`.

Migration `024_customers_profile_extension.sql` adds `birth_date`, `region`, `occupation`. Migration `025_customers_sex.sql` adds nullable `sex` with enum check. When a full birthday is captured, persist `birth_date` and derive `birth_year` for legacy compatibility.

### Quiz icebreaker (`021_quiz_icebreaker_v1.sql`+)

| Table | Purpose |
|-------|---------|
| `quiz_definitions` | Quiz catalog |
| `quiz_share_links` | Partner attribution codes |
| `quiz_responses` | Respondent sessions |
| `quiz_results` | Scored outcomes |
| `quiz_ai_followups` | Rule-based follow-up messages |

### Consultation Engine V1 (`023_consultation_engine_v1.sql`)

**Status:** `experimental_hidden`

Guided partner-led consultation SOP. **Not a current Baki GO product entry** — the 14-step flow remains in the codebase for future re-evaluation, but is hidden from home and normal navigation. Direct URLs (`/consultation/*`), APIs, tables, migrations, tests, and existing production data are retained.

**Customer is the only CRM anchor** — no duplicate profile tables.

| Table | Purpose |
|-------|---------|
| `consultation_sessions` | Session identity, lifecycle, gate summary columns |
| `consultation_data` | One row per session; structured step payload in `data_json` |
| `consultation_ai_outputs` | Structured AI coach insights per session + point key (V1: motivation + barrier) |

#### `consultation_sessions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `customer_id` | uuid FK → `customers` | Required anchor |
| `owner_member_id` | uuid FK → `members` | Coach who runs the session |
| `quiz_result_id` | uuid FK → `quiz_results` | Nullable; Phase 4 integration |
| `body_composition_record_id` | uuid FK → `body_composition_records` | Set in Step 3 |
| `current_step` | integer 1–14 | Resume pointer |
| `status` | text | `in_progress`, `completed`, `follow_up`, `not_ready`, `abandoned` |
| `commitment_score` | integer 1–10 | Step 7 (written); used by Step 8 gate |
| `health_safety_flag` | text | `pending_review` (default), `normal`, `caution`, `professional_review_required` — Step 2 does not auto-promote to `normal` |
| `success_story_count` | integer | Step 10+ (future) |
| `brief_snapshot` | jsonb | Completed brief snapshot (future; replaces separate briefs table) |
| `started_at`, `completed_at`, `created_at`, `updated_at` | timestamptz | |

#### `consultation_data`

| Column | Type | Notes |
|--------|------|-------|
| `session_id` | uuid PK FK → `consultation_sessions` | One row per session |
| `data_json` | jsonb | V1 SOP payloads, e.g. `health`, future `desired_state`, `meals`, etc. |

**Phase 1 `data_json` keys:** `health` (Step 2), `phase1CompletedAt` (after Step 3). Region/occupation live on `customers`, not in JSONB.

**Phase 2 `data_json` keys:** `goals` (Step 4), `previousExperience` (Step 5), `motivations` (Step 6), `barriers` + `readiness` (Step 8). `commitment_score` lives on `consultation_sessions`.

**Phase 3 `data_json` keys:** `methodInterest` (Step 10), `education` (Step 11), `cooperation` (Step 12), `meals` + `services` (Step 13), `outcome` (Step 14). `success_story_count` lives on `consultation_sessions`; completed sessions store deterministic `brief_snapshot` JSONB.

**RLS:** Owner-only — same pattern as `customers` (uplines excluded).

#### `consultation_ai_outputs`

Separate from `consultation_data.data_json` — supports regenerate, audit, model tracking, and future AI points.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `session_id` | uuid FK → `consultation_sessions` | Unique with `point_key` |
| `owner_member_id` | uuid FK → `members` | Coach who owns the session |
| `point_key` | text | `motivation_insight`, `barrier_insight` (V1) |
| `input_snapshot` | jsonb | Sanitized AI input (no phone/PII) |
| `output_json` | jsonb nullable | Structured coach insight payload |
| `model` | text nullable | Provider model id |
| `status` | text | `pending`, `completed`, `failed` |
| `error_message` | text nullable | Failure detail when `status = failed` |
| `regeneration_count` | integer | Upserted per `(session_id, point_key)` |
| `created_at`, `updated_at` | timestamptz | |

**API access:** Service role + server-side `owner_member_id` check (mirrors quiz partner routes).

### Conceptual relationships

```
Member (coach)
  └── owns → Customer
                ├── body_composition_records
                └── consultation_sessions
                      ├── consultation_data (data_json)
                      └── consultation_ai_outputs (point_key + output_json)
```

## Naming Conventions

- Tables: `snake_case`, plural (e.g., `activity_events`, `members`)
- Primary keys: `id` (UUID preferred)
- Foreign keys: `{entity}_id`
- Timestamps: `created_at`, `updated_at` on mutable tables

## Computed vs Stored Data

| Type | Storage | Notes |
|------|---------|-------|
| Logged activities | Stored | Single source of truth |
| Rank progress | Computed | Derived from activities + BUSINESS_RULES.md |
| Team health signals | Computed | Needs help, improving, falling behind, recognition |
| Daily next actions | Computed | Derived from rank, history, and team context |
| Gamification (XP, levels, badges) | Events stored, totals computed | Rules in GAME_DESIGN.md |
| Meeting summaries | Computed | Aggregated at read time for team scope |
| Consultation Brief | Hybrid (future) | Live step data + `brief_snapshot` on complete |

### AI Coaching V1 (`027_coaching_v1.sql`)

**Status:** Phase 1 active product module. Cloud-first; customer access via portal token. See [COACHING.md](./COACHING.md).

| Table | Purpose |
|-------|---------|
| `coaching_enrollments` | Active/paused/completed coaching relationship; plan snapshot + onboarding state |
| `coaching_daily_logs` | One row per enrollment per `log_date` (Asia/Taipei). Sleep: `sleep_bedtime`, `sleep_wake_time`; `sleep_duration` computed on save |
| `coaching_meal_entries` | Meal slot rows linked to daily log |
| `coaching_meal_photos` | Storage path refs for meal photos (private bucket) |

**Migration `028_coaching_sleep_times.sql`:** adds `sleep_bedtime`, `sleep_wake_time` to `coaching_daily_logs`.

### AI Coaching Phase 2b-1 (`029_coaching_ai_phase2a.sql`)

**Status:** Schema + pure helpers only. Not applied to production yet. No OpenAI integration.

| Table | Purpose |
|-------|---------|
| `coaching_coach_directives` | Coach-set focus / priority / instruction for AI context |
| `coaching_ai_outputs` | One `daily_coach_generation` row per `(enrollment_id, log_date)` — customer + coach JSON in `output_json` |
| `coaching_generation_jobs` | Lightweight async queue; service role worker only |
| `ai_llm_call_log` | Cross-feature append-only LLM usage + cost telemetry |

**`coaching_ai_outputs` key columns:** `input_fingerprint`, `input_snapshot`, `output_json`, `status` (`pending|processing|completed|failed`), `regeneration_count`, `ai_proposed_intervention_level` (audit), `final_intervention_level` (deterministic engine — authoritative), `started_at`, `completed_at`. Unique: `(enrollment_id, log_date, point_key)` where `point_key = daily_coach_generation`.

**`coaching_generation_jobs` idempotency:** partial unique index on `(output_id, input_fingerprint) WHERE status IN ('queued','processing')`.

**Code:** `src/lib/coaching/ai/build-input-snapshot.ts`, `coaching-generation-submit.ts`, `coaching-daily-output-schema.ts`, `coaching-prior-ai-context.ts`, `src/lib/ai/llm-telemetry.ts`

**RLS:** Coach SELECT on `coaching_ai_outputs` + `ai_llm_call_log` only. No authenticated policies on `coaching_generation_jobs`. Customer anon has no direct table access.

**Storage:** `coaching-meal-photos` (private). No public URL; signed URLs via service role API.

**Reuse:** `customers`, `members`, `customer_portal_tokens`, `body_composition_records`, `customer_progress_photos` (read-only in coach detail).

## Migrations

- All schema changes go through versioned migrations.
- Document breaking changes in this file and in [BUSINESS_RULES.md](./BUSINESS_RULES.md) when they affect domain behavior.

## Related Documentation

- [PRODUCT.md](./PRODUCT.md)
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)
- [COACHING.md](./COACHING.md)
