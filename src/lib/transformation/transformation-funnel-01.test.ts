import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  TRANSFORMATION_GOALS,
  TRANSFORMATION_PAIN_POINTS,
} from "@/lib/transformation/transformation-contract";
import {
  formatTaiwanMobilePhone,
  isValidTaiwanMobilePhone,
} from "@/lib/transformation/transformation-phone";
import {
  buildTransformationContactFingerprint,
  normalizeTransformationShareCode,
  validateTransformationPublicSubmit,
  TransformationError,
} from "@/lib/transformation/transformation-service";
import {
  mergeTransformationAttribution,
  parseTransformationAttribution,
} from "@/lib/transformation/transformation-utm";
import {
  trackTransformationFormStartOnce,
  trackTransformationLeadOnce,
} from "@/lib/meta/track-transformation-meta";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("TRANSFORMATION-FUNNEL-01", () => {
  it("uses additive migration 062 and independent transformation tables", () => {
    expect(
      existsSync(resolve(process.cwd(), "supabase/migrations/062_transformation_funnel_v1.sql")),
    ).toBe(true);
    const migration = src("supabase/migrations/062_transformation_funnel_v1.sql");
    expect(migration).toContain("transformation_share_links");
    expect(migration).toContain("transformation_leads");
    expect(migration).toContain("owner_partner_id");
    expect(migration).toContain("revoke all on table public.transformation_leads");
    expect(migration).not.toContain("drop table");
  });

  it("resolves share codes safely and never trusts client partner UUID on public submit", () => {
    expect(normalizeTransformationShareCode("ab12cd")).toBe("AB12CD");
    expect(normalizeTransformationShareCode("bad")).toBeNull();
    const submit = src("src/app/api/transformation/public/submit/route.ts");
    expect(submit).toContain("forged_partner_id");
    expect(submit).toContain("submitTransformationLead");
    expect(submit).not.toContain("body.ownerPartnerId ??");
  });

  it("validates Taiwan phone, consent, and required fields", () => {
    const base = {
      shareCode: "ABCD12",
      name: "小美",
      phone: "0912-345-678",
      goal: TRANSFORMATION_GOALS[0],
      targetAreaOrProblem: "腹部",
      painPoint: TRANSFORMATION_PAIN_POINTS[0],
      consentAccepted: true,
    };
    expect(validateTransformationPublicSubmit(base).phone).toBe("0912345678");
    expect(() => validateTransformationPublicSubmit({ ...base, consentAccepted: false })).toThrow(
      TransformationError,
    );
    expect(() => validateTransformationPublicSubmit({ ...base, phone: "123" })).toThrow(
      TransformationError,
    );
    expect(isValidTaiwanMobilePhone("0912345678")).toBe(true);
    expect(formatTaiwanMobilePhone("+886912345678")).toBe("0912345678");
  });

  it("builds contact fingerprints for dedupe", () => {
    const a = buildTransformationContactFingerprint({ phone: "0912-345-678", socialContact: "@ming" });
    const b = buildTransformationContactFingerprint({ phone: "0912345678", socialContact: "ming" });
    expect(a).toBe(b);
    expect(a).not.toBe(buildTransformationContactFingerprint({ phone: "0987654321" }));
  });

  it("preserves first-touch attribution merge including fbclid", () => {
    const first = parseTransformationAttribution({
      utm_source: "meta",
      fbclid: "fb123",
    });
    const second = parseTransformationAttribution({ utm_source: "other", ad_id: "ad1" });
    const merged = mergeTransformationAttribution(first, second);
    expect(merged.utmSource).toBe("meta");
    expect(merged.fbclid).toBe("fb123");
    expect(merged.adId).toBe("ad1");
  });

  it("fires Meta Lead and Google Ads conversion only after non-duplicate success", () => {
    const landing = src("src/components/transformation/TransformationLandingPage.tsx");
    expect(landing).toContain("trackTransformationGoogleAdsConversionOnce");
    expect(landing).toMatch(
      /!payload\.duplicateOfExisting[\s\S]*trackTransformationLeadOnce[\s\S]*trackTransformationGoogleAdsConversionOnce/,
    );
  });

  it("fires Lead only after success and FormStart only once", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      configurable: true,
    });
    const calls: unknown[][] = [];
    (globalThis as { fbq?: (...args: unknown[]) => void }).fbq = (...args: unknown[]) => {
      calls.push(args);
    };
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1308235894542058";
    expect(trackTransformationFormStartOnce()).toBe(true);
    expect(trackTransformationFormStartOnce()).toBe(false);
    expect(trackTransformationLeadOnce("lead-1")).toBe(true);
    expect(trackTransformationLeadOnce("lead-1")).toBe(false);
    expect(calls.some((c) => c[0] === "trackCustom" && c[1] === "TransformationFormStart")).toBe(true);
    expect(calls.filter((c) => c[0] === "track" && c[1] === "Lead")).toHaveLength(1);

    const landing = src("src/components/transformation/TransformationLandingPage.tsx");
    expect(landing).toContain("trackTransformationLeadOnce");
    expect(landing).toContain("!payload.duplicateOfExisting");
  });

  it("keeps Pixel on /transform only and does not alter global MetaPixel mounts", () => {
    expect(src("src/app/transform/[code]/layout.tsx")).toContain("MetaPixel");
    expect(src("src/components/meta/MetaPixel.tsx")).toContain('fbq("track", "PageView")');
    expect(src("src/app/join/[code]/layout.tsx")).toContain("MetaPixel");
    expect(src("src/app/layout.tsx")).not.toContain("MetaPixel");
  });

  it("wires owner-only admin surfaces and public path", () => {
    expect(src("src/components/admin/AdminCenterPage.tsx")).toContain("/admin/transformation");
    expect(src("src/lib/auth/public-paths.ts")).toContain('"/transform/"');
    const adminApi = src("src/app/api/admin/transformation/leads/route.ts");
    expect(adminApi).toContain("assertSuperAdmin");
    const leadDetailApi = src("src/app/api/admin/transformation/leads/[id]/route.ts");
    expect(leadDetailApi).toContain("assertSuperAdmin");
    expect(leadDetailApi).toContain("deleteTransformationLeadForAdmin");
    const shareApi = src("src/app/api/admin/transformation/share/route.ts");
    expect(shareApi).toContain("assertSuperAdmin");
    expect(shareApi).toContain("getOrCreateTransformationShareLink");
  });

  it("uses compact admin list and authenticated delete", () => {
    const adminPage = src("src/components/transformation/AdminTransformationPage.tsx");
    expect(adminPage).toContain("<table");
    expect(adminPage).toContain("確定要刪除");
    expect(adminPage).toContain('method: "DELETE"');
    const service = src("src/lib/transformation/transformation-service.ts");
    expect(service).toContain("deleteTransformationLeadForAdmin");
    expect(service).toMatch(/deleteTransformationLeadForAdmin[\s\S]*transformation_leads[\s\S]*\.delete\(\)/);
  });

  it("links converted leads via customer search instead of UUID paste", () => {
    const detailPage = src("src/components/transformation/AdminTransformationDetailPage.tsx");
    expect(detailPage).toContain("連結顧客");
    expect(detailPage).toContain("searchCustomers");
    expect(detailPage).toContain("確認連結");
    expect(detailPage).not.toContain("貼上 ID");
  });

  it("shows active contact success UI with confirmed LINE destination", () => {
    const landing = src("src/components/transformation/TransformationLandingPage.tsx");
    expect(landing).toContain("申請完成！");
    expect(landing).toContain("最後一步：主動聯絡我們");
    expect(landing).toContain("https://line.me/ti/p/rqkTMnEK8J");
    expect(landing).toContain("https://www.instagram.com/Omtcsh/");
    expect(landing).toContain("用 LINE 聯絡我");
    expect(landing).toContain("用 Instagram 聯絡我");
    expect(landing).toContain("trackTransformationLeadOnce");
  });

  it("enforces owner-only resolve via super admin check in service", () => {
    const service = src("src/lib/transformation/transformation-service.ts");
    expect(service).toContain("resolveIsSuperAdmin");
    expect(service).toContain("resolveActiveTransformationOwnerByCode");
    expect(service).toContain("customer_before_conversion");
    expect(service).toMatch(/listTransformationLeadsForAdmin[\s\S]*transformation_leads/);
  });

  it("deletes lead row only and keeps customer FK as set null on customer delete", () => {
    const migration = src("supabase/migrations/062_transformation_funnel_v1.sql");
    expect(migration).toContain("customer_id uuid references public.customers (id) on delete set null");
    const service = src("src/lib/transformation/transformation-service.ts");
    expect(service).toMatch(
      /deleteTransformationLeadForAdmin[\s\S]*from\("transformation_leads"\)[\s\S]*\.delete\(\)/,
    );
    expect(service).not.toMatch(/deleteTransformationLeadForAdmin[\s\S]*from\("customers"\)/);
  });

  it("does not modify recruitment or quiz funnel files", () => {
    expect(src("src/app/join/[code]/page.tsx")).toContain("JoinRecruitmentPage");
    expect(src("src/lib/recruitment/recruitment-service.ts")).toContain("recruitment_leads");
    expect(src("src/lib/auth/public-paths.ts")).toContain('"/join/"');
  });
});
