import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isPublicPath } from "@/lib/auth/public-paths";
import {
  isBusinessInterested,
  isProductHigh,
  matchesQuestionnaireSegment,
  wantsConsultation,
} from "@/lib/lose2kg/questionnaire-rules";
import type { Lose2kgQuestionnaireResultRow } from "@/types/lose2kg";

const ROOT = process.cwd();

function src(rel: string) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("lose2kg performance — staff init single request", () => {
  it("staff root route uses getStaffWorkstationInit (gate+bootstrap combined)", () => {
    const route = src("src/app/api/lose2kg/staff/[token]/route.ts");
    expect(route).toContain("getStaffWorkstationInit");
    expect(route).not.toContain("getStaffGateInfo");
  });

  it("staff workstation client uses loadInit, not gate→bootstrap double fetch", () => {
    const page = src("src/components/lose2kg/Lose2kgStaffWorkstationPage.tsx");
    expect(page).toContain("loadInit");
    expect(page).not.toContain("loadGate");
    const mount = page.slice(page.indexOf("useEffect(() => {"), page.indexOf("const activeParticipants"));
    expect(mount).toContain("loadInit");
    expect(mount).not.toContain("loadBootstrap");
  });

  it("resolveStaffSession accepts period row hint and throttles last_seen", () => {
    const svc = src("src/lib/lose2kg/v2-service.ts");
    expect(svc).toContain("LOSE2KG_STAFF_LAST_SEEN_THROTTLE_MS");
    expect(svc).toContain("periodRowHint");
    expect(svc).toContain("getStaffWorkstationInit");
    const resolveFn = svc.slice(
      svc.indexOf("export async function resolveStaffSession"),
      svc.indexOf("export async function requireStaffPeriodAccess"),
    );
    expect(resolveFn).toContain("LOSE2KG_STAFF_LAST_SEEN_THROTTLE_MS");
    // Must not unconditionally write last_seen every call
    expect(resolveFn).toMatch(/Date\.now\(\)\s*-\s*lastSeenMs\s*>=\s*LOSE2KG_STAFF_LAST_SEEN_THROTTLE_MS/);
  });

  it("getStaffBootstrap avoids select(*) on measurements and does not load questionnaire", () => {
    const svc = src("src/lib/lose2kg/v2-service.ts");
    const bootFn = svc.slice(
      svc.indexOf("export async function getStaffBootstrap"),
      svc.indexOf("export async function getStaffDrawBootstrap"),
    );
    expect(bootFn).not.toContain('.select("*")');
    expect(bootFn).not.toContain("questionnaire");
    expect(bootFn).toContain("weight_change_pct");
  });

  it("measurement save skips ensureMeasurementSlots when 4 slots exist", () => {
    const svc = src("src/lib/lose2kg/service.ts");
    const upsert = svc.slice(
      svc.indexOf("export async function upsertMeasurement"),
      svc.indexOf("async function recalculateParticipantTickets"),
    );
    expect(upsert).toContain("length < 4");
    expect(upsert).toContain("ensureMeasurementSlots");
    expect(upsert).toContain("recalculateParticipantTickets");
    expect(upsert).toContain("measurements: nextMeasurements");
  });

  it("percentage updates use batch upsert, not serial per-slot loop", () => {
    const svc = src("src/lib/lose2kg/service.ts");
    expect(svc).toContain("batchUpdateMeasurementPercentages");
    const recalc = svc.slice(
      svc.indexOf("async function recalculateParticipantTickets"),
      svc.indexOf("export async function applyLiveMeasurementReading"),
    );
    expect(recalc).toContain("batchUpdateMeasurementPercentages");
    expect(recalc).not.toMatch(/for\s*\(\s*const m of measurements\s*\)[\s\S]*?\.update\(\s*\{\s*weight_change_pct/);
  });

  it("staff grid uses memoized measurementLookup Map", () => {
    const page = src("src/components/lose2kg/Lose2kgStaffWorkstationPage.tsx");
    expect(page).toContain("measurementLookup");
    expect(page).toContain("Map<string, Lose2kgMeasurement>");
    expect(page).toContain("measurementLookup={measurementLookup}");
  });

  it("keeps bootstrap endpoint for compatibility", () => {
    expect(
      existsSync(resolve(ROOT, "src/app/api/lose2kg/staff/[token]/bootstrap/route.ts")),
    ).toBe(true);
  });
});

describe("lose2kg week-4 questionnaire", () => {
  it("migration 088 is additive and expands ticket event types", () => {
    const sql = src("supabase/migrations/088_lose2kg_questionnaire_v1.sql");
    expect(sql).toContain("lose2kg_questionnaire_settings");
    expect(sql).toContain("lose2kg_questionnaire_responses");
    expect(sql).toContain("questionnaire_completed");
    expect(sql).toContain("submit_lose2kg_questionnaire_v1");
    expect(sql).toContain("unique (period_id, participant_id)");
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("truncate");
    expect(sql).not.toMatch(/delete from public\.lose2kg_/i);
  });

  it("public survey route is open public under /lose2kg/", () => {
    expect(isPublicPath("/lose2kg/survey/abcdefghijklmnopqrstuv")).toBe(true);
    expect(existsSync(resolve(ROOT, "src/app/lose2kg/survey/[token]/page.tsx"))).toBe(true);
  });

  it("public survey APIs do not expose private member fields", () => {
    const members = src("src/app/api/lose2kg/survey/[token]/members/route.ts");
    const svc = src("src/lib/lose2kg/questionnaire.ts");
    expect(svc).toContain('.select("id, name")');
    expect(members).not.toContain("email");
    expect(members).not.toContain("phone");
    const bootstrap = svc.slice(
      svc.indexOf("export async function getPublicSurveyBootstrap"),
      svc.indexOf("export async function searchPublicSurveyMembers"),
    );
    expect(bootstrap).toContain("public_display_name");
    expect(bootstrap).not.toContain("email");
    expect(bootstrap).not.toContain("phone");
  });

  it("segmentation rules are deterministic", () => {
    expect(
      isProductHigh({
        productInterest: "know_what",
        desiredHelp: ["self_continue"],
      }),
    ).toBe(true);
    expect(
      isProductHigh({
        productInterest: "none",
        desiredHelp: ["product_pairing"],
      }),
    ).toBe(true);
    expect(
      isProductHigh({
        productInterest: "none",
        desiredHelp: ["diet"],
      }),
    ).toBe(false);
    expect(
      isBusinessInterested({
        businessInterest: "very_interested",
        incomeInterest: "not_interested",
      }),
    ).toBe(true);
    expect(
      isBusinessInterested({
        businessInterest: "customer_only",
        incomeInterest: "willing_to_learn",
      }),
    ).toBe(true);
    expect(
      wantsConsultation({ consultationInterest: "yes" }),
    ).toBe(true);
    expect(
      wantsConsultation({ consultationInterest: "no" }),
    ).toBe(false);

    const pendingRow: Lose2kgQuestionnaireResultRow = {
      participantId: "p1",
      participantName: "A",
      publicDisplayName: "A",
      hasResponse: false,
      inviterName: null,
      coachName: null,
      productInterest: null,
      businessInterest: null,
      incomeInterest: null,
      consultationInterest: null,
      productHigh: false,
      businessInterested: false,
      wantsConsultation: false,
      submittedAt: null,
      response: null,
    };
    expect(matchesQuestionnaireSegment(pendingRow, "pending")).toBe(true);
    expect(matchesQuestionnaireSegment(pendingRow, "product_high")).toBe(false);
  });

  it("ticket breakdown includes questionnaire_completed", () => {
    const breakdown = src("src/lib/lose2kg/ticket-breakdown.ts");
    expect(breakdown).toContain("questionnaire_completed");
    expect(breakdown).toContain("第四週成果問卷 +1");
  });

  it("admin period page includes questionnaire section", () => {
    const page = src("src/components/lose2kg/Lose2kgPeriodPage.tsx");
    expect(page).toContain("Lose2kgQuestionnaireAdminSection");
  });

  it("staff bootstrap still excludes questionnaire data", () => {
    const boot = src("src/lib/lose2kg/v2-service.ts");
    const bootFn = boot.slice(
      boot.indexOf("export async function getStaffBootstrap"),
      boot.indexOf("export async function getStaffDrawBootstrap"),
    );
    expect(bootFn).not.toContain("questionnaire");
  });
});
