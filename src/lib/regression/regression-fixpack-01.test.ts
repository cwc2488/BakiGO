import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/app-config", () => ({
  APP_IDS: { virtualUplineHerbalifeMemberId: "00000" },
  todayISODate: () => "2026-08-24",
}));

vi.mock("@/lib/cloud/customer-cloud-sync", () => ({
  scheduleCustomerCloudPush: vi.fn(),
  flushCustomerCloudPush: vi.fn(),
}));

import {
  buildDefaultFormValues,
  formValuesToPayload,
  validateEventFormValues,
} from "@/components/calendar/EventFormModal";
import { buildCopiedEventPayloads } from "@/lib/calendar/copy-event-to-dates";
import {
  ADMIN_CENTER_HOME_ENTRY,
  decideAdminAccess,
  homeMoreEntriesForViewer,
  RECOGNITION_CENTER_ENTRY,
} from "@/lib/auth/admin-access";
import {
  LEARNING_RESOURCE_CATALOG,
  LEARNING_SERIES_LABELS,
  groupLearningResources,
} from "@/lib/learning-resources/catalog";
import { isPublicPath } from "@/lib/auth/public-paths";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { createCustomerRepository } from "@/lib/repositories/customer-repository";
import { DEFAULT_ALLOCATION_RULES } from "@/lib/radar/allocation/allocation-rules";
import { bodyRecordToFormValues } from "@/lib/customers/customer-body-form";

const EXPECTED_TRAINING_IDS = [
  "training_marketing_plan",
  "training_talk_case",
  "training_weight_loss_female",
  "training_weight_loss_male",
  "training_weight_gain_male",
  "training_sculpt_female",
  "training_baki_close",
  "training_after_sales",
  "training_five_keys",
  "training_how_to_retail",
  "training_packaging_story",
  "five_courses_develop",
  "five_courses_after_sales",
  "five_courses_uplift",
  "five_courses_retain",
  "five_courses_escape_map",
] as const;

