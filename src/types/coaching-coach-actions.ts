import type { CoachingAttentionReasonCode } from "@/types/coaching-attention";
import type { CoachingEvidenceRef } from "@/types/coaching-timeline";

export const COACHING_COACH_ACTION_TYPES = ["note", "acknowledged", "follow_up"] as const;
export type CoachingCoachActionType = (typeof COACHING_COACH_ACTION_TYPES)[number];

export const COACHING_COACH_ACTION_STATUSES = [
  "open",
  "acknowledged",
  "follow_up",
  "resolved",
  "superseded",
] as const;
export type CoachingCoachActionStatus = (typeof COACHING_COACH_ACTION_STATUSES)[number];

export type CoachingCoachActionRecord = {
  id: string;
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  actionType: CoachingCoachActionType;
  status: CoachingCoachActionStatus;
  note: string | null;
  relatedReasonCodes: string[];
  evidenceRefs: CoachingEvidenceRef[];
  relatedLogDate: string | null;
  relatedMeasurementId: string | null;
  isMaterial: boolean;
  supersededBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  updatedAt: string;
};

/** Bounded memory slice for GenerationInput / Attention (not full timeline dump). */
export type CoachingRecentCoachActionMemoryItem = {
  id: string;
  actionType: CoachingCoachActionType;
  status: CoachingCoachActionStatus;
  note: string | null;
  relatedReasonCodes: string[];
  createdAt: string;
  resolvedAt: string | null;
  isMaterial: boolean;
  relatedLogDate: string | null;
};

export type CoachingRecentCoachActionMemory = {
  recentActions: CoachingRecentCoachActionMemoryItem[];
  unresolvedFollowUps: CoachingRecentCoachActionMemoryItem[];
  /** Material-only subset used for fingerprinting. */
  materialActions: CoachingRecentCoachActionMemoryItem[];
};


export type CoachingRelevantCoachActionContextItem = {
  id: string;
  actionType: CoachingCoachActionType;
  status: CoachingCoachActionStatus;
  note: string;
  relatedReasonCodes: string[];
  /** Active issue keys / reason codes that matched this note. */
  matchedActiveKeys: string[];
  /** Distinctive situational fragments derived from note (not issue labels). */
  distinctiveFragments: string[];
  createdAt: string;
  relatedLogDate: string | null;
};

/**
 * Deterministic Known Context for the active issue(s).
 * Subset of RecentCoachActionMemory — not a dump of all recent notes.
 */
export type CoachingRelevantCoachActionContext = {
  activeIssueKeys: string[];
  knownContexts: CoachingRelevantCoachActionContextItem[];
};

export const COACHING_COACH_ACTION_MEMORY_LIMIT = 5 as const;

export function isCoachingCoachActionType(value: string): value is CoachingCoachActionType {
  return (COACHING_COACH_ACTION_TYPES as readonly string[]).includes(value);
}

export function isCoachingCoachActionStatus(value: string): value is CoachingCoachActionStatus {
  return (COACHING_COACH_ACTION_STATUSES as readonly string[]).includes(value);
}

export function inferCoachActionMaterial(input: {
  actionType: CoachingCoachActionType;
  note: string | null | undefined;
}): boolean {
  const note = input.note?.trim() ?? "";
  if (note.length > 0) return true;
  // Empty acknowledgement / empty follow_up marker is non-material for fingerprint.
  return false;
}

export function mapCoachActionToAttentionShape(action: CoachingCoachActionRecord): {
  id: string;
  actionType: string;
  relatedReasonCodes: CoachingAttentionReasonCode[];
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
} {
  return {
    id: action.id,
    actionType: action.actionType,
    relatedReasonCodes: action.relatedReasonCodes.filter((code): code is CoachingAttentionReasonCode =>
      Boolean(code),
    ) as CoachingAttentionReasonCode[],
    note: action.note,
    createdAt: action.createdAt,
    resolvedAt: action.resolvedAt,
  };
}
