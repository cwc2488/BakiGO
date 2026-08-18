import type {
  RecognitionEventCreateInput,
  RecognitionEventStatus,
  RecognitionPublicEventAward,
  RecognitionSubmissionCreateEntry,
} from "@/types/recognition";
import { createHash, randomBytes } from "node:crypto";

export const DEFAULT_RECOGNITION_AWARDS = [
  { slug: "map_month_1", name: "MAP 第一個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 1 },
  { slug: "map_month_2", name: "MAP 第二個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 2 },
  { slug: "map_month_3_pass", name: "MAP 第三個月", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 3 },
  { slug: "new_supervisor", name: "新科督導", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 4 },
  { slug: "world_team_month_1", name: "世界組第一個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 5 },
  { slug: "world_team_month_2", name: "世界組第二個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 6 },
  { slug: "world_team_month_3", name: "世界組第三個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 7 },
  { slug: "new_world_team_pass", name: "新科世界組（第四個月過關）", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 8 },
  { slug: "world_team_1pct", name: "1%世界組", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 9 },
  { slug: "club_5k", name: "5K俱樂部", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 10 },
  { slug: "top_10000", name: "萬點高手", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 11 },
  { slug: "promo_month_1", name: "推廣組第一個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 12 },
  { slug: "promo_month_2", name: "推廣組第二個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 13 },
  { slug: "new_promo_pass", name: "新科推廣組", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 14 },
  { slug: "ro2500_promo_month_1", name: "RO2500推廣組第一個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 15 },
  { slug: "ro2500_promo_month_2", name: "RO2500推廣組第二個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 16 },
  { slug: "new_ro2500_promo_pass", name: "新科RO2500推廣組", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 17 },
  { slug: "wealth_month_1", name: "富豪組第一個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 18 },
  { slug: "wealth_month_2", name: "富豪組第二個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 19 },
  { slug: "new_wealth_pass", name: "新科富豪組", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 20 },
  { slug: "ro7500_wealth_month_1", name: "RO7500富豪組第一個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 21 },
  { slug: "ro7500_wealth_month_2", name: "RO7500富豪組第二個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 22 },
  { slug: "ro7500_wealth_pass", name: "RO7500富豪組", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 23 },
  { slug: "president_month_1", name: "總裁組第一個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 24 },
  { slug: "president_month_2", name: "總裁組第二個月", requiresPhoto: false, layoutHint: "name_list", sortOrder: 25 },
  { slug: "new_president_pass", name: "新科總裁組", requiresPhoto: true, layoutHint: "photo_grid", sortOrder: 26 },
  { slug: "million_lifetime", name: "百萬終生成就獎", requiresPhoto: true, layoutHint: "premium", sortOrder: 27 },
] as const;

export function validateRecognitionEventInput(input: {
  year?: number;
  month?: number;
  collectStartsAt?: string | null;
  collectEndsAt?: string | null;
}): string | null {
  if (input.year !== undefined && (input.year < 2000 || input.year > 2100)) {
    return "year must be between 2000 and 2100.";
  }
  if (input.month !== undefined && (input.month < 1 || input.month > 12)) {
    return "month must be between 1 and 12.";
  }
  if (input.collectStartsAt && input.collectEndsAt) {
    const start = new Date(input.collectStartsAt).getTime();
    const end = new Date(input.collectEndsAt).getTime();
    if (end < start) {
      return "collect_ends_at cannot be before collect_starts_at.";
    }
  }
  return null;
}

const ALLOWED_EVENT_STATUS_TRANSITIONS: Record<RecognitionEventStatus, RecognitionEventStatus[]> = {
  draft: ["collecting", "archived"],
  collecting: ["closed", "archived"],
  closed: ["collecting", "archived"],
  archived: [],
};

export function isValidRecognitionStatusTransition(
  current: RecognitionEventStatus,
  next: RecognitionEventStatus,
): boolean {
  return ALLOWED_EVENT_STATUS_TRANSITIONS[current].includes(next);
}

export function assertRecognitionStatusTransition(
  current: RecognitionEventStatus,
  next: RecognitionEventStatus,
): string | null {
  if (!isValidRecognitionStatusTransition(current, next)) {
    return `Cannot transition event from '${current}' to '${next}'.`;
  }
  return null;
}

export function validateRecognitionAwardReorderInput(
  orderedAwardIds: string[],
  currentEventAwardIds: string[],
): string | null {
  if (orderedAwardIds.length === 0) {
    return "ordered award ids are required.";
  }
  const uniqueIncoming = new Set(orderedAwardIds);
  if (uniqueIncoming.size !== orderedAwardIds.length) {
    return "ordered award ids contain duplicates.";
  }
  if (orderedAwardIds.length !== currentEventAwardIds.length) {
    return "ordered award ids must include the complete current event-award set.";
  }
  const currentSet = new Set(currentEventAwardIds);
  if (!orderedAwardIds.every((id) => currentSet.has(id))) {
    return "ordered award ids must all belong to the target event.";
  }
  return null;
}

export type CreateRecognitionEventRpcArgs = {
  p_name: string;
  p_year: number;
  p_month: number;
  p_collect_starts_at: string | null;
  p_collect_ends_at: string | null;
  p_copied_from_event_id: string | null;
  p_created_by_member_id: string;
};

export function toCreateRecognitionEventRpcArgs(
  input: RecognitionEventCreateInput,
): CreateRecognitionEventRpcArgs {
  return {
    p_name: input.name.trim(),
    p_year: input.year,
    p_month: input.month,
    p_collect_starts_at: input.collectStartsAt ?? null,
    p_collect_ends_at: input.collectEndsAt ?? null,
    p_copied_from_event_id: input.copiedFromEventId ?? null,
    p_created_by_member_id: input.createdByMemberId,
  };
}

export const RECOGNITION_PUBLIC_MAX_ENTRIES = 10;
export const RECOGNITION_PUBLIC_MAX_TEXT_LENGTH = 100;
export const RECOGNITION_PUBLIC_MAX_ORG_LENGTH = 120;
export const RECOGNITION_PUBLIC_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const RECOGNITION_PUBLIC_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function generateRecognitionPublicToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRecognitionPublicToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function normalizeRecognitionSubmittedName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export type RecognitionPublicCollectionState =
  | "invalid"
  | "not_started"
  | "closed"
  | "expired"
  | "open";

export function resolveRecognitionCollectionState(input: {
  exists: boolean;
  status: RecognitionEventStatus | null;
  collectStartsAt: string | null;
  collectEndsAt: string | null;
  nowMs?: number;
}): RecognitionPublicCollectionState {
  if (!input.exists || !input.status) return "invalid";
  const nowMs = input.nowMs ?? Date.now();
  const startMs = input.collectStartsAt ? new Date(input.collectStartsAt).getTime() : null;
  const endMs = input.collectEndsAt ? new Date(input.collectEndsAt).getTime() : null;

  if (input.status !== "collecting") {
    return input.status === "closed" || input.status === "archived" ? "closed" : "not_started";
  }
  if (startMs !== null && nowMs < startMs) return "not_started";
  if (endMs !== null && nowMs > endMs) return "expired";
  return "open";
}

export function validateRecognitionPublicEntryCount(count: number): string | null {
  if (count <= 0) return "至少需要一位受表揚者。";
  if (count > RECOGNITION_PUBLIC_MAX_ENTRIES) {
    return `一次最多可送出 ${RECOGNITION_PUBLIC_MAX_ENTRIES} 位。`;
  }
  return null;
}

export function validateRecognitionPublicTextField(value: string, maxLength: number, fieldLabel: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${fieldLabel} 為必填。`;
  if (trimmed.length > maxLength) return `${fieldLabel} 長度不可超過 ${maxLength} 字。`;
  return null;
}

export function validateRecognitionPublicPhoto(input: {
  mimeType: string;
  byteSize: number;
}): string | null {
  if (!RECOGNITION_PUBLIC_ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return "不支援的圖片格式。";
  }
  if (input.byteSize > RECOGNITION_PUBLIC_MAX_IMAGE_BYTES) {
    return `圖片不可超過 ${Math.floor(RECOGNITION_PUBLIC_MAX_IMAGE_BYTES / (1024 * 1024))}MB。`;
  }
  return null;
}

export function validateRecognitionPublicSubmissionAgainstAwards(input: {
  entries: Array<{
    submittedName: string;
    eventAwardId: string;
    originalPhotoStoragePath: string | null;
  }>;
  awards: RecognitionPublicEventAward[];
}): string | null {
  const countError = validateRecognitionPublicEntryCount(input.entries.length);
  if (countError) return countError;

  const awardMap = new Map(input.awards.map((award) => [award.eventAwardId, award]));
  for (const entry of input.entries) {
    const award = awardMap.get(entry.eventAwardId);
    if (!award) {
      return "包含無效或已停用的表揚項目。";
    }
    const nameError = validateRecognitionPublicTextField(entry.submittedName, 100, "受表揚者姓名");
    if (nameError) return nameError;
    if (award.requiresPhoto && !entry.originalPhotoStoragePath) {
      return `「${award.name}」需要照片。`;
    }
  }
  return null;
}

export function toRecognitionSubmissionRpcEntries(
  entries: RecognitionSubmissionCreateEntry[],
): Array<{
  id: string;
  event_award_id: string;
  submitted_name: string;
  normalized_name: string;
  original_photo_storage_path: string | null;
  original_photo_mime_type: string | null;
  original_photo_size_bytes: number | null;
}> {
  return entries.map((entry) => ({
    id: entry.id,
    event_award_id: entry.eventAwardId,
    submitted_name: entry.submittedName,
    normalized_name: normalizeRecognitionSubmittedName(entry.submittedName),
    original_photo_storage_path: entry.originalPhotoStoragePath,
    original_photo_mime_type: entry.originalPhotoMimeType,
    original_photo_size_bytes: entry.originalPhotoSizeBytes,
  }));
}
