import { APP_IDS } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { recalculateMemberMetrics, type MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { BakiEventCreateInput } from "@/types/baki-event";
import { getEventTypeDefinition } from "./event-types";

export function processEvent(
  input: BakiEventCreateInput,
  storage: StorageAdapter,
): MemberComputedMetrics {
  const definition = getEventTypeDefinition(input.eventTypeKey);
  if (!definition) {
    throw new Error(`Unknown event type: ${input.eventTypeKey}`);
  }

  if (definition.category !== input.eventCategory) {
    throw new Error("Event category does not match event type.");
  }

  const repository = createEventRepository(storage);
  repository.create(input);

  return recalculateMemberMetrics(
    {
      memberId: input.memberId,
      referenceDate: input.eventDate,
    },
    storage,
  );
}

export function processEventForCurrentMember(
  input: Omit<BakiEventCreateInput, "memberId" | "organizationId">,
  storage: StorageAdapter,
): MemberComputedMetrics {
  return processEvent(
    {
      ...input,
      memberId: resolveAuthenticatedMemberId(storage),
      organizationId: APP_IDS.organizationId,
    },
    storage,
  );
}
