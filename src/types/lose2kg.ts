/** Types for 再瘦2公斤 (lose2kg) — independent admin activity system. */

export type Lose2kgPeriodStatus = "draft" | "active" | "completed";
export type Lose2kgParticipantStatus = "active" | "withdrawn" | "disqualified";
export type Lose2kgPrizeStatus = "pending" | "drawn" | "void";
export type Lose2kgDrawStatus = "completed" | "void";
export type Lose2kgTempDrawStatus = "pending" | "completed" | "void";

export type Lose2kgTicketEventType =
  | "weight_milestone_awarded"
  | "weight_ticket_revoked"
  | "manual_add"
  | "manual_remove"
  | "correction"
  | "questionnaire_completed";

export type Lose2kgMeasurementSlot = 1 | 2 | 3 | 4;

export type Lose2kgPeriod = {
  id: string;
  name: string;
  status: Lose2kgPeriodStatus;
  startDate: string | null;
  measurementDates: [string, string, string, string];
  /** Live/public dashboard token (plaintext only when freshly minted). */
  publicToken: string | null;
  publicEnabled: boolean;
  /** Staff workstation token (plaintext only when freshly minted). */
  staffToken?: string | null;
  hasStaffPassword?: boolean;
  publicShowWeights?: boolean;
  liveDrawStatus?: "idle" | "drawing" | "revealed";
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type Lose2kgParticipant = {
  id: string;
  periodId: string;
  name: string;
  publicDisplayName: string;
  status: Lose2kgParticipantStatus;
  note: string | null;
  sortOrder: number;
  weightTicketBalance: number;
  activityTicketBalance: number;
  totalTicketBalance: number;
  currentWeightChangePct: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Lose2kgMeasurement = {
  id: string;
  periodId: string;
  participantId: string;
  slot: Lose2kgMeasurementSlot;
  weightKg: number | null;
  measuredAt: string | null;
  weightChangePct: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Lose2kgTicketEvent = {
  id: string;
  periodId: string;
  participantId: string;
  eventType: Lose2kgTicketEventType;
  delta: number;
  reason: string | null;
  relatedMeasurementId: string | null;
  relatedMilestone: number | null;
  createdByMemberId: string | null;
  createdAt: string;
};

export type Lose2kgWeightMilestone = {
  participantId: string;
  periodId: string;
  milestonePercent: number;
  ticketState: "active" | "revoked";
  awardedAt: string;
  revokedAt: string | null;
};

export type Lose2kgPrize = {
  id: string;
  periodId: string;
  name: string;
  winnerCount: number;
  sortOrder: number;
  status: Lose2kgPrizeStatus;
  allowDuplicateWinners: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Lose2kgDraw = {
  id: string;
  periodId: string;
  prizeId: string;
  status: Lose2kgDrawStatus;
  winnerParticipantId: string | null;
  winnerNameSnapshot: string | null;
  winnerTicketCount: number | null;
  totalPoolTicketCount: number | null;
  randomMetadata: Record<string, unknown> | null;
  drawnByMemberId: string | null;
  drawnAt: string | null;
  voidedByMemberId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  idempotencyKey: string;
  createdAt: string;
};

export type Lose2kgTempDrawSession = {
  id: string;
  periodId: string;
  status: Lose2kgTempDrawStatus;
  publicToken: string;
  winnerParticipantId: string | null;
  winnerNameSnapshot: string | null;
  entryCount: number | null;
  randomMetadata: Record<string, unknown> | null;
  createdByMemberId: string | null;
  drawnAt: string | null;
  voidedByMemberId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Lose2kgTempDrawEntry = {
  id: string;
  sessionId: string;
  participantId: string;
  participantNameSnapshot: string;
  present: boolean;
};

export type Lose2kgPublicTicketRow = {
  publicDisplayName: string;
  totalTickets: number;
};

export type Lose2kgPublicTicketPage = {
  periodName: string;
  measurementDates: [string, string, string, string];
  participants: Lose2kgPublicTicketRow[];
};

export type Lose2kgPublicTempDrawPage = {
  periodName: string;
  status: Lose2kgTempDrawStatus;
  entryCount: number;
  presentNames: string[];
  winnerName: string | null;
};

export type Lose2kgLiveLeaderboardRow = {
  rank: number;
  participantId: string;
  publicDisplayName: string;
  totalTickets: number;
  weightTickets: number;
  extraTickets: number;
  weightChangePct?: number | null;
};

export type Lose2kgLiveDashboard = {
  periodName: string;
  status: Lose2kgPeriodStatus;
  measurementDates: [string, string, string, string];
  currentSlot: Lose2kgMeasurementSlot;
  nextMeasurementDate: string | null;
  participantCount: number;
  totalTickets: number;
  maxTickets: number;
  publicShowWeights: boolean;
  leaderboard: Lose2kgLiveLeaderboardRow[];
};

/** Week-4 outcomes questionnaire (lose2kg-only). */
export type Lose2kgBiggestChange =
  | "weight"
  | "body_composition"
  | "diet"
  | "exercise"
  | "energy"
  | "no_change"
  | "other";

export type Lose2kgProductInterest =
  | "know_what"
  | "interested_need_guidance"
  | "want_to_learn"
  | "none";

export type Lose2kgDesiredHelp =
  | "diet"
  | "product_pairing"
  | "fat_loss"
  | "muscle_body"
  | "exercise_plan"
  | "coach_support"
  | "self_continue";

export type Lose2kgFavoritePart =
  | "challenge"
  | "exercise_games"
  | "nutrition_class"
  | "product_experience"
  | "team_atmosphere"
  | "bring_friends"
  | "other";

export type Lose2kgBusinessInterest =
  | "very_interested"
  | "open_to_listen"
  | "customer_only"
  | "not_now";

export type Lose2kgIncomeInterest =
  | "willing_to_learn"
  | "somewhat_interested"
  | "not_interested";

export type Lose2kgConsultationInterest = "yes" | "contact_later" | "no";

export type Lose2kgQuestionnaireSettings = {
  periodId: string;
  isOpen: boolean;
  openedAt: string | null;
  closedAt: string | null;
  publicToken: string | null;
  surveyUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Lose2kgQuestionnaireResponse = {
  id: string;
  periodId: string;
  participantId: string;
  /** Legacy member attribution; nullable after free-text inviter migration. */
  inviterMemberId: string | null;
  /** Free-text inviter name (preferred display / attribution). */
  inviterName: string;
  coachMemberId: string | null;
  satisfactionScore: number;
  biggestChange: Lose2kgBiggestChange;
  biggestChangeOther: string | null;
  nextGoal: string;
  productInterest: Lose2kgProductInterest;
  desiredHelp: Lose2kgDesiredHelp[];
  favoritePart: Lose2kgFavoritePart;
  favoritePartOther: string | null;
  businessInterest: Lose2kgBusinessInterest;
  incomeInterest: Lose2kgIncomeInterest;
  consultationInterest: Lose2kgConsultationInterest;
  additionalNote: string | null;
  ticketAwarded: boolean;
  submittedAt: string;
  updatedAt: string;
};

export type Lose2kgQuestionnaireSegment =
  | "all"
  | "pending"
  | "consultation"
  | "product_high"
  | "business_interest"
  | "product_and_business"
  | "no_demand";

export type Lose2kgQuestionnaireResultRow = {
  participantId: string;
  participantName: string;
  publicDisplayName: string;
  hasResponse: boolean;
  inviterName: string | null;
  coachName: string | null;
  productInterest: Lose2kgProductInterest | null;
  businessInterest: Lose2kgBusinessInterest | null;
  incomeInterest: Lose2kgIncomeInterest | null;
  consultationInterest: Lose2kgConsultationInterest | null;
  productHigh: boolean;
  businessInterested: boolean;
  wantsConsultation: boolean;
  submittedAt: string | null;
  response: Lose2kgQuestionnaireResponse | null;
};
