"use client";

import { ProgressBar } from "@/components/home/ui";
import {
  buildQuickLogHref,
  resolvePresidentAiAction,
  type PresidentAiAction,
} from "@/lib/president-ai/resolve-president-ai-action";
import { formatFocusModeLabel } from "@/lib/president-ai/display-labels";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";
import type { FocusMode, Priority } from "@/types/president-ai";
import Link from "next/link";

function ActionButton({
  action,
  onQuickLog,
  compact,
}: {
  action: PresidentAiAction;
  onQuickLog?: (actionKey: "measurement" | "consultation" | "recruit") => void;
  compact?: boolean;
}) {
  const className = `inline-flex w-full items-center justify-center rounded-2xl bg-[#1d1d1f] font-semibold text-white transition-transform active:scale-[0.98] ${
    compact ? "px-4 py-3 text-[0.875rem]" : "px-5 py-3.5 text-[0.9375rem]"
  }`;

  if (action.kind === "quick-log") {
    if (onQuickLog) {
      return (
        <button className={className} onClick={() => onQuickLog(action.actionKey)} type="button">
          {action.label}
        </button>
      );
    }
    return (
      <Link className={className} href={buildQuickLogHref(action.actionKey)}>
        {action.label}
      </Link>
    );
  }

  return (
    <Link className={className} href={action.href}>
      {action.label}
    </Link>
  );
}

export function TodayStepCard({
  priority,
  focusMode,
  reasoning,
  onQuickLog,
  compact = false,
  showFocusMode = true,
  minimal = false,
}: {
  priority: Priority | null;
  focusMode: FocusMode;
  reasoning?: string | null;
  onQuickLog?: (actionKey: "measurement" | "consultation" | "recruit") => void;
  compact?: boolean;
  showFocusMode?: boolean;
  minimal?: boolean;
}) {
  const action = resolvePresidentAiAction(priority);
  const title = priority?.title ?? focusMode.label;
  const description = minimal ? null : (priority?.description ?? focusMode.reason);

  return (
    <section
      className={`rounded-[1.75rem] border border-[var(--brand-border)] bg-gradient-to-br from-[#f0faf3] to-[var(--brand-surface)] ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
            {PARTNER_LABELS.todayAction}
          </p>
          {!minimal && showFocusMode ? (
            <p className="mt-1 text-[0.8125rem] font-medium text-[#86868b]">
              {formatFocusModeLabel(focusMode.key)}
            </p>
          ) : null}
        </div>
        {!minimal && priority ? (
          <span className="shrink-0 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]">
            {priority.score}%
          </span>
        ) : null}
      </div>

      <h2
        className={`mt-3 font-semibold tracking-tight text-[#1d1d1f] ${
          minimal
            ? "text-[1.375rem] leading-snug sm:text-[1.5rem]"
            : compact
              ? "text-[1.125rem] leading-snug"
              : "text-[1.375rem] leading-snug sm:text-[1.5rem]"
        }`}
      >
        {title}
      </h2>

      {!minimal && priority ? (
        <div className="mt-3">
          <ProgressBar color="#77b539" percent={priority.score} />
        </div>
      ) : null}

      {description ? (
        <p className={`mt-3 leading-relaxed text-[#636366] ${compact ? "text-[0.875rem]" : "text-[0.9375rem]"}`}>
          {description}
        </p>
      ) : null}

      {!minimal && reasoning ? (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#86868b]">{reasoning}</p>
      ) : null}

      {action ? (
        <div className={minimal ? "mt-5" : "mt-4"}>
          <ActionButton action={action} compact={compact || minimal} onQuickLog={onQuickLog} />
        </div>
      ) : null}
    </section>
  );
}
