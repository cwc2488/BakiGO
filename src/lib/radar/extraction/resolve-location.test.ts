import { describe, expect, it } from "vitest";
import { computeLocationScore } from "../scoring/modules/location";
import { LOCATION_POINTS } from "../scoring/config";
import {
  isMemberLocationContextConfigured,
  resolveLocationLevel,
} from "./resolve-location";

describe("resolveLocationLevel — missing member context rule", () => {
  it("returns member_context_neutral when member has no development areas", () => {
    expect(isMemberLocationContextConfigured(undefined)).toBe(false);
    expect(
      resolveLocationLevel(
        {
          availability: "unknown",
          reasoning: "位置資料不足",
        },
        undefined,
      ),
    ).toBe("member_context_neutral");
    expect(computeLocationScore({ level: "member_context_neutral" })).toBe(2.5);
    expect(LOCATION_POINTS.member_context_neutral).toBe(2.5);
  });

  it("returns unknown (0 pts) when member has areas but candidate location is unavailable", () => {
    expect(
      resolveLocationLevel(
        {
          availability: "unknown",
          reasoning: "位置資料不足",
        },
        {
          primary_city: "台北市",
          primary_district: "大安區",
        },
      ),
    ).toBe("unknown");
    expect(computeLocationScore({ level: "unknown" })).toBe(0);
  });

  it("does not treat missing member context as candidate unknown", () => {
    const level = resolveLocationLevel(
      {
        availability: "unknown",
        reasoning: "位置資料不足",
      },
      { secondary_areas: [] },
    );
    expect(level).toBe("member_context_neutral");
    expect(level).not.toBe("unknown");
  });
});
