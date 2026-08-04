import type { EntityId, ISODateString, YearMonth } from "@/types";
import type { MonthlyChallengeProgress } from "@/types/monthly-challenge";

/** Immutable activity log — source input for progress calculations. */
export interface ActivityEvent {
  id: string;
  memberId: EntityId;
  activityKey: string;
  activityDate: ISODateString;
  value?: number;
  /** Optional scope for retail house or other keyed targets. */
  retailHouseKey?: string;
}

export interface CalculateMonthlyProgressInput {
  memberId: EntityId;
  yearMonth: YearMonth;
  challenge: {
    id: EntityId;
    yearMonth: YearMonth;
    title: string;
    criteria: Array<{
      criterionKey: string;
      label: string;
      targetValue: number | null;
      unit?: string;
      weight?: number;
    }>;
  };
  activities: ActivityEvent[];
  transactions?: Array<{
    memberId: EntityId;
    transactionDate: ISODateString;
    transactionTypeKey: string;
    amount: number;
  }>;
  /** VP transactions from VP Rule Engine — Challenge reads Monthly VP only. */
  vpTransactions?: import("@/types/vp").VPTransaction[];
  computedAt?: Date;
}

export interface CalculateRetailHouseInput {
  memberId: EntityId;
  yearMonth: YearMonth;
  retailHouseKeys: string[];
  activities: ActivityEvent[];
  transactions: Array<{
    memberId: EntityId;
    transactionDate: ISODateString;
    amount: number;
    currencyCode: string;
    retailHouseKey?: string;
  }>;
}

export interface CalculateMapProgressInput {
  memberId: EntityId;
  yearMonth: YearMonth;
  members: Array<{
    id: EntityId;
    rankKey: string;
    sponsorMemberId?: EntityId;
  }>;
  activities: ActivityEvent[];
}

export interface CalculateRankProgressInput {
  memberId: EntityId;
  targetRankKey: string;
  yearMonth: YearMonth;
  activities: ActivityEvent[];
}

export interface CalculateLeaderboardInput {
  yearMonth: YearMonth;
  members: Array<{
    id: EntityId;
    displayName: string;
    nickname?: string;
    rankKey: string;
  }>;
  activities: ActivityEvent[];
  transactions: Array<{
    memberId: EntityId;
    transactionDate: ISODateString;
    amount: number;
  }>;
  challenges: Array<{
    id: EntityId;
    yearMonth: YearMonth;
    title: string;
    criteria: Array<{
      criterionKey: string;
      label: string;
      targetValue: number;
      weight?: number;
    }>;
  }>;
  metricKey?: string;
  limit?: number;
}

export interface CalculateLeaderForestInput {
  leaderMemberId: EntityId;
  yearMonth: YearMonth;
  priorYearMonth: YearMonth;
  members: Array<{
    id: EntityId;
    displayName: string;
    nickname?: string;
    rankKey: string;
    sponsorMemberId?: EntityId;
  }>;
  activities: ActivityEvent[];
  challenges: Array<{
    id: EntityId;
    yearMonth: YearMonth;
    title: string;
    criteria: Array<{
      criterionKey: string;
      label: string;
      targetValue: number;
      weight?: number;
    }>;
  }>;
}

export interface RetailHouseResult {
  memberId: EntityId;
  yearMonth: YearMonth;
  houses: Array<{
    retailHouseKey: string;
    updateCount: number;
    transactionCount: number;
    totalAmount: number;
    currencyCode: string | null;
  }>;
}

export interface MapLineStatus {
  lineIndex: number;
  downlineMemberId: EntityId | null;
  isActive: boolean;
}

export interface MapProgressResult {
  memberId: EntityId;
  yearMonth: YearMonth;
  totalLines: number | null;
  activeLines: number;
  progressPercent: number | null;
  lines: MapLineStatus[];
}

export interface RankCriterionProgress {
  criterionKey: string;
  currentValue: number;
  targetValue: number;
  progressPercent: number;
  weight: number;
}

export interface RankProgressResult {
  memberId: EntityId;
  targetRankKey: string;
  label: string;
  overallProgressPercent: number;
  isQualified: boolean;
  criteria: RankCriterionProgress[];
}

export interface LeaderboardEntry {
  rank: number;
  memberId: EntityId;
  displayName: string;
  nickname?: string;
  rankKey: string;
  score: number;
  metricKey: string;
}

export interface LeaderboardResult {
  yearMonth: YearMonth;
  metricKey: string;
  entries: LeaderboardEntry[];
}

export type LeaderSignal = "needs_help" | "improving" | "falling_behind" | "deserves_recognition";

export interface LeaderForestMemberStatus {
  memberId: EntityId;
  displayName: string;
  nickname?: string;
  rankKey: string;
  signal: LeaderSignal;
  currentActivityCount: number;
  priorActivityCount: number;
  monthlyChallengeProgressPercent: number;
}

export interface LeaderForestLine {
  lineIndex: number;
  rootMemberId: EntityId | null;
  downlineCount: number;
  activeLines: number;
  members: LeaderForestMemberStatus[];
}

export interface LeaderForestResult {
  leaderMemberId: EntityId;
  yearMonth: YearMonth;
  totalDownlineCount: number;
  directLines: LeaderForestLine[];
  signals: {
    needsHelp: LeaderForestMemberStatus[];
    improving: LeaderForestMemberStatus[];
    fallingBehind: LeaderForestMemberStatus[];
    deservesRecognition: LeaderForestMemberStatus[];
  };
}

export interface CalculateVpInput {
  memberId: EntityId;
  yearMonth: YearMonth;
  transactions: Array<{
    memberId: EntityId;
    transactionDate: ISODateString;
    transactionTypeKey: string;
    amount: number;
  }>;
}

export interface VpTypeTotal {
  transactionTypeKey: string;
  count: number;
  totalVp: number;
}

export interface VpResult {
  memberId: EntityId;
  yearMonth: YearMonth;
  totalVp: number;
  byType: VpTypeTotal[];
}

export type { MonthlyChallengeProgress };
