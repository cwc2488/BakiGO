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

Migration `061_customers_soft_delete.sql` adds nullable `deleted_at`. Active CRM rows have `deleted_at IS NULL`. Coach delete is a soft delete (`deleted_at = now()`); a BEFORE UPDATE trigger preserves `deleted_at` once set so stale client upserts cannot resurrect. Child tables (measurements, photos, coaching FKs) are not cascade-deleted.

### Quiz icebreaker (`021_quiz_icebreaker_v1.sql`+)

| Table | Purpose |
|-------|---------|
| `quiz_definitions` | Quiz catalog |
| `quiz_share_links` | Partner attribution codes |
| `quiz_responses` | Respondent sessions |
| `quiz_results` | Scored outcomes |
| `quiz_ai_followups` | Rule-based follow-up messages |

### Quiz V2 (Production schema — no repo migration in this restore)

Production Supabase (`baki-go` / `ubdrkrvyyrqdvlehzhsz`) already contains the Quiz V2 core schema from the 8/18 dirty deploy. This restore branch adds application code only; it does **not** ship a new numbered migration. Recognition occupies repo migration numbers 035–045.

| Table | Purpose |
|-------|---------|
| `analysis_sessions` | Anonymous RESET / analysis session (`token_hash` only; **No PII**). Nullable `radar_candidate_id` (future Radar; no product dependency). Service-role only. |
| `analysis_reports` | Layer2 AI report |
| `analysis_generation_jobs` | Analysis generation queue |
| `experience_21d_interests` | Partner 21-day INTEREST leads (`brief_json` is coach-only). Unique `analysis_session_id`. Soft archive via `archived_at`. |
| `experience_21d_funnel_events` | 21D funnel events (one per session+event) |
| `quiz_partner_landing_views` | Human `/q/{code}` landing views (never crawler OG GET) |
| `quiz_result_shares` | Consumer `/s/{code}` result shares |
| `quiz_result_share_views` | Human `/s/{code}` views |
| `quiz_result_share_events` | Observable share-sheet evidence |

`quiz_responses.growth_share_id` retains `/r` attribution. Partner workbench is `/quiz/21d` (tabs: 21 天名單 / 我的分享 / 我的成效). Consumer RESET Quiz V2 is `/quiz/fat-loss`. Official Customer Hub entry is `/quiz/21d`. `/quiz/hub` is leftover catalog, not the official partner entry.

**CONVERSATION-RESET-01:** `/quiz/fat-loss` creates `entry=reset_v1` and persists `__resetV1` (`conversation_reset_v1`) on `analysis_sessions.answers_json`. Fixed 6-question projective quiz + gpt-4.1 conversation + 3-section report. Production `/quiz/fat-loss` serves RESET Quiz V2.

**21D-HANDOFF-01:** After RESET report, consumer can express INTEREST in a paid 21-day experience (no price, no checkout). Attribution copies from `analysis_sessions` — `/r` growth share owner wins over `/q` referrer. Minimal contact capture: display name + one channel (`line`, `instagram`, or `phone`).

**21D Experience Landing + Consultation V1 (`063`):** Public LP at `/experience/21d/[token]` (analysis session token). Adds nullable `consultation_preference` (`text` | `phone` | `in_person`) and `landing_page_version` on `experience_21d_interests`. Funnel events include `21d_landing_viewed`, `21d_consultation_*`. Ownership still copied server-side from the analysis session — client cannot forge partner IDs.

**QUIZ-PARTNER-01:** Workbench statuses are presentation only: interested→待聯絡, contacted/considering→已聯絡, joined→已成交, declined→未成交. Joined/declined change lead status only — no customer, enrollment, order, or payment.

**21D-START-01 (no new tables):** After Lead `joined`, Partner creates/selects an owned Customer and starts a 21-day coaching journey on existing `coaching_enrollments`. Marker lives in `plan_snapshot_json.experience21d`.

### Recognition Center (`035_recognition_foundation.sql` + `036_recognition_event_rpcs.sql`)

**Status:** Phase 3 foundation implemented. Migration files:

- `supabase/migrations/035_recognition_foundation.sql`
- `supabase/migrations/036_recognition_event_rpcs.sql`
- `supabase/migrations/043_recognition_admin_only_grants.sql` (admin-only grants / FORCE RLS)
- `supabase/migrations/044_recognition_delete_event.sql` (`delete_recognition_event`)

