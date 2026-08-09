# AI Radar PRD v1.0

## Baki Go - AI Radar System

Version: 1.0

Status: Ready for Development

---

# 1. Product Vision

AI Radar 是 Baki Go 的核心模組。

目標不是分析社群，而是：

> 每天推薦目前最值得開發的 20 位名單。

AI Radar 必須持續學習每位使用者自己的開發結果，使推薦品質越來越準確。

AI Radar 不負責：

- CRM
- 話術
- 教學
- 開發流程管理

AI Radar 只負責：

- 找人
- 分析
- 排序
- 學習

---

# 2. Core Flow

每日 03:00

↓

更新 Candidate

↓

重新分析最近 90 天公開資料

↓

AI 分析

↓

重新計算推薦分數

↓

排行榜

↓

Top20

↓

使用者查看

↓

開始開發

↓

回報結果

↓

AI Learning

---

# 3. Data Source

Platform

- Instagram
- Threads

Candidate 必須：

- 公開帳號
- 可分析公開資訊

若 IG 與 Threads 為同一人：

AI 合併分析。

若無法 100% 確認：

不得合併。

---



# 4. Analysis Scope

分析期間：

最近 90 天

分析內容：

- Profile
- Avatar
- Bio
- Account ID
- Posts
- Reels
- Threads
- Highlights
- Public Activity

分析以時間為主。

不是固定篇數。

---



# 5. Daily Analysis

每天 03:00

重新：

- 更新 Candidate
- 更新需求
- 更新改變動機
- 更新活躍度
- 更新距離
- 更新推薦分數
- 更新成交率
- 更新排行榜

---



# 6. Recommendation Ranking

主要排序：

1. 改變動機
2. 活躍度
3. 需求

另外納入：

- 行政區距離
- 四大特性
- AI 個人學習
- 公開訊號

---



# 7. Recommendation Score

100 分制

保留：

一位小數

例如：

98.7

100 分代表：

目前綜合判斷最值得開發的人。

每日重新計算。

顯示：

↑↓

以及主要變動原因。

---



# 8. Candidate Card

Candidate Card 顯示：

- 改變動機
- 推薦分數
- 成交機率
- 推薦原因
- 多重需求
- 分析時間
- Instagram
- Threads
- 所在地
- 年齡
- 性別
- 職業
- 是否有小孩
- 興趣
- 個性
- 生活型態
- 最佳切入話題
- 不建議切入話題
- 最佳聯絡時機
- 建議聯絡平台

---



# 9. Recommendation Rule

每天固定：

20 人

不足：

補滿。

沒有最低門檻。

排行榜永遠保留最高分 Top20。

---



# 10. Candidate Lifecycle

New

↓

Viewed

↓

Start Development

↓

Development

↓

Result

↓

AI Learning

---



# 11. Development

開始開發：

立即成立。

不等待回覆。

Candidate：

退出排行榜。

狀態：

Development。

---



# 12. Result

可回報：

- Success
- Failure
- Already Know
- Give Up

Failure：

必須填原因。

固定選項＋其他。

Success：

不用填原因。

Already Know：

未來仍可再次推薦。

---



# 13. AI Learning

AI 只學：

目前登入使用者自己的資料。

不共享其他夥伴。

學習：

- Success
- Failure

持續修正：

- 推薦分數
- 排序
- 成交率

---



# 14. Re-Recommendation

若 Candidate 再次符合條件：

可再次推薦。

需顯示：

- 曾推薦
- 上次原因
- 本次重新推薦原因

---



# 15. Distance

優先：

行政區

無法判斷：

退回縣市。

距離越近：

權重越高。

---



# 16. Time

最佳聯絡時間：

AI 推估。

不影響推薦。

只提供建議。

---



# 17. System Principle

AI：

- 每日學習
- 每日重新分析
- 每日重新排序

核心：

不是找最多人。

而是：

找目前最值得開發的人。

End of PRD v1.0