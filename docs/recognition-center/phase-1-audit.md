# BakiGO Recognition Center — Phase 1 Audit & Implementation Plan

**Status:** Planning only. No application code, no migration, no production data change, no deploy.

**Audience:** Product review, then another architect / Phase 2 implementer.

**Date:** 2026-08-18

**Scope of this document:** current-architecture audit, reuse map, proposed schema / RLS / Storage, routes, public vs admin security, duplicate detection, PPT architecture, phased plan, risks, and the original pre-freeze decision set.

> Phase 2 note: product and architecture freeze decisions are now recorded in `docs/RECOGNITION.md`, with corresponding updates in `docs/BUSINESS_RULES.md`, `docs/DATABASE.md`, and `docs/ROADMAP.md`. When this audit and the frozen docs differ, the Phase 2 frozen docs win.

> Phase 3 note: Foundation implementation shipped. See Phase 3 sections in `docs/RECOGNITION.md` and `docs/DATABASE.md` for actual migration name, routes, and bootstrap procedure.

---

## 0. Product goal (frozen as specified)

Build a **表揚中心 (Recognition Center)** inside BakiGO to remove repeated monthly admin work: collecting recognition lists, collecting photos, de-duplicating, reviewing, querying history, and producing PPT.

Recognition Center is **not**:

- a CRM feature
- `/leaderboard` 排行與表揚 (points ranking)
- `/events` 活動紀錄 (personal MAP / activity log)
- GAME_DESIGN badges / achievements
- leader-engine `deserves_recognition`
- full 月會 PPT automation

**Out of V1 (explicit):** 培訓時間、活動宣傳文宣、總裁組勉勵內容、當月特殊簡報、完整月會 PPT 自動化。

Recognition Center only owns **fixed, repetitive recognition work**.

### Golden constraints from product

1. Public submitters need **no BakiGO account**.
2. Public submission **must not** become official PPT data.
3. Same event + same award + normalized name → detect suspected duplicates.
4. **Do not delete** raw submissions. Keep all `submitted_by` sources.
5. Admin sees **consolidated candidates**, not a pile of raw rows.
6. Review states: 待審核 / 已通過 / 需修正 / 不採用 (`pending` / `approved` / `needs_fix` / `rejected`).
7. Cross-award same name → hint only; never auto-delete.
8. Photo awards: keep **original**; add **presentation crop / processed image**.
9. Multi-face photos: **never let AI pick the honoree**.
10. Award with 0 approved recipients → **omit from PPT entirely** (no blank page).
11. PPT aspect **4:3**. Theme ⊥ roster data.
12. History by year/month + one-tap text copy. Person timeline is **future**, schema should allow it.
13. Birthday slide: auto-update **「X月壽星」** month text from event month. **No auto names in V1**.
14. Default 27 awards exist, but architecture **must not hard-code them as the sole source**. Admins must later add / disable / reorder / customize.

### Default catalog (seed, not UI-only constants)

**Photo required (12):**

3. MAP 第三個月
4. 新科督導
8. 新科世界組（第四個月過關）
9. 1%世界組
10. 5K俱樂部
11. 萬點高手
14. 新科推廣組
17. 新科RO2500推廣組
20. 新科富豪組
23. RO7500富豪組
26. 新科總裁組
27. 百萬終生成就獎

**Name-only (15):**

1. MAP 第一個月
2. MAP 第二個月
5. 世界組第一個月
6. 世界組第二個月
7. 世界組第三個月
12. 推廣組第一個月
13. 推廣組第二個月
15. RO2500推廣組第一個月
16. RO2500推廣組第二個月
18. 富豪組第一個月
19. 富豪組第二個月
21. RO7500富豪組第一個月
22. RO7500富豪組第二個月
24. 總裁組第一個月
25. 總裁組第二個月

Total **27**. These items are **absent** from `docs/BUSINESS_RULES.md` today. They are a different domain from `RANK_KEYS` / `CLOUD_MEMBER_LEVELS`.

### Event fields (product)

Each 表揚活動 (example: `2026 年 9 月月會`) has:

- name
- year / month
- public collect start / end
- status: `draft` / `collecting` / `closed` / `archived`
- public submit link
- award sort order
- PPT theme/template
- copy previous month **settings**, not the roster

### PPT layouts (product)

- 4:3 because venue projectors are 4:3
- name-only layout
- 12-person photo grid (4×3)
- 1–3 person hero
- 百萬終生成就獎 premium
- photo count > 12 auto-paginates
- Preview / validation before generate: counts, page count, missing photos, suspected dupes, unfinished review, other blockers
- Only **approved** recipients enter formal PPT

---

## 1. Current architecture audit

### 1.1 Product position

BakiGO is a **Business Operating System for Network Marketing**, not a CRM. Docs: `docs/PRODUCT.md`, `docs/BUSINESS_RULES.md`, `docs/DATABASE.md`, `docs/UI_SYSTEM.md`, `docs/GAME_DESIGN.md`, `docs/ROADMAP.md`.

Priority 0 Rule Engine: UI must not hard-code business catalogs/targets. Recognition award list belongs in docs + DB, not a frozen TS enum as source of truth.

Recognition Center is an **org operations tool**. It does **not** tell a member what to do next. Do not put it in daily-action or replace `/leaderboard`.

### 1.2 Two data planes

