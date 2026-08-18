# Baki GO — Recognition Center

## Purpose

Recognition Center（表揚中心）是 Baki GO 的**組織營運模組**，專門處理每月與各類固定活動的表揚行政工作：

- 表揚活動建立
- 公開收件
- 名單去重與整併
- 照片收集與人工確認
- 審核與歷史查詢
- 4:3 表揚簡報資料準備

Recognition Center 的目標是降低重複行政成本，同時保留完整來源、審核痕跡與未來模板化能力。

> Recognition Center 只處理「固定、重複性的表揚工作」。

## Boundaries / Non-goals

Recognition Center **不是**：

- CRM 功能
- `/leaderboard` 的排行功能
- `/events` 的個人活動紀錄
- GAME_DESIGN 成就 / badge 模組
- 團隊健康訊號 `deserves_recognition`
- 完整月會 PPT 自動化系統

### V1 明確不做

- 培訓時間管理
- 活動宣傳文宣
- 總裁組勉勵內容
- 當月特殊簡報
- 完整月會 PPT 自動化
- 自動壽星姓名載入
- 自動由 Baki GO 晉升規則提名表揚名單
- AI 自動判定多人照片中的受表揚者

## Terminology

### Recognition Event

一次具體的表揚收件與輸出單位，例如：

- 2026 年 9 月月會
- 2026 年 9 月 STS
- 2026 年 9 月世界組大學

`Recognition Event` 是主體；`year` / `month` 只是屬性。**同一個年月可以有多個 Recognition Event。**

### Recognition Event Template

可重複使用的活動設定模板，未來可能包含：

- 月會
- STS
- 世界組大學
- 特別活動

Template 的目的是預先定義：

- 預設表揚項目集合
- 預設項目排序
- 預設 PPT theme

然後用來建立新的 `Recognition Event`，再進行 event-specific customization。

> V1 不要求實作 Template UI / feature code，但架構不得阻礙未來加入 Template。

### Award Definition

表揚項目的目錄定義。預設有 27 項，但系統架構不可將這 27 項視為唯一不可變的硬編碼規則；未來管理員可新增、停用、排序、自訂。

### Submission

公開表單的一次送出。包含：

- 填報者名稱
- 填報者組織資訊（V1 為 free text）
- 一批表揚名單 entry

Submission 是**原始證據**，不是正式表揚結果。

### Submission Entry

Submission 內的單一被提報人項目。每一個姓名 / 照片組合都是一個 entry。

### Candidate

管理員審核用的整併對象。系統會把相同活動 + 相同項目 + 相同 normalized name 的 entry 整併成 consolidated candidate。

### Original Photo

公開或管理員上傳的原始照片檔案，必須保留，不可用 presentation crop 覆蓋。

### Presentation Crop

為 PPT 使用而產生的裁切 / 處理後圖片。它不是原圖替代品，而是簡報輸出版本。

## Product principles specific to Recognition Center

1. **Submission is evidence, not approval.**
2. **Approved recipients only** can enter the formal PPT data set.
3. **Raw submissions and raw entries are retained.** Do not silently delete evidence.
4. **Theme and roster data are separate.**
5. **No blank award slides.** Awards with zero approved recipients are omitted.
6. **Public form stays simple.** Photo anomalies go to admin review.
7. **Recognition admin is an explicit allowlist, not inferred from rank.**

## Recognition Admin permission model

Recognition Center V1 uses a dedicated **`recognition_admin_members` allowlist**.

Rules:

- Recognition Admin permission is **not** derived from career rank.
- President rank does **not** automatically grant Recognition Admin access.
- A member must be explicitly added to the Recognition Admin allowlist.
- This allowlist is independent of member-management, promotions, partner-care, or leaderboard permissions.

If implementation discovers architectural friction with current app permission helpers, that friction must be documented; it must **not** be resolved by changing this product rule.

## Recognition Event model

Each Recognition Event includes:

- 活動名稱
- 年份 / 月份
- 公開收件開始時間 `collect_starts_at`
- 公開收件截止時間 `collect_ends_at`
- 狀態：`draft` / `collecting` / `closed` / `archived`
- 公開填報連結
- 表揚項目排序
- PPT theme/template

### Multiple events per month

Multiple Recognition Events in the same year/month are **allowed**.