**Production schema is not applied by Vercel.** Recognition migrations 035–044 must be executed in the Supabase SQL Editor (see `docs/SUPABASE_SETUP.md`). As of the Production Recovery Audit, Production was missing `recognition_events` and `create_recognition_event_with_awards` because these files had never been pasted into Production. Applying them does **not** drop `members`, `customers`, coaching, quiz, radar, or leaderboard data.

Recognition Center is an **organization operations module**, not member-local workspace data. It must use dedicated SQL tables + service-role APIs, not `member_app_data`.

| Table | Purpose |
|-------|---------|
| `recognition_award_definitions` | Recognition award catalog; default 27 items plus future custom items |
| `recognition_ppt_themes` | Theme/config layer separated from roster data |
| `recognition_event_templates` | Future reusable defaults for event creation; not required in first implementation phase, but the architecture must stay compatible |
| `recognition_events` | Primary business entity for one recognition collection/review/export cycle |
| `recognition_event_awards` | Event-specific enabled awards + ordering |
| `recognition_submissions` | Raw public submission envelopes (`submitted_by`, org text, metadata) |
| `recognition_submission_entries` | One row per submitted honoree item |
| `recognition_photo_assets` | Original uploaded photos + metadata/flags |
| `recognition_photo_crops` | Presentation crop / processed image references |
| `recognition_candidates` | Consolidated admin review objects; PPT source uses approved candidates only |
| `recognition_candidate_sources` | Mapping from candidate back to raw submission entries |
| `recognition_duplicate_signals` | Warning/blocking duplicate hints across candidates |
| `recognition_admin_members` | Historical admin table; does not grant access. Super Admin is `src/lib/auth/super-admin.ts` |
| `recognition_ppt_exports` | Conceptual name; Phase 7 implemented `recognition_presentation_exports` |
| `recognition_presentation_exports` | PPTX generation audit rows (no file storage) |

#### Recognition design rules

- `Recognition Event` is the primary entity; `year` / `month` are attributes only.
- **Multiple events in the same year/month are allowed.**
- Do **not** define `(year, month)` as unique.
- Public submissions are **evidence**, not approved recognition.
- Raw submissions and raw entries are retained.
- Consolidated `recognition_candidates` are the admin/PPT working source.
- Only `approved` candidates may enter formal presentation output.
- Public collection requires **both**:
  - `event.status = collecting`
  - current time inside `collect_starts_at` / `collect_ends_at`
- `closed` events may be reopened back to `collecting` by Recognition Admin, but the same time-window rules still apply.
- Public token rotation invalidates the previous token immediately.

#### `recognition_award_definitions`

Catalog table for default + future custom awards.

Suggested columns:

- `id` uuid PK
- `slug` text unique
- `name` text
- `requires_photo` boolean
- `layout_hint` text (`name_list | photo_grid | photo_hero | premium`)
- `sort_order` integer
- `is_active` boolean
- timestamps

The default 27 awards are catalog entries only. They are **not** career rank keys and must not be merged into promotion / qualification tables.

#### `recognition_ppt_themes`

Theme/config table separated from recognition data.

Suggested columns:

- `id` uuid PK
- `slug` text unique
- `name` text
- `aspect_ratio` text (default `4:3`)
- `config_json` jsonb
- `is_active`
- timestamps

#### `recognition_event_templates`

Future reusable configuration layer.

Suggested scope:

- default award set
- default award ordering
- default PPT theme
- create event from template, then allow event-specific customization

This table is **future-compatible architecture**, not a requirement to implement first. If omitted from the first migration sequence, event schema must still make later template introduction straightforward.

#### `recognition_events`

Primary lifecycle entity.

Suggested columns:

- `id` uuid PK
- `name`
- `year`
- `month`
- `collect_starts_at`
- `collect_ends_at`
- `status` (`draft | collecting | closed | archived`)
- `public_token_hash`
- `public_token_prefix`
- `ppt_theme_id`
- `event_template_id` nullable for future template lineage
- `copied_from_event_id` nullable
- `created_by_member_id`
- `closed_at` nullable
- timestamps

Important:

- do **not** add unique `(year, month)`
- `event_template_id` is optional but keeps the model template-compatible
- copy-previous-month remains supported independently of templates

