import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Go21 activation E2E path (durable)", () => {
  it("activation upserts cloud customer and returns portalToken from service role", () => {
    const activation = src("src/lib/analysis/handoff/experience-21d-activation.ts");
    expect(activation).toContain("ensureOwnedCloudCustomer");
    expect(activation).toContain("ensureCustomerPortalTokenServiceRole");
    expect(activation).toContain("portalToken");
    expect(activation).toContain("customerProfile");

    const ensure = src("src/lib/go21/ensure-cloud-customer.ts");
    expect(ensure).toContain('.from("customers")');
    expect(ensure).toContain('.from("customer_portal_tokens")');
    expect(ensure).toContain("isCloudDatabaseMemberId");
  });

  it("customer Go21 card loads via /api/coaching/go21/status with timeout (not browser RLS)", () => {
    const section = src("src/components/coaching/CoachingCustomerSection.tsx");
    expect(section).toContain("/api/coaching/go21/status");
    expect(section).toContain("LOAD_TIMEOUT_MS");
    expect(section).toContain("flushCustomerCloudPushAsync");
    expect(section).toContain("openActivation");
    expect(section).not.toContain("fetchCustomerPortalToken");
    expect(section).toContain("重試載入");
  });

  it("start page posts customerProfile and prefers portalToken from API", () => {
    const start = src("src/components/quiz/Experience21dStartPage.tsx");
    expect(start).toContain("customerProfile");
    expect(start).toContain("portalToken");
    expect(start).toContain("flushCustomerCloudPushAsync");
  });

  it("auth fetch times out instead of hanging forever on getSession", () => {
    const fetch = src("src/lib/quiz/quiz-member-fetch.ts");
    expect(fetch).toContain("SESSION_TIMEOUT_MS");
    expect(fetch).toContain("登入狀態載入逾時");
  });
});

describe("ensureOwnedCloudCustomer unit (mocked)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects non-cloud member ids with a clear message", async () => {
    vi.doMock("@/lib/supabase/service-client", () => ({
      createSupabaseServiceClient: () => {
        throw new Error("should_not_call");
      },
    }));
    const { ensureOwnedCloudCustomer } = await import("@/lib/go21/ensure-cloud-customer");
    await expect(
      ensureOwnedCloudCustomer({
        ownerMemberId: "member-default",
        customerId: "11111111-1111-4111-8111-111111111111",
        profile: { displayName: "測試" },
      }),
    ).rejects.toThrow(/雲端帳號/);
  });

  it("rejects non-uuid customer ids", async () => {
    const { ensureOwnedCloudCustomer } = await import("@/lib/go21/ensure-cloud-customer");
    await expect(
      ensureOwnedCloudCustomer({
        ownerMemberId: "11111111-1111-4111-8111-111111111111",
        customerId: "customer-local-not-uuid",
        profile: { displayName: "測試" },
      }),
    ).rejects.toThrow(/顧客資料尚未就緒/);
  });
});
