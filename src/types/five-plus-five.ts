/** Domain types for 5＋5 行動 V1 (+ 086 questionnaire components). */

export type FivePlusFiveReportRow = {
  id: string;
  memberId: string;
  reportDate: string;
  /** Authoritative total = manual + questionnaire. */
  fishPoolCount: number;
  invitationFiveStepsCount: number;
  manualFishPoolCount: number;
  questionnaireFishPoolCount: number;
  manualInvitationFiveStepsCount: number;
  questionnaireInvitationFiveStepsCount: number;
  /** True only after member presses 完成今日回報. */
  hasUserSubmitted: boolean;
  userSubmittedAt: string | null;
  firstSubmittedAt: string;
  updatedAt: string;
  submittedOnTime: boolean;
  createdAt: string;
};

export type FivePlusFiveReportInput = {
  reportDate: string;
  /** Preferred — edits only the manual component. */
  manualFishPoolCount?: number;
  manualInvitationFiveStepsCount?: number;
  /** Legacy client keys — treated as manual counts. */
  fishPoolCount?: number;
  invitationFiveStepsCount?: number;
};

export type FivePlusFiveDayStatus =
  | "not_yet_reported" // today, before deadline, no user submit
  | "overdue_unreported" // past day, no user submit
  | "reported_fish_met" // today user-submitted, fish >= target
  | "reported_fish_unmet" // today user-submitted, fish < target
  | "backfill" // past day later filled (submitted_on_time = false)
  | "on_time_past"; // past day with on-time user submit

export type FivePlusFivePeriodTotals = {
  fishPool: number;
  invitationFiveSteps: number;
};

export type FivePlusFiveMyStats = {
  today: FivePlusFivePeriodTotals & {
    fishTarget: number;
    fishMet: boolean;
    /** True only when has_user_submitted — questionnaire-only rows stay false. */
    hasReport: boolean;
    status: FivePlusFiveDayStatus;
    submittedOnTime: boolean | null;
    firstSubmittedAt: string | null;
    manualFishPool: number;
    questionnaireFishPool: number;
    manualInvitationFiveSteps: number;
    questionnaireInvitationFiveSteps: number;
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
