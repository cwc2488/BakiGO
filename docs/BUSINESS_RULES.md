# Baki GO — Business Rules

## Purpose

This document is the **single source of truth** for domain logic and business constraints. All application code must reflect rules defined here — never the other way around.

> **Rule:** Business logic must not be hardcoded in the application. When behavior changes, update this document first, then implement.

> **Golden Rule:** Every member should know exactly what to do next.

## How to Use This Document

1. Define or update a rule in this file before writing implementation code.
2. Reference the rule by name or section in code comments and pull requests where helpful.
3. If code and documentation disagree, the documentation wins until intentionally revised.

## Priority 0 — Rule Engine

**No KPI may be inferred.** Every numeric target shown in the product must be defined in this document (or cross-referenced docs) and configured in rule config before the UI displays it.

| Situation | Required behavior |
|-----------|-------------------|
| Target not yet defined in docs | Rule config holds `null`; UI shows **Rule Missing** / **等待使用者定義。** |
| Engine cannot resolve target | Do not compute progress; omit the KPI — never substitute 10, 100, 500, 2500, etc. |
| UI needs progress % | Must come from engine output (`progressPercent`), never calculated in components |

### Targets pending definition

The following remain optional / future KPIs:

- **Gamification achievements:** some unlock thresholds still null
- **Adventure:** step completion thresholds
- **Missions:** streak daily target, monthly challenge overall target
- **Retail monthly challenge:** NTD / VP retail criteria (non-activity)

Activity, MAP, VP qualification, President tree, and Super League targets are defined below.

## Recognition Center

Recognition Center（表揚中心）是 Baki GO 的**組織營運模組**，負責固定、重複性的表揚收件、去重、審核、歷史查詢與 4:3 表揚簡報資料準備。

### Scope boundary

Recognition Center **不是**：

- career rank / promotion engine
- GAME_DESIGN 成就系統
- `/leaderboard` 排行
- `/events` 個人活動紀錄
- 完整月會 PPT 自動化

以下需求不屬於 Recognition Center V1：

- 培訓時間
- 活動宣傳文宣
- 總裁組勉勵內容
- 當月特殊簡報
- 完整月會 PPT 自動化

### Recognition Event rules

`Recognition Event` 是表揚中心的主要業務實體。`year` / `month` 是其屬性，不是唯一識別。

Frozen rules:

- 同一個年月 **可以有多個** Recognition Event
- 不得將 `(year, month)` 視為唯一業務鍵
- 公開收件必須同時滿足：
  - `status = collecting`
  - current time 位於 `collect_starts_at` / `collect_ends_at`
- `closed` event 可由 Recognition Admin 重新開回 `collecting`
- 重新開啟後仍必須遵守原本的收件時間窗判定
- 旋轉 public collection token 時，舊 token **立即失效**

### Recognition Admin rules

Recognition Center 使用專用 allowlist：

- `recognition_admin_members`

Frozen rules:

- Recognition Admin 權限**不得**由 rank 推論
- President rank **不會**自動擁有 Recognition Admin 權限
- 必須由 allowlist 明確授權

### Recognition Event Template compatibility

Recognition Center 架構必須保留未來 `Recognition Event Template` 概念：

Template
→ default award set
→ default award ordering
→ default PPT theme
→ create Recognition Event
→ event-specific customization

Template 例子可能包括：

- 月會
- STS
- 世界組大學
- 特別活動

`Copy Previous Month Settings` 必須保留，但不得成為唯一可重用機制。

### Submission evidence rule

公開 submission 是**原始證據**，不是正式表揚結果。

Rules:

- submission 不得直接成為正式 PPT 資料
- raw submissions / raw entries 必須保留
- approved candidate 才能進入正式 presentation dataset

### Duplicate / consolidation rules

同一活動 + 同一表揚項目 + 同一 normalized name：

- 可以整併為同一 candidate
- 但必須保留所有來源與 submitted_by

同一活動 + 不同表揚項目 + 同一 normalized name：

- 只作為 **warning**
- 不得自動 merge
- 不得自動 reject
- 不得自動 delete
- 不得阻止 PPT generation

Name normalization frozen rule:

- 不得自動移除稱謂 / 頭銜，例如 `老師`、`督導`、`先生`、`組`
- 帶稱謂但相似的名字可列為 suspected duplicate
- 但不得靜默合併

### Review state rules

