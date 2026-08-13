"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmCard } from "@/components/members/ui";
import { PageShell } from "@/components/ui/PageShell";
import { formatCommandCenterSectionLabel } from "@/lib/coaching/attention/command-center-copy";
import { extractFocusDatesFromAttentionEvidence } from "@/lib/coaching/timeline/build-timeline-events";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { formatCoachingDayProgressLabel } from "@/lib/coaching/presentation/coaching-ui-copy";
import { useSoftRefresh } from "@/lib/hooks/use-soft-refresh";
import type {
  CoachingCommandCenterCard,
  CoachingCommandCenterFilter,
} from "@/types/coaching-attention";

type CommandCenterResponse = {
  ok?: boolean;
  asOfLogDate?: string;
  counts?: {
    needsAttention: number;
    watch: number;
    measurementDue: number;
    positiveProgress: number;
    routine: number;
    total: number;
  };
  sections?: {
    needsAttention: CoachingCommandCenterCard[];
    watch: CoachingCommandCenterCard[];
    measurementDue: CoachingCommandCenterCard[];
    positiveProgress: CoachingCommandCenterCard[];
    allActive: CoachingCommandCenterCard[];
  };
  meta?: { openaiCalled: boolean };
  error?: string;
};

const FILTERS: Array<{ id: CoachingCommandCenterFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "needs_attention", label: "需要處理" },
  { id: "watch", label: "觀察中" },
  { id: "measurement_due", label: "建議回測" },
  { id: "positive_progress", label: "進展良好" },
];

function sectionTone(section: CoachingCommandCenterCard["assessment"]["commandCenterSection"]): string {
  switch (section) {
    case "needs_attention":
      return "text-[#b42318]";
    case "watch":
      return "text-[#b54708]";
    case "measurement_due":
      return "text-[#175cd3]";
    case "positive_progress":
      return "text-[var(--brand-primary-dark)]";
    default:
      return "text-[#636366]";
  }
}

function buildEvidenceHref(card: CoachingCommandCenterCard): string {
  const focusDates = extractFocusDatesFromAttentionEvidence({
    evidenceBlocks: card.assessment.evidence,
  });
  const params = new URLSearchParams();
  params.set("tab", "timeline");
  if (focusDates.length > 0) {
    params.set("focusDates", focusDates.join(","));
  }
  if (card.assessment.reasonCodes.length > 0) {
    params.set("reasonCodes", card.assessment.reasonCodes.join(","));
  }
  return `${card.detailHref}?${params.toString()}`;
}

