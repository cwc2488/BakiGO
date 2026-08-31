import { describe, expect, it } from "vitest";
import { collectDownlineIds } from "@/lib/business-engine/utils";
import { filterCloudDatabaseMemberIds, isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import type { Member } from "@/types/member";

function member(partial: Partial<Member> & Pick<Member, "id">): Member {
  return {
    organizationId: "org",
    herbalifeMemberId: partial.herbalifeMemberId ?? partial.id,
    displayName: partial.displayName ?? partial.id,
    joinedAt: "2026-01-01",
    status: "active",
    tags: [],
    rankKey: partial.rankKey ?? "supervisor",
    roleKey: partial.roleKey ?? "partner",
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

  it("downline cloud fetch targets only UUID cloud members and excludes viewer", () => {
    const viewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const child = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const localOnly = "member-virtual-upline";
    const targets = filterCloudDatabaseMemberIds(
      [viewer, child, localOnly].filter((id) => id !== viewer),
    );
    expect(targets).toEqual([child]);
    expect(isCloudDatabaseMemberId(localOnly)).toBe(false);
  });
});
