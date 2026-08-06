"use client";

import {
  formatDisplayDate,
  formatTimeGreeting,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { buildGoalCenter } from "@/lib/goal-center/build-goal-center";
import { GOAL_KPI_DEFINITIONS } from "@/types/goal-center";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GoalCardView, GoalCenterSection } from "./GoalCardView";

type LoadState = "loading" | "ready" | "error";

export default function GoalCenterPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [goalCenter, setGoalCenter] = useState<ReturnType<typeof buildGoalCenter> | null>(null);

  const load = useCallback(() => {
    setLoadState("loading");
    try {
      const metrics = loadMissionControlMetrics();
      setGoalCenter(buildGoalCenter(metrics));
      setLoadState("ready");
    } catch {
      setGoalCenter(null);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, [load]);

  if (loadState === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
        載入中…
      </div>
    );
  }

  if (loadState === "error" || !goalCenter) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--brand-bg)] px-6">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">無法載入目標中心</p>
        <button className="text-[var(--brand-primary-dark)]" onClick={load} type="button">
          重新載入
        </button>
      </div>
    );
  }

  const goalsByKpi = GOAL_KPI_DEFINITIONS.map((kpi) => ({
    ...kpi,
    goals: goalCenter.goals.filter((goal) => goal.kpiCategory === kpi.key),
  }));

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f0faf3_0%,#f5faf6_48%,#e8f8ee_100%)]">
      <main className="home-container flex flex-col gap-5 pb-24 pt-10 sm:pt-12">
        <header className="home-section space-y-3">
          <Link className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]" href="/">
            ← 返回首頁
          </Link>
          <p className="text-[2rem] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
            {formatDisplayDate(goalCenter.referenceDate)}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MemberNameWithAvatar
              avatarUrl={getMemberAvatarUrl()}
              name={getMemberDisplayName()}
              nameClassName="text-[1.75rem] font-semibold leading-snug tracking-tight text-[#1d1d1f]"
              size="md"
              subtitle={`${formatTimeGreeting()} · 目標中心`}
              subtitleClassName="text-[0.9375rem] font-medium text-[#86868b]"
              variant="hero"
            />
          </div>
          <p className="text-[1rem] leading-relaxed text-[#636366]">
            距離目標還差多少 — 所有 KPI 皆來自業務規則。
          </p>
        </header>

        {goalCenter.goals.length > 0 ? (
          <GoalCenterSection title="全部目標">
            {goalCenter.goals.map((goal) => (
              <GoalCardView key={goal.id} goal={goal} />
            ))}
          </GoalCenterSection>
        ) : (
          <GoalCenterSection title="全部目標">
            <p className="text-[0.9375rem] text-[#86868b]">
              目前沒有進行中的目標。完成成交或活動後，目標中心會顯示距離各 KPI 的差距。
            </p>
          </GoalCenterSection>
        )}

        {goalsByKpi.map((group) =>
          group.goals.length > 0 ? (
            <GoalCenterSection key={group.key} title={group.label}>
              {group.goals.map((goal) => (
                <GoalCardView key={goal.id} goal={goal} />
              ))}
            </GoalCenterSection>
          ) : null,
        )}
      </main>
    </div>
  );
}