| Plane | Pattern | Examples | Use for Recognition? |
|---|---|---|---|
| **A. Cloud SQL + RLS + service-role API** | multi-party, public token, photos, review | Quiz, Coaching portal, Growth share `/r/[token]` | **YES** |
| **B. LocalStorage → `member_app_data` JSON sync** | per-member workspace across devices | `baki-events`, promotions, calendar, points | **NO** |

Recognition is org-wide collection + review + history + PPT. It **must** use plane A. Do not store it in `member_app_data`.

Syncable JSON keys today (`src/lib/cloud/syncable-storage-keys.ts`) include events, promotions, calendar, member photos, etc. Adding recognition there would make every member’s device a conflicting source of truth.

### 1.3 Existing “recognition-ish” surfaces — do not reuse

| Surface | What it actually is |
|---|---|
| `/leaderboard` title「排行與表揚」 | Monthly **points** leaderboard (`buildPointsLeaderboard`) |
| Home entry `MY_HOME_BUSINESS_ENTRIES`「排行與表揚」 | Same leaderboard |
| `/events`「活動紀錄」 | Personal activity / MAP meeting log (`EventCenterPage`, `baki-events`) |
| `GAME_DESIGN` badges / achievements | Member gamification from activity events |
| Leader signal `deserves_recognition` | Team-health computed signal |
| `/pre-meeting-graphic` | Customer invite graphic (canvas PNG), not PPT |
| `RANK_KEYS` / `CLOUD_MEMBER_LEVELS` | Career ranks: map, supervisor, active_supervisor, world_team, promotion_group, wealth_group, president |

1%世界組、5K俱樂部、萬點高手、百萬終生成就獎、RO2500/RO7500 分月表揚 **do not exist** in business rules or schema.

### 1.4 Auth / session

- Supabase Email + Password (`src/lib/auth/auth-service.ts`)
- Browser: `AuthProvider` + `AuthGate` + `fetchWithMemberAuth` (attaches Bearer from `supabase.auth.getSession()`)
- API member identity: `getMemberIdFromRequest()` in `src/lib/supabase/member-auth.ts` — Bearer → `auth.getUser` → `members.id` by email
- Service role: `createSupabaseServiceClient()` / `isSupabaseServiceConfigured()`
- Client: `createSupabaseBrowserClient()`
- Fallback `APP_IDS.currentMemberId = "member-default"` is legacy local fallback; recognition APIs must require real cloud member id

**Public path split is critical** (`src/lib/auth/public-paths.ts`):

| Kind | Paths | Logged-in behavior | For recognition public form? |
|---|---|---|---|
| **Open public** | `/privacy`, `/quiz/fat-loss`, `/q/`, `/r/` | Stay on page | **YES — copy this** |
| **Auth public** | `/login`, `/register`, `/c/[token]` | Redirect to `/daily-action` | **NO** |

`AppShell` hides bottom/side nav when `isPublicPath`. Public recognition form should be **open public** so admins can QA the link without being kicked home.

Tests live in `src/lib/auth/public-paths.test.ts` — any new public prefix must be added there.

### 1.5 Member / organization / permissions

Cloud tables (`supabase/migrations/001_cloud_foundation.sql`):

- `members`: id, member_number, name, email, **role** default `'member'`, current_level, sponsor_member_number, later `avatar_url`
- `organization_relationships`: parent → child downline
- RLS: authenticated **SELECT all members** (`USING true`). Do **not** copy this for recognition rosters/photos.

Local member type (`src/types/member.ts`) has richer fields (birthday, phone, nickname). Cloud `members` table does **not** store birthday. Profile extras live in `member_app_data` key `baki-go:member-profile` (`src/lib/members/member-profile-sync.ts`). Confirms V1 must **not** auto-load 壽星 names from members.

Single tenant: `APP_IDS.organizationId = "org-default"`. **No `organizations` table.**

`members.role` is derived as `president` if `current_level === "president"`, else `member` (`resolveCloudMemberRole`).

Existing permission helpers — **none are Recognition admin**:

| Helper | Gate | Too wide / wrong? |
|---|---|---|
| `isPresidentMember` | rank = president → see all members | Seeing org ≠ editing 月會 PPT |
| `canManagePromotions` | promotion_group and above | Far too many people |
| `canAccessMemberManagement` | has downline | Partner care, not ops |
| `canAdjustDownlineRank` | promotion_group+ and first-gen downline | Rank edit |
| Quiz `/quiz/manage` | **any authenticated member** | Own share links only |

**Largest architectural gap:** there is no org-level admin / ops role. Recognition Center needs a dedicated allowlist (see §4 and §11).

### 1.6 Public-token patterns in production code

| Feature | Token | Stored | Access | Verdict |
|---|---|---|---|---|
| Quiz `share_code` | 6-char alphanumeric (`generateShareCode`) | plaintext unique | service-role | **Do not reuse** (guessable; fine for quiz attribution, not photo upload) |
| Customer portal `customer_portal_tokens.token` | `encode(gen_random_bytes(24), 'hex')` | **plaintext** | SECURITY DEFINER RPC `get_customer_portal_by_token` / `resolve_coaching_portal_context` granted to anon | Token design **do not copy**; RPC-to-anon pattern is OK only after hashing |
| Growth share `/r/[token]` | `randomBytes(32).base64url` (≥128-bit) | **`token_hash` SHA-256 only** | service-role after hash lookup | **Copy this** |

