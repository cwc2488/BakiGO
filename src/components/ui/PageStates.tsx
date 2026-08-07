import { IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { PAGE_GRADIENT_CLASS } from "./brand-ui";

export function PageLoadingState({ message = "載入中…" }: { message?: string }) {
  return (
    <div
      className={`flex min-h-full items-center justify-center ${PAGE_GRADIENT_CLASS} px-6 text-[var(--brand-text-muted)]`}
    >
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
    <div className={`flex min-h-full items-center justify-center ${PAGE_GRADIENT_CLASS} px-6`}>
      <div className="w-full max-w-sm rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.04)]">
        <p className="text-[1.125rem] font-semibold text-[var(--brand-text)]">
          <IconLabel icon={APP_ICON.mood.error}>{title}</IconLabel>
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--brand-text-muted)]">{message}</p>
        {onRetry ? (
          <button
            className="mt-6 w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white transition-transform active:scale-[0.98]"
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
