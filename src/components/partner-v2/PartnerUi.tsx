"use client";

import Link from "next/link";
import type { ReactNode } from "react";

const CARD_CLASS =
  "rounded-[var(--pv2-radius-lg)] border border-[var(--pv2-border-subtle)] bg-[var(--pv2-surface)] shadow-[var(--pv2-shadow-sm)]";

export function PartnerCard({
  children,
  className = "",
  as: Component = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return <Component className={`${CARD_CLASS} p-5 ${className}`}>{children}</Component>;
}

export function PartnerSectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h2 className="text-[1rem] font-semibold tracking-tight text-[var(--pv2-text-primary)]">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PartnerMetricValue({
  current,
  target,
  unit = "",
}: {
  current: number;
  target: number | null;
  unit?: string;
}) {
  if (target === null) {
    return (
      <p className="text-[var(--pv2-text-hero)] font-semibold tabular-nums tracking-tight text-[var(--pv2-text-primary)]">
        {current.toLocaleString("zh-Hant")}
        <span className="ml-1 text-[1.125rem] font-medium text-[var(--pv2-text-muted)]">/ —</span>
      </p>
    );
  }

  return (
    <p className="text-[var(--pv2-text-hero)] font-semibold tabular-nums tracking-tight text-[var(--pv2-text-primary)]">
      {current.toLocaleString("zh-Hant")}
      <span className="text-[1.125rem] font-medium text-[var(--pv2-text-muted)]">
        {" "}
        / {target.toLocaleString("zh-Hant")}
        {unit}
      </span>
    </p>
  );
}

export function PartnerProgressTrack({
  percent,
  tone = "brand",
}: {
  percent: number | null;
  tone?: "brand" | "neutral" | "success";
}) {
  if (percent === null) {
    return <div className="h-1.5 rounded-full bg-[var(--pv2-surface-elevated)]" aria-hidden />;
  }

  const fillClass =
    tone === "success"
      ? "bg-[var(--pv2-success)]"
      : tone === "neutral"
        ? "bg-[var(--pv2-text-muted)]"
        : "bg-[var(--pv2-brand-primary)]";

  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[var(--pv2-surface-elevated)]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${fillClass}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export function PartnerStatusPill({
  status,
}: {
  status: "not_started" | "in_progress" | "completed";
}) {
  const styles = {
    not_started: "bg-[var(--pv2-surface-elevated)] text-[var(--pv2-text-secondary)]",
    in_progress: "bg-[var(--pv2-brand-primary-muted)] text-[var(--pv2-brand-primary-dark)]",
    completed: "bg-[var(--pv2-success-muted)] text-[var(--pv2-success)]",
  } as const;

  const labels = {
    not_started: "尚未啟動",
    in_progress: "進行中",
    completed: "已達成",
  } as const;

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function PartnerPrimaryButton({
  children,
  onClick,
  href,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
}) {
  const className =
    "inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[var(--pv2-text-primary)] px-4 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98]";

  if (href) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={className} onClick={onClick} type={type}>
      {children}
    </button>
  );
}

export function PartnerSecondaryButton({
  children,
  onClick,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[var(--pv2-border-subtle)] bg-[var(--pv2-surface)] px-4 text-[0.9375rem] font-semibold text-[var(--pv2-text-primary)] transition-transform active:scale-[0.98]";

  if (href) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={className} onClick={onClick} type="button">
      {children}
    </button>
  );
}

export function PartnerListRow({
  children,
  href,
  onClick,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "flex min-h-[4.25rem] min-w-0 items-center gap-3 rounded-[var(--pv2-radius-md)] border border-[var(--pv2-border-subtle)] bg-[var(--pv2-surface)] px-4 py-3 transition-colors hover:bg-[var(--pv2-surface-elevated)]";

  if (href) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={`${className} w-full text-left`} onClick={onClick} type="button">
      {children}
    </button>
  );
}