Growth share helpers: `src/lib/coaching/referral-share/share-token.ts` (`generateGrowthShareToken`, `hashGrowthShareToken`, `isPlausibleGrowthShareToken`). Public API: `src/app/api/r/[token]/route.ts` — GET returns public payload only; POST writes via service role; never returns owner ids / token_hash.

Quiz public write: `POST /api/quiz/responses/start` — **no auth**, service-role insert. Quiz tables have RLS enabled and **zero policies** (anon and authenticated cannot read/write tables directly).

Coaching public photo upload: `POST /api/coaching/portal/[token]/meals/[mealSlot]/photo` — resolve portal → `storage.from("coaching-meal-photos").upload` with service role → attach path on meal row. **No anon storage policies.**

**There is no public API rate limit today** (only in-memory coaching AI recovery kick limiter). Recognition public upload **must add** IP/token rate limits.

### 1.7 Storage today

| Bucket / table | Visibility | Notes | Reuse? |
|---|---|---|---|
| `member-avatars` | **public** bucket, 512KB, jpeg/png/webp, authenticated folder = own member id | Avatars | **No** |
| `coaching-meal-photos` | **private**, 5MB, jpeg/png/webp, **no object policies** | Path built in `buildCoachingMealPhotoPath`; signed/download via service role | **Copy strategy, new bucket** |
| `customer_progress_photos` | Postgres `image_data_url` | Anti-pattern for recognition | **No** |
| `customer_receipt_photos` | Postgres data URL + retain_until | Coach-only receipts | **No** |

`ImageUploadButtons` already supports camera / library / `image/*,.heic,.heif`.

Coaching image pipeline (`src/lib/coaching/ai/coaching-meal-image-processor.ts`): dynamic `import("sharp")`, rotate, resize long-edge, jpeg. `detect-photo-reuse.ts` computes sha256 + 8×8 average hash. `sharp` is a **transitive** dependency (`package-lock.json`), not a direct `package.json` dependency — declare it when recognition image processing lands.

**No pptx / pptxgenjs / jspdf in dependencies.**

### 1.8 UI / IA to reuse

- `PageShell`, `TabRootShell`, `BrandCard`, `PrimaryButton`, `SectionLabel`
- `MobileFormModal`, `MobileDismissibleSheet`
- `ImageUploadButtons`
- `PageLoadingState` / `PageErrorState`
- `CrmButton` / `CrmCard` (members UI)
- Time: `todayISODate`, `toYearMonth*`, Asia/Taipei (`coachingTodayLogDate`, radar jobs)
- Public URL: `src/lib/app/public-origin.ts` — `PRODUCTION_APP_ORIGIN = "https://bakigo.tw"`, `buildPublicShareUrl(path)`
- Zod already used for coaching/consultation/radar schemas
- Nav: bottom 3 worlds are 我的 / 顧客 / 行事曆. Recognition belongs in **More** (`MY_HOME_MORE_ENTRIES`), not the 5 primary business tiles

Mobile-first is a project rule. Public form **must** be phone-first. Admin photo review and 4:3 PPT preview may use wider desktop layout, but inbox/review must remain usable on a phone.

### 1.9 Route map (relevant)

Authenticated app: `/`, `/login`, `/register`, `/leaderboard`, `/events`, `/promotions`, `/pre-meeting-graphic`, `/members`, `/organization`, `/quiz/manage`, `/quiz/leads`, `/coaching`, `/customers`, `/calendar`, …

Public:

- `/q/[code]` → quiz
- `/quiz/fat-loss/*` open public
- `/c/[token]` customer/coaching portal (**auth-public, redirects logged-in users**)
- `/r/[token]` growth referral (open public)

API style for public: Next.js App Router `src/app/api/.../route.ts`, `runtime = "nodejs"`, service client, JSON errors.

Admin-style API: `getMemberIdFromRequest` first, 401 if missing, then resource ownership/role check.

### 1.10 Jobs / async

Coaching has `coaching_generation_jobs` + RPCs `claim_coaching_generation_jobs` / `reclaim_stale_coaching_generation_jobs` + `POST /api/coaching/jobs/process`. Reuse **later** for async PPTX. Not needed until binary generation.

### 1.11 Docs gap

`docs/ROADMAP.md` still describes foundation / daily member / leader phases. Recognition Center is not listed. `docs/DATABASE.md` has no recognition entities. `docs/BUSINESS_RULES.md` has no 27-award catalog.

Phase 2 (if approved) should add `docs/RECOGNITION.md` and update those files. **This Phase 1 file is the audit only.**

---

## 2. Reuse map

### Reuse

- Auth session + `fetchWithMemberAuth` + `getMemberIdFromRequest`
- `members.id` as `created_by` / `reviewer` (optional later FK for honoree)
- Open-public path registration + `public-paths.test.ts`
- Growth-share token generate / SHA-256 / plausibility check
- Quiz pattern: RLS on, zero anon policies, all IO via service-role API
- Coaching private Storage: server-proxied upload, signed read, originals as storage paths not data URLs
- `ImageUploadButtons`, `PageShell`, `BrandCard`, `MobileFormModal`, `PageStates`
- `Asia/Taipei`, `buildPublicShareUrl`
- Coaching job queue **later** for PPTX
- `sharp` pipeline as a **later** photo heuristic (not V1 AI)

### Reuse as pattern only (do not share tables)

- `quiz_definitions` catalog + seed + slug + status
- `quiz_share_links` / public quiz responses (unauthenticated write after token)
- `coaching_meal_photos.storage_path` + private bucket
- Growth `token_hash` column

