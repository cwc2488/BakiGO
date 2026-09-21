import Link from "next/link";
import type { ReactNode } from "react";

import { IconChevronDown, IconLearning } from "@/components/ui/BrandIcons";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";
import type { TrainingLearningLink } from "@/types/training-checklist";

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

export function getValidTrainingLearningLinks(
  links: TrainingLearningLink[],
): TrainingLearningLink[] {
  return links.filter(
    (link) =>
      Boolean(link.learningResourceYoutubeUrl) &&
      Boolean(link.learningResourceTitle || link.learningResourceId),
  );
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
      <main className="home-container flex flex-col gap-4 pb-28 pt-8 sm:pt-10">
        <div className="home-section flex items-center justify-between gap-3">
          <Link
            className="inline-flex min-h-11 min-w-11 items-center text-[0.875rem] font-medium text-[var(--brand-primary-dark)] transition-opacity active:opacity-70"
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

export function TrainingHeroCompact({
  eyebrow,
  title,
  tagline,
  incompleteCount,
  completedCount,
}: {
  eyebrow?: string;
  title: string;
  tagline: string;
  incompleteCount: number;
  completedCount: number;
}) {
  return (
    <header className="home-section space-y-3">
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-[0.8125rem] font-medium text-[var(--brand-text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="break-words text-[1.75rem] font-semibold tracking-tight text-[var(--brand-text)]">
          {title}
        </h1>
        <p className="text-[0.875rem] leading-relaxed text-[var(--brand-text-secondary)]">
          {tagline}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem]">
        <p className="text-[var(--brand-text)]">
          <span className="text-[var(--brand-text-muted)]">尚未完成</span>{" "}
          <span className="font-semibold tabular-nums">{incompleteCount}</span> 項
        </p>
        <p className="text-[var(--brand-text)]">
          <span className="text-[var(--brand-text-muted)]">已完成</span>{" "}
          <span className="font-semibold tabular-nums text-[var(--brand-primary-dark)]">
            {completedCount}
          </span>{" "}
          項
        </p>
      </div>
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
    <div className="flex items-center justify-between gap-3 px-0.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-[var(--brand-text)]">
          {children}
        </h2>
        {typeof count === "number" ? (
          <span className="text-[0.8125rem] tabular-nums text-[var(--brand-text-muted)]">
            {count} 項
          </span>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}

export function TrainingListSurface({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[1.15rem] border border-[var(--brand-border)]/70 bg-[var(--brand-surface)] shadow-[0_1px_2px_rgba(29,29,31,0.03)]">
      {children}
    </div>
  );
}

export function TrainingListDivider() {
  return <div aria-hidden className="mx-4 h-px bg-[var(--brand-border)]/70" />;
}

export function TrainingSkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <div className="home-section space-y-4" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-[var(--brand-border)]/70" />
        <div className="h-4 w-52 max-w-full animate-pulse rounded bg-[var(--brand-border)]/55" />
        <div className="h-4 w-44 animate-pulse rounded bg-[var(--brand-border)]/45" />
      </div>
      <div className="overflow-hidden rounded-[1.15rem] border border-[var(--brand-border)]/70 bg-[var(--brand-surface)]">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index}>
            {index > 0 ? <div className="mx-4 h-px bg-[var(--brand-border)]/60" /> : null}
            <div className="flex min-h-14 items-center gap-3 px-4 py-3">
              <div className="h-3 w-6 animate-pulse rounded bg-[var(--brand-border)]/70" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-2/3 max-w-[12rem] animate-pulse rounded bg-[var(--brand-border)]/75" />
                <div className="h-3 w-16 animate-pulse rounded bg-[var(--brand-border)]/50" />
              </div>
            </div>
          </div>
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
      className={`rounded-[1rem] border px-3.5 py-2.5 text-[0.875rem] font-medium leading-relaxed ${styles}`}
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

export function TrainingSheetShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(29,29,31,0.42)] sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-t-[1.35rem] border border-[var(--brand-border)]/70 bg-[var(--brand-surface)] shadow-[0_18px_48px_rgba(29,29,31,0.16)] sm:rounded-[1.35rem]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 pt-1">
            <h3 className="text-[1.125rem] font-semibold tracking-tight text-[var(--brand-text)]">
              {title}
            </h3>
            {subtitle ? (
              <div className="mt-1 text-[0.875rem] leading-relaxed text-[var(--brand-text-muted)]">
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            aria-label="關閉"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[1.25rem] text-[var(--brand-text-muted)] transition-opacity active:opacity-70"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

export function TrainingLearningActionLabel() {
  return (
    <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-[var(--brand-primary-dark)]">
      <IconLearning size={14} />
      學習內容
    </span>
  );
}