#### `recognition_event_awards`

Event-specific projection of the catalog.

Suggested columns:

- `id` uuid PK
- `event_id`
- `award_definition_id`
- `sort_order`
- `is_enabled`

Use this table to preserve event-specific ordering and enable/disable behavior.

#### `recognition_submissions`

Raw public submission envelopes.

Suggested columns:

- `id` uuid PK
- `event_id`
- `submitted_by_name`
- `submitted_by_org` (free text in V1)
- `ip_hash` nullable
- `user_agent` nullable
- `created_at`

These rows are append-only evidence and must not be treated as official roster data.

#### `recognition_submission_entries`

One row per submitted item.

Suggested columns:

- `id` uuid PK
- `submission_id`
- `event_id`
- `award_definition_id`
- `raw_name`
- `normalized_name`
- `photo_asset_id` nullable
- `created_at`

Raw entries are retained even when candidates consolidate.

#### `recognition_photo_assets`

Original photo storage metadata.

Suggested columns:

- `id` uuid PK
- `event_id`
- `original_storage_path`
- `sha256`
- `mime_type`
- `width`
- `height`
- `byte_size`
- `source` (`public | admin`)
- `flags_json`
- `review_status` (`pending_process | auto_ok | needs_review | rejected`)
- `created_at`

Original photos must always be preserved.

#### `recognition_photo_crops`

Earlier conceptual table. Phase 6 implemented `recognition_candidate_photo_reviews` instead, because originals live on submission entries rather than a separate `recognition_photo_assets` table. Crop rows still must not replace originals.

#### `recognition_candidate_photo_reviews`

Implemented in `040_recognition_photo_review.sql`.

One active presentation-photo review row per candidate:

- `candidate_id` unique
- `source_entry_id` — preferred original the crop is bound to
- `original_width` / `original_height` nullable
- `crop_x` / `crop_y` / `crop_width` / `crop_height` nullable normalized 0–1, all-or-none, bounds-checked
- `crop_aspect_ratio` default `'3:4'` (portrait card slot; not the 4:3 PPT slide)
- `flags text[]` manual review flags
- `is_blocked` / `blocked_reason`
- `crop_finalized_at` / `crop_finalized_by_member_id`
- timestamps

No derived cropped bitmap is stored. Phase 7 reads the private original through service-role download and applies crop metadata in memory while generating PPTX. Originals remain unchanged.

Changing `recognition_candidates.preferred_source_entry_id` resets this row.

RLS enabled, forced, with zero anon/authenticated policies. RPCs:

- `upsert_recognition_candidate_photo_review(...)` — rejects stale `source_entry_id` vs current preferred
- `reset_recognition_candidate_photo_review(...)`

Both revoke PUBLIC/anon/authenticated and grant EXECUTE only to `service_role`.

#### `recognition_candidates`

Consolidated admin review objects and formal PPT working source.

Implemented in `039_recognition_candidates.sql`:

- `id` uuid PK
- `event_id`
- `event_award_id` (event-specific award row; not a career rank key)
- `display_name` (canonical/presentation name; admin-editable)
- `normalized_name` (immutable exact-match consolidation key from raw entries)
- `review_status` (`pending | approved | needs_fix | rejected`)
- `member_id` nullable for future person-history/timeline support
- `preferred_source_entry_id` nullable original photo source for Phase 6 presentation crop. Consolidation never infers this value; Recognition Admin must choose it. Reconsolidation preserves an existing admin selection. Changing this value resets any presentation crop bound to the previous source.
- `sort_order`
- `reviewed_at`, `reviewed_by_member_id`
- timestamps

Uniqueness: `(event_id, event_award_id, normalized_name)`.

Business rules:

- same event + same award + same normalized name may consolidate
- all sources must still be preserved
- same normalized name across **different** awards is a warning only
- cross-award duplicate names must **not** auto-merge, reject, delete, or block PPT generation
- presentation crop lives on `recognition_candidate_photo_reviews` and must not replace originals
- changing `preferred_source_entry_id` invalidates the existing presentation crop
- admin `display_name` edits do **not** change `normalized_name`, do **not** silently merge candidates, and do **not** destroy presentation crop

#### `recognition_candidate_sources`

