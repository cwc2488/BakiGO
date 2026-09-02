import { APP_IDS } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import {
  buildCompletedActivityMetadata,
} from "@/lib/event-center/activity-lifecycle";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { rethrowStorageUserError } from "@/lib/repositories/storage-quota-error";
import {
  recalculateMemberMetrics,
  type MemberComputedMetrics,
} from "@/lib/services/recalculate-member-metrics";
import type { BakiEvent, BakiEventCreateInput } from "@/types/baki-event";
import { getEventTypeDefinition } from "./event-types";

function persistCreatedEvent(
  storage: StorageAdapter,
  input: BakiEventCreateInput,
): void {
  try {
    createEventRepository(storage).create(input);
  } catch (error) {
    rethrowStorageUserError(error);
  }
}

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

  persistCreatedEvent(storage, input);

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

/** Canonical completion for quick / manual activity records (already completed). */
export function completeActivityEventForCurrentMember(
  input: Omit<BakiEventCreateInput, "memberId" | "organizationId">,
  storage: StorageAdapter,
  source: "quick" | "event_center" | "consultation_flow" | "pipeline" = "quick",
): MemberComputedMetrics {
  const completedAt = new Date().toISOString();
  return processEventForCurrentMember(
    {
      ...input,
      metadata: buildCompletedActivityMetadata(
        {
          ...input.metadata,
          source,
        },
        completedAt,
      ),
    },
    storage,
  );
}

export function findActivityEventByMetadata(
  storage: StorageAdapter,
  memberId: string,
  match: (metadata: BakiEvent["metadata"]) => boolean,
): BakiEvent | undefined {
  return createEventRepository(storage)
    .getByMemberId(memberId)
    .find((event) => match(event.metadata ?? {}));
}

export function upsertActivityEventForCurrentMember(
  input: Omit<BakiEventCreateInput, "memberId" | "organizationId">,
  storage: StorageAdapter,
  findExisting: (metadata: BakiEvent["metadata"]) => boolean,
): MemberComputedMetrics {
  const memberId = resolveAuthenticatedMemberId(storage);
  const fullInput: BakiEventCreateInput = {
    ...input,
    memberId,
    organizationId: APP_IDS.organizationId,
  };

  const definition = getEventTypeDefinition(fullInput.eventTypeKey);
  if (!definition) {
    throw new Error(`Unknown event type: ${fullInput.eventTypeKey}`);
  }

  const repository = createEventRepository(storage);
  const existing = findActivityEventByMetadata(storage, memberId, findExisting);

  if (existing) {
    try {
      repository.update(existing.id, {
        eventTypeKey: fullInput.eventTypeKey,
        eventDate: fullInput.eventDate,
        metadata: {
          ...existing.metadata,
          ...fullInput.metadata,
        },
      });
    } catch (error) {
      rethrowStorageUserError(error);
    }
  } else {
    persistCreatedEvent(storage, fullInput);
  }

  return recalculateMemberMetrics(
    { memberId, referenceDate: fullInput.eventDate },
    storage,
  );
}
