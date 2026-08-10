"use client";

import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import { QUIZ_HUB_ITEMS } from "@/lib/quiz/quiz-hub-catalog";

function QuizHubCard({
  title,
  description,
  coverSrc,
  manageHref,
  leadsHref,
}: {
  title: string;
  description: string;
  coverSrc: string;
  manageHref: string;
  leadsHref: string;
}) {
  return (
    <BrandCard className="p-0 overflow-hidden" variant="bordered">
      <Image
        src={coverSrc}
        alt={title}
        width={819}
        height={1024}
        sizes="(max-width: 430px) 100vw, 430px"
        className="mx-auto h-auto w-full max-w-[430px] object-contain object-center"
      />
      <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div>
          <h2 className="text-[1.125rem] font-semibold leading-snug text-[#1d1d1f]">{title}</h2>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">{description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            className="rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-center text-[0.875rem] font-semibold text-white transition-transform active:scale-[0.98]"
            href={manageHref}
          >
            分享測驗
          </Link>
          <Link
            className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 text-center text-[0.875rem] font-semibold text-[#1d1d1f] transition-colors active:bg-[var(--brand-primary-muted)]"
            href={leadsHref}
          >
            查看名單
          </Link>
        </div>
      </div>
    </BrandCard>
  );
}

export function QuizHubPage() {
  return (
    <PageShell
      backHref="/"
      subtitle="用測驗開啟話題，快速了解對方真正的需求。"
      title="測驗中心"
    >
      <div className="grid gap-4">
        {QUIZ_HUB_ITEMS.map((item) => (
          <QuizHubCard
            key={item.slug}
            coverSrc={item.coverSrc}
            description={item.description}
            leadsHref={item.leadsHref}
            manageHref={item.manageHref}
            title={item.title}
          />
        ))}
      </div>
    </PageShell>
  );
}
