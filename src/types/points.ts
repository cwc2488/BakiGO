import type { EntityId, ISODateString, Timestamp, YearMonth } from "./common";

export type LeaderboardPeriod = "monthly" | "weekly";

export const LEADERBOARD_DISPLAY_LIMITS: Record<LeaderboardPeriod, number> = {
  monthly: 10,
  weekly: 5,
};

/** 上線替下線兌換獎品時的永久紀錄 */
export interface PointRedemption {
  id: EntityId;
  /** 被扣積分的下線 */
  memberId: EntityId;
  /** 執行兌換的上線 */
  redeemedByMemberId: EntityId;
  points: number;
  prizeDescription: string;
  note?: string;
  redeemedAt: Timestamp;
  yearMonth: YearMonth;
}

export interface PointsLeaderboardEntry {
  rank: number;
  memberId: EntityId;
  displayName: string;
  nickname?: string;
  /** Points counted for this leaderboard period. */
  periodPoints: number;
  monthlyPoints: number;
  weeklyPoints: number;
  lifetimePoints: number;
  availablePoints: number;
  streakMultiplier: number;
  currentStreak: number;
}

export interface PointsLeaderboardResult {
  period: LeaderboardPeriod;
  yearMonth: YearMonth;
  weekStartDate?: ISODateString;
  weekEndDate?: ISODateString;
  referenceDate: ISODateString;
  entries: PointsLeaderboardEntry[];
  viewerRank: number | null;
  viewerEntry: PointsLeaderboardEntry | null;
  displayLimit: number;
}
