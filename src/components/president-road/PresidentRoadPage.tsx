"use client";

import { ProgressBar } from "@/components/home/ui";
import { APP_IDS } from "@/lib/config/app-config";
import { loadMemberById } from "@/lib/members/member-service";
import { loadMissionControlMetrics } from "@/lib/mission-control/format";
import {
  buildPresidentRoad,
  resolvePresidentRoadRankKey,
} from "@/lib/president-road/president-road-selectors";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { PresidentRoadNode } from "@/types/president-road";
import type { Priority } from "@/types/president-ai";
import { PageShell } from "@/components/ui/PageShell";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageStates";
import { APP_ICON } from "@/lib/ui/app-icons";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";
import { useCallback, useEffect, useState } from "react";

type LoadState = "loading" | "ready" | "error";

function RoadNodeCard({ node }: { node: PresidentRoadNode }) {
  const statusColor =
    node.status === "completed"
      ? "#30d158"
      : node.status === "in_progress"
        ? "#77b539"
        : "#c7c7cc";

  return (
    <article className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-6 py-6 sm:px-8 sm:py-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-[#86868b]">
            {node.statusSymbol} {node.statusLabel}
          </p>
          <h2 className="mt-2 text-[2rem] font-semibold tracking-tight text-[#1d1d1f] sm:text-[2.25rem]">
            {node.title}
          </h2>
        </div>
        {node.progressPercent !== null ? (
          <p className="text-[1.5rem] font-semibold text-[#1d1d1f]">{node.progressPercent}%</p>
        ) : null}
      </div>

      {node.progressPercent !== null ? (
        <div className="mt-5">
          <ProgressBar color={statusColor} height="h-3" percent={node.progressPercent} />
        </div>
      ) : null}

      {node.lines.length > 0 ? (
        <dl className="mt-6 space-y-4">
          {node.lines.map((line) => (
            <div key={`${node.key}-${line.label}`} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
              <dt className="text-[0.8125rem] font-medium text-[#86868b]">{line.label}</dt>
              <dd className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">{line.value}</dd>
              {line.remaining ? (
                <dd className="mt-1 text-[0.9375rem] font-medium text-[#ff375f]">{line.remaining}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}

      {node.remainingSummary ? (
        <p className="mt-4 text-[1rem] font-medium text-[#636366]">{node.remainingSummary}</p>
      ) : null}
    </article>
  );
}

function PriorityCard({ priority }: { priority: Priority }) {
  return (
    <article className="rounded-2xl bg-[var(--brand-bg)] px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">{priority.title}</p>
        <p className="shrink-0 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]">
          {priority.score}%
        </p>
      </div>
      <div className="mt-3">
        <ProgressBar color="#77b539" percent={priority.score} />
      </div>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#86868b]">{priority.description}</p>
    </article>
  );
}

export default function PresidentRoadPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [road, setRoad] = useState<ReturnType<typeof buildPresidentRoad> | null>(null);

  const load = useCallback(() => {
    setLoadState("loading");
    try {
      const storage = createLocalStorageAdapter();
      const metrics = loadMissionControlMetrics(APP_IDS.currentMemberId, storage);
      const member = loadMemberById(APP_IDS.currentMemberId, storage);
      const rankKey = resolvePresidentRoadRankKey(member?.rankKey ?? "new_member", metrics);
      setRoad(buildPresidentRoad(metrics, rankKey));
      setLoadState("ready");
    } catch {
      setRoad(null);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, [load]);

  if (loadState === "loading") {
    return <PageLoadingState message="載入升級路線…" />;
  }

  if (loadState === "error" || !road) {
    return (
      <PageErrorState message="無法載入升級路線" onRetry={load} title="載入失敗" />
    );
  }

  return (
    <PageShell
      subtitle="從會員到總裁組的完整路線，依業務規則顯示你的進度。"
      title={PARTNER_LABELS.upgradePath}
      titleIcon={APP_ICON.page.presidentRoad}
      variant="plain"
    >
        <section className="rounded-[1.75rem] bg-[var(--brand-bg)] px-6 py-8 sm:px-8 sm:py-10">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-[#86868b]">
            總裁進度
          </p>
          <p className="mt-3 text-[4rem] font-semibold leading-none tracking-tight text-[#1d1d1f]">
            {road.presidentProgressPercent}%
          </p>
          {road.distanceToPresidentSummary ? (
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#636366]">
              {road.distanceToPresidentSummary}
            </p>
          ) : null}
          <div className="mt-6">
            <ProgressBar color="#1d1d1f" height="h-3.5" percent={road.presidentProgressPercent} />
          </div>
        </section>

        <section className="space-y-5">
          {road.nodes.map((node, index) => (
            <div key={node.key} className="space-y-5">
              {index > 0 ? (
                <div aria-hidden className="flex justify-center py-1">
                  <span className="text-[1.25rem] text-[#d1d1d6]">↓</span>
                </div>
              ) : null}
              <RoadNodeCard node={node} />
            </div>
          ))}
        </section>

        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-6 py-7 sm:px-8">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-[#86868b]">
            {PARTNER_LABELS.todaySuggestions}
          </p>
          <p className="mt-2 text-[1.0625rem] font-medium text-[#636366]">
            {road.presidentAI.focusMode.label}
          </p>
          {road.presidentAI.reasoning[0] ? (
            <p className="mt-3 text-[1rem] leading-relaxed text-[#1d1d1f]">
              {road.presidentAI.reasoning[0]}
            </p>
          ) : null}
          <div className="mt-5 space-y-3">
            {road.presidentAI.topPriorities.slice(0, 3).map((priority) => (
              <PriorityCard key={priority.sourceKey} priority={priority} />
            ))}
          </div>
        </section>

        <section className="rounded-[1.75rem] bg-[#1d1d1f] px-6 py-7 text-white sm:px-8">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-white/60">
            今日下一步
          </p>
          {road.todayNextStep ? (
            <>
              <p className="mt-4 text-[1.5rem] font-semibold leading-snug">
                {road.todayNextStep.title}
              </p>
              <p className="mt-3 text-[1rem] leading-relaxed text-white/75">
                {road.todayNextStep.description}
              </p>
            </>
          ) : (
            <p className="mt-4 text-[1rem] text-white/75">今日沒有下一個步驟</p>
          )}
        </section>
    </PageShell>
  );
}