Recognition candidates review states:

- `pending`
- `approved`
- `needs_fix`
- `rejected`

Rules:

- 只有 `approved` 可進正式 PPT
- `pending` / `needs_fix` 代表審核未完成
- `rejected` 不代表刪除原始 submission evidence

### Photo rules

Photo awards 必須遵守：

- 原始圖片必須保留
- presentation crop / processed image 與原圖分離
- public submitter 在 V1 不需做手動 crop 確認
- 照片異常 / 團體照 / 多人照交由 admin review
- AI **不得**從多人照片中自動選定受表揚者

### Presentation rules

Recognition Center presentation 規則：

- 目標比例：`4:3`
- 支援：
  - 純姓名版型
  - 12 人照片版型（4×3）
  - 少人 hero 版型（1–3 人）
  - 百萬終生成就獎 premium 版型
- 照片超過 12 人自動分頁
- theme 與 roster data 必須分離
- 某 award 無 approved recipients 時，必須完全省略，不得產生空白頁

Frozen rule:

- 純姓名每頁人數在 Phase 2 仍保持 **configurable / unresolved**
- 不得在此階段硬寫成永久產品規則

### Birthday scope

Recognition Center V1：

- 不將 birthday slide 視為 PPT generation 範圍
- 保留未來月會模板可由 event month 推導 `X月壽星` 的概念
- 自動壽星姓名填入仍不在範圍內

### Default Recognition award catalog (27 items)

> These awards are **Recognition Center catalog entries**, not career-rank keys, promotion rules, or mission rules.

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

Future rule:

- Catalog must be extensible by admin configuration
- V1 default 27 項不是永久封閉列表

## Monthly Activity

Every member should maintain monthly field activity — **either** criterion satisfies the month:

| Criterion | Target | Unit |
|-----------|--------|------|
| 量測 (`measurement`) | **30** | 次 / 月 |
| 諮詢新會員 (`consultation`) | **7** | 次 / 月 |

Logic: **OR** — 30 量測 **或** 7 次諮詢新加入會員。

配置：`rankQualification.new_member` + `monthlyChallenge` activity criteria。

## MAP 計劃 → 督導

| 條件 | 數值 |
|------|------|
| 個人 VP（連續月） | **1000 VP × 3 個月** |
| 招募達標會員 | **2 位**（各於加入後 **一年內累積 4000 VP**） |
| MAP 會議 | **30 場**（HOM、STS、商機、新人設定、成就營、摘星之旅、風尚之旅、風雲盛會、新人導航、一日培訓、督導培訓、RO 大學、營養課、財富健康講座；各類型可重複參加） |

配置：`qualification_supervisor` + VP targets `map_monthly_personal_vp` / `downline_qualifying_lifetime_vp` + `meeting-types.ts`。

> **成交**僅在零售屋登記；**晉升資格**由下線達標與 Engine 自動計算，不需手動標記。

## 督導 → 活躍督導 → 世界組

| 轉換 | 條件 |
|------|------|
| 督導 → 活躍督導 | 連續 **3** 個月個人 **2500 VP** 以上 |
| 活躍督導 → 世界組（VP 路徑） | 連續 **4** 個月個人 **2500 VP** 以上 |

配置：`qualification_active_supervisor`、`qualification_world_team` + `supervisor_monthly_personal_vp`。

## 下線晉升（推廣組以上）

| 目前階級 | 下一階 | 條件 |
|----------|--------|------|
| 世界組 | 推廣組 | 下線 **5** 位世界組 |
| 推廣組 | 富豪組 | 下線 **6** 位推廣組 |
| 富豪組 | 總裁 | 下線 **3** 位富豪組 |

## 總裁組

| 項目 | 數值 |
|------|------|
| 活動線（活躍督導） | **14** 條 |
| 終生目標 — 只吃不做的客人 | **50** 位 |

活動線判定：`presidentTree.activeRankKeys = [active_supervisor]`，`totalLines = 14`。

## 超級聯賽 10+2

年度重點（**1/1 – 12/31**）：

| 項目 | 目標 |
|------|------|
| 一代招募 | **10** 位 |
| 其中成為督導 | **2** 位 |

配置：`superLeague.firstGenerationTarget = 10`，`supervisorTarget = 2`。

## 註冊位階（已完成里程碑）

若使用者註冊時選擇的位階為 **推廣組**，代表 **MAP → 推廣組** 之間的任務均視為已完成（以此類推更高位階）。