class MemoryStorage implements StorageAdapter {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function createRepo(storage = new MemoryStorage()) {
  return createCustomerRepository(storage);
}

describe("BAKIGO-REGRESSION-FIXPACK-01", () => {
  it("Magic Link measurement exposes muscle mass and basal metabolism fields", () => {
    const portalRecord = {
      recordDate: "2026-08-24",
      weightKg: 70,
      bodyFatPercent: 22,
      visceralFatLevel: 8,
      bodyAge: 30,
      basalMetabolicRate: 1450,
      bmi: 22.5,
      skeletalMuscleKg: 28.4,
    };

    expect(portalRecord.skeletalMuscleKg).toBe(28.4);
    expect(portalRecord.basalMetabolicRate).toBe(1450);
    expect(portalRecord.weightKg).toBe(70);
    expect(portalRecord.bodyFatPercent).toBe(22);
  });

  it("existing measurement fields still round-trip through body form helpers", () => {
    const values = bodyRecordToFormValues({
      recordDate: "2026-08-20",
      age: 35,
      weightKg: 68.2,
      skeletalMuscleKg: 27.1,
      bmi: 21.8,
      bodyFatPercent: 24.5,
      visceralFatLevel: 7,
      basalMetabolicRate: 1380,
      bodyAge: 32,
      note: "午后量测",
    });

    expect(values.skeletalMuscleKg).toBe("27.1");
    expect(values.basalMetabolicRate).toBe("1380");
    expect(values.weightKg).toBe("68.2");
    expect(values.note).toBe("午后量测");
  });

  it("measurement edit persists on the same record and does not duplicate", () => {
    const repo = createRepo();
    const customer = repo.createCustomer({
      ownerMemberId: "member-1",
      displayName: "測試顧客",
    });
    const created = repo.createBodyRecord({
      customerId: customer.id,
      recordDate: "2026-08-20",
      weightKg: 70,
      skeletalMuscleKg: 28,
      basalMetabolicRate: 1400,
    });

    const updated = repo.updateBodyRecord(created.id, {
      customerId: customer.id,
      recordDate: "2026-08-20",
      weightKg: 69.5,
      skeletalMuscleKg: 28.2,
      basalMetabolicRate: 1410,
    });

    const records = repo.getBodyRecordsByCustomer(customer.id);
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(created.id);
    expect(updated.id).toBe(created.id);
    expect(records[0]?.weightKg).toBe(69.5);
    expect(records[0]?.skeletalMuscleKg).toBe(28.2);
    expect(records[0]?.basalMetabolicRate).toBe(1410);
  });

  it("measurement delete persists after reload from storage", () => {
    const storage = new MemoryStorage();
    const repo = createRepo(storage);
    const customer = repo.createCustomer({
      ownerMemberId: "member-1",
      displayName: "刪除量測顧客",
    });
    const keep = repo.createBodyRecord({
      customerId: customer.id,
      recordDate: "2026-08-10",
      weightKg: 71,
    });
    const remove = repo.createBodyRecord({
      customerId: customer.id,
      recordDate: "2026-08-18",
      weightKg: 70,
    });

    repo.deleteBodyRecord(remove.id);
    const reloaded = createRepo(storage);
    const records = reloaded.getBodyRecordsByCustomer(customer.id);
    expect(records.map((record) => record.id)).toEqual([keep.id]);
  });

  it("customer delete persists after refresh and leaves unrelated customers", () => {
    const storage = new MemoryStorage();
    const repo = createRepo(storage);
    const keep = repo.createCustomer({
      ownerMemberId: "member-1",
      displayName: "留下的顧客",
    });
    const remove = repo.createCustomer({
      ownerMemberId: "member-1",
      displayName: "刪除的顧客",
    });

    repo.deleteCustomer(remove.id);
    const reloaded = createRepo(storage);
    const remaining = reloaded.getCustomersByOwner("member-1");
    expect(remaining.map((customer) => customer.id)).toEqual([keep.id]);
    expect(remaining.some((customer) => customer.id === remove.id)).toBe(false);
  });

  it("calendar event copies to multiple selected dates preserving clock time/duration", () => {
    const source = {
      ...buildDefaultFormValues("2026-08-23", "10:00"),
      title: "STS",
      endDate: "2026-08-23",
      endTime: "16:00",
      notes: "週會",
      color: "blue" as const,
    };

    const payloads = buildCopiedEventPayloads(source, [
      "2026-08-20",
      "2026-08-06",
      "2026-08-14",
      "2026-08-20",
    ]);

    expect(payloads).toHaveLength(3);
    expect(payloads.map((payload) => payload.startAt.slice(0, 10))).toEqual([
      "2026-08-06",
      "2026-08-14",
      "2026-08-20",
    ]);
    for (const payload of payloads) {
      expect(payload.title).toBe("STS");
      expect(payload.startAt.slice(11, 16)).toBe("10:00");
      expect(payload.endAt.slice(11, 16)).toBe("16:00");
      expect(payload.notes).toBe("週會");
      expect(payload.color).toBe("blue");
      expect(payload.recurrence.frequency).toBe("none");
    }
  });

  it("calendar create/edit validation and conflict-style end-time rules remain enforced", () => {
    const invalid = {
      ...buildDefaultFormValues("2026-08-24", "10:00"),
      title: "測試",
      endTime: "09:00",
    };
    expect(validateEventFormValues(invalid)).toBe("結束時間必須晚於開始時間");

    const valid = formValuesToPayload({
      ...buildDefaultFormValues("2026-08-24", "10:00"),
      title: "測試",
      endTime: "11:00",
    });
    expect(valid.startAt).toBe("2026-08-24T10:00");
    expect(valid.endAt).toBe("2026-08-24T11:00");
  });

  it("表揚中心 entry is visible only to super admin", () => {
    const base = [
      { href: "/leaderboard", title: "排行榜" },
      { href: "/profile", title: "個人資料" },
    ];
    const forAdmin = homeMoreEntriesForViewer(base, true);
    const forPartner = homeMoreEntriesForViewer(base, false);

    expect(forAdmin.some((entry) => entry.href === ADMIN_CENTER_HOME_ENTRY.href)).toBe(true);
    expect(forPartner.some((entry) => entry.href === ADMIN_CENTER_HOME_ENTRY.href)).toBe(false);
    expect(forPartner.some((entry) => entry.href === RECOGNITION_CENTER_ENTRY.href)).toBe(false);
    expect(decideAdminAccess({ memberId: "m1", isAdmin: true })).toBe("allowed");
    expect(decideAdminAccess({ memberId: "m1", isAdmin: false })).toBe("forbidden");
    expect(isPublicPath("/recognition/p/token-demo")).toBe(true);
    expect(isPublicPath("/recognition")).toBe(false);
  });

  it("學習庫 restores the exact 16 later-added items without duplicates", () => {
    const ids = LEARNING_RESOURCE_CATALOG.map((item) => item.id);
    for (const id of EXPECTED_TRAINING_IDS) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(LEARNING_SERIES_LABELS.training_videos).toBe("培訓影片");
    expect(LEARNING_SERIES_LABELS.five_courses).toBe("五堂課程");
    const groups = groupLearningResources();
    expect(groups.some((group) => group.key === "training_videos")).toBe(true);
    expect(groups.some((group) => group.key === "five_courses")).toBe(true);
  });

  it("Radar allocation smoke still keeps threshold 40 and Top20 cap 20", () => {
    expect(DEFAULT_ALLOCATION_RULES.minimum_qualified_score).toBe(40);
    expect(DEFAULT_ALLOCATION_RULES.daily_recommendation_cap).toBe(20);
  });

  it("canonical Partner Quiz Hub remains at /quiz/21d (not obsolete /quiz/hub)", async () => {
    const { CUSTOMER_JOURNEY_HUB_ITEMS } = await import(
      "@/lib/customers/customer-journey-hub-items"
    );
    const quiz = CUSTOMER_JOURNEY_HUB_ITEMS.find((item) => item.title === "心理測驗");
    expect(quiz?.href).toBe("/quiz/21d");
    expect(quiz?.href).not.toBe("/quiz/hub");
    expect(quiz?.waitingBadge).toBe(true);
  });
});
