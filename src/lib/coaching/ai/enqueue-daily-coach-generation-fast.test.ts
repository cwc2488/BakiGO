import { describe, expect, it } from "vitest";
import {
  buildProvisionalGenerationFingerprint,
  isProvisionalGenerationFingerprint,
} from "@/lib/coaching/ai/enqueue-daily-coach-generation-fast";

describe("provisional generation fingerprint", () => {
  it("marks defer fingerprints as provisional", () => {
    const fp = buildProvisionalGenerationFingerprint({
      enrollmentId: "enr",
      logDate: "2026-08-13",
      submittedAt: "2026-08-13T01:00:00.000Z",
    });
    expect(isProvisionalGenerationFingerprint(fp)).toBe(true);
    expect(isProvisionalGenerationFingerprint("abc123")).toBe(false);
  });
});