This is intentional so Baki GO can later support different event types in the same month, such as:

- 月會
- STS
- 世界組大學
- 特別活動

Therefore:

- Do **not** treat `(year, month)` as a unique business identifier
- Do **not** design the product assuming one event per month
- History should be modeled around `Recognition Event`, with year/month as filters

### Event lifecycle

Recognition Event lifecycle:

`draft` → `collecting` → `closed` → `archived`

Additional frozen rules:

- A Recognition Admin **may reopen** a `closed` event back to `collecting`
- Reopened events must still obey the normal collection time-window rules
- State changes should be recorded consistently for auditability

### Public collection availability

Public submission is available **only if both conditions are true**:

1. `event.status = collecting`
2. current time is within `collect_starts_at` / `collect_ends_at`

Do not rely on only one of these conditions.

### Public token rotation

Rotating a public collection token:

- immediately invalidates the previous token
- has **no grace-overlap period** in V1

## Recognition Event Template future model

Recognition Event Template is a future reusable configuration layer.

The architecture must support:

Template
→ default award set
→ default award ordering
→ default PPT theme
→ create Recognition Event
→ event-specific customization

`Copy Previous Month Settings` remains supported, but it must **not** become the only reuse mechanism.

V1 architecture requirements for template compatibility:

- event rows must support event-specific overrides
- award ordering must be attachable at the event level
- PPT theme selection must be attachable at the event level
- event creation flow must not assume that “copy previous month” is the only starting point

## Default award definitions (V1 catalog)

These 27 items are the default catalog. They are **not** career rank keys and must not be incorrectly merged into the promotion / rank system.

| # | Award | Photo required |
|---|---|---|
| 1 | MAP 第一個月 | No |
| 2 | MAP 第二個月 | No |
| 3 | MAP 第三個月（MAP 第三個月過關） | Yes |
| 4 | 新科督導 | Yes |
| 5 | 世界組第一個月 | No |
| 6 | 世界組第二個月 | No |
| 7 | 世界組第三個月 | No |
| 8 | 新科世界組（第四個月過關） | Yes |
| 9 | 1%世界組 | Yes |
| 10 | 5K俱樂部 | Yes |
| 11 | 萬點高手 | Yes |
| 12 | 推廣組第一個月 | No |
| 13 | 推廣組第二個月 | No |
| 14 | 新科推廣組（第三個月過關） | Yes |
| 15 | RO2500推廣組第一個月 | No |
| 16 | RO2500推廣組第二個月 | No |
| 17 | 新科RO2500推廣組（第三個月過關） | Yes |
| 18 | 富豪組第一個月 | No |
| 19 | 富豪組第二個月 | No |
| 20 | 新科富豪組（第三個月過關） | Yes |
| 21 | RO7500富豪組第一個月 | No |
| 22 | RO7500富豪組第二個月 | No |
| 23 | RO7500富豪組（第三個月過關） | Yes |
| 24 | 總裁組第一個月 | No |
| 25 | 總裁組第二個月 | No |
| 26 | 新科總裁組（第三個月過關） | Yes |
| 27 | 百萬終生成就獎 | Yes |

Future management requirements:

- add custom award definitions
- disable awards
- reorder awards
- select different default PPT treatment

## Collection workflow

### Public submitters

Public submitters do **not** need a Baki GO account.

With a valid public link, a submitter may:

- choose a recognition award
- batch input multiple name-only recipients
- for photo awards, submit name + photo
- provide submitter name
- provide submitter organization information (free text in V1)
- submit

### Public submission evidence rule

Public submissions must **never** become official PPT data automatically.

They are evidence that enters review flow:

`public submission` → `raw submission / entries` → `candidate consolidation` → `admin review` → `approved recipients` → `presentation plan`

### Public simplicity rule

The public form must stay simple in V1:

- public submitters do **not** perform manual crop confirmation
- public submitters do **not** resolve duplicates
- public submitters do **not** need to map to the Baki GO org tree

Photo anomalies and group-photo issues go to admin review.

## Duplicate / consolidation rules

### Name normalization

V1 normalization:

- normalize Unicode form
- trim
- collapse obvious spacing noise
- support exact normalized-name duplicate detection

Frozen rule:

- Do **not** automatically strip titles / honorifics such as `老師`、`督導`、`先生`、`組`
- Similar names involving titles may be surfaced as suspected duplicates
- They must **not** be silently merged

