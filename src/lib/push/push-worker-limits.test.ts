import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_PUSH_LIMIT,
  DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT,
  MAX_CALENDAR_PUSH_LIMIT,
  MAX_FIVE_PLUS_FIVE_PUSH_LIMIT,
  resolvePushWorkerLimits,
} from "@/lib/push/push-worker-limits";

describe("push worker limit resolution", () => {
  it("GET cron keeps calendar at 80 and fivePlusFive at 1000", () => {
    const limits = resolvePushWorkerLimits({ method: "GET" });
    expect(limits.calendarLimit).toBe(DEFAULT_CALENDAR_PUSH_LIMIT);
    expect(limits.calendarLimit).toBe(80);
    expect(limits.fivePlusFiveLimit).toBe(DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT);
    expect(limits.fivePlusFiveLimit).toBe(1000);
  });

  it("POST body.limit does not raise calendar past 200", () => {
    const limits = resolvePushWorkerLimits({ method: "POST", bodyLimit: 1000 });
    expect(limits.calendarLimit).toBe(MAX_CALENDAR_PUSH_LIMIT);
    expect(limits.calendarLimit).toBe(200);
    expect(limits.fivePlusFiveLimit).toBe(MAX_FIVE_PLUS_FIVE_PUSH_LIMIT);
    expect(limits.fivePlusFiveLimit).toBe(1000);
  });
});
