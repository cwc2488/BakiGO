import { describe, expect, it } from "vitest";
import { collectDownlineIds } from "@/lib/business-engine/utils";
import type { Member } from "@/types/member";

function member(partial: Partial<Member> & Pick<Member, "id">): Member {
  return {
    organizationId: "org",
    herbalifeMemberId: partial.herbalifeMemberId ?? partial.id,
    name: partial.name ?? partial.id,
    rankKey: partial.rankKey ?? "supervisor",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sponsorMemberId: partial.sponsorMemberId,
    ...partial,
  };
}

describe("Product VP organization authorization (sponsor hierarchy)", () => {
  const upline = member({ id: "upline", rankKey: "promotion_group" });
  const downline = member({ id: "downline", sponsorMemberId: "upline" });
  const stranger = member({ id: "stranger" });
  const all = [upline, downline, stranger];

  it("authorized upline includes downline; unrelated partner does not", () => {
    expect(collectDownlineIds(all, "upline").has("downline")).toBe(true);
    expect(collectDownlineIds(all, "stranger").has("downline")).toBe(false);
  });

  it("self is not treated as downline scope for sponsorship", () => {
    expect(collectDownlineIds(all, "downline").has("downline")).toBe(false);
  });
});
