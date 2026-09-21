/** Domain types for 問卷開發 V1. */

export type QuestionnaireSource = "onsite" | "online";

export type QuestionnaireContactType = "line" | "instagram" | "phone";

export type QuestionnaireInterestLevel = "high" | "medium" | "low";

export type QuestionnaireLeadStatus =
  | "new"
  | "contacted"
  | "invitation_started"
  | "completed"
  | "paused";

export type QuestionnaireExerciseFrequency =
  | "almost_none"
  | "once"
  | "two_to_three"
  | "four_plus";

export type QuestionnaireShareLinkView = {
  shareCode: string;
  href: string;
  display: string;
  previewPath: string;
  onsiteHref: string;
};

export type QuestionnaireLeadSummary = {
  id: string;
  displayName: string;
  primaryNeed: string | null;
  needTags: string[];
  interestLevel: QuestionnaireInterestLevel | null;
  usesSupplements: boolean | null;
  status: QuestionnaireLeadStatus;
  lastResponseAt: string;
  lastSource: QuestionnaireSource;
};

export type QuestionnaireResponseView = {
  id: string;
  source: QuestionnaireSource;
  improvementAreas: string[];
  improvementOther: string | null;
  bodySatisfactionScore: number;
  weeklyExerciseFrequency: QuestionnaireExerciseFrequency;
  usesSupplements: boolean;
  supplementDetails: string | null;
  priorityImprovement: string;
  furtherUnderstandingInterest: QuestionnaireInterestLevel;
  displayName: string;
  contactType: QuestionnaireContactType;
  contactValue: string;
  consentAcceptedAt: string;
  submittedAt: string;
};

export type QuestionnaireLeadDetail = QuestionnaireLeadSummary & {
  contactType: QuestionnaireContactType;
  contactValue: string;
  supplementDetails: string | null;
  firstSource: QuestionnaireSource;
  firstResponseAt: string;
  responseCount: number;
  fishCreditedAt: string | null;
  invitationStartedAt: string | null;
  invitationCreditedAt: string | null;
  latestResponse: QuestionnaireResponseView | null;
  recentResponses: QuestionnaireResponseView[];
};

export type QuestionnaireDashboard = {
  todayValidNewLeads: number;
  todayTarget: number;
  todayProgressPercent: number;
  todayOnsite: number;
  todayOnline: number;
  todayFishCredited: number;
  weekValidNewLeads: number;
  invitationStartedCount: number;
  totalLeadCount: number;
  share: QuestionnaireShareLinkView;
  recentLeads: QuestionnaireLeadSummary[];
};

export type QuestionnairePublicConfig = {
  valid: true;
  title: string;
  description: string;
  shareCode: string;
  source: QuestionnaireSource;
  partnerDisplayName: string | null;
};

export type QuestionnairePublicSubmitResult = {
  ok: true;
  isNewLead: boolean;
};
