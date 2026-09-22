import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildQuestionnaireContactFingerprint,
  normalizeQuestionnaireContactValue,
} from "@/lib/questionnaire/fingerprint";
import {
  QUESTIONNAIRE_IMPROVEMENT_AREAS,
  QUESTIONNAIRE_LIMITS,
  allowedQuestionnaireStatusActions,
} from "@/lib/questionnaire/contract";
import { resolveQuestionnaireTargets } from "@/lib/questionnaire/rules";
import {
  normalizeQuestionnaireShareCode,
  normalizeQuestionnaireSource,
  validateQuestionnairePublicSubmit,
  QuestionnaireError,
} from "@/lib/questionnaire/service";

function src(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("問卷開發 — rules / share code", () => {
  it("A — daily target from rule engine is 3", () => {
    expect(resolveQuestionnaireTargets().dailyValidNewLeads).toBe(3);
  });

  it("B — share code normalize accepts 6–12 uppercase alnum", () => {
    expect(normalizeQuestionnaireShareCode("ab12cd34")).toBe("AB12CD34");
    expect(normalizeQuestionnaireShareCode("SHORT")).toBeNull();
    expect(normalizeQuestionnaireShareCode("TOO-LONG!!!!")).toBeNull();
    expect(normalizeQuestionnaireShareCode("ABCDEF")).toBe("ABCDEF");
  });

  it("source normalizes unknown to online", () => {
    expect(normalizeQuestionnaireSource("onsite")).toBe("onsite");
    expect(normalizeQuestionnaireSource("online")).toBe("online");
    expect(normalizeQuestionnaireSource("hack")).toBe("online");
    expect(normalizeQuestionnaireSource(null)).toBe("online");
  });
});

describe("問卷開發 — fingerprint dedupe", () => {
  it("F — same owner + normalized contact → same fingerprint", () => {
    const a = buildQuestionnaireContactFingerprint({
      ownerMemberId: "owner-1",
      contactType: "instagram",
      contactValue: " @Amy_Fit ",
    });
    const b = buildQuestionnaireContactFingerprint({
      ownerMemberId: "owner-1",
      contactType: "instagram",
      contactValue: "amy_fit",
    });
    expect(a).toBe(b);
    expect(normalizeQuestionnaireContactValue("instagram", "@Amy_Fit")).toBe("amy_fit");
  });

  it("G — same contact different owner → different fingerprint", () => {
    const a = buildQuestionnaireContactFingerprint({
      ownerMemberId: "owner-a",
      contactType: "line",
      contactValue: "hello",
    });
    const b = buildQuestionnaireContactFingerprint({
      ownerMemberId: "owner-b",
      contactType: "line",
      contactValue: "hello",
    });
    expect(a).not.toBe(b);
  });

  it("phone normalization strips spaces and dashes", () => {
    expect(normalizeQuestionnaireContactValue("phone", "0912-345-678")).toBe("0912345678");
  });
});

describe("問卷開發 — validation", () => {
  const base = {
    shareCode: "AB12CD34",
    source: "online",
    improvementAreas: ["體重／體脂"],
    bodySatisfactionScore: 3,
    weeklyExerciseFrequency: "once",
    usesSupplements: false,
    priorityImprovement: "想減脂",
    furtherUnderstandingInterest: "high",
    displayName: "小美",
    contactType: "line",
    contactValue: "xiaomei",
    consentAccepted: true,
  };

  it("E/L/M — valid payload passes; consent and contact required", () => {
    const ok = validateQuestionnairePublicSubmit(base);
    expect(ok.displayName).toBe("小美");
    expect(ok.supplementDetails).toBeNull();

    expect(() =>
      validateQuestionnairePublicSubmit({ ...base, consentAccepted: false }),
    ).toThrow(QuestionnaireError);

    expect(() =>
      validateQuestionnairePublicSubmit({ ...base, contactValue: "" }),
    ).toThrow(QuestionnaireError);
  });

  it("J — Q4 yes stores supplement details", () => {
    const ok = validateQuestionnairePublicSubmit({
      ...base,
      usesSupplements: true,
      supplementDetails: "乳清蛋白、維生素",
    });
    expect(ok.usesSupplements).toBe(true);
    expect(ok.supplementDetails).toBe("乳清蛋白、維生素");
  });

  it("K — Q4 no forces supplement details null", () => {
    const ok = validateQuestionnairePublicSubmit({
      ...base,
      usesSupplements: false,
      supplementDetails: "should ignore",
    });
    expect(ok.supplementDetails).toBeNull();
  });

  it("N — invalid enum rejected", () => {
    expect(() =>
      validateQuestionnairePublicSubmit({
        ...base,
        weeklyExerciseFrequency: "never",
      }),
    ).toThrow(QuestionnaireError);
    expect(() =>
      validateQuestionnairePublicSubmit({
        ...base,
        improvementAreas: ["火星"],
      }),
    ).toThrow(QuestionnaireError);
  });

  it("O — invalid satisfaction rejected", () => {
    expect(() =>
      validateQuestionnairePublicSubmit({ ...base, bodySatisfactionScore: 0 }),
    ).toThrow(QuestionnaireError);
    expect(() =>
      validateQuestionnairePublicSubmit({ ...base, bodySatisfactionScore: 6 }),
    ).toThrow(QuestionnaireError);
    expect(() =>
      validateQuestionnairePublicSubmit({ ...base, bodySatisfactionScore: 3.5 }),
    ).toThrow(QuestionnaireError);
  });

  it("honeypot triggers spam code", () => {
    try {
      validateQuestionnairePublicSubmit({ ...base, companyWebsite: "http://spam.test" });
      expect.fail("expected honeypot throw");
    } catch (error) {
      expect(error).toBeInstanceOf(QuestionnaireError);
      expect((error as QuestionnaireError).code).toBe("honeypot");
    }
  });

  it("improvement areas are enum-only", () => {
    expect(QUESTIONNAIRE_IMPROVEMENT_AREAS).toContain("目前沒有特別想改善");
    expect(QUESTIONNAIRE_LIMITS.priorityImprovementMax).toBe(200);
  });
});

describe("問卷開發 — status transitions", () => {
  it("S — status transition matrix (no paused→new)", () => {
    expect(allowedQuestionnaireStatusActions("new")).toEqual([
      "contacted",
      "invitation_started",
      "paused",
    ]);
    expect(allowedQuestionnaireStatusActions("contacted")).toContain("invitation_started");
    expect(allowedQuestionnaireStatusActions("invitation_started")).toEqual([
      "completed",
      "paused",
    ]);
    expect(allowedQuestionnaireStatusActions("completed")).toEqual([]);
    expect(allowedQuestionnaireStatusActions("paused")).toEqual([
      "contacted",
      "invitation_started",
    ]);
    expect(allowedQuestionnaireStatusActions("paused")).not.toContain("new");
  });
});

describe("問卷開發 — privacy / routes / migration", () => {
  it("C/D — public paths + no q/ collision", () => {
    const publicPaths = src("src/lib/auth/public-paths.ts");
    expect(publicPaths).toContain('"/survey/"');
    expect(publicPaths).not.toContain('"/q/" && questionnaire');
  });

  it("P/Q/R — APIs derive owner from session, not client body", () => {
    const patch = src("src/app/api/questionnaire/leads/[id]/route.ts");
    expect(patch).toContain("getMemberIdFromRequest");
    expect(patch).toContain("forged_owner_id");
    const submit = src("src/app/api/public/questionnaire/[code]/submit/route.ts");
    expect(submit).toContain("forged_owner_id");
    expect(submit).toContain("isNewLead");
    expect(submit).not.toMatch(/leadId.*result/);
  });

  it("public GET does not expose member id/email/number", () => {
    const route = src("src/app/api/public/questionnaire/[code]/route.ts");
    expect(route).toContain("getPublicQuestionnaireConfig");
    expect(route).not.toContain("partnerMemberId");
    expect(route).not.toContain("member_number");
    expect(route).not.toMatch(/owner\.email|members\.email|"email"/);
  });

  it("E/F — concurrent submit uses ON CONFLICT; fish credit once", () => {
    const sql = src("supabase/migrations/086_questionnaire_development_v1.sql");
    expect(sql).toContain("on conflict (owner_member_id, contact_fingerprint) do nothing");
    expect(sql).toContain("and fish_credited_at is null");
    expect(sql).toContain("status_priority");
    expect(sql).toContain("questionnaire_leads_owner_status_priority_idx");
  });

  it("H — list uses DB range pagination on status_priority + id tiebreaker", () => {
    const service = src("src/lib/questionnaire/service.ts");
    expect(service).toContain('.order("status_priority"');
    expect(service).toContain('.order("last_response_at"');
    expect(service).toContain('.order("id", { ascending: true })');
    expect(service).toContain(".range(from, to)");
    expect(service).not.toContain("Math.min(500");
    expect(service).not.toContain("sortLeadsForList");
    const sql = src("supabase/migrations/086_questionnaire_development_v1.sql");
    expect(sql).toContain(
      "(owner_member_id, status_priority, last_response_at desc, id)",
    );
  });

  it("share-link concurrent first-create reloads existing active link", () => {
    const service = src("src/lib/questionnaire/service.ts");
    expect(service).toContain("loadActiveShareCode");
    expect(service).toContain("Concurrent first-create");
    expect(service).toMatch(/duplicate\|unique/);
  });

  it("share-link unique conflict model prefers existing owner link", async () => {
    const { resolveShareLinkAfterUniqueConflict } = await import(
      "@/lib/five-plus-five/concurrency-model"
    );
    expect(
      resolveShareLinkAfterUniqueConflict({
        ownerHadActiveAfterConflict: "AB12CD34",
        attemptedCode: "ZZZZZZZZ",
      }),
    ).toEqual({ shareCode: "AB12CD34", action: "use_existing" });
    expect(
      resolveShareLinkAfterUniqueConflict({
        ownerHadActiveAfterConflict: null,
        attemptedCode: "ZZZZZZZZ",
      }).action,
    ).toBe("retry_generate");
  });

  it("M/N — public submit: no raw PG errors; byte-size payload gate", () => {
    const submit = src("src/app/api/public/questionnaire/[code]/submit/route.ts");
    expect(submit).toContain("送出失敗，請稍後再試。");
    expect(submit).toContain('code: "submit_failed"');
    expect(submit).toContain("request.text()");
    expect(submit).toContain("TextEncoder");
    expect(submit).toContain("payloadMaxBytes");
    expect(submit).not.toContain("content-length");
  });

  it("migration 086 tables + RPCs + revoke pattern", () => {
    const sql = src("supabase/migrations/086_questionnaire_development_v1.sql");
    expect(sql).toContain("questionnaire_share_links");
    expect(sql).toContain("questionnaire_leads");
    expect(sql).toContain("questionnaire_responses");
    expect(sql).toContain("submit_questionnaire_response_v1");
    expect(sql).toContain("start_questionnaire_lead_invitation_v1");
    expect(sql).toContain("upsert_five_plus_five_manual_report_v2");
    expect(sql).toContain("manual_fish_pool_count");
    expect(sql).toContain("questionnaire_fish_pool_count");
    expect(sql).toContain("has_user_submitted");
    expect(sql).toContain("revoke all on function public.submit_questionnaire_response_v1");
    expect(sql).toContain("grant execute on function public.submit_questionnaire_response_v1");
    expect(sql).toContain("service_role");
    expect(sql).not.toContain("recruitment_share_links");
  });

  it("home entry + 5plus5 secondary link exist", () => {
    const home = src("src/lib/home/my-home-presentation.ts");
    expect(home).toContain('href: "/questionnaire"');
    expect(home).toContain("問卷開發");
    const report = src("src/components/five-plus-five/FivePlusFiveMyReportPage.tsx");
    expect(report).toContain('href="/questionnaire"');
    expect(report).toContain("去做問卷");
    expect(report).toContain("問卷自動帶入");
    expect(report).toContain("computeLiveFishTotal");
    expect(report).toContain("manualFish");
  });
});

describe("問卷開發 — delete reverse + performance (087)", () => {
  it("087 delete RPC edge semantics encoded in SQL", () => {
    const sql = src("supabase/migrations/087_questionnaire_delete_performance.sql");
    // A/B/C/D — credit dates via Taipei; independent fish/invite
    expect(sql).toContain("(v_lead.fish_credited_at at time zone 'Asia/Taipei')::date");
    expect(sql).toContain("(v_lead.invitation_credited_at at time zone 'Asia/Taipei')::date");
    // H — never touch manual
    expect(sql).not.toMatch(/manual_fish_pool_count\s*=/);
    expect(sql).not.toMatch(/manual_invitation_five_steps_count\s*=/);
    // I — floor at 0
    expect(sql).toContain("greatest(questionnaire_fish_pool_count - 1, 0)");
    // F — second delete → lead_not_found
    expect(sql).toContain("raise exception 'lead_not_found'");
    // E — DELETE lead (responses cascade via FK)
    expect(sql).toContain("delete from public.questionnaire_leads");
  });

  it("dashboard uses single aggregate RPC", () => {
    const service = src("src/lib/questionnaire/service.ts");
    expect(service).toContain("get_questionnaire_dashboard_v1");
    expect(service).toContain("p_recent_limit");
  });

  it("detail uses latest_response_id relational select", () => {
    const service = src("src/lib/questionnaire/service.ts");
    expect(service).toContain("questionnaire_responses!latest_response_id");
    expect(service).not.toContain('from("questionnaire_responses")');
  });

  it("DELETE route ownership from server only", () => {
    const route = src("src/app/api/questionnaire/leads/[id]/route.ts");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("ownerMemberId: memberId");
    expect(route).toContain("forged_owner_id");
  });
});
