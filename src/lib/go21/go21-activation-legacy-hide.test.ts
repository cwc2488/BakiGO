import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Go21 activation + legacy coaching hide", () => {
  it("customer start-21d seeds customerId from route mode (never empty on first paint)", () => {
    const page = src("src/components/quiz/Experience21dStartPage.tsx");
    expect(page).toContain('mode.kind === "customer"');
    expect(page).toContain("mode.customerId");
    expect(page).toContain("effectiveCustomerId");
    expect(page).toContain("initialCustomerName");
    expect(page).toContain("載入中");
    // Must not only seed from interest query param
    expect(page).toMatch(/seededCustomerId[\s\S]*mode\.kind === "customer"/);
  });

  it("customer start route prefetches display name server-side", () => {
    const route = src("src/app/customers/[id]/start-21d/page.tsx");
    expect(route).toContain("getMemberIdFromCookies");
    expect(route).toContain("display_name");
    expect(route).toContain("initialCustomerName");
  });

  it("hides legacy generic coaching start CTA from customer detail", () => {
    const section = src("src/components/coaching/CoachingCustomerSection.tsx");
    expect(section).toContain("開通 21 天 AI 陪跑");
    expect(section).toContain("Baki Go 21");
    expect(section).not.toContain("開始一般陪跑");
    expect(section).not.toContain("一般陪跑連結（舊版表單）");
    expect(section).not.toContain("CoachingPlanConfirmForm");
  });

  it("redirects Go21 enrollments from legacy /coaching portal to /go21", () => {
    const route = src("src/app/c/[token]/coaching/page.tsx");
    expect(route).toContain("isExperience21dEnrollment");
    expect(route).toContain('redirect(`/c/${encodeURIComponent(token)}/go21`)');
    expect(route).toContain("CoachingCustomerPortalPage");
  });

  it("keeps coach Attention hub reachable as 陪跑中心", () => {
    const hub = src("src/lib/customers/customer-journey-hub-items.ts");
    const nav = src("src/lib/ui/work-hub-links.ts");
    expect(hub).toContain('title: "陪跑中心"');
    expect(hub).toContain('href: "/coaching"');
    expect(nav).toContain('title: "陪跑中心"');
    expect(nav).toContain('href: "/coaching"');
  });
});
