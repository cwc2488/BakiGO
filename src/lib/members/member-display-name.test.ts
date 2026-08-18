import { describe, expect, it } from "vitest";
import { getMemberDisplayName } from "@/lib/members/member-service";
import type { Member } from "@/types/member";

describe("getMemberDisplayName", () => {
  it("returns empty string when cloud member name fields are missing", () => {
    const member = {
      id: "member-cloud-1",
      nickname: undefined,
      displayName: undefined,
    } as unknown as Member;

    expect(getMemberDisplayName(member)).toBe("");
    expect(getMemberDisplayName(undefined)).toBe("");
  });
});