### Do not reuse as data / do not copy

- `member_app_data` JSON blobs
- `baki-events` / `event-repository` / `EventCenterPage`
- `promotion_campaigns` local JSON + `canManagePromotions`
- `customers`, `consultation_*`, `coaching_*` rows
- `RANK_KEYS` as award catalog
- `/leaderboard` or `/events` URL trees
- Customer portal **plaintext** tokens
- `members` RLS `USING (true)`
- Storing images as `image_data_url` in Postgres
- Quiz 6-character codes for a photo-capable public form
- Public Storage buckets

---

## 3. Proposed database schema

Principle: **raw submissions are append-only evidence. Admins work on consolidated candidates. PPT reads `review_status = approved` only.**

All new tables: UUID PKs, `created_at` / `updated_at` on mutable rows, snake_case, FKs `{entity}_id`. No computed KPI columns. Single-tenant (no `organization_id` until multi-tenant exists).

### 3.1 `recognition_award_definitions`

Org-wide catalog. **Forbidden to treat a TS constant array as the only source.**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | stable key, e.g. `map_month_1` |
| name | text | display name |
| requires_photo | boolean | |
| layout_hint | text | `name_list` \| `photo_grid` \| `photo_hero` \| `premium` |
| sort_order | integer | default catalog order |
| is_active | boolean | default true; deactivate, don’t delete |
| created_at, updated_at | timestamptz | |

Seed 27 rows in a future migration (not this phase). Million-lifetime uses `premium`. Photo items use `photo_grid` / `photo_hero` as default hint; actual layout still depends on approved count (see §8).

### 3.2 `recognition_ppt_themes`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | |
| name | text | |
| aspect_ratio | text | default `4:3` |
| config_json | jsonb | colors, fonts, logo storage path, layout component map |
| is_active | boolean | |
| created_at, updated_at | timestamptz | |

Theme swap must not rewrite candidates. Seed one default theme row later.

### 3.3 `recognition_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. `2026 年 9 月月會` |
| year | integer | |
| month | integer 1–12 | |
| collect_starts_at | timestamptz | |
| collect_ends_at | timestamptz | |
| status | text | `draft` \| `collecting` \| `closed` \| `archived` |
| public_token_hash | text unique | SHA-256 of raw token; raw token shown once / in URL only |
| public_token_prefix | text | short prefix for support lookup, not sufficient to auth |
| ppt_theme_id | uuid FK | |
| copied_from_event_id | uuid FK nullable | |
| created_by_member_id | uuid FK → members | |
| closed_at | timestamptz nullable | |
| created_at, updated_at | timestamptz | |

Copy previous month: copy event_awards enablement + sort + theme. **Never copy** submissions, entries, photos, candidates, signals. Mint a **new** token.

Open product decision: unique `(year, month)` vs allow multiple events in one month.

Birthday month label is **derived** from `month`. No extra column required; optional `birthday_label_override` only if ops need to override later (not V1).

### 3.4 `recognition_event_awards`

Per-event catalog snapshot / ordering.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| award_definition_id | uuid FK | |
| sort_order | integer | |
| is_enabled | boolean | hide from public form if false |

Unique `(event_id, award_definition_id)`. Unique `(event_id, sort_order)` recommended.

Disabled awards are omitted from public form and from PPT (even if someone had been approved historically on a previous event).

### 3.5 `recognition_submissions`

One envelope per public submit.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| submitted_by_name | text | required |
| submitted_by_org | text | V1 **free text** unless product says otherwise |
| ip_hash | text nullable | SHA-256 of IP for rate-limit/abuse, not displayed |
| user_agent | text nullable | |
| created_at | timestamptz | |

No `status` that means “approved”. This row is evidence only. **No DELETE** in app or RLS.

### 3.6 `recognition_submission_entries`

One row per name (and optional photo) inside an envelope.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| submission_id | uuid FK | |
| event_id | uuid FK | denormalized for indexes |
| award_definition_id | uuid FK | |
| raw_name | text | as typed |
| normalized_name | text | see §7 |
| photo_asset_id | uuid FK nullable | required if award.requires_photo |
| created_at | timestamptz | |

Never deleted. Never copied into PPT directly.

### 3.7 `recognition_photo_assets`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| original_storage_path | text | private bucket |
| sha256 | text | exact-file duplicate signal |
| mime_type | text | |
| width, height | integer nullable | |
| byte_size | integer | |
| source | text | `public` \| `admin` |
| flags_json | jsonb | group_photo, tiny_subject, overlay_text, low_res, multi_face, no_clear_person, orientation |
| review_status | text | `pending_process` \| `auto_ok` \| `needs_review` \| `rejected` |
| created_at | timestamptz | |

**Never overwrite or delete originals.** Processing writes a **crop row**, not a replacement original.

Phase 1/early implementation may leave `flags_json` empty / heuristic-only. AI flags are later.

### 3.8 `recognition_photo_crops`

Presentation crop.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| photo_asset_id | uuid FK | |
| crop_box_json | jsonb | normalized {x,y,w,h} in original pixels or 0–1 ratios — pick one and document |
| processed_storage_path | text | derived jpeg for PPT |
| confirmed_by | text | `submitter` \| `admin` |
| confirmed_at | timestamptz | |
| is_current | boolean | one current crop per asset |

Partial unique `(photo_asset_id)` WHERE `is_current`.

Multi-face: no current crop until a human confirms. AI must not set `is_current`.

### 3.9 `recognition_candidates`

