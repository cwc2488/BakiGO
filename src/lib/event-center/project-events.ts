import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import {
  ACTIVITY_KEYS,
  RETAIL_TRANSACTION_TYPE_KEYS,
} from "@/lib/business-engine/rules/keys";
import { isActivityCountedForKpi } from "@/lib/event-center/activity-lifecycle";
import type { ActivityEvent } from "@/lib/business-engine/types";
import type { BakiEvent } from "@/types/baki-event";
import type { RetailTransaction } from "@/types/retail-transaction";

const TRANSACTION_TYPE_KEYS = new Set<string>(Object.values(RETAIL_TRANSACTION_TYPE_KEYS));

function getTransactionCurrencyCode(transactionTypeKey: string): string {
  const config = DEFAULT_BUSINESS_RULES.retailTransactionTypes.find(
    (type) => type.key === transactionTypeKey,
  );
  return config?.currencyCode ?? "TWD";
}

function toRetailTransaction(event: BakiEvent): RetailTransaction | null {
  if (!TRANSACTION_TYPE_KEYS.has(event.eventTypeKey)) {
    return null;
  }

  const customerName =
    typeof event.metadata?.customerName === "string" ? event.metadata.customerName : "—";

  return {
    id: event.id,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    organizationId: event.organizationId,
    memberId: event.memberId,
    customerName,
    transactionTypeKey: event.eventTypeKey,
    transactionDate: event.eventDate,
    amount: event.value ?? 0,
    currencyCode:
      typeof event.metadata?.currencyCode === "string"
        ? event.metadata.currencyCode
        : getTransactionCurrencyCode(event.eventTypeKey),
    productKey:
      typeof event.metadata?.productKey === "string" ? event.metadata.productKey : undefined,
    retailHouseKey: event.retailHouseKey,
    note: typeof event.metadata?.note === "string" ? event.metadata.note : undefined,
    metadata: event.metadata,
  };
}

function toActivityEvent(event: BakiEvent): ActivityEvent {
  return {
    id: event.id,
    memberId: event.memberId,
    activityKey: event.eventTypeKey,
    activityDate: event.eventDate,
    value: event.value,
    retailHouseKey: event.retailHouseKey,
  };
}

export interface ProjectedEvents {
  activities: ActivityEvent[];
  transactions: RetailTransaction[];
}

export function projectEventsForEngines(events: BakiEvent[]): ProjectedEvents {
  const activities: ActivityEvent[] = [];
  const transactions: RetailTransaction[] = [];

  events.forEach((event) => {
    if (!event || typeof event !== "object" || !event.id || !event.eventDate) {
      return;
    }
    if (event.eventCategory === "transaction") {
      const transaction = toRetailTransaction(event);
      if (transaction) {
        transactions.push(transaction);
        activities.push({
          id: `${event.id}-retail-house-update`,
          memberId: event.memberId,
          activityKey: ACTIVITY_KEYS.RETAIL_HOUSE_UPDATE,
          activityDate: event.eventDate,
          value: 1,
          retailHouseKey: event.retailHouseKey,
        });
      }
      return;
    }

    if (event.eventCategory === "activity") {
      if (!isActivityCountedForKpi(event)) {
        return;
      }
      activities.push(toActivityEvent(event));
    }
  });

  return { activities, transactions };
}

export function isRetailTransactionTypeKey(eventTypeKey: string): boolean {
  return TRANSACTION_TYPE_KEYS.has(eventTypeKey);
}
