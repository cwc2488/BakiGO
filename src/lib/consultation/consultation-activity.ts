import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { upsertActivityEventForCurrentMember } from "@/lib/event-center/process-event";
import { todayISODate } from "@/lib/config/app-config";
import {
  buildCompletedActivityMetadata,
} from "@/lib/event-center/activity-lifecycle";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";

export function emitConsultationCompletedActivity(
  input: {
    customerId: EntityId;
    consultationSessionId: EntityId;
  },
  storage: StorageAdapter,
): void {
  const completedAt = new Date().toISOString();
  upsertActivityEventForCurrentMember(
    {
      eventTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
      eventCategory: "activity",
      eventDate: todayISODate(),
      metadata: {
        customerId: input.customerId,
        consultationSessionId: input.consultationSessionId,
        source: "consultation_flow",
        ...buildCompletedActivityMetadata(undefined, completedAt),
      },
    },
    storage,
    (metadata) => metadata?.consultationSessionId === input.consultationSessionId,
  );
}
