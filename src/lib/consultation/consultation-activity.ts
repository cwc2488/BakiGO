import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import { todayISODate } from "@/lib/config/app-config";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";

export function emitConsultationCompletedActivity(
  input: {
    customerId: EntityId;
    consultationSessionId: EntityId;
  },
  storage: StorageAdapter,
): void {
  processEventForCurrentMember(
    {
      eventTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
      eventCategory: "activity",
      eventDate: todayISODate(),
      metadata: {
        customerId: input.customerId,
        consultationSessionId: input.consultationSessionId,
      },
    },
    storage,
  );
}