Admin work object **and** PPT source of truth.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| award_definition_id | uuid FK | |
| display_name | text | chosen spelling for PPT |
| normalized_name | text | |
| review_status | text | `pending` \| `approved` \| `needs_fix` \| `rejected` |
| current_photo_asset_id | uuid nullable | |
| current_crop_id | uuid nullable | |
| reviewer_member_id | uuid nullable | |
| review_note | text nullable | |
| member_id | uuid nullable | **optional**; not required V1; for future timeline |
| created_at, updated_at | timestamptz | |

**Partial unique** `(event_id, award_definition_id, normalized_name)` WHERE `review_status IN ('pending','approved','needs_fix')`. Rejected rows must not block a later re-submit of the same name.

Approved rows with `requires_photo` should have a current confirmed crop before PPT generate (validation blocker).

### 3.10 `recognition_candidate_sources`

| Column | Type | Notes |
|---|---|---|
| candidate_id | uuid FK | |
| submission_entry_id | uuid FK unique | each entry maps to one candidate |
| created_at | timestamptz | |

PK `(candidate_id, submission_entry_id)`. This is how submitted_by list is reconstructed.

### 3.11 `recognition_duplicate_signals`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| left_candidate_id | uuid FK | |
| right_candidate_id | uuid FK | |
| signal_type | text | `same_award_name` \| `cross_award_name` \| `photo_hash` \| `fuzzy_name` |
| severity | text | `info` \| `warning` \| `blocking` |
| resolved_at | timestamptz nullable | |
| created_at | timestamptz | |

Unique `(left_candidate_id, right_candidate_id, signal_type)` with ordered ids to avoid A-B / B-A duplicates.

Cross-award same name: **warning default**, not auto-merge, not auto-reject.

### 3.12 `recognition_admin_members`

Dedicated allowlist. **Do not infer from rank.**

| Column | Type | Notes |
|---|---|---|
| member_id | uuid PK FK → members | |
| granted_by_member_id | uuid nullable | |
| granted_at | timestamptz | |

Open product decision: initial members; whether presidents auto-qualify (recommend **no**).

### 3.13 `recognition_ppt_exports` (later phase)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK | |
| ppt_theme_id | uuid FK | theme used at export time |
| page_count | integer | |
| validation_snapshot_json | jsonb | |
| recipient_snapshot_json | jsonb nullable | audit only; live truth remains candidates |
| storage_path | text nullable | generated pptx in a private bucket or same photos bucket prefix `exports/` |
| created_by_member_id | uuid | |
| created_at | timestamptz | |

History UI does **not** depend on pptx files. It reads approved candidates for that event’s year/month.

### 3.14 Indexes

- `recognition_events (year, month)`
- `recognition_events (public_token_hash)` unique
- `recognition_event_awards (event_id, sort_order)`
- `recognition_submission_entries (event_id, award_definition_id, normalized_name)`
- `recognition_submissions (event_id, created_at desc)`
- `recognition_candidates (event_id, review_status)`
- `recognition_candidates (event_id, award_definition_id, sort by display_name)` for PPT
- `recognition_photo_assets (event_id, sha256)`
- Future timeline: `(normalized_name)` on approved candidates, or generated `recognition_honoree_index` later — **do not skip normalized_name storage now**

### 3.15 Status machine

```
draft → collecting → closed → archived
         ↑              │
         └──────────────┘  (reopen? product decision; default no)
```

- `draft`: no public writes; link may exist but API 404
- `collecting`: public writes if also inside time window (see §11 for clock vs status)
- `closed`: public writes rejected; review + preview + export
- `archived`: read-only history

Public GET/POST must check **both** status and time window unless product picks one authority.

Copy-from-previous: new row in `draft` or `collecting` per product; recommend `draft` until admin opens collection.

---

## 4. RLS

Copy **Quiz**, not `members` (`USING true`) and not plaintext portal tokens.

For every `recognition_*` table:

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
2. **anon: zero policies**
3. **authenticated: zero table policies** in V1 (or later a narrow admin SELECT if browser supabase client is used — recommend **not** using browser client against these tables)
4. All reads/writes: Next.js Route Handlers + service role
5. Public handlers: lookup `public_token_hash`, verify status + window, then insert
6. Admin handlers: `getMemberIdFromRequest` → membership in `recognition_admin_members` → 401 / 403. Prefer 404 for non-admins on event URLs to avoid existence leak if links are sensitive
7. No `GRANT` of table DML to `anon` / `authenticated`
8. Storage: no `storage.objects` policies on `recognition-photos`

Do **not** create SECURITY DEFINER RPCs that return other people’s names to anon.

Optional later: authenticated SELECT for allowlisted members via a policy using `members.email = jwt email` joined to `recognition_admin_members`. Still keep mutations on service role so validation/merge logic cannot be bypassed from the client.

---

## 5. Storage strategy

New private bucket: **`recognition-photos`**.

Do **not** share `coaching-meal-photos` or `member-avatars`.

Suggested bucket settings (future migration, not now):

- `public = false`
- `file_size_limit` ≈ 10–15MB (group photos)
- `allowed_mime_types`: jpeg, png, webp, heic, heif (convert HEIC server-side to jpeg for processed crop)

Paths:

```
{event_id}/original/{asset_id}
{event_id}/crops/{crop_id}.jpg
{event_id}/exports/{export_id}.pptx   # later
```

Rules:

