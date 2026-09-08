/** Cleaning roster (admin-only) domain types. */

export type CleaningRosterEntityStatus = "active" | "deleted";
export type CleaningRosterAssignmentRole = "assigned" | "rest";

export type CleaningRosterArea = {
  id: string;
  name: string;
  sortOrder: number;
  status: CleaningRosterEntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type CleaningRosterMember = {
  id: string;
  name: string;
  currentWeight: number;
  totalAssignments: number;
  consecutiveRestRounds: number;
  sortOrder: number;
  status: CleaningRosterEntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type CleaningRosterPreviewAssignment = {
  areaId: string;
  areaName: string;
  memberId: string;
  memberName: string;
};

export type CleaningRosterPreviewRester = {
  memberId: string;
  memberName: string;
};

export type CleaningRosterPreview = {
  idempotencyKey: string;
  assignments: CleaningRosterPreviewAssignment[];
  resting: CleaningRosterPreviewRester[];
};

export type CleaningRosterHistoryAssignment = {
  areaId: string | null;
  memberId: string | null;
  areaName: string | null;
  memberName: string;
  role: CleaningRosterAssignmentRole;
  sortOrder: number;
};

export type CleaningRosterHistoryRound = {
  id: string;
  confirmedAt: string;
  assignments: CleaningRosterHistoryAssignment[];
  resting: CleaningRosterHistoryAssignment[];
};

export type CleaningRosterBootstrap = {
  areas: CleaningRosterArea[];
  members: CleaningRosterMember[];
  history: CleaningRosterHistoryRound[];
  fairnessResetAt: string | null;
};

export const CLEANING_ROSTER_BASE_WEIGHT = 1;
export const CLEANING_ROSTER_REST_WEIGHT_DELTA = 0.5;
export const CLEANING_ROSTER_HISTORY_LIMIT = 20;