function CommandCenterCardView({ card }: { card: CoachingCommandCenterCard }) {
  const section = card.assessment.commandCenterSection;
  const dayLabel = formatCoachingDayProgressLabel(card.dayNumber, card.dayTotal);
  const goalLabel = card.goal?.trim() || "陪跑中";
  const evidenceHref = buildEvidenceHref(card);

  return (
    <article className="rounded-[1.25rem] border border-[#e8ece4] bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{card.customerDisplayName}</p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">
            {dayLabel} · {goalLabel}
          </p>
        </div>
        <span className={`shrink-0 text-[0.8125rem] font-medium ${sectionTone(section)}`}>
          {formatCommandCenterSectionLabel(section)}
        </span>
      </div>

      {card.assessment.primaryReason ? (
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#1d1d1f]">{card.assessment.primaryReason}</p>
      ) : null}

      {card.evidenceSummary ? (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#636366]">{card.evidenceSummary}</p>
      ) : null}

      {section !== "measurement_due" && card.outcomeStatusLabel ? (
        <p className="mt-2 text-[0.8125rem] text-[#86868b]">目前身體狀態：{card.outcomeStatusLabel}</p>
      ) : null}

      {section === "measurement_due" ? (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#636366]">
          完成下一次回測後，系統才能進一步判斷身體變化。
        </p>
      ) : null}

      {card.recommendedActionLabel ? (
        <div className="mt-3 rounded-[1rem] bg-[#f7faf5] px-3 py-2">
          <p className="text-[0.75rem] font-medium tracking-wide text-[#86868b]">建議現在做</p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#1d1d1f]">{card.recommendedActionLabel}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1d1d1f] px-4 text-[0.875rem] font-medium text-white"
          href={card.detailHref}
        >
          去處理
        </Link>
        {card.assessment.evidence.length > 0 || card.evidenceSummary ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d2d2d7] bg-white px-4 text-[0.875rem] font-medium text-[#1d1d1f]"
            href={evidenceHref}
          >
            為什麼提醒
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function SectionBlock({
  title,
  count,
  emptyText,
  cards,
}: {
  title: string;
  count: number;
  emptyText?: string;
  cards: CoachingCommandCenterCard[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">{title}</h2>
        <span className="text-[0.8125rem] text-[#86868b]">{count}</span>
      </div>
      {cards.length === 0 && emptyText ? (
        <p className="rounded-[1.25rem] border border-dashed border-[#e5e7eb] bg-white/70 px-4 py-4 text-[0.9375rem] text-[#86868b]">
          {emptyText}
        </p>
      ) : null}
      {cards.map((card) => (
        <CommandCenterCardView key={card.enrollmentId} card={card} />
      ))}
    </section>
  );
}

export default function CoachingCommandCenterPage() {
  const [logDate] = useState(coachingTodayLogDate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CommandCenterResponse | null>(null);
  const [filter, setFilter] = useState<CoachingCommandCenterFilter>("all");
  const [query, setQuery] = useState("");

  const loadCommandCenter = useCallback(
    async (options?: { soft?: boolean }) => {
      if (!options?.soft) {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await fetchCoachingWithMemberAuth(
          `/api/coaching/command-center?logDate=${encodeURIComponent(logDate)}`,
        );
        const body = (await response.json()) as CommandCenterResponse;
        if (!response.ok || !body.ok || !body.sections || !body.counts) {
          throw new Error(body.error ?? "無法載入陪跑指揮中心");
        }
        setPayload(body);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "無法載入陪跑指揮中心");
      } finally {
        if (!options?.soft) {
          setLoading(false);
        }
      }
    },
    [logDate],
  );

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  useSoftRefresh(() => loadCommandCenter({ soft: true }));

  const filteredAll = useMemo(() => {
    const cards = payload?.sections?.allActive ?? [];
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const searched = !q
      ? cards
      : cards.filter((card) => {
          if (card.customerDisplayName.toLowerCase().includes(q)) return true;
          if (card.goal?.toLowerCase().includes(q)) return true;
          if (card.customerPhone) {
            const phone = card.customerPhone.replace(/\D/g, "");
            if (digits.length >= 3 && phone.includes(digits)) return true;
            if (card.customerPhone.toLowerCase().includes(q)) return true;
          }
          return false;
        });
    if (filter === "all") return searched;
    return searched.filter((card) => card.assessment.commandCenterSection === filter);
  }, [payload, query, filter]);

  const counts = payload?.counts;
  const sections = payload?.sections;
  const searchActive = query.trim().length > 0 || filter !== "all";

  return (
    <PageShell backHref="/customers" backLabel="返回顧客" subtitle={`${logDate} · Asia/Taipei`} title="陪跑指揮中心">
      <CrmCard className="space-y-4">
        <p className="text-[0.9375rem] leading-relaxed text-[#636366]">今天誰需要我？</p>

        <label className="block">
          <span className="sr-only">搜尋學員</span>
          <input
            className="min-h-11 w-full rounded-[1rem] border border-[#e5e7eb] bg-white px-4 text-[0.9375rem] text-[#1d1d1f] outline-none ring-[var(--brand-primary)] focus:ring-2"
            placeholder="搜尋姓名或電話"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`min-h-10 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium ${
                  active ? "bg-[#1d1d1f] text-white" : "bg-[#f3f4f1] text-[#636366]"
                }`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                {counts
                  ? ` ${
                      item.id === "all"
                        ? counts.total
                        : item.id === "needs_attention"
                          ? counts.needsAttention
                          : item.id === "watch"
                            ? counts.watch
                            : item.id === "measurement_due"
                              ? counts.measurementDue
                              : counts.positiveProgress
                    }`
                  : ""}
              </button>
            );
          })}
        </div>
      </CrmCard>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="載入陪跑指揮中心">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-[1.25rem] bg-[#f0f1ef]" />
          ))}
        </div>
      ) : null}
      {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

      {!loading && !error && counts?.total === 0 ? (
        <CrmCard>
          <p className="text-[0.9375rem] text-[#86868b]">目前沒有進行中的陪跑學員。</p>
        </CrmCard>
      ) : null}

      {!loading && !error && searchActive ? (
        <section className="space-y-3">
          <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">搜尋結果</h2>
          {filteredAll.length === 0 ? (
            <p className="rounded-[1.25rem] border border-dashed border-[#e5e7eb] bg-white/70 px-4 py-4 text-[0.9375rem] text-[#86868b]">
              找不到符合條件的學員。
            </p>
          ) : (
            filteredAll.map((card) => <CommandCenterCardView key={card.enrollmentId} card={card} />)
          )}
        </section>
      ) : null}

      {!loading && !error && !searchActive && sections && counts ? (
        <div className="space-y-8">
          <SectionBlock
            title="需要處理"
            count={counts.needsAttention}
            emptyText="今天沒有需要立即處理的學員。"
            cards={sections.needsAttention}
          />
          <SectionBlock title="持續觀察" count={counts.watch} cards={sections.watch} />
          <SectionBlock title="建議安排回測" count={counts.measurementDue} cards={sections.measurementDue} />
          <SectionBlock title="進展良好" count={counts.positiveProgress} cards={sections.positiveProgress} />
          <SectionBlock title="全部陪跑中" count={counts.total} cards={sections.allActive} />
        </div>
      ) : null}
    </PageShell>
  );
}
