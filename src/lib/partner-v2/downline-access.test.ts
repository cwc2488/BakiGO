import { describe, expect, it } from "vitest";
import {
  canViewDownlineMemberData,
  resolveDownlineAccess,
} from "@/lib/partner-v2/downline-access";
import type { Member } from "@/types/member";

function member(id: string, sponsorId?: string): Member {
  return {
    id,
    sponsorMemberId: sponsorId,
    rankKey: "new_member",
    status: "active",
    displayName: id,
    herbalifeMemberId: id,
    organizationId: "org1",
    joinedAt: "2026-01-01",
  } as Member;
}

describe("downline access", () => {
  const tree = [
    member("A"),
    member("B", "A"),
    member("C", "B"),
    member("D", "A"),
    member("X"),
    member("Y", "X"),
  ];

  it("A can view B, C, D", () => {
    expect(resolveDownlineAccess(member("A"), "B", tree)).toBe("authorized_downline");
    expect(resolveDownlineAccess(member("A"), "C", tree)).toBe("authorized_downline");
    expect(resolveDownlineAccess(member("A"), "D", tree)).toBe("authorized_downline");
    expect(canViewDownlineMemberData(member("A"), "C", tree)).toBe(true);
  });

  it("B can view C but not D", () => {
    expect(canViewDownlineMemberData(member("B"), "C", tree)).toBe(true);
    expect(canViewDownlineMemberData(member("B"), "D", tree)).toBe(false);
  });

  it("D cannot view B or C", () => {
    expect(canViewDownlineMemberData(member("D"), "B", tree)).toBe(false);
    expect(canViewDownlineMemberData(member("D"), "C", tree)).toBe(false);
  });

  it("X/Y isolated from A tree", () => {
    expect(canViewDownlineMemberData(member("A"), "Y", tree)).toBe(false);
    expect(canViewDownlineMemberData(member("X"), "B", tree)).toBe(false);
  });

  it("viewer can always view self", () => {
    expect(resolveDownlineAccess(member("A"), "A", tree)).toBe("self");
  });
});