Join table linking a candidate to all raw submission entries that fed it.

Implemented columns:

- `id` uuid PK
- `candidate_id`
- `submission_entry_id` (unique; one entry belongs to one candidate)
- `created_at`

This is required so the system can preserve:

- all `submitted_by`
- all raw sources
- auditability after consolidation

Re-running consolidation uses `ON CONFLICT DO NOTHING` so source links are not duplicated.

#### `recognition_duplicate_signals`

V1 computes cross-award and conservative suspected-duplicate warnings at read time.

A persisted `recognition_duplicate_signals` table remains a future extension for photo-hash / additional fuzzy signals. Cross-award same-name is a warning only by product decision.

#### `recognition_admin_members`

Historical Recognition Admin allowlist table. **Does not grant access.**

Canonical Super Admin is 會員編號 `20699471` via `src/lib/auth/super-admin.ts`.

Do **not** infer from rank.
President does **not** automatically qualify.

#### `recognition_ppt_exports` / `recognition_presentation_exports`

Implemented in Phase 7 as `recognition_presentation_exports` (`041_recognition_presentation_exports.sql`).

The formal roster source remains approved candidates. Generated PPTX files are outputs, not the truth source, and are **not** stored in the database.

Audit columns:

- `event_id`
- `generated_by_member_id`
- `generated_at`
- `approved_candidate_count`
- `slide_count`
- `theme_id` / `theme_version`
- `status` (`success` only in V1)

Rows are inserted only after a successful render. Failed generations do not create a row.

RLS enabled, forced, with zero anon/authenticated policies. Table privileges revoked from PUBLIC/anon/authenticated and granted to `service_role`.

### Recognition conceptual relationships

```
Recognition Event
  ├── event awards (enabled catalog + order)
  ├── submissions
  │     └── submission entries
  │           └── optional original photo asset
  ├── candidates
  │     ├── candidate sources → submission entries
  │     ├── duplicate signals
  │     └── optional current crop → original photo asset
  └── optional ppt exports
```

### Recognition storage

Recognition photos should use a **private Supabase Storage bucket** (planned), separate from:

- `member-avatars`
- `coaching-meal-photos`
- customer photo/data-URL patterns

Rules:

- original uploads stored privately
- presentation crop metadata stored separately; no public derived bitmap in Phase 6
- no public bucket access
- reads via authenticated admin photo API (`Cache-Control: private, no-store`) / service-role
- public submitters do not receive direct table access

### Recognition public collection (`037_recognition_public_collection.sql`)

**Status:** Phase 4 public collection implemented.

Adds:

- `recognition_events.public_collection_token`
- `recognition_events.public_collection_token_hash`
- `recognition_events.public_collection_token_rotated_at`
- `recognition_submissions`
- `recognition_submission_entries`
- private bucket `recognition-photos`
- atomic RPC `create_public_recognition_submission(...)`

Additive `038_recognition_public_submission_rpc_guards.sql` replaces that RPC so final DB execution rechecks event collection state and enabled awards before any insert.

#### Token storage strategy

Phase 4 stores both:

- raw high-entropy token
- token hash

Reason:

- Recognition Admin must be able to repeatedly view/copy the active public URL
- browser clients still do **not** read the DB directly
- all access remains through Next.js server handlers + service_role

Public resolution uses `public_collection_token_hash`.

#### `recognition_submissions`

Raw public submission envelope.

Key fields:

- `event_id`
- `submitter_name`
- `submitter_organization`
- `submitted_at`
- `source_context_json`

Rules:

- immutable evidence
- no BakiGO member mapping required
- `submitter_organization` is a legacy column; public UX does not collect it (default `''`)

#### `recognition_submission_entries`

Raw entry rows inside one submission.

Key fields:

- `submission_id`
- `event_id`
- `event_award_id`
- `submitted_name`
- `normalized_name`
- `original_photo_storage_path`
- `original_photo_mime_type`
- `original_photo_size_bytes`

Rules:

- preserve raw submitted name
- normalized name is for future exact duplicate detection only
- no automatic consolidation in Phase 4

#### Public original-photo storage

Bucket: `recognition-photos`

Rules:

- private bucket only
- no public bucket read/write
- server-mediated uploads
- no generic list/delete/read for public submitters
- originals only in Phase 4
- future crop/processed image remains a later phase concern

