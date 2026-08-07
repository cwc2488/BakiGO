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
import { buildRetailPipelineSnapshot } from "@/lib/retail-pipeline/pipeline-selectors";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { PageShell } from "@/components/ui/PageShell";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageStates";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";
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
      const pipeline = buildRetailPipelineSnapshot(memberId, storage);
      return buildGoalBlueprint(goals, {
        referenceDate: metrics.missions.referenceDate,
        yearMonth: metrics.yearMonth,
        vp: metrics.vp,
        monthlyChallenge: metrics.monthlyChallenge,
        promotionProgress: metrics.promotionProgress,
      }, transactions, pipeline);
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
    return <PageLoadingState />;
  }

  if (loadState === "error" || !goalCenter || !blueprint) {
    return (
      <PageErrorState message="無法載入目標中心" onRetry={load} title="載入失敗" />
    );
  }

  const goalsByKpi = GOAL_KPI_DEFINITIONS.map((kpi) => ({
    ...kpi,
    goals: goalCenter.goals.filter((goal) => goal.kpiCategory === kpi.key),
  }));

  return (
    <>
      <PageShell
        headerExtra={
          <Link
            className="rounded-full bg-[var(--brand-primary-muted)] px-3 py-1.5 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
            href="/president-road"
          >
            {PARTNER_LABELS.upgradePathShort}
          </Link>
        }
        subtitle="設定目標，系統會依進度引導你今天的下一步。"
        title="目標中心"
      >
        <div className="home-section">
          <MemberNameWithAvatar
            avatarUrl={getMemberAvatarUrl()}
            name={getMemberDisplayName()}
            nameClassName="text-[1.25rem] font-semibold text-[#1d1d1f]"
            size="sm"
            subtitle={`${formatTimeGreeting()} · ${formatDisplayDate(goalCenter.referenceDate)}`}
            subtitleClassName="text-[0.875rem] text-[#86868b]"
          />
        </div>

        <GoalCenterSection title={PARTNER_LABELS.longTermDirection}>
          <UltimateGoalCard
            description={blueprint.ultimateGoal.description}
            title={blueprint.ultimateGoal.title}
          />
          {blueprint.careerGoal ? (
            <CareerGoalCard
              actionSteps={blueprint.careerGoal.actionSteps}
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

        <GoalCenterSection title={PARTNER_LABELS.myGoals}>
          <button
            className="w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[0.9375rem] font-semibold text-white"
            onClick={() => setAddModalOpen(true)}
            type="button"
          >
            + {PARTNER_LABELS.addGoal}（VP / 收入 / 新客）
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
          goalsByKpi.map((group) =>
            group.goals.length > 0 ? (
              <GoalCenterSection key={group.key} title={group.label}>
                {group.goals.map((goal) => (
                  <GoalCardView key={goal.id} goal={goal} />
                ))}
              </GoalCenterSection>
            ) : null,
          )
        ) : null}
      </PageShell>

      <AddMemberGoalModal
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddGoal}
        open={addModalOpen}
      />
    </>
  );
}
