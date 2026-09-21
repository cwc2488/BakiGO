/** Domain types for 5＋5 行動 V1. */

export type FivePlusFiveReportRow = {
  id: string;
  memberId: string;
  reportDate: string;
  fishPoolCount: number;
  invitationFiveStepsCount: number;
  firstSubmittedAt: string;
  updatedAt: string;
  submittedOnTime: boolean;
  createdAt: string;
};

export type FivePlusFiveReportInput = {
  reportDate: string;
  fishPoolCount: number;
  invitationFiveStepsCount: number;
};

export type FivePlusFiveDayStatus =
  | "not_yet_reported" // today, before deadline, no report
  | "overdue_unreported" // past day, no report
  | "reported_fish_met" // today reported, fish >= target
  | "reported_fish_unmet" // today reported, fish < target
  | "backfill" // past day later filled (submitted_on_time = false)
  | "on_time_past"; // past day with on-time report

export type FivePlusFivePeriodTotals = {
  fishPool: number;
  invitationFiveSteps: number;
};

export type FivePlusFiveMyStats = {
  today: FivePlusFivePeriodTotals & {
    fishTarget: number;
    fishMet: boolean;
    hasReport: boolean;
    status: FivePlusFiveDayStatus;
    submittedOnTime: boolean | null;
    firstSubmittedAt: string | null;
  };
  week: FivePlusFivePeriodTotals & {
    fishTarget: number;
    invitationTarget: number;
    fishMet: boolean;
    invitationMet: boolean;
    weekStart: string;
    weekEnd: string;
  };
  month: FivePlusFivePeriodTotals;
  history: FivePlusFivePeriodTotals;
  streakOnTimeDays: number;
  monthOnTimeRatePercent: number;
  monthOnTimeDays: number;
  monthElapsedDays: number;
  targets: {
    fishPoolDaily: number;
    fishPoolWeekly: number;
    invitationFiveStepsWeekly: number;
  };
  todayDate: string;
  memberName: string;
};

export type FivePlusFiveOrgMemberStatus = {
  memberId: string;
  memberName: string;
  generation: number; // 1 = 直推
  todayFish: number | null;
  todayInvitation: number | null;
  weekInvitation: number;
  weekFish: number;
  hasTodayReport: boolean;
  todayFishMet: boolean;
  weekInvitationMet: boolean;
  todayStatus: FivePlusFiveDayStatus;
  submittedOnTime: boolean | null;
};

export type FivePlusFiveOrgSummary = {
  todayDate: string;
  totalMembers: number;
  reportedToday: number;
  fishMetToday: number;
  invitationMetThisWeek: number;
  notReportedToday: number;
  members: FivePlusFiveOrgMemberStatus[];
  targets: {
    fishPoolDaily: number;
    fishPoolWeekly: number;
    invitationFiveStepsWeekly: number;
  };
};

export type FivePlusFiveMemberDetail = {
  memberId: string;
  memberName: string;
  generation: number | null;
  stats: FivePlusFiveMyStats;
  recentDays: Array<{
    date: string;
    fishPoolCount: number | null;
    invitationFiveStepsCount: number | null;
    status: FivePlusFiveDayStatus;
    submittedOnTime: boolean | null;
    firstSubmittedAt: string | null;
  }>;
  readOnly: boolean;
};
