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

The following must be filled in here before corresponding KPIs appear:

- **President tree:** total active lines required
- **Rank qualification:** activity counts per rank (Supervisor, World Team, …)
- **Monthly challenge:** criterion targets per transaction/activity type
- **Next steps:** VP targets, MAP active-line targets, daily activity targets
- **Gamification achievements:** unlock thresholds
- **Adventure:** step completion thresholds
- **Missions:** streak daily target, monthly challenge overall target

Until defined, the homepage and mission views will display **Rule Missing** — this is intentional.

## Organization Context

Baki GO serves **Network Marketing organizations**. Members operate within a team hierarchy and progress through defined ranks.

## Promotion Rules

賀寶芙晉升制度 — **single source of truth:** `src/lib/business-engine/rules/promotion.ts`

All Mission、Achievement、Adventure、Next Step 相關晉升 KPI **只能讀取 Promotion Rule**，禁止在 UI 或其他模組寫死數字。

### 1. 階級介紹

| 順序 | rankId | 名稱 | 說明 |
|------|--------|------|------|
| 1 | `member` | 會員 | 組織起點 |
| 2 | `supervisor` | 督導 | 領導團隊的第一步 |
| 3 | `world_team` | 世界組 | 組織開始出現世界組成員 |
| 4 | `promotion_group` | 推廣組 | 推廣力量在組織中成形 |
| 5 | `wealth_group` | 富豪組 | 事業達到新高度 |
| 6 | `president` | 總裁 | 晉升最高階 |

階級路徑：

```
會員 → 督導 → 世界組 → 推廣組 → 富豪組 → 總裁
```

### 2. 晉升條件

| 目前階級 | 下一階 | 條件 | 狀態 |
|----------|--------|------|------|
| 會員 | 督導 | _待使用者定義_ | Rule Missing |
| 督導 | 世界組 | _待使用者定義_ | Rule Missing |
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

## Edge Cases & Exceptions

Document any intentional exceptions to the rules above in this section.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| — | Initial foundation document created | — |
| — | Updated for Network Marketing Business OS philosophy | — |
| 2026-08 | Sprint 11 — Promotion Rules（賀寶芙晉升制度） | — |
| 2026-08 | Sprint 13 — VP Rule Engine（Core Currency） | — |