實作：以 `member.rankKey` 對照晉升階梯；已達或超過之 Qualification 標記 `isQualified`。

## Organization Context

Baki GO serves **Network Marketing organizations**. Members operate within a team hierarchy and progress through defined ranks.

## Promotion Rules

賀寶芙晉升制度 — **single source of truth:** `src/lib/business-engine/rules/promotion.ts`

All Mission、Achievement、Adventure、Next Step 相關晉升 KPI **只能讀取 Promotion Rule**，禁止在 UI 或其他模組寫死數字。

### 1. 階級介紹

| 順序 | rankId | 名稱 | 說明 |
|------|--------|------|------|
| 1 | `member` | 會員 | 組織起點 |
| 2 | `supervisor` | 督導 | MAP 計劃達標 |
| 3 | `active_supervisor` | 活躍督導 | 2500 VP × 3 連續月 |
| 4 | `world_team` | 世界組 | 2500 VP × 4 連續月 |
| 5 | `promotion_group` | 推廣組 | 5 位下線世界組 |
| 6 | `wealth_group` | 富豪組 | 6 位下線推廣組 |
| 7 | `president` | 總裁 | 3 位下線富豪組 |

階級路徑：

```
會員 → 督導 → 活躍督導 → 世界組 → 推廣組 → 富豪組 → 總裁
```

### 2. 晉升條件

| 目前階級 | 下一階 | 條件 | 狀態 |
|----------|--------|------|------|
| 會員 | 督導 | MAP 計劃（1000 VP×3 月 + 2 位達標招募） | ✅ Qualification |
| 督導 | 活躍督導 | 2500 VP × 3 連續月 | ✅ Qualification |
| 活躍督導 | 世界組 | 2500 VP × 4 連續月 | ✅ Qualification |
| 世界組 | 推廣組 | 下線中 **5** 位世界組 | ✅ 已定義 |
| 推廣組 | 富豪組 | 下線中 **6** 位推廣組 | ✅ 已定義 |
| 富豪組 | 總裁 | 下線中 **3** 位富豪組 | ✅ 已定義 |

> Priority 0：除上述 **5、6、3** 外，不得自行推論任何晉升數字。

### 3. Rule Schema

| 型別 | 用途 |
|------|------|
| `PromotionRequirement` | `downlineRankId`、`requiredCount`（可為 `null`）、`descriptionTemplate` |
| `PromotionRank` | `rankId`、`name`、`parentRank`、`nextRank`、`requirement`、`description`、`badge`、`themeColor` |
| `PromotionRule` | 明確的 `fromRankId → toRankId` 轉換規則 |
| `PromotionTree` | 完整階級樹、`rules[]`、`achievementMilestones[]`、文案模板 |

配置位置：`BusinessRulesConfig.promotion`（預設 `DEFAULT_PROMOTION_TREE`）

### 4. Business Engine 流程

```
Member + Organization (members[])
  → calculatePromotionProgress()
  → PromotionProgress
```

`PromotionProgress` 輸出範例（世界組 → 推廣組，已有 3 位下線世界組）：

| 欄位 | 值 |
|------|-----|
| currentRankName | 世界組 |
| nextRankName | 推廣組 |
| current | 3 |
| target | 5 |
| remaining | 2 |
| progressPercent | 60 |

若 `requirement.requiredCount === null` → `isRuleMissing: true`，不計算 KPI。

### 5. Mission 如何引用

`generateMissionsFromPromotion(promotionProgress)` 讀取 `PromotionTree.missionTemplates` 產生 Mission 文案（例如「距離推廣組還差 2 位世界組」）。**Mission Engine 不寫死任何晉升文字或數字。**

### 6. Achievement 如何引用

`buildPromotionAchievementRules(promotionTree)` 依 `achievementMilestones` 自動產生成就規則：

| 成就 | 來源 |
|------|------|
| 第一次世界組 | milestone `first_world_team`（count = 1） |
| 第一條世界組 | milestone `line_1_world_team`（count = 1） |
| 第五條世界組 | milestone `line_5_world_team`（自 promotion rule 取 5） |
| 推廣組 / 富豪組 / 總裁 | milestone `rank_*`（rank_reached） |

Achievement Engine 合併 promotion 規則與既有 gamification 規則，以 `downlineRankCounts`（promotion rankId 為 key）評估。

