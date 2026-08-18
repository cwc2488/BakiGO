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
