import { describe, expect, it } from "vitest";
import {
  GLOBAL_CANDIDATE_LIFECYCLE_STATES,
  MEMBER_DEVELOPMENT_STATES,
} from "../jobs/constants";
import { InMemoryPipelineStore } from "./in-memory-pipeline-store";

describe("global vs member candidate state separation", () => {
  it("keeps member development states disjoint from global lifecycle states", () => {
    for (const developmentState of MEMBER_DEVELOPMENT_STATES) {
      expect(GLOBAL_CANDIDATE_LIFECYCLE_STATES).not.toContain(developmentState);
    }
  });

  it("pipeline store has no API to mutate global candidate lifecycle", () => {
    const store = new InMemoryPipelineStore();
    const mutators = Object.keys(store).filter((key) =>
      /lifecycle|candidate_pool|global/i.test(key),
    );
    expect(mutators).toEqual([]);
  });
});