### 7. Adventure 如何引用

`buildPromotionAdventureSteps(promotionTree)` 依 `PromotionTree.order` 產生主線章節（會員 → … → 總裁）。  
`calculateAdventure()` 讀取 promotion 步驟，**不再使用 MissionRules 內硬編碼流程**。  
未定義晉升條件的章節標記 `isRuleMissing: true`。

Next Step Engine：`buildPromotionNextSteps(promotionProgress)` 依 `nextStepTemplates` 產生晉升建議（含 `progressPercent`）。

## VP Rules

VP 是 Baki GO **核心貨幣** — **single source of truth:** `src/lib/business-engine/rules/vp.ts`  
完整說明見 [VP_RULES.md](./VP_RULES.md)。

### 1. VP 定義

VP 由零售交易依 VP Source Rule 轉換而來。禁止在 Engine / UI 內自行計算或寫死 VP 數字。

### 2. VP 種類

Personal、Retail House、Organization、Monthly、Rolling、Qualification、Lifetime — 見 VP_RULES.md §2。

### 3. Transaction 流程

```
Retail Transaction → VPTransaction[] → calculateVP() → VPSnapshot
```

### 4. Calculation Flow

`calculateVP()`、`calculateMonthlyVP()`、`calculateRollingVP()`、`calculateOrganizationVP()`、`calculateQualificationVP()`、`calculateLifetimeVP()` — 純函式，位於 `src/lib/business-engine/vp/`。

### 5. Snapshot 機制

`VPSnapshot.isCache = true` — 僅快取，可隨時由交易重算。

### 6. Qualification 關係

Qualification 條件以 `vpTargetKey` 引用 VP Rule（例如世界組 2500 / 10000 VP）。  
Promotion / Boss **只讀 Qualification VP**，不讀原始 Transaction。

### 7. Mission 如何引用

Mission 目標來自 Qualification gap 或 Promotion progress — **不得**寫 `2500 VP` 等硬編字串。

### 8. Promotion 如何引用

`calculatePromotionProgress()` 優先使用 `QualificationResult`（Qualification VP 路徑）。

### 9. Challenge 如何引用

`calculateMonthlyProgress()` 對 VP 條件讀取 **Monthly VP**（`vpTransactions`），不自行加總。

### 10. Future Extension

產品倍率、Rolling 視窗、更多 rank VP target — 見 VP_RULES.md §11。

## Career Path Rules

Members progress through the following ranks. Qualification criteria for each rank must be defined here before implementation.

| Rank | Order |
|------|-------|
| New Member | 1 |
| Supervisor | 2 |
| Active Supervisor | 3 |
| World Team | 4 |
| President | 5 |

### Rank Qualification

_To be defined — specify required activities, team metrics, and time windows for each rank transition._

## Data Entry

- Users enter each piece of data **once**.
- Derived values (totals, rank progress, streaks, levels, team health scores) are **never** stored as user-editable fields — they are calculated.
- Activity logged by a member flows automatically into personal stats, team stats, and leader views.

## Statistics

- All statistics are **automatically calculated** from source activity records.
- Manual overrides of computed statistics are not permitted unless explicitly documented as an exception here.
- Coaching recommendations must be based on **real logged activity**, never assumptions or memory.

## Daily Actions

- Every member receives a clear set of **next actions** derived from their rank, activity history, and team context.
- The system determines what to do next; members do not guess.

## Leader Rules

Leaders must be able to instantly identify:

| Signal | Meaning |
|--------|---------|
| Needs help | Member is inactive or missing key activities |
| Improving | Member shows positive activity trend |
| Falling behind | Member is declining vs. prior period |
| Deserves recognition | Member hit a milestone or sustained strong performance |

Leader views are computed from the same source activity data — no separate manual leader tracking.

## Meeting Rules

- Weekly team meetings are a first-class use case.
- Meeting views aggregate member progress into a single shared screen.
- Meeting data is read-only and always reflects live calculated stats.

## Gamification

Gamification rules (levels, experience, badges, achievements, titles, rankings) are defined in [GAME_DESIGN.md](./GAME_DESIGN.md) and cross-referenced here when they affect business logic.

## Validation Rules

_To be defined._

## Permissions & Access

_To be defined — member vs. leader vs. admin roles within an organization._

### Consultation Engine V1 (Phase 1)