- Upload **only** via service-role API after token or admin auth
- Read via short-lived signed URLs
- Originals never overwritten (`upsert: false`)
- App never deletes originals
- Public submitter may receive a signed URL **only** for their just-uploaded original / in-progress crop confirmation, never the event roster
- Admin inbox uses signed URLs per photo

HEIC: iPhone camera is common (`ImageUploadButtons` already accepts it). Server must convert; do not assume browser decode.

---

## 6. Routes, pages, components

Do **not** nest under `/leaderboard`, `/events`, or `/promotions`.

### 6.1 Public (open public, no AppShell nav)

| Route | Purpose |
|---|---|
| `/recognition/p/[token]` | Choose award, batch names, photo name+file, submitter name/org, submit |
| `GET /api/recognition/public/[token]` | Minimal catalog: title, year/month, enabled awards, requires_photo. **No names** |
| `POST /api/recognition/public/[token]/submissions` | Create submission + entries; upsert pending candidates |
| `POST /api/recognition/public/[token]/photos` | Multipart upload original |
| `POST /api/recognition/public/[token]/photos/[assetId]/crop` | Optional submitter crop confirm |

Token in URL is the raw secret. API hashes before lookup.

Success copy: 「已收到，待審核」. Never return existing roster or other submitters.

### 6.2 Admin (authenticated + allowlist)

| Route | Purpose |
|---|---|
| `/recognition` | Event list |
| `/recognition/events/new` | Create; optional copy previous month settings |
| `/recognition/events/[eventId]` | Settings, public link, status, theme, award order |
| `/recognition/events/[eventId]/inbox` | Consolidated candidates by award / status |
| `/recognition/events/[eventId]/photos` | Photo exception queue |
| `/recognition/events/[eventId]/preview` | 4:3 HTML preview + validation summary |
| `/recognition/history?year=2026&month=8` | All awards + names + one-tap text copy |
| `/recognition/awards` | Catalog admin (can be a later sub-phase) |

Admin APIs under `/api/recognition/admin/...` all use Bearer + allowlist.

Suggested admin endpoints:

- CRUD events, copy-from, rotate token, change status
- List candidates with sources + signals
- Patch candidate status / display_name / photo/crop
- Merge / split candidates (keep sources)
- Signed photo URLs
- Preview plan JSON
- History query + text export payload
- Later: enqueue PPTX export

### 6.3 Code layout (when Phase 3+ starts — not this file)

```
src/lib/recognition/
  access.ts              # isRecognitionAdmin
  token.ts               # generate/hash (mirror growth share)
  normalize-name.ts
  merge-candidates.ts
  presentation-plan.ts
  validation.ts
  time.ts                # Asia/Taipei window checks

src/components/recognition/
  public/                # phone-first form
  admin/                 # inbox, photos, preview, history

src/app/recognition/...
src/app/api/recognition/...
```

Reuse UI primitives listed in §1.8. Do not invent a second design system.

### 6.4 IA / nav

- Add `/recognition/p/` to `OPEN_PUBLIC_PATHS` (not AUTH_PUBLIC)
- Add link in **More** (`MY_HOME_MORE_ENTRIES`), hidden if not allowlisted (client still must not be the security boundary)
- Update `AppNav` `isActive` if needed so「我的」highlight is correct
- Do not occupy one of the 5 primary home business tiles
- Do not rename `/leaderboard` in this project unless product explicitly asks later

---

## 7. Duplicate detection strategy

Goal: admin sees **one person per award**, with provenance, not N raw rows.

### 7.1 Normalize (must live in docs, not only code)

V1 proposed:

1. Unicode NFKC
2. Trim
3. Collapse internal whitespace to single space
4. ASCII lower-case
5. Keep CJK characters as-is

**Honorific stripping** (老師 / 督導 / 組 / 先生) is an **open product decision**. It changes whether `王小明` and `王小明老師` auto-merge.

Do not strip middle dots / hyphens until product says so (`王小明` vs `王-小明`).

Store both `raw_name` and `normalized_name`.

### 7.2 Same event + same award + same normalized_name

- **Auto-merge** into one `recognition_candidates` row
- Append `recognition_candidate_sources`
- Keep every `submitted_by_*`
- If incoming display spelling differs, keep first display_name (or majority) and surface a `needs_fix` if conflict is material
- Multiple photos for same candidate: **do not drop files**. Candidate → `needs_fix` or photo queue until human picks current crop
- Exact photo `sha256` match can auto-reuse the same `photo_asset` row but still record both sources

### 7.3 Same event + different award + same normalized_name

Example: MAP1 and MAP2.

- Keep **two** candidates (one per award)
- Insert `cross_award_name` signal
- Inbox shows「亦出現在：MAP 第二個月」
- **Never auto-delete, auto-reject, or auto-merge across awards**
- PPT preview: default **warning**, not blocking (MAP1+MAP2 may be legitimate). Product may flip this to blocking.

### 7.4 Fuzzy / photo similarity

V1: exact normalized match + optional honorific rule + exact sha256.

Fuzzy (`fuzzy_name`) and perceptual hash: **signal only**, later. Coaching already has 8×8 aHash — reusable later, not required to ship collection.

### 7.5 Inbox UX

Filters: 待審核 / 已通過 / 需修正 / 不採用 / 照片異常.

Each candidate card:

- display name + award
- source count
- list of submitted_by name/org + timestamps
- photo thumb (signed)
- cross-award hints
- actions: approve / needs_fix / reject / change photo / confirm crop / edit display name

