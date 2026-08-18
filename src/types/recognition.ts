/**
 * Recognition Center domain types.
 *
 * These types are for the Recognition Center (表揚中心) only.
 * They are NOT related to BakiGO career rank keys, promotion logic,
 * GAME_DESIGN achievements, or the leaderboard module.
 */

export type RecognitionLayoutHint = "name_list" | "photo_grid" | "photo_hero" | "premium";

export type RecognitionEventStatus = "draft" | "collecting" | "closed" | "archived";

// ---------------------------------------------------------------------------
// Award definitions (global catalog)
// ---------------------------------------------------------------------------

export interface RecognitionAwardDefinition {
  id: string;
  slug: string;
  name: string;
  requiresPhoto: boolean;
  layoutHint: RecognitionLayoutHint;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Recognition Event
// ---------------------------------------------------------------------------

export interface RecognitionEvent {
  id: string;
  name: string;
  year: number;
  month: number;
  collectStartsAt: string | null;
  collectEndsAt: string | null;
  status: RecognitionEventStatus;
  pptThemeId: string | null;
  eventTemplateId: string | null;
  copiedFromEventId: string | null;
  createdByMemberId: string | null;
  closedAt: string | null;
  publicCollectionToken: string | null;
  publicCollectionTokenHash: string | null;
  publicCollectionTokenRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecognitionEventCreateInput {
  name: string;
  year: number;
  month: number;
  collectStartsAt?: string | null;
  collectEndsAt?: string | null;
  copiedFromEventId?: string | null;
  createdByMemberId: string;
}

export interface RecognitionEventUpdateInput {
  name?: string;
  year?: number;
  month?: number;
  collectStartsAt?: string | null;
  collectEndsAt?: string | null;
  status?: RecognitionEventStatus;
}

// ---------------------------------------------------------------------------
// Event awards (event-specific configuration)
// ---------------------------------------------------------------------------

export interface RecognitionEventAward {
  id: string;
  eventId: string;
  awardDefinitionId: string;
  sortOrder: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  // denormalized for UI convenience
  awardSlug?: string;
  awardName?: string;
  requiresPhoto?: boolean;
  layoutHint?: RecognitionLayoutHint;
}

export interface RecognitionEventAwardUpdateInput {
  isEnabled?: boolean;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Admin member
// ---------------------------------------------------------------------------

export interface RecognitionAdminMember {
  memberId: string;
  grantedByMemberId: string | null;
  isActive: boolean;
  grantedAt: string;
}

// ---------------------------------------------------------------------------
// Public collection
// ---------------------------------------------------------------------------

export interface RecognitionPublicEventAward {
  eventAwardId: string;
  awardDefinitionId: string;
  slug: string;
  name: string;
  requiresPhoto: boolean;
  sortOrder: number;
}

export interface RecognitionPublicEvent {
  eventId: string;
  name: string;
  year: number;
  month: number;
  collectEndsAt: string | null;
  awards: RecognitionPublicEventAward[];
}

export interface RecognitionSubmission {
  id: string;
  eventId: string;
  submitterName: string;
  submitterOrganization: string;
  submittedAt: string;
  createdAt: string;
}

export interface RecognitionSubmissionEntry {
  id: string;
  submissionId: string;
  eventId: string;
  eventAwardId: string;
  submittedName: string;
  normalizedName: string;
  originalPhotoStoragePath: string | null;
  originalPhotoMimeType: string | null;
  originalPhotoSizeBytes: number | null;
  createdAt: string;
}

export interface RecognitionSubmissionCreateEntry {
  id: string;
  eventAwardId: string;
  submittedName: string;
  normalizedName: string;
  originalPhotoStoragePath: string | null;
  originalPhotoMimeType: string | null;
  originalPhotoSizeBytes: number | null;
}

export interface RecognitionRawSubmissionView {
  submission: RecognitionSubmission;
  entries: Array<RecognitionSubmissionEntry & {
    awardName: string;
    requiresPhoto: boolean;
    hasOriginalPhoto: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Candidates / review (Phase 5)
// ---------------------------------------------------------------------------

export type RecognitionReviewStatus = "pending" | "approved" | "needs_fix" | "rejected";

export interface RecognitionEventSummary extends RecognitionEvent {
  approvedCount: number;
  pendingCount: number;
  needsFixCount: number;
  rejectedCount: number;
  problemCount: number;
}

export interface RecognitionCandidateSource {
  id: string;
  candidateId: string;
  submissionEntryId: string;
  submittedName: string;
  normalizedName: string;
  eventAwardId: string;
  awardName: string;
  submitterName: string;
  submitterOrganization: string;
  submittedAt: string;
  originalPhotoStoragePath: string | null;
  originalPhotoMimeType: string | null;
  hasOriginalPhoto: boolean;
  createdAt: string;
}

export interface RecognitionCandidateWarningRef {
  candidateId: string;
  eventAwardId: string;
  awardName: string;
  displayName: string;
  normalizedName: string;
}

export interface RecognitionCandidate {
  id: string;
  eventId: string;
  eventAwardId: string;
  awardName: string;
  requiresPhoto: boolean;
  displayName: string;
  normalizedName: string;
  reviewStatus: RecognitionReviewStatus;
  memberId: string | null;
  preferredSourceEntryId: string | null;
  sortOrder: number;
  reviewedAt: string | null;
  reviewedByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
  submitterOrganizations: string[];
  hasOriginalPhoto: boolean;
  missingRequiredPhoto: boolean;
  crossAwardWarning: boolean;
  suspectedDuplicateWarning: boolean;
  crossAwardMatches: RecognitionCandidateWarningRef[];
  suspectedDuplicates: RecognitionCandidateWarningRef[];
  sources: RecognitionCandidateSource[];
}

export interface RecognitionCandidateUpdateInput {
  reviewStatus?: RecognitionReviewStatus;
  displayName?: string;
  preferredSourceEntryId?: string | null;
}

export interface RecognitionConsolidationResult {
  eventId: string;
  candidateCount: number;
  sourceLinkCount: number;
  createdCandidateCount: number;
  createdSourceLinkCount: number;
}

export interface RecognitionApprovedRosterAward {
  eventAwardId: string;
  awardName: string;
  sortOrder: number;
  candidates: Array<{
    id: string;
    displayName: string;
    sortOrder: number;
    preferredSourceEntryId: string | null;
    hasOriginalPhoto: boolean;
  }>;
}

export interface RecognitionApprovedRoster {
  eventId: string;
  eventName: string;
  year: number;
  month: number;
  awards: RecognitionApprovedRosterAward[];
}
