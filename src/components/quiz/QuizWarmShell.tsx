import type { ReactNode } from "react";

/** Public quiz/analysis shell — scoped consumer theme, no app dashboard chrome. */
export function QuizWarmShell({
  children,
  footer,
  tone = "warm",
}: {
  children: ReactNode;
  footer?: ReactNode;
  tone?: "warm" | "night";
}) {
  const night = tone === "night";
  return (
    <div
      className={`quiz-consumer min-h-full${night ? " analysis-xp" : ""}`}
      data-quiz-consumer-theme="v1"
      data-analysis-xp={night ? "v1" : undefined}
    >
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10 pt-7 sm:px-6">
        {children}
        {footer ? <footer className="qc-caption mt-8 text-center">{footer}</footer> : null}
      </main>
    </div>
  );
}

/** Truthful progress: N / total + bar from current/total (not fake %). */
export function QuizProgressBar({ current, total }: { current: number; total: number }) {
  const safeTotal = Math.max(total, 1);
  const clamped = Math.min(Math.max(current, 0), safeTotal);
  const widthPct = Math.round((clamped / safeTotal) * 100);
  return (
    <div className="mb-6 space-y-2" role="status" aria-label={`進度 ${clamped} / ${safeTotal}`}>
      <div className="qc-caption flex items-center justify-between">
        <span>
          {clamped} / {safeTotal}
        </span>
      </div>
      <div className="qc-progress-track">
        <div className="qc-progress-fill" style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

export function QuizPrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="qc-btn-primary">
      {children}
    </button>
  );
}

export function QuizSecondaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="qc-btn-secondary">
      {children}
    </button>
  );
}

export function QuizOptionButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected ? "true" : "false"}
      className="qc-answer"
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}

/** @deprecated Prefer QuizCharacter — kept for compatibility. */
export function QuizCharacterCard({
  emoji,
  animalName,
  tagline,
  accent,
  headline,
  size = "lg",
}: {
  emoji: string;
  animalName: string;
  tagline: string;
  accent: string;
  headline?: string;
  size?: "lg" | "md";
}) {
  const boxSize = size === "lg" ? "h-44 w-44 text-7xl" : "h-28 w-28 text-5xl";
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`${boxSize} mb-4 flex items-center justify-center rounded-[2rem] shadow-[0_16px_40px_rgba(47,38,34,0.12)]`}
        style={{ background: `linear-gradient(180deg, ${accent} 0%, #fff8f2 100%)` }}
      >
        <span aria-hidden>{emoji}</span>
      </div>
      <h2 className="qc-heading">{animalName}</h2>
      <p className="qc-caption mt-1">{tagline}</p>
      {headline ? <p className="qc-body mt-4 max-w-md">{headline}</p> : null}
    </div>
  );
}
