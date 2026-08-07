"use client";

import { AddMemberGoalModal } from "@/components/goal-center/AddMemberGoalModal";
import {
  CareerGoalCard,
  MemberGoalCard,
  UltimateGoalCard,
} from "@/components/goal-center/MemberGoalCard";
import { GoalCardView, GoalCenterSection } from "@/components/goal-center/GoalCardView";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { buildGoalCenter } from "@/lib/goal-center/build-goal-center";
import { buildGoalBlueprint } from "@/lib/member-goals/calculate-member-goal-progress";
import {
  addMemberGoal,
  deactivateMemberGoal,
  loadActiveMemberGoals,
} from "@/lib/member-goals/member-goal-storage";
import {
  formatDisplayDate,
  formatTimeGreeting,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import { createRetailRepository } from "@/lib/repositories/retail-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { GOAL_KPI_DEFINITIONS } from "@/types/goal-center";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LoadState = "loading" | "ready" | "error";

export default function GoalCenterPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [goalCenter, setGoalCenter] = useState<ReturnType<typeof buildGoalCenter> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const storage = useMemo(() => createLocalStorageAdapter(), []);

  const load = useCallback(() => {
    setLoadState("loading");
    try {
      void refreshKey;
      const metrics = loadMissionControlMetrics(undefined, storage);
      setGoalCenter(buildGoalCenter(metrics));
      setLoadState("ready");
    } catch {
      setGoalCenter(null);
      setLoadState("error");
    }
  }, [refreshKey, storage]);

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, [load]);

  const blueprint = useMemo(() => {
    if (loadState !== "ready") {
      return null;
    }
    try {
      const metrics = loadMissionControlMetrics(undefined, storage);
      const memberId = resolveAuthenticatedMemberId(storage);
      const goals = loadActiveMemberGoals(storage, memberId, metrics.yearMonth);
      const transactions = createRetailRepository(storage).getByMemberId(memberId);
      return buildGoalBlueprint(goals, {
        referenceDate: metrics.missions.referenceDate,
        yearMonth: metrics.yearMonth,
        vp: metrics.vp,
        monthlyChallenge: metrics.monthlyChallenge,
        promotionProgress: metrics.promotionProgress,
      }, transactions);
    } catch {
      return null;
    }
  }, [loadState, refreshKey, storage]);

  const handleAddGoal = useCallback(
    (input: {
      type: import("@/types/member-goal").MemberGoalType;
      targetValue: number;
      horizon: import("@/types/member-goal").MemberGoalHorizon;
      label?: string;
    }) => {
      const metrics = loadMissionControlMetrics(undefined, storage);
      addMemberGoal(storage, {
        ownerMemberId: resolveAuthenticatedMemberId(storage),
        type: input.type,
        targetValue: input.targetValue,
        horizon: input.horizon,
        yearMonth: metrics.yearMonth,
        label: input.label,
      });
      setRefreshKey((current) => current + 1);
    },
    [storage],
  );

  const handleRemoveGoal = useCallback(
    (goalId: string) => {
      deactivateMemberGoal(storage, goalId);
      setRefreshKey((current) => current + 1);
    },
    [storage],
  );

  if (loadState === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
        載入中…
      </div>
    );
  }

  if (loadState === "error" || !goalCenter || !blueprint) {
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
            設定長中短期目標，AI 會依你的藍圖引導今日一步。
          </p>
        </header>

        <GoalCenterSection title="目標藍圖">
          <UltimateGoalCard
            description={blueprint.ultimateGoal.description}
            title={blueprint.ultimateGoal.title}
          />
          {blueprint.careerGoal ? (
            <CareerGoalCard
              current={blueprint.careerGoal.current}
              description={blueprint.careerGoal.description}
              progressPercent={blueprint.careerGoal.progressPercent}
              remaining={blueprint.careerGoal.remaining}
              target={blueprint.careerGoal.target}
              title={blueprint.careerGoal.title}
              unit="位"
            />
          ) : null}
        </GoalCenterSection>

        <GoalCenterSection title="我的目標">
          <button
            className="w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[0.9375rem] font-semibold text-white"
            onClick={() => setAddModalOpen(true)}
            type="button"
          >
            + 新增目標（VP / 收入 / 新客）
          </button>
          {blueprint.memberGoals.length > 0 ? (
            blueprint.memberGoals.map((goal) => (
              <MemberGoalCard
                key={goal.goalId}
                goal={goal}
                onRemove={() => handleRemoveGoal(goal.goalId)}
              />
            ))
          ) : (
            <p className="text-[0.9375rem] text-[#86868b]">
              還沒有自訂目標。例如：本月 5000 VP、收入 10 萬、10 位新客人。
            </p>
          )}
        </GoalCenterSection>

        {goalCenter.goals.length > 0 ? (
          <GoalCenterSection title="規則引擎目標">
            {goalCenter.goals.map((goal) => (
              <GoalCardView key={goal.id} goal={goal} />
            ))}
          </GoalCenterSection>
        ) : null}

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

      <AddMemberGoalModal
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddGoal}
        open={addModalOpen}
      />
    </div>
  );
}