Admin merge/split tools: moving `candidate_sources` between candidates; do not delete entries.

### 7.6 What never happens

- DELETE on submissions / entries
- Silent drop of a source after merge
- AI choosing which face is the honoree
- Auto-reject because the name also appears in another award

---

## 8. PPT generation architecture

Phase 1 **plans** this. Do not generate PPTX now. Do not add pptx libraries in this phase.

### 8.1 Three layers

```
Approved candidates + event_awards order
        ↓
PresentationPlan (pure data: slides[], counts, blockers)
        ↓
Theme tokens (4:3 look: color, font, logo, geometry)
        ↓
Renderer: HTML Preview first, PPTX later
```

Changing theme must not mutate candidates. Changing roster must not require a new theme row.

### 8.2 Layout resolver (data layer, not theme)

Walk enabled awards in `event_awards.sort_order`:

1. Count `review_status = approved` for that award
2. If count = 0 → **skip award completely** (no title-only page, no blank page)
3. Else choose layout:
   - `name_list` → name slides (**names per 4:3 page = open decision**)
   - photo + count 1–3 → hero (`photo_hero`)
   - photo + count 4–12 → 4×3 grid
   - photo + count > 12 → paginate 12 per page
   - 百萬終生成就獎 / `layout_hint = premium` → premium even if 1 person
4. Optional birthday **title** slide: month text from `events.month` only (no names V1). Product should confirm whether this slide is in Recognition PPT at all, given “not full 月會 PPT”. Recommendation: include **only** the month-label placeholder page if the current recognition deck already has that slot; otherwise omit until asked.

Photo cells use **current confirmed crop**, not the original group photo, unless crop is full-frame and confirmed.

### 8.3 PresentationPlan shape (logical)

```
{
  eventId, title, year, month, themeId, aspect: "4:3",
  awards: [{ awardId, name, approvedCount, slideCount, omitted: false }],
  slides: [{ index, kind, awardId, recipientIds[], layout }],
  validation: { blocking: [], warnings: [], info: [] },
  totals: { recipients, pages, missingCrops, pendingReview, unresolvedSameAwardDupes }
}
```

HTML preview **must** be real 4:3 (e.g. 1024×768 canvas scaled). A tall phone article is not an acceptable preview.

### 8.4 Validation before generate

| Check | Suggested severity |
|---|---|
| Any candidate `pending` or `needs_fix` | **blocking** |
| Photo award approved but no current confirmed crop | **blocking** |
| Same-award unresolved photo/name conflict | **blocking** |
| Cross-award same name | warning (unless product says block) |
| Fuzzy name signals open | warning |
| Event still `collecting` | warning |
| Award omitted because 0 approved | info |
| Counts + estimated pages | info |

Formal PPT / export allowed only when `blocking.length === 0`. Preview may still render with watermarks for blockers.

### 8.5 Later PPTX

- Library TBD (pptxgenjs or equivalent), 4:3 slide size
- Theme `config_json` maps `layout` → master
- Write file to private storage; row in `recognition_ppt_exports`
- Optional async job modeled on `coaching_generation_jobs`
- Regenerating uses **current approved set + chosen theme**, not a previous pptx binary, unless ops explicitly re-download an export

---

## 9. Public vs admin security (end-to-end)

### Public

1. High-entropy URL token; DB stores hash only
2. Write only if `status = collecting` **and** now ∈ [starts_at, ends_at] (unless §11 picks one authority)
3. GET returns no roster
4. Server-proxied upload; MIME sniff; size cap; HEIC convert
5. Caps: max names per request, max photos per request, max envelope rate per IP hash
6. No account, no session cookie required
7. Closed / archived / draft / bad token → generic failure (avoid leaking “this month’s event exists” if possible; unlisted URL already implies knowledge of token)
8. Do not echo back other entries after insert beyond the submitter’s own payload ack

### Admin

1. 401 without Bearer
2. 403/404 if not in `recognition_admin_members`
3. Mutate candidates / crops / status only through APIs that preserve sources
4. Rotate token invalidates old public URL (hash replaced)
5. Copy-month mints a new token
6. Signed URLs short TTL
7. Do not expose service role to the browser

### Abuse

Today’s public quiz/coaching endpoints have **no** IP rate limit. Recognition **must** add one because of photo storage cost. In-memory limiter is acceptable for V1 if documented; durable limiter later.

---

## 10. Implementation phases

**Phase 1 — this document.** Audit + plan. Stop for product/architect review.

**Phase 2 — Docs freeze (still no feature code / no migration apply / no deploy)**  
If approved: `docs/RECOGNITION.md`, award catalog into `docs/BUSINESS_RULES.md` (or a dedicated rules section), `docs/DATABASE.md`, `docs/ROADMAP.md`. Freeze §11 decisions first.

**Phase 3 — Catalog + events**  
Tables 3.1–3.4 + 3.12. Admin allowlist. Event CRUD, public token, copy previous settings, status machine. No public form yet (or form 404 until collecting).

**Phase 4 — Public collection**  
Submissions, entries, original photo upload, time window, rate limit, pending candidate upsert. Success ≠ approved.

**Phase 5 — Consolidation + review**  
Exact merge, sources list, four review states, cross-award hints, history year/month + one-tap text copy.

**Phase 6 — Photo review without AI**  
Original vs crop, multi-face must be manual, heuristic exception queue (resolution, extreme aspect). Clear single-subject photos may `auto_ok`.