### Same event + same award + same normalized name

When the same normalized person name appears in the same event and same award:

- entries may consolidate into one candidate according to the architecture
- all raw sources must still be retained
- all submitter provenance must still be retained

### Same event + different award + same normalized name

When the same normalized name appears across different awards:

- treat it as a **warning only**
- do **not** auto-merge
- do **not** auto-reject
- do **not** auto-delete
- do **not** block PPT generation

This warning exists to help admins review potential confusion, not to enforce a product rule that one person may appear only once.

## Review states

Recognition candidates support these review states:

- `pending` — waiting for review
- `approved` — allowed to enter formal presentation data
- `needs_fix` — data/photo needs correction
- `rejected` — not used

Rules:

- only `approved` can enter PPT
- `pending` / `needs_fix` are incomplete review states
- `rejected` does not delete evidence

## Photo rules

Recognition photo awards must model real-world usage:

- group photos
- very small subject
- large text overlays
- landscape / portrait
- low resolution
- multiple faces
- no clearly identifiable subject

### Original photo rule

Original photos must be preserved.

Do not:

- overwrite original with processed output
- treat crop as the original
- silently discard alternate uploads

### Presentation crop rule

Recognition Center must support a **presentation crop / processed image** concept.

This crop exists for display / PPT quality control and is separate from the original asset.

### Multi-person photo rule

If a photo contains multiple possible people:

- AI must **never** choose the honoree
- the record must go to admin review

### Public photo workflow rule

Public V1 flow stays simple:

- no required manual crop confirmation in the public form
- anomalies and group photos go to admin review
- clear, normal photos may pass into review with minimal friction

## Public security model

Recognition Center public collection must be treated as a security-sensitive write path.

Rules:

- use a public collection token
- invalid token access must fail immediately
- rotating token invalidates the previous token immediately
- public table access must not bypass server-side validation
- public submitters must not see existing event rosters
- public uploads must not imply approval

Public submission availability requires:

- `status = collecting`
- current time inside collection window

These two rules are cumulative, not interchangeable.

## History / text export behavior

Recognition Center must support historical lookup by month and event.

At minimum, admins must be able to:

- select a historical month / event
- view awards and approved names
- one-tap copy a text-only version for LINE / emcee use

Text export rules:

- approved recipients only
- follow event award ordering
- omit awards with zero approved recipients

Future extension:

- person history / achievement timeline

To support that future, candidates may carry a nullable `member_id`, but V1 public submissions do not require member matching.

## 4:3 presentation rules

Recognition Center presentation planning targets **4:3** output.

Required layout families:

1. name-only layout
2. 12-person photo grid (4 columns × 3 rows)
3. small-count hero layout (1–3 people)
4. premium layout for 百萬終生成就獎

Rules:

- photo count > 12 auto-paginates
- PPT theme and roster data must remain separate
- an award with zero approved recipients must be omitted entirely

### Name-only pagination

The exact number of names per 4:3 slide remains **configurable / unresolved** in Phase 2.

Do not hard-code a permanent product rule yet.

## PPT validation rules

Before formal PPT generation, Recognition Center must provide Preview / validation summary including:

- per-award approved counts
- page counts
- missing photos / missing presentation-ready photo data
- suspected duplicates
- unfinished review states
- other blocking issues

V1 rule:

- only approved recipients may enter the formal presentation plan

### Empty-award omission

If an award has zero approved recipients for an event:

- it must be completely hidden from the presentation output
- no blank page may be generated

## Birthday scope

Recognition Center V1 does **not** generate birthday slides.

Frozen rule:

- do not include birthday slides as part of Recognition Center V1 PPT generation
- preserve the concept that a future monthly-meeting template may derive `X月壽星` from the event month
- auto birthday-name population remains out of scope

## Future extension boundaries

Recognition Center architecture should allow future work such as:

- Recognition Event Templates
- person recognition timeline
- AI-based photo anomaly flags
- richer PPT theme/template systems
- event-type-specific default award sets

But V1 should not over-engineer or pre-build those features beyond what is necessary to keep the architecture open.

## Phase 3 implementation notes

Phase 3 foundation has been implemented. The following is now in the repository:

### Migration

