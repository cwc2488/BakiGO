import { beforeEach, describe, expect, it } from "vitest";
import {
  __getRecognitionPublicRateLimitBucketCountsForTests,
  __resetRecognitionPublicRateLimitForTests,
  allowRecognitionPublicLookup,
  allowRecognitionPublicSubmission,
  getRecognitionClientIp,
} from "@/lib/recognition/recognition-public-rate-limit";

describe("Recognition public rate limit", () => {
  beforeEach(() => {
    __resetRecognitionPublicRateLimitForTests();
  });

  it("treats independent client keys separately", () => {
    expect(allowRecognitionPublicLookup("client-a", 1000)).toBe(true);
    expect(allowRecognitionPublicLookup("client-b", 1000)).toBe(true);
  });

  it("expires old entries after the window", () => {
    const key = "client-expire";
    expect(allowRecognitionPublicSubmission(key, 1000)).toBe(true);
    expect(allowRecognitionPublicSubmission(key, 1000 + 11 * 60 * 1000)).toBe(true);
  });

  it("prunes stale buckets over time", () => {
    __resetRecognitionPublicRateLimitForTests();
    expect(allowRecognitionPublicLookup("stale-a", 1000)).toBe(true);
    expect(allowRecognitionPublicLookup("stale-b", 1000)).toBe(true);
    expect(__getRecognitionPublicRateLimitBucketCountsForTests().lookupBuckets).toBe(2);

    // trigger periodic prune path
    for (let i = 0; i < 50; i += 1) {
      allowRecognitionPublicLookup(`fresh-${i}`, 1000 + 11 * 60 * 1000);
    }
    expect(__getRecognitionPublicRateLimitBucketCountsForTests().lookupBuckets).toBeLessThanOrEqual(50);
  });

  it("fallback identity is not a permanent shared unknown bucket", () => {
    const reqA = new Request("http://localhost", {
      headers: {
        "user-agent": "agent-a",
        "accept-language": "zh-TW",
      },
    });
    const reqB = new Request("http://localhost", {
      headers: {
        "user-agent": "agent-b",
        "accept-language": "en-US",
      },
    });
    expect(getRecognitionClientIp(reqA)).not.toBe("unknown");
    expect(getRecognitionClientIp(reqB)).not.toBe("unknown");
    expect(getRecognitionClientIp(reqA)).not.toBe(getRecognitionClientIp(reqB));
  });
});
