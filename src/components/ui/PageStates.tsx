import { APP_EMOJI } from "@/lib/ui/app-emojis";

export function PageLoadingState({ message = "載入中…" }: { message?: string }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] px-6 text-[#86868b]">
      {message}
    </div>
  );
}

export function PageErrorState({
  title = "無法載入",
  message = "請稍後再試。",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] px-6">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">
          {APP_EMOJI.mood.error} {title}
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#86868b]">{message}</p>
        {onRetry ? (
          <button
            className="mt-6 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white transition-transform active:scale-[0.98]"
            onClick={onRetry}
            type="button"
          >
            重新載入
          </button>
        ) : null}
      </div>
    </div>
  );
}
