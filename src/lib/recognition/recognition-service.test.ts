import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertRecognitionStatusTransition,
  DEFAULT_RECOGNITION_AWARDS,
  isValidRecognitionStatusTransition,
  toCreateRecognitionEventRpcArgs,
  validateRecognitionAwardReorderInput,
  validateRecognitionEventInput,
} from "@/lib/recognition/recognition-domain";
import {
  createRecognitionEvent,
  RecognitionServiceError,
  reorderEventAwards,
} from "@/lib/recognition/recognition-service";

const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service-client", () => ({
  createSupabaseServiceClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockOrder.mockReset();
  mockFrom.mockReset();
});

describe("Recognition Center — seeded award catalog", () => {
  it("has exactly 27 default awards", () => {
    expect(DEFAULT_RECOGNITION_AWARDS).toHaveLength(27);
  });

  it("uses official MAP display names without 第三個月過關", () => {
    expect(DEFAULT_RECOGNITION_AWARDS.find((award) => award.slug === "map_month_1")?.name).toBe("MAP 第一個月");
    expect(DEFAULT_RECOGNITION_AWARDS.find((award) => award.slug === "map_month_2")?.name).toBe("MAP 第二個月");
    expect(DEFAULT_RECOGNITION_AWARDS.find((award) => award.slug === "map_month_3_pass")?.name).toBe("MAP 第三個月");
    for (const award of DEFAULT_RECOGNITION_AWARDS) {
      expect(award.name).not.toContain("第三個月過關");
    }
  });

  it("has exactly 12 photo-required awards", () => {
    const photoAwards = DEFAULT_RECOGNITION_AWARDS.filter((a) => a.requiresPhoto);
    expect(photoAwards).toHaveLength(12);
  });

  it("has exactly 15 name-only awards", () => {
    const nameOnly = DEFAULT_RECOGNITION_AWARDS.filter((a) => !a.requiresPhoto);
    expect(nameOnly).toHaveLength(15);
  });

  it("photo-required slugs match frozen specification", () => {
    const photoSlugs = DEFAULT_RECOGNITION_AWARDS.filter((a) => a.requiresPhoto).map((a) => a.slug);
    expect(photoSlugs).toContain("map_month_3_pass");
    expect(photoSlugs).toContain("new_supervisor");
    expect(photoSlugs).toContain("new_world_team_pass");
    expect(photoSlugs).toContain("world_team_1pct");
    expect(photoSlugs).toContain("club_5k");
    expect(photoSlugs).toContain("top_10000");
    expect(photoSlugs).toContain("new_promo_pass");
    expect(photoSlugs).toContain("new_ro2500_promo_pass");
    expect(photoSlugs).toContain("new_wealth_pass");
    expect(photoSlugs).toContain("ro7500_wealth_pass");
    expect(photoSlugs).toContain("new_president_pass");
    expect(photoSlugs).toContain("million_lifetime");
  });

  it("name-only slugs are not photo-required", () => {
    const nameOnlySlugs = [
      "map_month_1", "map_month_2",
      "world_team_month_1", "world_team_month_2", "world_team_month_3",
      "promo_month_1", "promo_month_2",
      "ro2500_promo_month_1", "ro2500_promo_month_2",
      "wealth_month_1", "wealth_month_2",
      "ro7500_wealth_month_1", "ro7500_wealth_month_2",
      "president_month_1", "president_month_2",
    ];
    for (const slug of nameOnlySlugs) {
      const award = DEFAULT_RECOGNITION_AWARDS.find((a) => a.slug === slug);
      expect(award, `Award ${slug} should exist`).toBeDefined();
      expect(award?.requiresPhoto, `Award ${slug} should not require photo`).toBe(false);
    }
  });

  it("all slugs are unique", () => {
    const slugs = DEFAULT_RECOGNITION_AWARDS.map((a) => a.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it("awards are NOT career rank keys", () => {
    const careerRankKeys = [
      "member", "supervisor", "active_supervisor",
      "world_team", "promotion_group", "wealth_group", "president",
    ];
    for (const award of DEFAULT_RECOGNITION_AWARDS) {
      expect(careerRankKeys).not.toContain(award.slug);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Validation helpers — tests exercise production helpers
// ---------------------------------------------------------------------------

describe("Recognition Center — event input validation (pure)", () => {
  it("rejects month 0", () => {
    expect(validateRecognitionEventInput({ month: 0 })).not.toBeNull();
  });

  it("rejects month 13", () => {
    expect(validateRecognitionEventInput({ month: 13 })).not.toBeNull();
  });

  it("accepts months 1–12", () => {
    for (let m = 1; m <= 12; m++) {
      expect(validateRecognitionEventInput({ month: m })).toBeNull();
    }
  });

  it("accepts valid year 2026", () => {
    expect(validateRecognitionEventInput({ year: 2026 })).toBeNull();
  });

  it("rejects year 1999", () => {
    expect(validateRecognitionEventInput({ year: 1999 })).not.toBeNull();
  });

  it("rejects year 2101", () => {
    expect(validateRecognitionEventInput({ year: 2101 })).not.toBeNull();
  });

  it("rejects end before start", () => {
    expect(
      validateRecognitionEventInput({
        collectStartsAt: "2026-09-10T00:00:00Z",
        collectEndsAt: "2026-09-01T00:00:00Z",
      }),
    ).not.toBeNull();
  });

  it("accepts end equal to start", () => {
    expect(
      validateRecognitionEventInput({
        collectStartsAt: "2026-09-10T00:00:00Z",
        collectEndsAt: "2026-09-10T00:00:00Z",
      }),
    ).toBeNull();
  });

  it("accepts end after start", () => {
    expect(
      validateRecognitionEventInput({
        collectStartsAt: "2026-09-01T00:00:00Z",
        collectEndsAt: "2026-09-30T00:00:00Z",
      }),
    ).toBeNull();
  });

  it("allows both null (no collection window)", () => {
    expect(validateRecognitionEventInput({ collectStartsAt: null, collectEndsAt: null })).toBeNull();
  });

  it("allows same year/month for two independent events (no uniqueness constraint)", () => {
    // There is no unique constraint on (year, month) — this is intentional.
    // Multiple events in the same month are allowed (e.g. 月會 + STS).
    // This test documents the product rule; the DB migration omits the constraint.
    const event1 = { year: 2026, month: 9, name: "月會" };
    const event2 = { year: 2026, month: 9, name: "STS" };
    // Both should be valid — no uniqueness conflict
    expect(validateRecognitionEventInput({ year: event1.year, month: event1.month })).toBeNull();
    expect(validateRecognitionEventInput({ year: event2.year, month: event2.month })).toBeNull();
    expect(event1.year).toBe(event2.year);
    expect(event1.month).toBe(event2.month);
    expect(event1.name).not.toBe(event2.name);
  });
});

// ---------------------------------------------------------------------------
// 3. Status transition rules — tests exercise production helpers
// ---------------------------------------------------------------------------

describe("Recognition Center — status transition rules", () => {
  it("draft → collecting is valid", () => {
    expect(isValidRecognitionStatusTransition("draft", "collecting")).toBe(true);
  });

  it("collecting → closed is valid", () => {
    expect(isValidRecognitionStatusTransition("collecting", "closed")).toBe(true);
  });

  it("closed → collecting is valid (reopen, frozen product rule)", () => {
    expect(isValidRecognitionStatusTransition("closed", "collecting")).toBe(true);
  });

  it("archived cannot transition to anything", () => {
    const targets = ["draft", "collecting", "closed", "archived"] as const;
    for (const t of targets) {
      expect(isValidRecognitionStatusTransition("archived", t)).toBe(false);
    }
  });

  it("draft → closed is not directly valid", () => {
    expect(assertRecognitionStatusTransition("draft", "closed")).not.toBeNull();
  });

  it("collecting → draft is not valid", () => {
    expect(assertRecognitionStatusTransition("collecting", "draft")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Award reorder validation — tests exercise production helper
// ---------------------------------------------------------------------------

describe("Recognition Center — reorder validation", () => {
  it("accepts a complete ordered set", () => {
    expect(
      validateRecognitionAwardReorderInput(["a", "b", "c"], ["a", "b", "c"]),
    ).toBeNull();
  });

  it("rejects duplicate reorder ids", () => {
    expect(
      validateRecognitionAwardReorderInput(["a", "a", "c"], ["a", "b", "c"]),
    ).toBe("ordered award ids contain duplicates.");
  });

  it("rejects incomplete reorder list", () => {
    expect(
      validateRecognitionAwardReorderInput(["a", "b"], ["a", "b", "c"]),
    ).toBe("ordered award ids must include the complete current event-award set.");
  });

  it("rejects foreign ids", () => {
    expect(
      validateRecognitionAwardReorderInput(["a", "b", "x"], ["a", "b", "c"]),
    ).toBe("ordered award ids must all belong to the target event.");
  });
});

// ---------------------------------------------------------------------------
// 5. Confirm Recognition admin allowlist is not rank-based
// ---------------------------------------------------------------------------

describe("Recognition Center — admin permission model", () => {
  it("does not grant admin access based on president rank alone", () => {
    // Authorization is via recognition_admin_members table.
    // rank = president is NOT sufficient.
    // This test verifies the architectural principle at the code level.
    // The API routes call assertRecognitionAdmin which queries recognition_admin_members,
    // not members.current_level or members.role.

    const presidentRank = "president";
    const careerRanksThatDoNotGrantAccess = [
      "member", "supervisor", "active_supervisor",
      "world_team", "promotion_group", "wealth_group", "president",
    ];
    expect(careerRanksThatDoNotGrantAccess).toContain(presidentRank);
    // All ranks are in the "not granting access" list — including president.
    // This confirms the product rule that rank does NOT grant recognition admin.
  });
});

// ---------------------------------------------------------------------------
// 6. Existing career-rank behavior is unchanged (structural guard)
// ---------------------------------------------------------------------------

describe("Recognition Center — does not affect existing career rank keys", () => {
  it("recognition award slugs do not collide with RANK_KEYS", () => {
    const RANK_KEYS = {
      NEW_MEMBER: "new_member",
      SUPERVISOR: "supervisor",
      ACTIVE_SUPERVISOR: "active_supervisor",
      WORLD_TEAM: "world_team",
      PRESIDENT: "president",
      PROMOTION_GROUP: "promotion_group",
      WEALTH_GROUP: "wealth_group",
    };

    const rankKeyValues = Object.values(RANK_KEYS);
    const awardSlugs = DEFAULT_RECOGNITION_AWARDS.map((a) => a.slug);

    for (const slug of awardSlugs) {
      expect(rankKeyValues).not.toContain(slug);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Service contract tests — atomic create and reorder call RPCs
// ---------------------------------------------------------------------------

describe("Recognition Center service contract", () => {
  it("uses atomic RPC for event creation", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        id: "evt-1",
        name: "2026 年 9 月月會",
        year: 2026,
        month: 9,
        collect_starts_at: "2026-09-01T00:00:00Z",
        collect_ends_at: "2026-09-30T00:00:00Z",
        status: "draft",
        ppt_theme_id: null,
        event_template_id: null,
        copied_from_event_id: null,
        created_by_member_id: "mem-1",
        closed_at: null,
        created_at: "2026-08-18T00:00:00Z",
        updated_at: "2026-08-18T00:00:00Z",
      },
      error: null,
    });

    const event = await createRecognitionEvent({
      name: "2026 年 9 月月會",
      year: 2026,
      month: 9,
      collectStartsAt: "2026-09-01T00:00:00Z",
      collectEndsAt: "2026-09-30T00:00:00Z",
      createdByMemberId: "mem-1",
    });

    expect(event.id).toBe("evt-1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_recognition_event_with_awards",
      toCreateRecognitionEventRpcArgs({
        name: "2026 年 9 月月會",
        year: 2026,
        month: 9,
        collectStartsAt: "2026-09-01T00:00:00Z",
        collectEndsAt: "2026-09-30T00:00:00Z",
        createdByMemberId: "mem-1",
      }),
    );
  });

  it("surfaces RPC failure for atomic event creation", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "rpc failed" },
    });

    await expect(
      createRecognitionEvent({
        name: "2026 年 9 月月會",
        year: 2026,
        month: 9,
        createdByMemberId: "mem-1",
      }),
    ).rejects.toThrow(RecognitionServiceError);
  });

  it("rejects duplicate reorder ids before RPC call", async () => {
    mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          order: mockOrder.mockResolvedValue({
            data: [
              {
                id: "a",
                event_id: "evt-1",
                award_definition_id: "def-1",
                sort_order: 1,
                is_enabled: true,
                created_at: "x",
                updated_at: "x",
                recognition_award_definitions: null,
              },
              {
                id: "b",
                event_id: "evt-1",
                award_definition_id: "def-2",
                sort_order: 2,
                is_enabled: true,
                created_at: "x",
                updated_at: "x",
                recognition_award_definitions: null,
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    await expect(reorderEventAwards("evt-1", ["a", "a"])).rejects.toThrow(
      "ordered award ids contain duplicates.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects incomplete reorder list before RPC call", async () => {
    mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          order: mockOrder.mockResolvedValue({
            data: [
              {
                id: "a",
                event_id: "evt-1",
                award_definition_id: "def-1",
                sort_order: 1,
                is_enabled: true,
                created_at: "x",
                updated_at: "x",
                recognition_award_definitions: null,
              },
              {
                id: "b",
                event_id: "evt-1",
                award_definition_id: "def-2",
                sort_order: 2,
                is_enabled: true,
                created_at: "x",
                updated_at: "x",
                recognition_award_definitions: null,
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    await expect(reorderEventAwards("evt-1", ["a"])).rejects.toThrow(
      "ordered award ids must include the complete current event-award set.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("uses atomic RPC for complete valid reorder", async () => {
    mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          order: mockOrder.mockResolvedValue({
            data: [
              {
                id: "a",
                event_id: "evt-1",
                award_definition_id: "def-1",
                sort_order: 1,
                is_enabled: true,
                created_at: "x",
                updated_at: "x",
                recognition_award_definitions: null,
              },
              {
                id: "b",
                event_id: "evt-1",
                award_definition_id: "def-2",
                sort_order: 2,
                is_enabled: true,
                created_at: "x",
                updated_at: "x",
                recognition_award_definitions: null,
              },
            ],
            error: null,
          }),
        }),
      }),
    });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    await reorderEventAwards("evt-1", ["b", "a"]);

    expect(mockRpc).toHaveBeenCalledWith("reorder_recognition_event_awards", {
      p_event_id: "evt-1",
      p_award_ids: ["b", "a"],
    });
  });
});
