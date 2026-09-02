import { describe, expect, it } from "vitest";
import { capabilityStateFromMetaError } from "./capability-states";

describe("capabilityStateFromMetaError", () => {
  it("maps Threads 1000-follower lookup errors without inventing content", () => {
    expect(
      capabilityStateFromMetaError(
        "You can only lookup profiles that have 1,000 or more followers on Threads.",
      ),
    ).toBe("below_threads_profile_threshold");
  });

  it("keeps other Meta failures as source_unavailable", () => {
    expect(capabilityStateFromMetaError("An unexpected error has occurred.")).toBe(
      "source_unavailable",
    );
  });
});
