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

## 重置所有帳號並建立虛擬上線 00000

在 **SQL Editor** 執行 `supabase/migrations/002_reset_and_seed_virtual_member.sql`。

此腳本會：
1. 清空 `organization_relationships`
2. 清空 `members`（含巴其等所有會員）
3. 清空 `auth.users`（所有登入帳號）
4. 新增編號 **00000** 的「虛擬上線」

執行後所有裝置需重新註冊；推薦人可填 `00000`。

## 修改上線（需額外 migration）

若要用「修改上線」功能，請在 SQL Editor 執行：

`supabase/migrations/003_sponsor_update_policies.sql`

## 跨裝置資料同步（需額外 migration）

若要在手機／電腦／平板之間同步業務資料（活動紀錄、名單流程、行事曆等），請在 SQL Editor 執行：

`supabase/migrations/004_member_app_data.sql`

登入後會自動：
1. 從雲端下載你的資料至本機
2. 若雲端尚無資料，會上傳本機既有資料
3. 之後每次新增／修改，約 1.5 秒後自動上傳

同步範圍：活動紀錄、名單流程、個人行事曆、促銷活動、會員工作區、積分兌換、Super League 名單等。  
**不含**：Google 行事曆 OAuth（各裝置需分別授權）、共用行事曆快取。

## 會員頭像（需額外 migration）

若要在個人頁面上傳頭像，並在組織圖顯示，請在 SQL Editor 執行：

`supabase/migrations/005_member_avatars.sql`

此 migration 會新增 `members.avatar_url` 欄位，並建立 `member-avatars` Storage bucket。

## 4. 驗收流程

1. `/register` 建立會員 A（無推薦人）
2. `/register` 建立會員 B，推薦人填 A 的會員編號
3. 登入 A → **組織圖** 應看到自己與 B（第一代）
4. 換瀏覽器／電腦，用 A 的 Email 登入 → 組織與業務資料（活動、名單等）應仍存在
5. 在 A 手機新增一筆活動 → 用 A 帳號登入另一台裝置 → 應看到相同資料

## 資料表

- `members` — 會員主檔（member_number 唯一）
- `organization_relationships` — parent → child 上下線關係
- `member_app_data` — 跨裝置同步的業務資料（JSON 文件）
- `members.avatar_url` — 會員頭像公開 URL（Storage `member-avatars`）

## 登入

- Email + Password（Supabase Auth）
- 登入後自動從 Supabase 同步會員至本機，供既有引擎讀取
