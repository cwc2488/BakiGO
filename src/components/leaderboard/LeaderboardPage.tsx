"use client";

import { AppIcon, IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { PageShell } from "@/components/ui/PageShell";
import Link from "next/link";

/**
 * Partner-facing legacy reward Points (積分) leaderboard is retired from the product surface.
 * Historical points data / engines remain in the codebase for recoverability.
 */
export default function LeaderboardPage() {
  return (
    <PageShell
      subtitle="積分系統已退出夥伴前台"
      title="排行"
      titleIcon={APP_ICON.mood.trophy}
    >
      <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-6 shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
        <p className="text-[1.0625rem] font-semibold text-[var(--brand-text)]">
          <IconLabel icon={APP_ICON.section.points}>積分已退出日常使用</IconLabel>
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--brand-text-secondary)]">
          夥伴前台不再顯示本月積分、可兌換積分或兌換流程。事業進度請看零售屋與本月
          VP。
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--brand-primary)] px-5 text-[0.9375rem] font-semibold text-white"
            href="/retail-house"
          >
            前往零售屋
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--brand-border)] px-5 text-[0.9375rem] font-semibold text-[var(--brand-text)]"
            href="/"
          >
            返回我的
          </Link>
        </div>
        <p className="mt-4 flex items-start gap-2 text-[0.8125rem] text-[var(--brand-hint)]">
          <AppIcon className="mt-0.5 shrink-0" name={APP_ICON.mood.empty} size={14} />
          歷史積分資料仍保留於系統，僅前台不再展示。
        </p>
      </section>
    </PageShell>
  );
}