**Status:** `experimental_hidden` — not promoted as a Baki GO product entry. The experimental 14-step guided flow is archived in code for future re-evaluation; partners should not treat it as the official consultation SOP in the app UI.

Guided consultation (`consultation_sessions`) is **coach-owned customer data**, same privacy boundary as `customers` and `body_composition_records`:

| Rule | Behavior |
|------|----------|
| Visibility | **Owner member only** — uplines cannot read consultation sessions or health step data |
| Customer anchor | Every session links to exactly one existing `customers` row — no duplicate profile entity |
| Measurement | Step 3 writes to `body_composition_records`; session stores `body_composition_record_id` FK |
| Health safety flag | Enum: `pending_review`, `normal`, `caution`, `professional_review_required` — **automated mapping rules not yet defined** (Phase 1 records health data only; new sessions default to `pending_review`; completing Step 2 does **not** change the flag; `consultation_data.health.safetyReviewStatus = pending_rules`) |
| Customer profile | Step 1 reads/writes `customers` fields: name, phone, `birth_date`, height, `sex`, region, occupation — not duplicated in `consultation_data` |
| Duplicate protection | Before creating a new customer, match normalized phone within the same `owner_member_id`; if found, UI shows「可能已有此客戶」and offers existing customer or cancel — no auto-create, no name-only dedupe |
| Commitment gate | Step 7 writes `consultation_sessions.commitment_score` (1–10). Step 8 completes the gate — **never ends the session at Step 7**. Step 8 routing: **10** → execution confirm → `ready` → `current_step = 9`; **6–9** → barrier explore → `readyIfBarrierSolved = true` → step 9, else `not_ready`; **1–5** → not ready confirm → `not_ready`. `not_ready` retains all prior data and blocks Step 9+ |
| Steps 9–14 | Success stories (≥3, `success_story_count`), method interest, education cards by `goalType`, four cooperation items, meals + services, final outcome. Completing Step 14 writes `brief_snapshot`, sets `status`/`completed_at`, and emits `consultation` activity KPI only when outcome = `started` |
| Success stories | Step 10+ (future): partner self-reports count ≥ 3 — **not implemented in Phase 1–2** |

Configuration: `consultation_sessions.status`, `consultation_sessions.health_safety_flag`, `consultation_sessions.commitment_score` — Step 8 gate thresholds defined in Phase 2; success-story thresholds remain future work.

### Consultation Engine V1 (Phase 2 — Steps 4–8)

Decision Tree segment after Phase 1 body measurement. All step payloads live in `consultation_data.data_json` — no normalized tables for goals, experience, motivations, or barriers.

| Step | Purpose | Key data |
|------|---------|----------|
| 4 | Data review + goal body | Display Step 3 body record; record `goals.*` |
| 5 | Previous change experience | `previousExperience.*` — conversational, not a long form |
| 6 | Three reasons | `motivations.reason1–3` — **at least one required**; store guest's words verbatim |
| 7 | Commitment score | `commitment_score` on session — large 1–10 selector; always advances to Step 8 |
| 8 | Barriers + readiness gate | `barriers.*`, `readiness.*`; sets `status` and routing per commitment tier |

**Step 8 routing (authoritative — implement in flow engine, not UI):**

| Score | Step 8 mode | Outcome when complete |
|-------|-------------|------------------------|
| 10 | Execution confirm | `current_step = 9`, `status = in_progress` |
| 6–9 | Barrier explore | `readyIfBarrierSolved = true` → step 9; else `not_ready` |
| 1–5 | Not ready confirm | `status = not_ready`, stay at step 8 |

`not_ready` sessions show「本次諮詢暫停」and **cannot** enter Step 9+. Resume works for Steps 4–8 while `in_progress`.

**Out of scope for Phase 2:** success stories, AI, case matching, brain-change / science / services / product / pricing / Consultation Brief (Steps 9–14).

## Coaching Enrollment Journey Window

| Field | Authority |
|-------|-----------|
| `started_at` (date part, Asia/Taipei) | Day 1 of journey |
| `planned_end_at` | Inclusive planned last day (default = start + 89 calendar days = 90-day window) |
| `ended_at` | Actual completion timestamp when status → completed |

