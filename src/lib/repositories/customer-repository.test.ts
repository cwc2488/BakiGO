import { describe, expect, it, vi } from "vitest";
import { CUSTOMER_SEX_OPTIONS } from "@/types/customer";

vi.mock("@/lib/config/app-config", () => ({
  APP_IDS: { virtualUplineHerbalifeMemberId: "00000" },
  todayISODate: () => "2026-01-01",
}));

vi.mock("@/lib/cloud/customer-cloud-sync", () => ({
  scheduleCustomerCloudPush: vi.fn(),
  flushCustomerCloudPush: vi.fn(),
}));

import { createCustomerRepository } from "@/lib/repositories/customer-repository";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe("customer repository sex", () => {
  it("persists sex on create and update", () => {
    const storage = new MemoryStorage();
    const repo = createCustomerRepository(storage);

    const created = repo.createCustomer({
      ownerMemberId: "member-1",
      displayName: "測試客戶",
      sex: "female",
    });
    expect(created.sex).toBe("female");

    const updated = repo.updateCustomer(created.id, { sex: "male" });
    expect(updated.sex).toBe("male");
    expect(repo.getCustomerById(created.id)?.sex).toBe("male");
  });

  it("keeps sex undefined for legacy customers until backfilled", () => {
    const storage = new MemoryStorage();
    const repo = createCustomerRepository(storage);

    const created = repo.createCustomer({
      ownerMemberId: "member-1",
      displayName: "舊客戶",
    });
    expect(created.sex).toBeUndefined();

    const backfilled = repo.updateCustomer(created.id, { sex: "prefer_not_to_say" });
    expect(backfilled.sex).toBe("prefer_not_to_say");
  });

  it("exposes all supported sex enum values", () => {
    expect(CUSTOMER_SEX_OPTIONS).toEqual(["male", "female", "other", "prefer_not_to_say"]);
  });
});