`supabase/migrations/035_recognition_foundation.sql`
`supabase/migrations/036_recognition_event_rpcs.sql`

Creates:
- `recognition_award_definitions` (seeded with 27 default awards)
- `recognition_ppt_themes` (seeded with one default 4:3 theme)
- `recognition_admin_members`
- `recognition_events`
- `recognition_event_awards`

Atomic RPCs:
- `create_recognition_event_with_awards(...)`
- `reorder_recognition_event_awards(...)`

Both RPCs are `SECURITY DEFINER`, with `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`.

RLS enabled on all tables. Zero anon policies. Zero broad authenticated policies.

**This migration has not been applied to production.** Apply via Supabase SQL Editor or CLI before opening Recognition Center to admins.

### API routes

```
GET  /api/recognition/catalog
GET  /api/recognition/admin/me
GET  /api/recognition/events
POST /api/recognition/events
GET  /api/recognition/events/[eventId]
PATCH /api/recognition/events/[eventId]
GET  /api/recognition/events/[eventId]/awards
PATCH /api/recognition/events/[eventId]/awards/[awardId]
POST /api/recognition/events/[eventId]/awards/reorder
```

All admin routes: Bearer → member id → `recognition_admin_members` check.

Create event and award reorder now go through PostgreSQL RPCs so the DB applies them transactionally.
The browser cannot execute these RPCs directly; only the Next.js server, through the service-role Supabase client, may call them.

### UI routes

```
/recognition             Recognition Center home (admin only)
/recognition/events/new  Create event
/recognition/events/[id] Event management
```

Navigation: `/recognition` added to **More** entries in home navigation.

### Authorization

`src/lib/recognition/recognition-service.ts` — `isRecognitionAdmin()` / `assertRecognitionAdmin()` query `recognition_admin_members` table only. No rank inference.

### First Recognition Admin bootstrap procedure

The `recognition_admin_members` table starts empty. To grant the first admin:

1. Go to Supabase Dashboard → SQL Editor
2. Find the `members.id` UUID for the target member (query by email or member_number)
3. Run:

```sql
insert into public.recognition_admin_members (member_id, is_active)
values ('<target-member-id>', true);
```

4. Verify: that member can now access `/recognition` in the app.

This is a manual bootstrap step by design — there is no self-service admin grant and no insecure shortcut. All subsequent admin grants can be done via additional SQL inserts until a management UI is built.

### Tests

`src/lib/recognition/recognition-service.test.ts` — 27 passing tests covering:
- 27 default awards exist
- photo-required flags correct (12 photo, 15 name-only)
- multiple events in same year/month allowed
- invalid month rejected
- invalid year rejected
- collection end before start rejected
- status transition rules (including closed → collecting reopen)
- award uniqueness within event documented
- admin permission model not rank-based
- no collision with existing RANK_KEYS

### Deferred from Phase 3

- Copy Previous Event UI (route entry point deferred; atomic event-create RPC already supports `copiedFromEventId`)
- Recognition Event Template UI (architecture is compatible; no feature code)
- Public path for `/recognition/p/[token]` (Phase 4)
- Photo Storage bucket (Phase 4)
- Candidate consolidation (Phase 5)
- History export (Phase 5)
- PPT preview (Phase 6+)

## Phase 4 implementation notes

Phase 4 public collection has been implemented.

### Migration

`supabase/migrations/037_recognition_public_collection.sql`

Adds:

- `recognition_events.public_collection_token`
- `recognition_events.public_collection_token_hash`
- `recognition_events.public_collection_token_rotated_at`
- `recognition_submissions`
- `recognition_submission_entries`
- private Storage bucket `recognition-photos`
- atomic RPC `create_public_recognition_submission(...)`

`supabase/migrations/038_recognition_public_submission_rpc_guards.sql` replaces that RPC so final DB execution rechecks event collection state and enabled awards before any insert.

### Token architecture

Phase 4 stores both:

- raw high-entropy token
- SHA-256 token hash

Reason:

- admins must repeatedly view/copy the current public URL
- Phase 4 does not introduce a separate encryption subsystem
- access remains server-mediated and service-role only

Public route resolves by token **hash**.

Rotation:

- creates a new token
- updates token + hash immediately
- invalidates the previous token immediately
- no grace overlap

### Public route

`/recognition/p/[token]`

This is an **open public** route. No BakiGO login is required.

