import { describe, expect, it } from "vitest";
import {
  buildCandidateId,
  normalizeUsername,
  parseCandidateId,
  resolveCandidateInput,
  resolveEnrichUsername,
} from "./resolve-candidate-input";

describe("resolveCandidateInput", () => {
  it("parses Threads username", () => {
    const result = resolveCandidateInput({ threads: "@ExampleUser" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.platform).toBe("threads");
    expect(result.normalized_username).toBe("exampleuser");
  });

  it("parses Instagram profile URL", () => {
    const result = resolveCandidateInput({
      instagram: "https://www.instagram.com/bluebottle/",
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.platform).toBe("instagram");
    expect(result.normalized_username).toBe("bluebottle");
  });

  it("rejects dual platform submission", () => {
    const result = resolveCandidateInput({ threads: "a", instagram: "b" });
    expect(result).toEqual({ error: "Provide only one platform per submission" });
  });
});

describe("buildCandidateId", () => {
  it("dedups by platform and normalized username", () => {
    expect(buildCandidateId("threads", normalizeUsername("User_A"))).toBe(
      "cand_threads_user_a",
    );
  });
});

describe("resolveEnrichUsername", () => {
  it("recovers a wiped stored username from cand_threads_* id", () => {
    expect(parseCandidateId("cand_threads_gym_stranger")).toEqual({
      platform: "threads",
      normalized_username: "gym_stranger",
    });
    expect(
      resolveEnrichUsername({
        candidate_id: "cand_threads_gym_stranger",
        platform: "threads",
      }),
    ).toBe("gym_stranger");
  });

  it("prefers payload then stored username over the id slug", () => {
    expect(
      resolveEnrichUsername({
        payload_username: "@LiveUser",
        stored_username: "old_user",
        candidate_id: "cand_threads_gym_stranger",
        platform: "threads",
      }),
    ).toBe("liveuser");
    expect(
      resolveEnrichUsername({
        stored_username: "stored_user",
        candidate_id: "cand_threads_gym_stranger",
        platform: "threads",
      }),
    ).toBe("stored_user");
  });
});
