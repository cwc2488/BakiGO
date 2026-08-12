import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { todayISODate } from "@/lib/config/app-config";
import { buildCustomerFollowUpHints } from "@/lib/customers/body-composition-compare";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import type { Customer } from "@/types/customer";

export interface DailyFollowUpItem {
  customer: Customer;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export interface DailyFollowUpSnapshot {
  count: number;
  items: DailyFollowUpItem[];
}

const URGENCY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function buildDailyFollowUpSnapshot(
  storage: StorageAdapter,
  memberId: EntityId | null = resolveAuthenticatedMemberId(storage),
  today: string = todayISODate(),
): DailyFollowUpSnapshot {
  if (!memberId) {
    return { count: 0, items: [] };
  }

  const repo = createCustomerRepository(storage);
  const bodyByCustomer = repo.getBodyRecordsGroupedByCustomer();
  const items = repo
    .getCustomersByOwner(memberId)
    .flatMap((customer) => {
      const records = bodyByCustomer.get(customer.id) ?? [];
      const hints = buildCustomerFollowUpHints(customer, records, today);
      const topHint = hints.sort(
        (left, right) => URGENCY_RANK[left.urgency] - URGENCY_RANK[right.urgency],
      )[0];
      if (!topHint) {
        return [];
      }
      return [{ customer, reason: topHint.reason, urgency: topHint.urgency }];
    })
    .sort((left, right) => URGENCY_RANK[left.urgency] - URGENCY_RANK[right.urgency]);

  return { count: items.length, items };
}

export function readCustomerFollowUpReminderDate(storage: StorageAdapter): string | null {
  return storage.getItem(STORAGE_KEYS.customerFollowUpReminderDate);
}

export function markCustomerFollowUpReminderSent(storage: StorageAdapter, date: string = todayISODate()): void {
  storage.setItem(STORAGE_KEYS.customerFollowUpReminderDate, date);
}

export function shouldSendDailyCustomerFollowUpReminder(
  storage: StorageAdapter,
  now: Date = new Date(),
): boolean {
  const today = todayISODate();
  if (readCustomerFollowUpReminderDate(storage) === today) {
    return false;
  }

  // Daily digest at 9:00 local time.
  if (now.getHours() < 9) {
    return false;
  }

  return buildDailyFollowUpSnapshot(storage).count > 0;
}

export function buildCustomerFollowUpNotificationBody(snapshot: DailyFollowUpSnapshot): string {
  const names = snapshot.items.slice(0, 3).map((item) => item.customer.displayName);
  const suffix =
    snapshot.count > names.length ? ` 等 ${snapshot.count} 位` : ` ${snapshot.count} 位`;
  if (names.length === 0) {
    return "今天有顧客值得關心一下";
  }
  return `${names.join("、")}${suffix}，建議今天聯絡。`;
}
