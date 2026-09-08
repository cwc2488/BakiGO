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
  | "correction";

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
  publicDisplayName: string;
  totalTickets: number;
  weightChangePct?: number | null;
  weightTickets?: number;
  activityTickets?: number;
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
  liveDrawStatus: "idle" | "drawing" | "revealed";
  publicShowWeights: boolean;
  leaderboard: Lose2kgLiveLeaderboardRow[];
  winners: { prizeName: string; winnerName: string; drawnAt: string | null }[];
};
