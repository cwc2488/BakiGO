import type { ReactNode } from "react";

export function QuizWarmShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-full bg-[#faf6f1]">
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10 pt-8 sm:px-6">
        {children}
        {footer ? <footer className="mt-8 text-center text-xs text-[#9a8b82]">{footer}</footer> : null}
      </main>
    </div>
  );
}

export function QuizProgressBar({ current, total }: { current: number; total: number }) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center justify-between text-sm text-[#8b7d74]">
        <span>
          第 {current} / {total} 題
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#eadfd6]">
        <div
          className="h-full rounded-full bg-[#f0a8b8] transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
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
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-[1.25rem] bg-[#2f2622] px-5 py-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
    >
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
      className={`w-full rounded-[1.25rem] border px-4 py-4 text-left text-[0.98rem] leading-7 transition active:scale-[0.99] ${
        selected
          ? "border-[#f0a8b8] bg-[#fff4f7] shadow-[0_8px_24px_rgba(240,168,184,0.18)]"
          : "border-[#eadfd6] bg-white/90"
      }`}
    >
      {children}
    </button>
  );
}

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
      <h2 className="text-2xl font-semibold text-[#2f2622]">{animalName}</h2>
      <p className="mt-1 text-sm text-[#a0897d]">{tagline}</p>
      {headline ? (
        <p className="mt-4 max-w-md text-[1.02rem] leading-8 text-[#5f4f47]">{headline}</p>
      ) : null}
    </div>
  );
}
