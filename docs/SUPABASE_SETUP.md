# Supabase 雲端基礎（Milestone 5）

## 1. 建立 Supabase 專案

1. 至 [supabase.com](https://supabase.com) 建立專案
2. 在 **SQL Editor** 執行 `supabase/migrations/001_cloud_foundation.sql`

## 2. 關閉 Email 確認（開發／驗收用）

**Authentication → Providers → Email**  
關閉 **Confirm email**，註冊後才能立刻登入並寫入 `members` 表。

## 3. 環境變數

複製 `.env.example` 為 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 4. 驗收流程

1. `/register` 建立會員 A（無推薦人）
2. `/register` 建立會員 B，推薦人填 A 的會員編號
3. 登入 A → **組織圖** 應看到自己與 B（第一代）
4. 換瀏覽器／電腦，用 A 的 Email 登入 → 資料仍存在

## 資料表

- `members` — 會員主檔（member_number 唯一）
- `organization_relationships` — parent → child 上下線關係

## 登入

- Email + Password（Supabase Auth）
- 登入後自動從 Supabase 同步會員至本機，供既有引擎讀取