### APIs

Admin:

```text
GET  /api/recognition/events/[eventId]/token
POST /api/recognition/events/[eventId]/token
GET  /api/recognition/events/[eventId]/submissions
```

Public:

```text
GET  /api/recognition/public/[token]
POST /api/recognition/public/[token]/submissions
```

### Upload/storage model

- bucket: `recognition-photos`
- private only
- no public `storage.objects` policies
- uploads are server-mediated only
- originals only in Phase 4
- no crop / no AI / no face selection

Current original path model:

```text
recognition/<submission-id>/entries/<entry-id>/original.<ext>
```

### Upload limits

- max entries per submission: `10`
- max image size: `10 MB`
- allowed MIME:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/heic`
  - `image/heif`

### Atomic submission strategy

Phase 4 uses a staged upload + atomic DB finalization model:

1. server validates token and request
2. server uploads original photos to private Storage
3. server calls atomic RPC `create_public_recognition_submission(...)`
4. submission + entries commit together

Final DB execution of `create_public_recognition_submission(...)` rechecks, before inserting any row:

- the target `recognition_events` row still exists
- `event.status = collecting`
- current DB time is inside `collect_starts_at` / `collect_ends_at` when those bounds are non-null
- each `p_entries` award belongs to `p_event_id` and `recognition_event_awards.is_enabled = true`

If any of those RPC checks fail, the transaction raises and inserts zero submission rows and zero entry rows.

If DB finalization fails:

- uploaded objects are deleted with best-effort cleanup
- if cleanup also fails, orphaned files remain private and can be cleaned later

This avoids creating valid-looking partial DB submissions. File-signature validation stays in the Next.js server path, not in SQL.

### Rate-limit strategy

Phase 4 uses a **minimal in-memory** server-side rate limiter:

- public lookup limit
- public submission limit

This is acceptable for initial hardening but is not a distributed/global abuse-control system. Stronger multi-instance rate limiting remains a future hardening task.

### Admin raw-submission visibility

Phase 4 adds read-only raw submission visibility:

- total raw submissions
- total raw entries
- submitter name
- organization
- submission timestamp
- raw submitted names
- submitted award
- whether original photo exists

No candidate approval / dedupe / review actions are implemented in Phase 4.

## Phase 5 implementation notes

Phase 5 consolidation, review, and historical roster has been implemented.

### Migration

`supabase/migrations/039_recognition_candidates.sql`

Adds:

- `recognition_candidates`
- `recognition_candidate_sources`
- atomic RPC `consolidate_recognition_event_candidates(...)`
- atomic RPC `reorder_recognition_event_candidates(...)`

Raw `recognition_submissions` / `recognition_submission_entries` are not altered.

### Consolidation algorithm

Exact match only:

same Recognition Event
+ same `event_award_id`
+ same `normalized_name`

→ one Recognition Candidate.

All raw source entries remain linked through `recognition_candidate_sources`.

`normalized_name` is the immutable consolidation key. Existing Phase 4 normalization still applies (NFKC, trim, collapse spacing). Honorifics such as `老師` / `督導` / `先生` / `組` are **not** stripped and therefore do **not** auto-merge.

### Idempotency

- unique `(event_id, event_award_id, normalized_name)`
- unique `submission_entry_id` on source links
- `ON CONFLICT DO NOTHING`
- event-level advisory lock plus `FOR UPDATE` to serialize concurrent syncs

Re-running with no new submissions does not create duplicate candidates or source links.

A new matching raw entry attaches to the existing candidate.

### Review decision preservation

Reconsolidation does **not** overwrite:

- `review_status`
- `display_name`
- `preferred_source_entry_id`
- administrator `sort_order`

`approved`, `needs_fix`, and `rejected` survive later syncs.

### Warnings

Computed at read time, never as auto-merge/auto-reject:

- **Cross-award:** same event + same `normalized_name` + different awards → 「此姓名同時出現在其他表揚項目」
- **Suspected duplicate:** conservative trailing-honorific / remaining-space comparison → 「疑似重複」

Suspected-duplicate limitation: trailing `組` can create false positives (for example `林小組` vs `林小`). The UI never claims they are the same person.

### Canonical-name editing

Admin may edit `display_name` for presentation.

This does **not**:

- change raw `submitted_name`
- change the consolidation `normalized_name`
- silently merge another candidate

If the new display name collides with another candidate in the same award, the API returns 409 and asks the admin to review.

### Preferred photo

Consolidation may discover that source photos exist and must preserve every source photo. It must **not** decide which photo is preferred.

`preferred_source_entry_id` stays `null` until Recognition Admin explicitly chooses one original from that candidate's evidence. Reconsolidation preserves an existing admin selection.

Approval mutation for photo-required awards:

- at least one original photo source must exist
- `preferred_source_entry_id` must be non-null
- the preferred source must belong to this candidate and actually contain an original photo

Otherwise approval is rejected with:

「此表揚項目需要照片，請先選擇正式使用的照片。」

Name-only awards may be approved without a photo. Do not auto-change status to `needs_fix`.

- no crop
- no AI
- no face identification
- private authorized viewing through the admin photo API
- 「缺少照片」 = no original photo exists
- 「尚未選擇正式照片」 = original photo(s) exist but admin has not selected one

### Approved roster

Server-side contract:

enabled event awards in award order
→ `review_status = approved` only
→ candidate `sort_order`

Pending / needs_fix / rejected are excluded.

Roster metadata includes `requiresPhoto`, `preferredSourceEntryId`, `hasOriginalPhoto`, and `hasPreferredPhoto` so Phase 6 can distinguish approved + preferred selected from an inconsistent approved row without a preferred source. Phase 5 does **not** silently drop approved candidates for that inconsistency; the primary prevention is the approval mutation.

This is the future PPT input. PPT generation is **not** implemented in Phase 5.

### Historical text roster

Recognition Admin can copy:

```text
2026 年 9 月 月會表揚名單

