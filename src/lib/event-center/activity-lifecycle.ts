import type { BakiEvent, BakiEventCreateInput } from "@/types/baki-event";
import type { EntityMetadata } from "@/types";

export const ACTIVITY_LIFECYCLE_STATUS = {
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  SKIPPED: "skipped",
} as const;

export type ActivityLifecycleStatus =
  (typeof ACTIVITY_LIFECYCLE_STATUS)[keyof typeof ACTIVITY_LIFECYCLE_STATUS];

export type ActivityEventSource = "calendar" | "quick" | "event_center" | "consultation_flow" | "pipeline";

export interface ActivityLifecycleMetadata {
  lifecycleStatus?: ActivityLifecycleStatus;
  completedAt?: string;
  source?: ActivityEventSource;
  calendarEventId?: string;
  occurrenceDate?: string;
  consultationSessionId?: string;
  leadId?: string;
}

export function getActivityLifecycleStatus(
  metadata?: EntityMetadata,
): ActivityLifecycleStatus | undefined {
  const status = metadata?.lifecycleStatus;
  if (
    status === ACTIVITY_LIFECYCLE_STATUS.SCHEDULED ||
    status === ACTIVITY_LIFECYCLE_STATUS.COMPLETED ||
    status === ACTIVITY_LIFECYCLE_STATUS.SKIPPED
  ) {
    return status;
  }
  return undefined;
}

/** Legacy rows without lifecycleStatus are treated as completed activity records. */
export function isActivityCountedForKpi(event: BakiEvent): boolean {
  const status = getActivityLifecycleStatus(event.metadata);
  return status === undefined || status === ACTIVITY_LIFECYCLE_STATUS.COMPLETED;
}

export function isActivityCompletionFinalized(event: BakiEvent): boolean {
  const status = getActivityLifecycleStatus(event.metadata);
  return (
    status === ACTIVITY_LIFECYCLE_STATUS.COMPLETED || status === ACTIVITY_LIFECYCLE_STATUS.SKIPPED
  );
}

export function buildCompletedActivityMetadata(
  base: EntityMetadata | undefined,
  completedAt: string,
): EntityMetadata {
  return {
    ...base,
    lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.COMPLETED,
    completedAt,
  };
}

export function buildScheduledActivityMetadata(
  base: EntityMetadata | undefined,
): EntityMetadata {
  return {
    ...base,
    lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.SCHEDULED,
  };
}

export function buildSkippedActivityMetadata(
  base: EntityMetadata | undefined,
): EntityMetadata {
  return {
    ...base,
    lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.SKIPPED,
  };
}

export function withCompletedLifecycle(
  input: BakiEventCreateInput,
  completedAt: string = new Date().toISOString(),
): BakiEventCreateInput {
  return {
    ...input,
    metadata: buildCompletedActivityMetadata(input.metadata, completedAt),
  };
}
