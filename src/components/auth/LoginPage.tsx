"use client";

import { loginAccount } from "@/lib/auth/auth-service";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError } from "@/types/auth";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await loginAccount({ email, password }, createLocalStorageAdapter());
      await refresh();
      router.replace("/daily-action");
    } catch (caught) {
      if (caught instanceof AuthError) {
        setError(caught.message);
      } else {
        setError("登入失敗，請稍後再試");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 pb-24 pt-16">
        <header className="space-y-2">
          <h1 className="text-[2.5rem] font-semibold tracking-tight text-[#1d1d1f]">登入</h1>
          <p className="text-[1rem] text-[#86868b]">使用 Email 登入 Baki GO 雲端帳號</p>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">Email</span>
            <input
              autoComplete="email"
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-4 text-[1.0625rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">密碼</span>
            <input
              autoComplete="current-password"
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-4 text-[1.0625rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="text-[0.9375rem] text-[#ff375f]">{error}</p> : null}

          <button
            className="w-full rounded-[1.25rem] bg-[var(--brand-primary)] px-4 py-4 text-[1rem] font-semibold text-white disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "登入中…" : "登入"}
          </button>
        </form>

        <p className="text-center text-[0.9375rem] text-[#86868b]">
          還沒有帳號？{" "}
          <Link className="font-medium text-[var(--brand-primary-dark)]" href="/register">
            建立帳號
          </Link>
        </p>
      </main>
    </div>
  );
}