MAP 第一個月
王小明
陳小華
```

Rules: approved only, event award order, omit empty awards, display names only, no internal IDs.

### APIs

Admin (Bearer + `assertRecognitionAdmin`):

```text
GET    /api/recognition/events?year&month
POST   /api/recognition/events/[eventId]/candidates/sync
GET    /api/recognition/events/[eventId]/candidates
GET    /api/recognition/events/[eventId]/candidates/[candidateId]
PATCH  /api/recognition/events/[eventId]/candidates/[candidateId]
POST   /api/recognition/events/[eventId]/candidates/reorder
GET    /api/recognition/events/[eventId]/candidates/[candidateId]/photo?sourceEntryId=
GET    /api/recognition/events/[eventId]/roster
GET    /api/recognition/events/[eventId]/roster/text
```

Public users cannot list candidates, read the approved roster, or fetch private photos.

### UI

- Recognition Center home: year/month filter, approved count, pending/problem count
- Event page: Review Center entry + 複製文字版
- `/recognition/events/[eventId]/review`: sync, filters, review actions, source evidence, preferred photo, reorder

Opening Review Center syncs candidates. Admins can also press 「更新／同步投稿名單」.

## Phase 6 implementation notes

Phase 6 presentation-photo preparation has been implemented. PPTX generation is **not** included.

### Architecture

Original evidence and presentation output stay separate.

- Original photos remain on `recognition_submission_entries.original_photo_storage_path` in the private `recognition-photos` bucket.
- Presentation crop is **normalized metadata** on `recognition_candidate_photo_reviews`, bound to the current preferred source.
- Phase 6 does **not** generate a derived cropped bitmap. Future Phase 7 renderer reads the private original and applies crop metadata.
- Original files are never overwritten, cropped in place, or replaced.

### Crop coordinate format

Normalized relative to the original image:

- `x`, `y`, `width`, `height`
- `0 <= x,y <= 1`
- `width,height > 0`
- `x + width <= 1`
- `y + height <= 1`

This avoids locking crop data to one rendered pixel size.

### Portrait aspect ratio

PPT **slide** ratio remains **4:3**.

The individual recognition-card portrait slot uses **3:4** (width:height = 0.75), stored as `crop_aspect_ratio = '3:4'`.

3:4 is a conservative reusable portrait for future 4:3 card layouts (name under photo, padded 12-person grid, hero layouts). Future theme changes can keep the same original + crop box, or create a new crop, without destroying original evidence.

### Derived readiness states

Not stored as a second source of truth. Derived at read time:

| State | Meaning |
|---|---|
| `not_required` | Name-only award |
| `no_original_photo` | Photo-required, no original |
| `preferred_source_not_selected` | Original exists, admin has not chosen preferred source |
| `needs_photo_review` | Preferred source selected, crop missing/invalid/mismatched, not blocked |
| `crop_ready` | Valid crop bound to current preferred source, not blocked |
| `photo_blocked` | Admin marked the source photo unsafe for presentation |

### Blocking vs warning

Blocking (cannot bypass):

- required original missing
- preferred source missing or not in candidate evidence
- no crop / invalid crop / crop bound to a different source
- `photo_blocked`

Warnings (admin may accept by finalizing crop):

- low resolution (`min(width,height) < 600`)
- extreme aspect ratio
- landscape original
- manual flags such as `text_heavy`, `group_photo`, `poor_composition`

Warning flags never auto-reject. Structural blockers cannot be waived.

### Review flags

Manual only in Phase 6:

`group_photo`, `person_too_small`, `text_heavy`, `low_resolution`, `blurry_or_unclear`, `poor_composition`, `wrong_orientation`, `suspected_wrong_photo`, `other`

Group-photo copy is only:

「可能為多人合照，需要人工確認」

The system must **not** identify which person is the honoree, auto-crop around a guessed identity, run face recognition, or do biometric matching.

### Preferred-source change

If `preferred_source_entry_id` changes:

- existing crop / flags / blocked state reset
- candidate returns to `needs_photo_review`
- stale crop save with the old `sourceEntryId` is rejected (409)

Display-name changes do **not** reset crop.

### Private image access

Recognition Admin UI loads originals through:

`GET /api/recognition/events/[eventId]/candidates/[candidateId]/photo?sourceEntryId=`

- `assertRecognitionAdmin`
- `Cache-Control: private, no-store`
- browser blob URL, not a permanent public storage URL
- bucket stays private; no `storage.objects` policies added in Phase 6

### Event-level PPT readiness

Internal admin report only. Example fields:

- 已核准
- 需要照片
- 照片已完成
- 缺少原圖
- 尚未選照片
- 尚未裁切
- 照片有問題
- 尚有 N 個問題需要處理

Name-only approved candidates do not create photo blockers.

Approved roster still includes approved candidates whose photos are incomplete. Presentation validation reports those as PPT blockers. Incomplete photos are not silently dropped from the roster.

### PPT-photo-ready validator

A photo-required candidate is presentation-photo-ready only when:

- `review_status = approved`
- preferred source exists, belongs to the candidate, and has an original photo
- valid presentation crop exists for that same source
- candidate is not `photo_blocked`

Name-only awards are presentation-photo-ready without a crop.

This validator is the Phase 7 PPT renderer contract. Phase 6 does not generate PPTX.

### Optional automated checks

Implemented:

- original dimensions when the browser can read them
- conservative low-resolution warning
- extreme aspect / landscape hints

Deferred:

- AI group-photo / text-heavy detection
- any honoree / face / identity inference
- derived cropped bitmap generation
- PPTX / 4:3 slide renderer (Phase 7+)

Manual admin review is sufficient for Phase 6.

### APIs

Admin only (Bearer + `assertRecognitionAdmin`):

```text
GET    /api/recognition/events/[eventId]/photo-review?filter=
GET    /api/recognition/events/[eventId]/photo-review/[candidateId]
PATCH  /api/recognition/events/[eventId]/photo-review/[candidateId]
GET    /api/recognition/events/[eventId]/ppt-readiness
```

Public users cannot read photo-review metadata, signed original bytes, crops, flags, or PPT readiness.

### UI

- Event management: 「照片審查」 + 待處理 count, 「PPT 準備狀態」, disabled 「產生 PPT（未來階段）」
- `/recognition/events/[eventId]/photos`: filters, original + 3:4 crop editor, flags, block, 「下一位需要處理」

### Deferred to Phase 7+

- PPTX generation
- 4:3 HTML preview / theme engine
- birthday slides / President encouragement slides
- monthly-meeting back-half slides
- AI photo analysis
- persisted `recognition_duplicate_signals`
- candidate → member matching

## Implementation guardrails

Implementation must follow this document together with:

- `docs/recognition-center/phase-1-audit.md`
- `docs/BUSINESS_RULES.md`
- `docs/DATABASE.md`
- `docs/ROADMAP.md`
