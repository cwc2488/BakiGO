import Link from "next/link";
import type { ReactNode } from "react";

import { IconChevronDown, IconLearning } from "@/components/ui/BrandIcons";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";

export const TRAINING_SURFACE =
  "rounded-[1.35rem] border border-[var(--brand-border)]/70 bg-[var(--brand-surface)] shadow-[0_1px_2px_rgba(29,29,31,0.035)]";

export const TRAINING_SURFACE_SOFT =
  "rounded-[1.35rem] border border-[var(--brand-border)]/55 bg-[color-mix(in_srgb,var(--brand-surface)_88%,var(--brand-primary-muted))]";

export function formatTrainingDisplayDate(iso: string): string {
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return day.replaceAll("-", ".");
  }
  return iso.slice(0, 10);
}

export function formatTrainingItemNumber(sortOrder: number): string {
  return String(Math.max(0, Math.trunc(sortOrder))).padStart(2, "0");
}

export function TrainingPageFrame({
  children,
  backHref,
  backLabel,
  headerExtra,
}: {
  children: ReactNode;
  backHref: string;
  backLabel: string;
  headerExtra?: ReactNode;
}) {
  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="home-container flex flex-col gap-6 pb-28 pt-10 sm:pt-12">
        <div className="home-section flex items-start justify-between gap-3">
          <Link
            className="inline-flex min-h-11 items-center text-[0.875rem] font-medium text-[var(--brand-primary-dark)] transition-opacity active:opacity-70"
            href={backHref}
          >
            ← {backLabel}
          </Link>
          {headerExtra}
        </div>
        {children}
      </main>
    </div>
  );
}

export function TrainingHero({
  eyebrow,
  title,
  tagline,
  incompleteCount,
  completedCount,
  actions,
}: {
  eyebrow?: string;
  title: string;
  tagline: string;
  incompleteCount: number;
  completedCount: number;
  actions?: ReactNode;
}) {
  return (
    <header className="home-section space-y-5">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[0.8125rem] font-medium tracking-[0.04em] text-[var(--brand-text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="break-words text-[2rem] font-semibold tracking-tight text-[var(--brand-text)] sm:text-[2.125rem]">
          {title}
        </h1>
        <p className="max-w-[22rem] text-[0.9375rem] leading-relaxed text-[var(--brand-text-secondary)]">
          {tagline}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className={`${TRAINING_SURFACE} px-4 py-3.5`}>
          <p className="text-[0.75rem] font-medium tracking-wide text-[var(--brand-text-muted)]">
            尚未完成
          </p>
          <p className="mt-1.5 text-[1.75rem] font-semibold tabular-nums tracking-tight text-[var(--brand-text)]">
            {incompleteCount}
            <span className="ml-1 text-[0.875rem] font-medium text-[var(--brand-text-muted)]">
              項
            </span>
          </p>
        </div>
        <div className={`${TRAINING_SURFACE_SOFT} px-4 py-3.5`}>
          <p className="text-[0.75rem] font-medium tracking-wide text-[var(--brand-text-muted)]">
            已完成
          </p>
          <p className="mt-1.5 text-[1.75rem] font-semibold tabular-nums tracking-tight text-[var(--brand-primary-dark)]">
            {completedCount}
            <span className="ml-1 text-[0.875rem] font-medium text-[var(--brand-text-muted)]">
              項
            </span>
          </p>
        </div>
      </div>

      {actions}
    </header>
  );
}

export function TrainingSectionHeading({
  children,
  count,
  trailing,
}: {
  children: ReactNode;
  count?: number;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <h2 className="text-[1.0625rem] font-semibold tracking-tight text-[var(--brand-text)]">
          {children}
        </h2>
        <div className="mt-2 h-px w-10 bg-[var(--brand-primary)]/55" aria-hidden />
      </div>
      <div className="flex items-center gap-2">
        {typeof count === "number" ? (
          <span className="text-[0.8125rem] tabular-nums text-[var(--brand-text-muted)]">
            {count}
          </span>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}

export function TrainingStatusChip({
  tone = "pending",
  children,
}: {
  tone?: "pending" | "verified";
  children: ReactNode;
}) {
  const styles =
    tone === "verified"
      ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
      : "bg-[var(--brand-bg)] text-[var(--brand-text-secondary)]";
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-[0.75rem] font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

export function TrainingLearningLink({ href }: { href: string }) {
  return (
    <a
      className="mt-3 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-[0.95rem] bg-[var(--brand-bg)] px-3.5 text-[0.875rem] font-medium text-[var(--brand-primary-dark)] transition-opacity active:opacity-75"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <IconLearning className="shrink-0" size={18} />
        <span className="truncate">前往學習</span>
      </span>
      <span aria-hidden className="text-[1.1rem] text-[var(--brand-hint)]">
        ›
      </span>
    </a>
  );
}

export function TrainingVerifiedSeal() {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/25 bg-[var(--brand-primary-muted)] text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
    >
      ✓
    </span>
  );
}

export function TrainingSkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="home-section space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--brand-border)]/70" />
        <div className="h-9 w-48 animate-pulse rounded bg-[var(--brand-border)]/80" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded bg-[var(--brand-border)]/60" />
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <div className={`${TRAINING_SURFACE} h-[4.75rem] animate-pulse`} />
          <div className={`${TRAINING_SURFACE} h-[4.75rem] animate-pulse`} />
        </div>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className={`${TRAINING_SURFACE} h-[6.5rem] animate-pulse`}
          />
        ))}
      </div>
    </div>
  );
}

export function TrainingFeedbackBanner({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  const styles =
    tone === "success"
      ? "border-[var(--brand-primary)]/25 bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
      : "border-[#f0c7c7] bg-[#fff7f7] text-[#b42318]";
  return (
    <p
      className={`rounded-[1.1rem] border px-4 py-3 text-[0.875rem] font-medium leading-relaxed ${styles}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function TrainingCollapseToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      aria-expanded={open}
      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-[0.8125rem] font-medium text-[var(--brand-text-muted)] transition-opacity active:opacity-70"
      onClick={onToggle}
      type="button"
    >
      {label}
      <IconChevronDown
        className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        size={16}
      />
    </button>
  );
}