Current conceptual path:

```text
recognition/<submission-id>/entries/<entry-id>/original.<ext>
```

#### Atomic public submission RPC

`create_public_recognition_submission(...)`

Behavior:

- at execution time, before inserting anything, rechecks:
  - the target `recognition_events` row still exists
  - `event.status = collecting`
  - current DB time is inside `collect_starts_at` when non-null
  - current DB time is inside `collect_ends_at` when non-null
  - each entry award belongs to `p_event_id` and `recognition_event_awards.is_enabled = true`
- inserts one `recognition_submissions` row
- inserts all `recognition_submission_entries`
- runs in one DB transaction
- if any recheck fails, raises and inserts zero submission/entry rows
- execute allowed only to `service_role`

Upload handling remains outside the DB transaction:

1. server uploads originals first
2. server finalizes DB rows atomically via RPC
3. if DB finalization fails, the server performs best-effort delete of uploaded paths

This minimizes orphaned uploads and avoids valid-looking partial DB submissions. File-signature validation remains in the application layer, not in SQL.

### Recognition candidates / review (`039_recognition_candidates.sql`)

**Status:** Phase 5 consolidation, review, and historical roster implemented.

Adds:

- `recognition_candidates`
- `recognition_candidate_sources`
- atomic RPC `consolidate_recognition_event_candidates(event_id)`
- atomic RPC `reorder_recognition_event_candidates(event_id, event_award_id, candidate_ids)`

RLS is enabled on both tables with zero anon/authenticated policies. Both RPCs revoke PUBLIC/anon/authenticated and grant EXECUTE only to `service_role`.

Consolidation is idempotent:

- unique `(event_id, event_award_id, normalized_name)`
- unique `submission_entry_id` on source links
- `ON CONFLICT DO NOTHING`
- existing `review_status`, `display_name`, `preferred_source_entry_id`, and admin `sort_order` are preserved
- consolidation never auto-selects `preferred_source_entry_id`; new candidates stay `null` until an admin chooses

Review mutations update only `recognition_candidates`. They must not write `recognition_submissions` or `recognition_submission_entries`.

Approved roster:

- enabled event awards in `sort_order`
- `review_status = approved` only
- candidates in `sort_order`, then `created_at`, then `display_name`
- incomplete photos stay on the roster; Phase 6 adds `hasPresentationCrop`, `photoReady`, `photoReadinessState`, flags, and block reason for presentation validation

Duplicate warnings are computed at read time. They never auto-merge, auto-reject, or block future PPT generation.

### Recognition photo review (`040_recognition_photo_review.sql`)

**Status:** Phase 6 presentation crop + PPT-photo-ready validation implemented. Phase 7 generates PPTX from approved roster + crop metadata.

Adds:

- `recognition_candidate_photo_reviews` (one row per candidate)
- `upsert_recognition_candidate_photo_review(...)`
- `reset_recognition_candidate_photo_review(...)`
- trigger that resets crop metadata when `preferred_source_entry_id` changes

The trigger is the sole automatic reset owner. It is an `AFTER UPDATE OF preferred_source_entry_id` row trigger, not a deferred constraint trigger, so the preferred-source UPDATE and photo-review reset share one transaction. If reset raises, the preferred-source change rolls back. Application services must not call `reset_recognition_candidate_photo_review` after updating preferred source.

RLS is enabled and forced, with zero anon/authenticated policies. Table privileges are revoked from PUBLIC/anon/authenticated. Both RPCs revoke PUBLIC/anon/authenticated and grant EXECUTE only to `service_role`.

Crop coordinates are normalized 0–1 against the original image. Intended portrait slot ratio is `3:4`, distinct from the 4:3 PPT slide.

The RPC never writes `recognition_submissions`, `recognition_submission_entries`, or storage objects.

### Recognition RLS / API pattern

Recognition tables should follow the same broad access model as Quiz/Growth Share, not `members`:

- RLS enabled and **FORCE ROW LEVEL SECURITY** on every Recognition table (`043_recognition_admin_only_grants.sql`)
- no anon table policies
- no broad authenticated read/write policies
- `REVOKE ALL` from `public`, `anon`, and `authenticated`; table grants are `service_role` only
- Recognition RPCs remain execute-only for `service_role` (migrations 036–040, 044)

