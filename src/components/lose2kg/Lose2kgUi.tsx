"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "secondary" | "ghost" | "danger" | "gold";

const TONES: Record<Tone, string> = {
  primary:
    "bg-[#1d1d1f] text-white shadow-[0_2px_0_#0a0a0a] hover:bg-[#333] active:shadow-none",
  secondary:
    "border border-[#cfc9bc] bg-white text-[#1d1d1f] hover:bg-[#f7f3ea] shadow-sm",
  ghost: "bg-transparent text-[#1d1d1f] hover:bg-[#f5f5f7]",
  danger: "border border-[#f5c2c2] bg-[#fff5f5] text-[#c41e1e] hover:bg-[#ffe8e8]",
  gold: "bg-[#1d1d1f] text-white shadow-[0_2px_0_#0a0a0a] hover:bg-[#333] active:shadow-none",
};

export function Lose2kgButton({
  children,
  tone = "primary",
  loading = false,
  success = false,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  loading?: boolean;
  success?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-[0.875rem] font-semibold transition duration-[140ms] ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${TONES[tone]} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      {success ? "✓ " : null}
      {children}
    </button>
  );
}

export function Lose2kgToast({
  message,
  tone = "success",
}: {
  message: string | null;
  tone?: "success" | "error" | "info";
}) {
  if (!message) return null;
  const colors =
    tone === "error"
      ? "bg-[#fff2f2] text-[#d70015]"
      : tone === "info"
        ? "bg-[#f5f5f7] text-[#1d1d1f]"
        : "bg-[#e8f8ee] text-[#248a3d]";
  return (
    <div
      className={`fixed bottom-24 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl px-4 py-3 text-[0.875rem] font-medium shadow-lg ${colors}`}
      role="status"
    >
      {message}
    </div>
  );
}
