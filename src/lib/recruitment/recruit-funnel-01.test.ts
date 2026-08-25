import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  RECRUITMENT_AGE_RANGES,
  RECRUITMENT_MOTIVATIONS,
  RECRUITMENT_WORK_STATUSES,
} from "@/lib/recruitment/recruitment-contract";
import {
  buildRecruitmentContactFingerprint,
  normalizeRecruitmentShareCode,
  validateRecruitmentPublicSubmit,
  RecruitmentError,
} from "@/lib/recruitment/recruitment-service";
import { mergeRecruitmentUtm, parseRecruitmentUtm } from "@/lib/recruitment/recruitment-utm";
import { trackMetaLeadOnce } from "@/lib/meta/track-meta-lead";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("RECRUIT-FUNNEL-01", () => {
  it("uses additive migration 060 and independent recruitment tables", () => {
    expect(existsSync(resolve(process.cwd(), "supabase/migrations/060_recruitment_funnel_v1.sql"))).toBe(
      true,
    );
    const migration = src("supabase/migrations/060_recruitment_funnel_v1.sql");
    expect(migration).toContain("recruitment_share_links");
    expect(migration).toContain("recruitment_leads");
    expect(migration).toContain("partner_member_id");
    expect(migration).toContain("revoke all on table public.recruitment_leads");
    expect(migration).not.toContain("drop table");
  });

  it("resolves share codes safely and never trusts client partner UUID on public submit", () => {
    expect(normalizeRecruitmentShareCode("ab12cd")).toBe("AB12CD");
    expect(normalizeRecruitmentShareCode("bad")).toBeNull();
    const submit = src("src/app/api/recruitment/public/submit/route.ts");
    expect(submit).toContain("forged_partner_id");
    expect(submit).toContain("submitRecruitmentLead");
    expect(submit).not.toContain("body.partnerMemberId ??");
  });

  it("validates form: consent, motivations, region, and contact", () => {
    const base = {
      shareCode: "ABCD12",
      name: "小明",
      ageRange: RECRUITMENT_AGE_RANGES[0],
      city: "新北市",
      district: "板橋區",
      workStatus: RECRUITMENT_WORK_STATUSES[0],
      motivations: [RECRUITMENT_MOTIVATIONS[0]],
      weeklyAvailability: "3–6 小時",
      instagram: "ming",
      consentAccepted: true,
    };
    expect(validateRecruitmentPublicSubmit(base).name).toBe("小明");
    expect(() => validateRecruitmentPublicSubmit({ ...base, consentAccepted: false })).toThrow(
      RecruitmentError,
    );
    expect(() => validateRecruitmentPublicSubmit({ ...base, motivations: [] })).toThrow(RecruitmentError);
    expect(() =>
      validateRecruitmentPublicSubmit({ ...base, instagram: null, lineId: null, phone: null }),
    ).toThrow(RecruitmentError);
    expect(() =>
      validateRecruitmentPublicSubmit({ ...base, city: "火星", district: "一區" }),
    ).toThrow(RecruitmentError);
  });

  it("builds contact fingerprints consistently for conservative dedupe", () => {
    const a = buildRecruitmentContactFingerprint({ phone: "0912-345-678", instagram: "@Ming" });
    const b = buildRecruitmentContactFingerprint({ phone: "0912345678", instagram: "ming" });
    expect(a).toBe(b);
    expect(a).not.toBe(buildRecruitmentContactFingerprint({ phone: "0987654321" }));
  });

  it("preserves first-touch UTM merge", () => {
    const first = parseRecruitmentUtm({
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_campaign: "recruit_v1",
    });
    const second = parseRecruitmentUtm({ utm_source: "other", utm_content: "reel_01" });
    const merged = mergeRecruitmentUtm(first, second);
    expect(merged.utmSource).toBe("meta");
    expect(merged.utmContent).toBe("reel_01");
  });

  it("fires Lead only after success and only once per submission id", () => {
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
    expect(trackMetaLeadOnce("lead-1")).toBe(true);
    expect(trackMetaLeadOnce("lead-1")).toBe(false);
    expect(calls.filter((c) => c[0] === "track" && c[1] === "Lead")).toHaveLength(1);

    const join = src("src/components/recruitment/JoinRecruitmentPage.tsx");
    expect(join).toContain("trackMetaLeadOnce");
    expect(join).toContain("!payload.duplicateOfExisting");
  });

  it("keeps Pixel on /join only and does not alter Public Quiz MetaPixel scope mounts", () => {
    expect(src("src/app/join/[code]/layout.tsx")).toContain("MetaPixel");
    expect(src("src/components/meta/MetaPixel.tsx")).toContain('fbq("track", "PageView")');
    expect(src("src/app/quiz/fat-loss/layout.tsx")).toContain("MetaPixel");
    expect(src("src/app/layout.tsx")).not.toContain("MetaPixel");
    expect(src("src/app/recruitment/page.tsx")).not.toContain("MetaPixel");
    expect(src("src/components/quiz/QuizPartnerWorkbench.tsx")).not.toContain("MetaPixel");
  });

  it("wires Partner and Admin nav without touching Partner Hub quiz workbench", () => {
    expect(src("src/lib/home/my-home-presentation.ts")).toContain('title: "招募名單"');
    expect(src("src/lib/home/my-home-presentation.ts")).toContain('href: "/recruitment"');
    expect(src("src/components/admin/AdminCenterPage.tsx")).toContain("/admin/recruitment");
    expect(src("src/lib/auth/public-paths.ts")).toContain('"/join/"');
    expect(src("src/components/quiz/QuizPartnerWorkbench.tsx")).not.toContain("recruitment");
  });

  it("enforces partner-scoped lead read/update and Super Admin org list server-side", () => {
    const service = src("src/lib/recruitment/recruitment-service.ts");
    expect(service).toMatch(/listRecruitmentLeadsForPartner[\s\S]*\.eq\("partner_member_id", partnerMemberId\)/);
    expect(service).toMatch(
      /updateRecruitmentLeadStatusForPartner[\s\S]*\.eq\("id", input\.leadId\)[\s\S]*\.eq\("partner_member_id", input\.partnerMemberId\)/,
    );
    const partnerLeadsApi = src("src/app/api/recruitment/leads/route.ts");
    expect(partnerLeadsApi).toContain("getMemberIdFromRequest");
    expect(partnerLeadsApi).toContain("listRecruitmentLeadsForPartner(memberId)");
    const partnerPatchApi = src("src/app/api/recruitment/leads/[id]/route.ts");
    expect(partnerPatchApi).toContain("updateRecruitmentLeadStatusForPartner");
    expect(partnerPatchApi).toContain("partnerMemberId: memberId");
    const adminApi = src("src/app/api/admin/recruitment/leads/route.ts");
    expect(adminApi).toContain("assertSuperAdmin");
    expect(adminApi).toContain("listRecruitmentLeadsForAdmin");
  });
});
