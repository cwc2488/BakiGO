import { AppIcon, IconLabel, type AppIconName } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: AppIconName;
}) {
  return (
    <div className="rounded-2xl bg-[var(--brand-bg)] px-5 py-6 text-center">
      {icon ? (
        <div className="mb-2 flex justify-center">
          <AppIcon name={icon} size={32} />
        </div>
      ) : null}
      <p className="text-[1rem] font-semibold text-[#1d1d1f]">{title}</p>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[#86868b]">{description}</p>
    </div>
  );
}

export function HomeErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={`flex min-h-full items-center justify-center ${PAGE_GRADIENT_CLASS} px-6`}>
      <div className="w-full max-w-sm rounded-[1.75rem] bg-[var(--brand-surface)] p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        <p className="text-[1.125rem] font-semibold text-[var(--brand-text)]">
          <IconLabel icon={APP_ICON.mood.error}>無法載入首頁</IconLabel>
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--brand-text-muted)]">{message}</p>
        <button
          className="mt-6 w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
          onClick={onRetry}
          type="button"
        >
          重新載入
        </button>
      </div>
    </div>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[var(--brand-border)] ${className}`} />;
}

export function HomeLoadingSkeleton() {
  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="home-container flex flex-col gap-5 pb-24 pt-12">
        <div className="space-y-3">
          <SkeletonBar className="h-4 w-16" />
          <SkeletonBar className="h-8 w-48" />
          <SkeletonBar className="h-7 w-40" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.75rem] bg-[var(--brand-surface)]/90 p-6 shadow-[0_8px_40px_rgba(0,0,0,0.04)]"
          >
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="mt-4 h-20 w-full" />
          </div>
        ))}
        <SkeletonBar className="h-16 w-full rounded-[1.75rem]" />
      </main>
    </div>
  );
}
