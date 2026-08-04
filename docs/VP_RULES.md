# Baki GO — VP Rules

## Purpose

VP（Value Points）是 Baki GO 的**核心貨幣**。Promotion、Mission、Achievement、Challenge、Boss、Adventure、排行榜、零售屋、Qualification **都必須讀取 VP Rule**。

> **Golden Rule：** 任何地方禁止自行計算 VP、禁止寫死 VP 數字。若 Rule 不存在 → 回傳 **Rule Missing**，不得猜測。

**Source of truth（程式）：** `src/lib/business-engine/rules/vp.ts`  
**計算引擎：** `src/lib/business-engine/vp/calculate-vp-engine.ts`

---

## 1. VP 定義

VP 是從**零售交易（Retail Transaction）**依 VP Rule 轉換而來的積分。  
每一筆 VP 都對應一筆來源交易，不可人工累加、不可在 UI 或 Engine 內硬編數字。

---

## 2. VP 種類（Buckets）

| Bucket | 說明 | 主要用途 |
|--------|------|----------|
| **Personal VP** | 個人 VP — 本人零售交易 | 個人進度、Next Step |
| **Retail House VP** | 零售屋 VP — 依 `retailHouseId` 歸戶 | 零售屋模組 |
| **Organization VP** | 組織 VP — 本人 + 下線合計 | Qualification |
| **Monthly VP** | 月 VP — 當月個人 VP | **Challenge** |
| **Rolling VP** | 滾動視窗內 VP 合計 | 滾動 KPI（視窗未定義 → Rule Missing） |
| **Qualification VP** | 晉升計算 VP | **Promotion、Boss、Qualification** |
| **Lifetime VP** | 累積 VP — 全部有效交易 | 排行榜、成就（未來） |

---

## 3. 資料模型

| 型別 | 說明 |
|------|------|
| `VPTransaction` | 正規化 VP 紀錄（由交易衍生） |
| `VPBalance` | 單一 bucket 的計算餘額 |
| `VPBucket` | Bucket 定義（標籤、說明） |
| `VPSource` | 交易類型 → VP 來源與倍率 |
| `VPSnapshot` | 快取快照（可重新計算） |

### 每筆 VPTransaction 必須紀錄

`transactionId`, `date`, `memberId`, `retailHouseId`, `source`, `product`, `vp`, `month`, `year`, `rollingMonth`, `qualificationMonth`, `status`

---

## 4. Transaction 流程

```
Retail Transaction（原始資料）
  → normalizeToVpTransactions()（依 VP Source Rule）
  → VPTransaction[]
  → calculateVP() / calculateMonthlyVP() / …
  → VPSnapshot（快取）
```

**Business Rule：**

- 所有 VP 都來自 Transaction
- 任何 VP 都不得人工累加
- 所有 VP 必須可重新計算
- 任何 Snapshot 都只是快取

---

## 5. Calculation Flow

| 函式 | 說明 |
|------|------|
| `calculateVP()` | 主入口 — 產生完整 VPSnapshot |
| `calculateMonthlyVP()` | 月 VP |
| `calculateRollingVP()` | 滾動 VP（需 `rollingWindowMonths`） |
| `calculateOrganizationVP()` | 組織 VP |
| `calculateQualificationVP()` | 晉升計算 VP（personal + organization） |
| `calculateLifetimeVP()` | 累積 VP |

全部為**純函式**，不依賴 UI。

---

## 6. Snapshot 機制

`VPSnapshot` 標記 `isCache: true`，僅供讀取加速。  
權威來源永遠是 `VPTransaction[]` + VP Rules。

---

## 7. Qualification 關係

Qualification Rule 中 VP / Organization VP 條件使用 `vpTargetKey` 引用 VP Rule target，**不得**在 Qualification Rule 內寫死數字。

| Target Key | 用途 | 已定義數值 |
|------------|------|------------|
| `qualification_world_team_personal_vp` | 世界組 — 個人 VP | **2500** |
| `qualification_world_team_organization_vp` | 世界組 — 組織 VP | **10000** |

Qualification Engine 讀取 **Qualification VP**（來自 VPSnapshot），不直接掃描原始交易。

---

## 8. 各模組如何引用

| 模組 | 允許讀取 | 禁止 |
|------|----------|------|
| **Mission** | VP Rule target（經 Qualification / Promotion gap） | 寫死 `2500 VP` |
| **Promotion** | Qualification VP（經 QualificationResult） | 直接讀 Transaction |
| **Challenge** | Monthly VP | 自行加總交易 |
| **Boss** | Qualification VP（經 Next Step / Qualification） | 直接讀 Transaction |
| **Adventure** | Promotion Progress / Qualification | 直接讀 VP |
| **Next Step** | `vpTargetKey` → VP Rule | 內联 `vpTarget` 數字 |

---

## 9. VP Source（交易 → VP）

| Source Key | 交易類型 | Multiplier |
|------------|----------|------------|
| `retail_new_member_vp` | 新會員 VP 交易 | 1 |
| `retail_returning_member_vp` | 舊會員 VP 交易 | 1 |

---

## 10. Rule Missing

| Rule Key | 狀態 |
|----------|------|
| `vpRules.rollingWindowMonths` | 未定義（null） |
| 其他 Challenge / Next Step VP target | 多數仍 null — 見 BUSINESS_RULES.md Priority 0 |

---

## 11. Future Extension

- 產品別 VP 倍率（`productKey`）
- 零售屋歸戶規則細化
- Rolling VP 視窗月數
- 更多 Qualification VP target（督導、推廣組等）
- 排行榜 Lifetime VP 排名

修改 VP 制度時：**只改 `vp.ts` 與本文件**，Engine 與 UI 不應改動。

---

## Change Log

| Date | Change |
|------|--------|
| 2026-08 | Sprint 13 — VP Rule Engine（Core Currency） |
