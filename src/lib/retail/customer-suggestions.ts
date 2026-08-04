import { APP_IDS } from "@/lib/config/app-config";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

export function loadCustomerSuggestions(storage: StorageAdapter): string[] {
  const repository = createEventRepository(storage);
  const names = new Set<string>();

  repository.getByMemberId(APP_IDS.currentMemberId).forEach((event) => {
    if (event.eventCategory !== "transaction") {
      return;
    }

    const customerName = event.metadata?.customerName;
    if (typeof customerName === "string" && customerName.trim()) {
      names.add(customerName.trim());
    }
  });

  return Array.from(names).sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

export function filterCustomerSuggestions(
  suggestions: string[],
  query: string,
): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return suggestions.slice(0, 8);
  }

  return suggestions
    .filter((name) => name.includes(trimmed))
    .slice(0, 8);
}
