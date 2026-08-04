import type { BusinessRulesConfig } from "./rules";
import { DEFAULT_BUSINESS_RULES } from "./rules";
import { calculateMapProgress } from "./calculate-map-progress";
import { calculateMonthlyProgress } from "./calculate-monthly-progress";
import type {
  CalculateLeaderForestInput,
  LeaderForestMemberStatus,
  LeaderForestResult,
  LeaderSignal,
} from "./types";
import {
  collectDownlineIds,
  daysSinceLastActivity,
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
  getDirectDownline,
  resolveMetricValue,
} from "./utils";

function classifyMemberSignal(
  memberId: string,
  input: CalculateLeaderForestInput,
  rules: BusinessRulesConfig,
): LeaderForestMemberStatus {
  const member = input.members.find((item) => item.id === memberId);
  if (!member) {
    throw new Error(`Member not found: ${memberId}`);
  }

  const memberActivities = filterActivitiesByMember(input.activities, memberId);
  const currentActivities = filterActivitiesByYearMonth(memberActivities, input.yearMonth);
  const priorActivities = filterActivitiesByYearMonth(memberActivities, input.priorYearMonth);

  const challenge = input.challenges.find((item) => item.yearMonth === input.yearMonth);
  const monthlyChallengeProgressPercent = challenge
    ? calculateMonthlyProgress({
        memberId,
        yearMonth: input.yearMonth,
        challenge,
        activities: input.activities,
      }).overallProgressPercent
    : 0;

  const currentActivityCount = currentActivities.length;
  const priorActivityCount = priorActivities.length;
  const periodChangePercent = resolveMetricValue(currentActivityCount, priorActivityCount);

  const referenceDate = `${input.yearMonth}-28`;
  const inactivityDays = daysSinceLastActivity(memberActivities, referenceDate);

  let signal: LeaderSignal = "needs_help";

  if (monthlyChallengeProgressPercent >= rules.leaderForest.recognitionMinProgressPercent) {
    signal = "deserves_recognition";
  } else if (
    periodChangePercent !== null &&
    periodChangePercent >= rules.leaderForest.improvingPercentThreshold
  ) {
    signal = "improving";
  } else if (
    periodChangePercent !== null &&
    periodChangePercent <= rules.leaderForest.fallingBehindPercentThreshold
  ) {
    signal = "falling_behind";
  } else if (
    inactivityDays !== null &&
    inactivityDays <= rules.leaderForest.inactiveDaysThreshold
  ) {
    signal = "improving";
  }

  if (
    currentActivityCount === 0 ||
    (inactivityDays !== null && inactivityDays > rules.leaderForest.inactiveDaysThreshold)
  ) {
    signal = "needs_help";
  }

  return {
    memberId: member.id,
    displayName: member.displayName,
    nickname: member.nickname,
    rankKey: member.rankKey,
    signal,
    currentActivityCount,
    priorActivityCount,
    monthlyChallengeProgressPercent,
  };
}

/**
 * Builds a leader's downline forest with coaching signals.
 */
export function calculateLeaderForest(
  input: CalculateLeaderForestInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): LeaderForestResult {
  const downlineIds = collectDownlineIds(input.members, input.leaderMemberId);
  const directReports = getDirectDownline(input.members, input.leaderMemberId);

  const directLines = directReports.map((directReport, lineIndex) => {
    const lineDownlineIds = collectDownlineIds(input.members, directReport.id);
    lineDownlineIds.add(directReport.id);

    const members = Array.from(lineDownlineIds).map((memberId) =>
      classifyMemberSignal(memberId, input, rules),
    );

    const mapProgress = calculateMapProgress(
      {
        memberId: input.leaderMemberId,
        yearMonth: input.yearMonth,
        members: input.members,
        activities: input.activities,
      },
      rules,
    );

    const lineStatus = mapProgress.lines[lineIndex];

    return {
      lineIndex,
      rootMemberId: directReport.id,
      downlineCount: lineDownlineIds.size,
      activeLines: lineStatus?.isActive ? 1 : 0,
      members,
    };
  });

  const allStatuses = Array.from(downlineIds).map((memberId) =>
    classifyMemberSignal(memberId, input, rules),
  );

  return {
    leaderMemberId: input.leaderMemberId,
    yearMonth: input.yearMonth,
    totalDownlineCount: downlineIds.size,
    directLines,
    signals: {
      needsHelp: allStatuses.filter((status) => status.signal === "needs_help"),
      improving: allStatuses.filter((status) => status.signal === "improving"),
      fallingBehind: allStatuses.filter((status) => status.signal === "falling_behind"),
      deservesRecognition: allStatuses.filter(
        (status) => status.signal === "deserves_recognition",
      ),
    },
  };
}
