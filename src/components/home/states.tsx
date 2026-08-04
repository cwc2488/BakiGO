export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f5f5f7] px-5 py-6 text-center">
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
    <div className="flex min-h-full items-center justify-center bg-[#f5f5f7] px-6">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">無法載入首頁</p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#86868b]">{message}</p>
        <button
          className="mt-6 w-full rounded-2xl bg-[#0071e3] px-4 py-3.5 text-[1rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
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
  return <div className={`animate-pulse rounded-xl bg-[#ececf1] ${className}`} />;
}

export function HomeLoadingSkeleton() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#fafafa_0%,#f5f5f7_48%,#eef0f4_100%)]">
      <main className="home-container flex flex-col gap-5 pb-24 pt-12">
        <div className="space-y-3">
          <SkeletonBar className="h-4 w-16" />
          <SkeletonBar className="h-8 w-48" />
          <SkeletonBar className="h-7 w-40" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.75rem] bg-white/90 p-6 shadow-[0_8px_40px_rgba(0,0,0,0.04)]"
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