- Day N is derived only inside `[start, planned_end]` inclusive. Before start: no Day N, no daily-log requirement, no missing / non-reporting Attention. After planned end: no new missing Attention; historical outcomes/timeline retained.
- Paused status keeps existing pause semantics (not rewritten here).
- Coach may edit start / planned end; Attention dense calendars must clamp to this window without changing Phase 3 precedence.

### Coach Directive × Meal Vision (V1)

- Directive = what customer should do (slot + text + effective window + customer_visible).
- Meal Vision = what photo evidence shows.
- Verification = deterministic compare → `followed` | `possible_not_followed` | `unknown` | `ignored` (expired).
- Missing photo evidence must never assert absolute non-consumption.

### Bowel movement signal

- Deterministic from `bowel_movement_count` (+ recent high days / discomfort note).
- Coach copy may note elevated frequency; Customer copy is non-diagnostic (no diarrhea/disease claims unless Customer used those words).

## Coaching Growth Intelligence (Phase 4c–4e)

**Layers must never merge:**

```text
deterministic Measured Outcome   (Phase 2f)
  ≠ Customer perceived outcome   (Experience check-in)
  ≠ Coach / experience satisfaction
  ≠ recommendation willingness
  ≠ explicit referral intent
  ≠ Growth Opportunity           (persist)
  ≠ Growth Path                  (coach_assisted_referral | social_proof | friend_benefit)
  ≠ Ask / Share / Invite
  ≠ Attribution A→B              (future)
```

**Forbidden:** a single Referral Score / averaged NPS as eligibility authority.

Phase 2f **Body Outcome** authority is unchanged. Growth must not invent a second body KPI set or rewrite `outcomeStatus`.

### Outcome Signal (derive-only)

Computed at `asOfLogDate` for one `owner_member_id` + `customer_id`. Includes measurement stage, outcome status, attention, celebration class, and Phase 4c **customer-confirmed heuristic** (Customer note only).

### Customer Experience Check-in (persist authority)

Structured Customer response — primary Experience authority:

| Field | Scale | Meaning |
|-------|-------|---------|
| `outcome_perception` | 1–5 | 自己覺得改變程度 |
| `coach_helpfulness` | 1–5 | Coach / 陪跑是否有幫助 |
| `experience_satisfaction` | 1–5 | 整體體驗 |
| `recommendation_willingness` | 0–10 | 願意推薦程度（分開存，不合成） |
| `most_felt_change_text` | text | 最有感的改變（verbatim） |
| `most_felt_change_consent` | `coach_only` \| `share_ok` | 預設 coach_only |
| `explicit_referral_intent` | bool | Customer 主動肯定 |
| `struggle_flag` / `decline_growth_ask` | bool | Rescue / cooldown |

Check-in ≠ Growth Ask. Never auto-demand referral in the check-in flow.

**Authority rank:** structured check-in > Phase 4c note heuristic > Coach/AI/photo (never).  
Heuristic Path B only bootstraps when no valid check-in. Check-in low scores override vague positive heuristics.  
`explicit_referral_intent` (check-in OR heuristic) is the highest Growth signal, still subject to **Rescue > Growth**.

### Check-in triggers & cooldown

Triggers (event, not daily): `post_measurement` | `milestone` | `major_breakthrough` | `coach_invite` | `recheck`.

| Policy | Value |
|--------|-------|
| Min gap between check-ins | 14 days |
| After `decline_growth_ask` | 30 days (no Growth surface; Rescue OK) |
| After completed check-in | 21 days before auto recheck |
| Coach invite soft cap | 1 / 7 days |
| Hard suppress | `coach_attention` / struggle / owner mismatch |

### Growth Matrix (Measured Outcome × Experience)

Bands (separate — never averaged into one score):

- **outcomeBand:** `blocked` | `low` | `mid` | `high`
- **experienceBand:** `unknown` | `struggle` | `low` | `mid` | `high`

Experience high example: perception≥4 AND satisfaction≥4 AND willingness≥8.  
Experience low example: any key axis ≤2 OR `struggle_flag`.

| | Exp struggle/low | Exp unknown | Exp mid | Exp high |
|--|--|--|--|--|
| Outcome blocked/low | Rescue only | Rescue / wait | Support; no Growth Ask | Soft celebrate; Friend Benefit prep only |
| Outcome mid | Block Growth | Invite check-in | Coach-assisted emerging | Coach-assisted or Social Proof |
| Outcome high | Repair Experience; block Growth | Check-in before strong | Social Proof + Coach-assisted candidates | **strong** Growth |