**Phase 7 — Preview / validation**  
`PresentationPlan` + true 4:3 HTML preview + blocking gates. **Still no PPTX.**

**Phase 8 — PPT binary**  
Theme renderer, pagination, skip empty awards, export record.

**Phase 9 (optional)** — Photo AI flags (group / overlay text / tiny subject). **Still no auto person pick.**

**Phase 10 (optional)** — Person history / achievement timeline search by normalized name (and optional member_id).

### Phase gates

- Public write never creates `approved`
- Empty awards omitted from plan
- Originals retained
- Cross-award names never auto-deleted
- Tests for normalize/merge/plan/access
- No production data edits outside normal app usage after ship

---

## 11. Risks, conflicts, open product decisions

Existing architecture vs product: **do not silently change the product.** Flag and wait.

### 11.1 Must decide before Phase 3 schema apply

1. **Who is admin?** Recommend `recognition_admin_members` only. Initial emails / member numbers? Do presidents auto-qualify? **Recommend no.**
2. **Multiple events per year+month?** If no → unique `(year, month)`. History UX is simpler. If yes, history must list events in that month.
3. **Status vs clock.** Recommend: status is authoritative; optional job auto-flips to `closed` at `collect_ends_at`. Alternate: hard-stop at end time even if status still `collecting`.
4. **Honorific stripping** in normalize?
5. **Is cross-award same name PPT-blocking?** Default warning. MAP1+MAP2 may be normal.
6. **Name-list: how many names per 4:3 slide?**
7. Submitter「組織資訊」: free text vs org tree? **Recommend free text** (submitter has no account).
8. Put nullable `member_id` on candidates in V1 schema? Harmless if unused; helps future timeline. Public names often will not match.
9. Crop confirm on public form vs admin-only? Recommend: singles `auto_ok`; group/anomaly → admin queue so the public form stays simple.
10. Is a 壽星 title slide in the Recognition deck at all, or only month string support for a future 月會 template? V1 product says month text can auto-update; it also says full 月會 PPT is out of scope.
11. Reopen `closed` → `collecting`?
12. Token rotation UX: invalidate immediately vs grace overlap.

### 11.2 Principle tensions (keep specified product)

- **Enter data once** vs multi-submitter collection: V1 merges sources; does **not** auto-nominate from rank engine / MAP qualification. Auto-suggest from BakiGO ranks would be a later product, not V1.
- **Mobile-first** vs PPT preview: public form phone-first; preview must be real 4:3.
- **Priority 0 Rule Engine:** 27 items seeded in DB + docs, not UI-only constants. No fake KPI targets in the inbox.
- **Motivation-first member OS** vs ops tool: Recognition is admin/ops. Don’t gamify the public form. Don’t mix with GAME_DESIGN achievements.
- **Leaderboard naming collision:** do not ship Recognition inside「排行與表揚」without an explicit rename decision.
- **Customer portal plaintext tokens / members world-readable RLS:** new module must be stricter.

### 11.3 Technical risks

- Unlisted URL + photo upload = storage/cost abuse → token + window + size + rate limit
- HEIC from iPhones
- Group photos on stage if crop is wrong → multi-face never auto-pass
- `sharp` / PPTX not direct dependencies yet
- Single-tenant assumption; don’t design per-member workspace tables
- Partial unique indexes and merge races: upsert candidate in a transaction
- Signed URL leakage in screenshots / LINE — keep TTL short
- Admin UI on phone for 27 awards × many names: need by-award accordion, not a spreadsheet-only desktop trap
- Quiz-style “any logged-in member can call API” would leak rosters if copied blindly

### 11.4 Conflicts with existing code (do not “fix” by changing this product)

| Existing | Conflict | Resolution |
|---|---|---|
| No org admin | Product needs 管理員 | New allowlist; product names people |
| `/leaderboard` named 表揚 | Naming collision | Separate `/recognition` |
| `/events` named 活動 | 表揚活動 ≠ 活動紀錄 | Separate nouns in UI copy |
| Rank keys ≈ some award names | Different domain | Separate catalog table |
| Birthday only in JSON profile | Auto 壽星 names | Out of V1 (already) |
| `USING (true)` on members | Would leak if copied | Service-role + allowlist |
| No rate limit on public APIs | Photo abuse | Add for recognition |
| Auth-public `/c/` redirects | Admin cannot QA form | Use open public `/recognition/p/` |

---

## 12. Suggested copy formats (history)

One-tap text for LINE / emcee (approved only, enabled awards with count > 0, event award order):

```
2026年8月表揚

MAP 第一個月
- 王小明
- 李小華

新科督導
- 陳小美
```

Omit empty awards. Do not include rejected / pending.

---

## 13. Explicit non-goals (repeat)

- 培訓時間
- 活動宣傳文宣
- 總裁組勉勵內容
- 當月特殊簡報
- 完整月會 PPT 自動化
- Implementing AI image processing in early phases
- Auto 壽星 names
- Auto nomination from rank engine
- Deleting raw submissions
- Guessing honoree in group photos
- Applying migrations in Phase 1
- Deploy in Phase 1
- Changing production data in Phase 1

---

## 14. Phase 2 entry (not started)

If this audit is accepted:

1. Freeze §11 decisions in writing
2. Add `docs/RECOGNITION.md` (product + rules)
3. Update BUSINESS_RULES / DATABASE / ROADMAP
4. Only then write migration + feature code

**Phase 1 stops here.**