### Recognition event delete (`044_recognition_delete_event.sql`)

Adds `delete_recognition_event(uuid)` (SECURITY DEFINER, `service_role` execute only).

The function:

1. Locks the event row
2. Deletes matching `storage.objects` in bucket `recognition-photos`
3. Deletes `recognition_events`; child rows cascade via existing FKs

It does not write `members`, `customers`, coaching, quiz, radar, or leaderboard tables.
- private bucket `recognition-photos` has no client `storage.objects` policies; uploads/downloads stay server-mediated
- public submission goes through service-role API after token verification
- admin actions go through authenticated API + Super Admin (`src/lib/auth/super-admin.ts`)

### Recognition transactional RPCs

Phase 3 foundation uses PostgreSQL RPCs for operations that must be atomic:

- `create_recognition_event_with_awards(...)`
  - inserts one `recognition_events` row
  - populates `recognition_event_awards`
  - supports `copied_from_event_id`
  - rolls back everything if any step fails

- `reorder_recognition_event_awards(...)`
  - requires the complete current event-award set
  - rejects duplicate IDs
  - rejects foreign IDs
  - updates all `sort_order` values atomically

Phase 5 candidate RPCs:

- `consolidate_recognition_event_candidates(...)`
  - derives candidates from raw entries for one event
  - locks the event to serialize concurrent runs
  - inserts missing candidates / source links only
  - never overwrites review decisions
  - never auto-selects `preferred_source_entry_id`

- `reorder_recognition_event_candidates(...)`
  - requires the complete candidate set for one event award
  - updates `sort_order` atomically

Phase 6 photo-review RPCs:

- `upsert_recognition_candidate_photo_review(...)`
  - locks the candidate
  - requires `p_source_entry_id` to match current `preferred_source_entry_id`
  - validates crop bounds
  - writes derived crop/flags only
- `reset_recognition_candidate_photo_review(...)`
  - clears derived crop/flags/blocked state
  - called by `recognition_candidates_preferred_source_change` in the same transaction as the preferred-source UPDATE
  - not called by application code after a preferred-source mutation

### Recognition presentation exports (`041_recognition_presentation_exports.sql`)

**Status:** Phase 7 PPTX generation audit implemented. PPTX bytes are not stored.

Adds `recognition_presentation_exports` only. Additive. Does not alter candidates, photo reviews, submissions, or storage objects.

Generation pipeline uses existing service-role reads. The generator loads originals via the private `recognition-photos` download path. No public URLs, no signed permanent URLs, no `storage.objects` policy changes.

Concurrent data changes: generation builds one presentation DTO snapshot, then plans and renders from that snapshot. Later candidate/crop edits do not affect an in-flight generation.

Security rule:

- these RPCs are `SECURITY DEFINER`
- `EXECUTE` is revoked from `PUBLIC`, `anon`, and `authenticated`
- `EXECUTE` is granted only to `service_role`
- browser clients must go through authenticated Next.js API → `assertRecognitionAdmin(memberId)` → service-role client → RPC

### Recognition self-service validation (`045_recognition_self_service_validation.sql`)

**Status:** Additive / backward-compatible. Production must apply this file; code deploy does not change the DB.

Adds to `recognition_submissions`:

- `public_edit_token` / `public_edit_token_hash` — submitter resume/edit before deadline

Adds to `recognition_submission_entries`:

- `validation_status` (`PASS` | `WARNING` | `BLOCKED` | `ADMIN_OVERRIDE` | `EXCLUDED`)
- `validation_issues` jsonb
- `submitter_confirmed_warnings` text[]
- `current_photo_storage_path` / mime / size — PPT authoritative photo (fallback: original)
- `confirmed_crop` jsonb + dimensions + `crop_confirmed_at`
- `admin_override_json` jsonb
- `excluded_at` / `excluded_by_member_id` / `excluded_reason`

Also:

- `CREATE OR REPLACE create_public_recognition_submission` so `submitter_organization` may be empty (stored as `''`)
- `CREATE OR REPLACE delete_recognition_event` also removes `current_photo_storage_path` objects

Does not DROP organization columns or Award Definitions.

### Recognition Event Template compatibility

The schema must stay compatible with a future reusable template concept.

Minimum compatibility requirements:

