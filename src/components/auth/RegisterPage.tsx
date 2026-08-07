"use client";

import { SupabaseSetupNotice } from "@/components/auth/SupabaseSetupNotice";
import { PAGE_GRADIENT_CLASS, PrimarySubmitButton } from "@/components/ui/brand-ui";
import { registerAccount } from "@/lib/auth/auth-service";
import { useAuth } from "@/lib/auth/auth-context";
import { CLOUD_MEMBER_LEVELS } from "@/lib/cloud/member-levels";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { AuthError } from "@/types/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [sponsorMemberNumber, setSponsorMemberNumber] = useState("");
  const [currentLevel, setCurrentLevel] = useState<string>(CLOUD_MEMBER_LEVELS[0].value);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await registerAccount(
        {
          name,
          email,
          memberNumber,
          sponsorMemberNumber: sponsorMemberNumber.trim() || undefined,
          currentLevel,
          password,
        },
        createLocalStorageAdapter(),
      );
      await refresh();
      router.replace("/daily-action");
    } catch (caught) {
      if (caught instanceof AuthError) {
        setError(caught.message);
      } else {
        setError("建立帳號失敗，請稍後再試");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="home-container flex flex-col gap-8 pb-24 pt-16">
        <header className="home-section space-y-2">
          <h1 className="text-[2rem] font-semibold tracking-tight text-[var(--brand-text)] sm:text-[2.25rem]">建立帳號</h1>
          <p className="text-[1rem] text-[var(--brand-text-muted)]">
            會員資料永久保存在 Supabase 雲端，任何裝置登入都看到同一份組織。
          </p>
        </header>

        <SupabaseSetupNotice />

        <form className="home-section space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">姓名</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">Email</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">賀寶芙會員編號</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              value={memberNumber}
              onChange={(event) => setMemberNumber(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">推薦人會員編號</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              value={sponsorMemberNumber}
              onChange={(event) => setSponsorMemberNumber(event.target.value)}
            />
            <span className="text-[0.8125rem] text-[#86868b]">選填；有推薦人時會自動建立上下線關係</span>
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">目前資格</span>
            <select
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              value={currentLevel}
              onChange={(event) => setCurrentLevel(event.target.value)}
            >
              {CLOUD_MEMBER_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">密碼</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="text-[0.9375rem] text-[#ff375f]">{error}</p> : null}

          <PrimarySubmitButton disabled={isSubmitting}>
            {isSubmitting ? "建立中…" : "建立帳號"}
          </PrimarySubmitButton>
        </form>

        <p className="home-section text-center text-[0.9375rem] text-[var(--brand-text-muted)]">
          已有帳號？{" "}
          <Link className="font-medium text-[var(--brand-primary-dark)]" href="/login">
            登入
          </Link>
        </p>
      </main>
    </div>
  );
}
