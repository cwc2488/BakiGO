import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import {
  createQuickRecruitMember,
  type QuickRecruitInput,
} from "@/lib/daily-action/create-quick-recruit";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { recalculateMemberMetrics } from "@/lib/services/recalculate-member-metrics";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";

export type { QuickRecruitInput } from "@/lib/daily-action/create-quick-recruit";

export interface QuickActivityInput {
  customerName: string;
  customerPhone?: string;
  region?: string;
  note?: string;
}

export function logTodayActivity(
  activityType: "measurement" | "consultation",
  input: QuickActivityInput,
  storage: StorageAdapter,
): MemberComputedMetrics {
  const customerName = input.customerName.trim();
  if (!customerName) {
    throw new Error("請輸入姓名");
  }

  const eventTypeKey =
    activityType === "measurement"
      ? ACTIVITY_EVENT_KEYS.MEASUREMENT
      : ACTIVITY_EVENT_KEYS.CONSULTATION;

  return processEventForCurrentMember(
    {
      eventTypeKey,
      eventCategory: "activity",
      eventDate: todayISODate(),
      metadata: {
        customerName,
        customerPhone: input.customerPhone?.trim() || undefined,
        region: input.region?.trim() || undefined,
        note: input.note?.trim() || undefined,
      },
    },
    storage,
  );
}

export function logTodayRecruit(
  input: QuickRecruitInput,
  storage: StorageAdapter,
): MemberComputedMetrics {
  if (!input.displayName.trim()) {
    throw new Error("請輸入姓名");
  }

  const recruit = createQuickRecruitMember(storage, input);
  const eventDate = todayISODate();

  if (input.category === "distributor") {
    return processEventForCurrentMember(
      {
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        eventCategory: "transaction",
        eventDate,
        value: 1,
        retailHouseKey: APP_IDS.defaultRetailHouseKey,
        metadata: {
          customerName: recruit.displayName,
          customerPhone: input.phone?.trim() || undefined,
          region: input.region?.trim() || undefined,
          currencyCode: "VP",
          recruitMemberId: recruit.id,
          recruitCategory: input.category,
          note: input.note?.trim() || undefined,
        },
      },
      storage,
    );
  }

  return recalculateMemberMetrics(
    {
      memberId: resolveAuthenticatedMemberId(storage),
      referenceDate: eventDate,
    },
    storage,
  );
}
