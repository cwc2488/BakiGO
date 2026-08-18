import { calculatePoints } from "@/lib/business-engine/achievement/calculate-points";
import { calculateStreak } from "@/lib/business-engine/achievement/calculate-streak";
import { collectGamificationEvents } from "@/lib/business-engine/achievement/collect-events";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { getDownlineEvents, type DownlineCloudDataCache } from "@/lib/cloud/downline-cloud-data";
import { loadAllMembers } from "@/lib/members/member-service";
import {
  buildPointsLeaderboard,
  type LeaderboardPointsSnapshot,
} from "@/lib/points/build-points-leaderboard";
import { loadPointRedemptions } from "@/lib/repositories/point-redemption-repository";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { EntityId } from "@/types";
import type { Member } from "@/types/member";
import type { PointsLeaderboardResult } from "@/types/points";

export type { LeaderboardPointsSnapshot };

export type LeaderboardBoardResult = {
  weekly: PointsLeaderboardResult;
  monthly: PointsLeaderboardResult;
  viewerStreak: number;
};

function mergeEventsById(
  localEvents: BakiEvent[],
  downlineCache: DownlineCloudDataCache | undefined,
  memberIds: EntityId[],
): BakiEvent[] {
  const merged = new Map<string, BakiEvent>();
  for (const event of localEvents) {
    if (!event?.id) continue;
    merged.set(event.id, event);
  }
  for (const memberId of memberIds) {
    for (const event of getDownlineEvents(memberId, downlineCache)) {
      if (!event?.id) continue;
      merged.set(event.id, event);
    }
  }
  return [...merged.values()];
}

export function scoreMemberLeaderboardPoints(input: {
  memberId: EntityId;
  referenceDate: string;
  yearMonth: string;
  events: BakiEvent[];
  redemptions?: ReturnType<typeof loadPointRedemptions>;
}): LeaderboardPointsSnapshot {
  const projected = projectEventsForEngines(input.events);
  const activities = projected.activities.filter((activity) => activity.memberId === input.memberId);
  const transactions = projected.transactions
    .filter((transaction) => transaction.memberId === input.memberId)
    .map((transaction) => ({
      transactionDate: transaction.transactionDate,
      transactionTypeKey: transaction.transactionTypeKey ?? "",
      amount: transaction.amount,
    }));

  const events = collectGamificationEvents({
    memberId: input.memberId,
    activities,
    transactions,
  });

  const points = calculatePoints({
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    yearMonth: input.yearMonth,
    events,
    redemptions: input.redemptions,
  });

  const streak = calculateStreak(input.memberId, events, input.referenceDate);

  return {
    gamification: {
      points,
      streak,
    },
  };
}

export function buildLeaderboardBoards(input: {
  members: Member[];
  storage: StorageAdapter;
  downlineCache?: DownlineCloudDataCache;
  referenceDate: string;
  yearMonth: string;
  viewerMemberId: EntityId;
}): LeaderboardBoardResult {
  const localEvents = createEventRepository(input.storage).getAll();
  const memberIds = input.members.map((member) => member.id);
  const events = mergeEventsById(localEvents, input.downlineCache, memberIds);
  const redemptions = loadPointRedemptions(input.storage);

  const metricsByMemberId = new Map<EntityId, LeaderboardPointsSnapshot>(
    input.members.map((member) => [
      member.id,
      scoreMemberLeaderboardPoints({
        memberId: member.id,
        referenceDate: input.referenceDate,
        yearMonth: input.yearMonth,
        events,
        redemptions,
      }),
    ]),
  );

  const baseInput = {
    members: input.members,
    metricsByMemberId,
    yearMonth: input.yearMonth,
    referenceDate: input.referenceDate,
    viewerMemberId: input.viewerMemberId,
  };

  const weekly = buildPointsLeaderboard({ ...baseInput, period: "weekly" });
  const monthly = buildPointsLeaderboard({ ...baseInput, period: "monthly" });
  const viewerStreak = metricsByMemberId.get(input.viewerMemberId)?.gamification.streak.currentStreak ?? 0;

  return { weekly, monthly, viewerStreak };
}

export function loadLeaderboardBoards(
  storage: StorageAdapter,
  downlineCache: DownlineCloudDataCache | undefined,
  referenceDate: string,
  yearMonth: string,
  viewerMemberId: EntityId,
): LeaderboardBoardResult {
  const members = loadAllMembers(storage).filter((member) => member.status === "active");
  return buildLeaderboardBoards({
    members,
    storage,
    downlineCache,
    referenceDate,
    yearMonth,
    viewerMemberId,
  });
}
