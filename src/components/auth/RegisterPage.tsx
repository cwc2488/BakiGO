"use client";

import { registerAccount } from "@/lib/auth/auth-service";
import { useAuth } from "@/lib/auth/auth-context";
import { getRegistrationRankOptions } from "@/lib/auth/registration-ranks";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { todayISODate } from "@/lib/config/app-config";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { AuthError } from "@/types/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const rankOptions = useMemo(() => getRegistrationRankOptions(), []);
  const [displayName, setDisplayName] = useState("");
  const [herbalifeMemberId, setHerbalifeMemberId] = useState("");
  const [sponsorHerbalifeMemberId, setSponsorHerbalifeMemberId] = useState("");
  const [rankKey, setRankKey] = useState<string>(RANK_KEYS.NEW_MEMBER);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinedAt, setJoinedAt] = useState(todayISODate());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await registerAccount(
        {
          displayName,
          herbalifeMemberId,
          sponsorHerbalifeMemberId,
          email,
          password,
          joinedAt,
          rankKey,
        },
        createLocalStorageAdapter(),
      );
      refresh();
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
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 pb-24 pt-16">
        <header className="space-y-2">
          <h1 className="text-[2.5rem] font-semibold tracking-tight text-[#1d1d1f]">建立帳號</h1>
          <p className="text-[1rem] text-[#86868b]">
            會員編號為唯一身份，推薦人必須已存在於組織中。
          </p>
        </header>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">姓名</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">會員編號</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              value={herbalifeMemberId}
              onChange={(event) => setHerbalifeMemberId(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">推薦人會員編號</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              value={sponsorHerbalifeMemberId}
              onChange={(event) => setSponsorHerbalifeMemberId(event.target.value)}
            />
            <span className="text-[0.8125rem] text-[#86868b]">若無推薦人可填 00000（虛擬上線）</span>
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">位階</span>
            <select
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              value={rankKey}
              onChange={(event) => setRankKey(event.target.value)}
            >
              {rankOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">電子郵件</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
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

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">加入日期</span>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              type="date"
              value={joinedAt}
              onChange={(event) => setJoinedAt(event.target.value)}
            />
          </label>

          {error ? <p className="text-[0.9375rem] text-[#ff375f]">{error}</p> : null}

          <button
            className="w-full rounded-[1.25rem] bg-[var(--brand-primary)] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "建立中…" : "建立帳號"}
          </button>
        </form>

        <p className="text-center text-[0.9375rem] text-[#86868b]">
          已有帳號？{" "}
          <Link className="font-medium text-[var(--brand-primary-dark)]" href="/login">
            登入
          </Link>
        </p>
      </main>
    </div>
  );
}