- event-specific award ordering must not be hardwired to “copy previous month”
- event-specific theme selection must not assume a one-off event model
- event creation should later support:
  - create from template
  - copy previous month settings
  - create from scratch

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
| `coaching_enrollments` | Active/paused/completed coaching relationship; plan snapshot + onboarding state. `started_at` = Day 1 authority; `planned_end_at` (034) = inclusive planned end (default start+89 days); `ended_at` = actual completion timestamp |
| `coaching_daily_logs` | One row per enrollment per `log_date` (Asia/Taipei). Sleep: `sleep_bedtime`, `sleep_wake_time`; `sleep_duration` computed on save. Soft-delete: `deleted_at` / `deleted_by` (037); default queries exclude deleted rows. Active unique is `(enrollment_id, log_date) WHERE deleted_at IS NULL`. |
| `coaching_meal_entries` | Meal slot rows linked to daily log |
| `coaching_meal_photos` | Storage path refs for meal photos (private bucket) |

**Migration `028_coaching_sleep_times.sql`:** adds `sleep_bedtime`, `sleep_wake_time` to `coaching_daily_logs`.

**Migration `034_coaching_product_correction.sql`:** additive `planned_end_at` on enrollments; expands `coaching_coach_directives` with `meal_slot`, `effective_until`, `status`, `customer_visible` and drops single-active unique (multiple slot directives allowed).

### AI Coaching Phase 2b-1 / 2c (`029_coaching_ai_phase2a.sql` + `030_coaching_generation_job_claim.sql`)

**Status:** Phase 2c production Daily Coach integration. Apply `029` then `030` via `node scripts/coaching-prod-migrate.mjs apply`.

| Table | Purpose |
|-------|---------|
| `coaching_coach_directives` | Coach-set meal-slot instructions (`meal_slot`, `effective_from`/`effective_until`, `status`, `customer_visible`) for AI + Portal reminders; verified vs Meal Vision deterministically |
| `coaching_ai_outputs` | One `daily_coach_generation` row per `(enrollment_id, log_date)` — customer + coach JSON in `output_json` |
| `coaching_generation_jobs` | Lightweight async queue; service role worker only |
| `ai_llm_call_log` | Cross-feature append-only LLM usage + cost telemetry |

**Worker RPCs (`030`):** `claim_coaching_generation_jobs`, `reclaim_stale_coaching_generation_jobs`.

**`coaching_ai_outputs` key columns:** `input_fingerprint`, `input_snapshot`, `output_json`, `status` (`pending|processing|completed|failed`), `regeneration_count`, `ai_proposed_intervention_level` (audit), `final_intervention_level` (deterministic engine — authoritative), `started_at`, `completed_at`, `deleted_at` / `deleted_by` (037, aligned with daily-log soft-delete). Unique: `(enrollment_id, log_date, point_key)` where `point_key = daily_coach_generation`. Default list/get queries exclude deleted rows.

**`coaching_generation_jobs` idempotency:** partial unique index on `(output_id, input_fingerprint) WHERE status IN ('queued','processing')`.

**Code:** `enqueue-daily-coach-generation.ts`, `process-coaching-generation-job.ts`, `run-coaching-generation-worker.ts`, `POST /api/coaching/jobs/process`, portal `ai-output` poll.

**RLS:** Coach SELECT on `coaching_ai_outputs` + `ai_llm_call_log` only. No authenticated policies on `coaching_generation_jobs`. Customer anon has no direct table access.

**Storage:** `coaching-meal-photos` (private). No public URL; signed URLs via service role API.

**Reuse:** `customers`, `members`, `customer_portal_tokens`, `body_composition_records`, `customer_progress_photos` (read-only in coach detail).

### AI Coaching Phase 3d — Coach Action Memory

**Status:** Applied migration `031_coaching_coach_actions.sql`. Coach-only internal memory.

| Table | Purpose |
|-------|---------|
| `coaching_coach_actions` | Coach acknowledgement / note / follow_up with reason codes + evidence refs |

**Distinct from** `coaching_coach_directives` (plan focus). Actions feed Timeline (`coach_action`), Attention suppression (48h same-reason), and `GenerationInput.recentCoachActionMemory`.

**RLS:** authenticated SELECT/INSERT/UPDATE own `owner_member_id` only. No DELETE. Customer anon: no access.

