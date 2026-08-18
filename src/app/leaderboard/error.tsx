"use client";

export default function LeaderboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] px-6">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-[var(--brand-surface)] p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">無法載入排行榜</p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#ff375f]">
          {error.message || "排行榜計算失敗"}
        </p>
        <button
          className="mt-6 w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white"
          onClick={() => retry()}
          type="button"
        >
          重新載入
        </button>
      </div>
    </div>
  );
}
