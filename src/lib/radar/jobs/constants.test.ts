import { describe, expect, it } from "vitest";
import {
  GLOBAL_CANDIDATE_LIFECYCLE_STATES,
  MEMBER_DEVELOPMENT_STATES,
  isExcludedFromMemberRecommendations,
  isGlobalLifecycleState,
  isMemberDevelopmentState,
} from "./constants";

describe("global vs member candidate state separation", () => {
  it("allows only global lifecycle states", () => {
    for (const state of GLOBAL_CANDIDATE_LIFECYCLE_STATES) {
      expect(isGlobalLifecycleState(state)).toBe(true);
    }

    for (const state of MEMBER_DEVELOPMENT_STATES) {
      expect(isGlobalLifecycleState(state)).toBe(false);
    }
  });

  it("tracks member development states separately", () => {
    for (const state of MEMBER_DEVELOPMENT_STATES) {
      expect(isMemberDevelopmentState(state)).toBe(true);
    }
    expect(isMemberDevelopmentState("active")).toBe(false);
  });

  it("excludes in-progress development for one member only via member state", () => {
    expect(
      isExcludedFromMemberRecommendations({
        development_state: "in_progress",
        excluded_from_recommendations: false,
      }),
    ).toBe(true);

    expect(
      isExcludedFromMemberRecommendations({
        development_state: null,
        excluded_from_recommendations: false,
      }),
    ).toBe(false);
  });
});