**Materiality:** `is_material=true` when note has content → affects generation fingerprint; empty acknowledgement does not.

### AI Coaching Phase 3a — Attention Engine (derive-only)

**Status:** Deterministic engine in code; Coach Action persistence landed in Phase 3d (`031`).

| Concern | Approach |
|---------|----------|
| Attention tier / ranking | Derive at read time from AI outputs, signals, outcome, rolling memory |
| Coach Action Memory | `coaching_coach_actions` (Phase 3d) |
| Timeline events | **Derive** from daily logs / AI outputs / body records / coach actions — no duplicate event table |

### AI Coaching Phase 4c–4e — Growth Opportunities & Experience Check-ins

**Status:** Migration `032_growth_opportunities.sql` (applied on shared DB).

| Table | Purpose | Visibility |
|-------|---------|------------|
| `customer_experience_checkins` | Structured Experience authority (4 scales + free text + consent) | Customer portal: own create/read; Coach: owner read |
| `growth_opportunities` | Coach-only Growth eligibility + lifecycle + primary path | Coach owner only; portal **no** access |

**Experience columns (separate — no single score):** `outcome_perception` 1–5, `coach_helpfulness` 1–5, `experience_satisfaction` 1–5, `recommendation_willingness` 0–10.

**Growth columns:** readiness, fingerprint, primary_growth_path, secondary_paths_json, outcome/experience band snapshots, source_checkin_id, celebration_class, lifecycle status.

**RLS:** owner_member_id for coach; portal check-ins via service-role API after token resolve (same pattern as daily logs). Anon has no direct opportunity policies.

**Out of scope in 4e:** share tokens, attribution, public share page, LINE.

### AI Coaching Phase 4f — Growth Shares & Referral Attribution

**Status:** Migration `033_growth_shares_referrals.sql`.

| Table | Purpose | Visibility |
|-------|---------|------------|
| `growth_shares` | Coach-started share/invite campaign; hashed public token; consent + public display config | Coach owner CRUD (no DELETE); portal activate via service-role after portal token; anon **no** table access |
| `growth_referral_attributions` | A→B attribution + pending Friend B identity before/after Customer conversion | Coach owner read/update; public submit via service-role after share token verify; anon **no** table access |

**Share token:** plaintext returned once to Customer / Coach UI; DB stores `token_hash` (SHA-256 hex) only. Status: `pending_consent | active | paused | revoked | expired | declined`.

**Nullable FKs (by design):** `growth_shares.enrollment_id` and `growth_shares.growth_opportunity_id` may be null — Coach may start a share from any owned Customer without Coaching enrollment / Growth Opportunity (UX-1.2). Opportunity remains optional timing evidence.

**Attribution status:** `visited | interested | submitted | customer_created | declined`.

**Public route:** `/r/[token]` — open public; server resolves by hash; returns consented non-health payload only.

**Do not reuse:** `customer_portal_tokens` (health capability) or `quiz_share_links` (member referrer).

**RADAR-SEMANTIC-01 (`049_radar_semantic_region_preference.sql`):** Additive `member_radar_region_preferences` (one row per member). Stores `current_*` development region plus `pending_*` / `pending_effective_date` so a same-day change cannot rewrite today's Top20. RLS enabled; `anon` / `authenticated` have no grants; `service_role` only. Does not mutate historical Radar snapshots, analysis JSON, or pipeline runs. Candidate understanding lives in existing extraction JSON (`candidate_understanding`, optional/backward compatible).

**RADAR-FEEDBACK-01 (`050_radar_member_recommendation_feedback.sql`):** Additive `member_radar_recommendation_feedback` (unique `member_id + candidate_id + recommendation_date`). Stores 👍/👎, optional rejection reason/note, and immutable `evaluation_context` JSON for future quality reports. RLS enabled; `anon` / `authenticated` have no grants; `service_role` only. Does not mutate scores, Top20, allocation, or exclusion.

## Migrations

- All schema changes go through versioned migrations.
- Document breaking changes in this file and in [BUSINESS_RULES.md](./BUSINESS_RULES.md) when they affect domain behavior.

## Related Documentation

- [PRODUCT.md](./PRODUCT.md)
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)
- [COACHING.md](./COACHING.md)
- [RECOGNITION.md](./RECOGNITION.md)
