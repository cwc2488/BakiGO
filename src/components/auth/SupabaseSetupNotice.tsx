"use client";

import { isSupabaseConfigured } from "@/lib/supabase/client";

export function SupabaseSetupNotice() {
  if (isSupabaseConfigured()) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-[#ff9500]/40 bg-[#fff8eb] px-4 py-4 text-[0.875rem] leading-relaxed text-[#1d1d1f]">
      <p className="font-semibold text-[#c93400]">⚠️ Supabase 尚未設定，無法註冊／登入</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[#424245]">
        <li>
          至{" "}
          <a
            className="font-medium text-[var(--brand-primary-dark)] underline"
            href="https://supabase.com/dashboard"
            rel="noreferrer"
            target="_blank"
          >
            supabase.com
          </a>{" "}
          建立專案
        </li>
        <li>
          <strong>Settings → API</strong> 複製 Project URL 與 anon public key
        </li>
        <li>
          在專案根目錄建立 <code className="rounded bg-white/80 px-1">.env.local</code>：
          <pre className="mt-2 overflow-x-auto rounded-xl bg-white/80 p-3 text-[0.8125rem]">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
          </pre>
        </li>
        <li>
          <strong>SQL Editor</strong> 執行{" "}
          <code className="rounded bg-white/80 px-1">supabase/migrations/001_cloud_foundation.sql</code>
        </li>
        <li>
          <strong>Authentication → Email</strong> 關閉 Confirm email
        </li>
        <li>
          <strong>重啟 dev server</strong>（<code className="rounded bg-white/80 px-1">npm run dev</code>）
        </li>
      </ol>
    </section>
  );
}