**Rescue > Growth** hard blocks: `coach_attention`, struggle, worsening, mixed+muscle-loss, decline cooldown, owner mismatch, no enrollment.

### Growth Paths

| Path | When primary |
|------|----------------|
| `coach_assisted_referral` | explicit intent, or high×high default |
| `social_proof` | high Outcome + mid/high Exp + share consent + willingness≥7 |
| `friend_benefit` | high Exp with mid/low Outcome, or softer invite |

Multi-path may be **internally eligible**; surface **one primary** only (14-day Growth Ask cooldown across paths). Friend Benefit v1 = abstract benefit/reward — no product discount hardcode.

### Persistence & reconcile

- Tables: `customer_experience_checkins` (Customer authority), `growth_opportunities` (Coach-only).
- Same fingerprint → update; major evidence change → supersede.
- Reconcile on events: measurement saved, check-in submitted, attention→coach_attention, growth action/snooze/decline, enrollment lifecycle. **No daily polling.**

### Ownership / privacy

Strict `owner_member_id`. Customer portal: create/read **own check-ins only**; never read Growth Opportunity / Matrix internals. Upline: no access.

### Growth Loop Share × Referral (Phase 4f)

**Layers still must never merge:**

```text
Customer (Referral Center parent set)
  ≠ Growth Opportunity (4e timing evidence only)
  ≠ Share / Invite (growth_shares)
  ≠ Referral Attribution A→B (growth_referral_attributions)
  ≠ Customer B
```

- **Referral Center parent set = all owner Customers.** Coaching enrollment / 90-day / second measurement / Growth Opportunity / Experience Check-in are **not** gates to appear or to start a manual share.
- Growth Opportunity / Growth Intelligence = **timing evidence** for presentation state (適合分享／持續培養／先關心…), not permission authority.
- Outcome ≠ Referral. Growth Opportunity ≠ Referral Permission. Coaching Enrollment ≠ Referral Requirement.
- Coach may start a share from any owned Customer (`growth_shares.enrollment_id` / `growth_opportunity_id` nullable). Customer consent still required before public token activation.
- No second referral score / Outcome authority in Referral Center presentation.
- **Rescue warning:** struggle / dissatisfaction / coach_attention may warn「目前建議先處理顧客狀況」and suppress auto-recommend; Coach may still manually start (warning, not hard block for missing outcome data).
- **Rescue > Growth:** if Growth becomes blocked after start, active share CTAs pause.
- Public share pages are privacy-first: no weight / body fat / muscle / notes / Growth Matrix / AI. Measurement delta only if Customer explicitly opts in (summary text only).
- Friend benefit v1 label =「朋友專屬體驗」— no Herbalife discount / VP / pricing claims.
- Attribution persists pending Friend B identity before Customer creation; after conversion keep `introduced_customer_id` forever.
- Same-owner phone soft dedupe links existing Customer B (no duplicate). Name-only never auto-merges. Cross-owner never merges.
- Do not auto-enroll B, auto-start AI Coaching, or auto-create Member.

## Edge Cases & Exceptions

Document any intentional exceptions to the rules above in this section.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| — | Initial foundation document created | — |
| — | Updated for Network Marketing Business OS philosophy | — |
| 2026-08 | Sprint 11 — Promotion Rules（賀寶芙晉升制度） | — |
| 2026-08 | Sprint 13 — VP Rule Engine（Core Currency） | — |
| 2026-08 | Consultation Engine V1 Phase 1 — sessions + JSONB step data | — |
| 2026-08 | Consultation Engine V1 Phase 2 — Steps 4–8 decision tree + commitment gate | — |
| 2026-08 | Coaching Phase 4c — Referral Opportunity Engine (Path A/B + persist) | — |
| 2026-08 | Coaching Phase 4d–4e — Experience Check-in + Growth Matrix + Coach Growth UI | — |
| 2026-08 | Coaching Phase 4f — Growth share tokens + A→B attribution + Referral Center | — |
| 2026-08 | UX-1.2 — Referral Center = all Customers; Growth = timing evidence; Coach UI humanization | — |
| 2026-08 | Coaching Product Correction P0/P1 — enrollment window, portal Home, directives, bowel signal, Hub IA | — |
| 2026-08 | Recognition Center Phase 2 — domain rules freeze, admin allowlist, multi-event month support, 27-award default catalog | — |
