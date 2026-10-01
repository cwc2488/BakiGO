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
    expect(upsert).toContain("measurements: freshMeasurements");
  });

  it("measurement save fresh-reads all slots after weight UPDATE before recalculation", () => {
    const svc = src("src/lib/lose2kg/service.ts");
    const upsert = svc.slice(
      svc.indexOf("export async function upsertMeasurement"),
      svc.indexOf("async function recalculateParticipantTickets"),
    );
    // Weight write happens before the fresh SELECT
    const updateIdx = upsert.indexOf(".update({");
    const weightKgIdx = upsert.indexOf("weight_kg: input.weightKg");
    const freshSelectMarker = 'Fresh read after weight write';
    const freshIdx = upsert.indexOf(freshSelectMarker);
    const freshSelectIdx = upsert.indexOf(
      '.eq("participant_id", input.participantId)',
      freshIdx,
    );
    const recalcIdx = upsert.indexOf("recalculateParticipantTickets");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(weightKgIdx).toBeGreaterThan(updateIdx);
    expect(freshIdx).toBeGreaterThan(weightKgIdx);
    expect(freshSelectIdx).toBeGreaterThan(freshIdx);
    expect(recalcIdx).toBeGreaterThan(freshSelectIdx);
    expect(upsert).toContain("freshMeasurements");
    expect(upsert).toContain("measurements: freshMeasurements");
    // Must not pass a locally patched pre-update snapshot
    expect(upsert).not.toContain("nextMeasurements");
  });

  it("percentage updates use pct-only RPC, not serial per-slot loop", () => {
    const svc = src("src/lib/lose2kg/service.ts");
    expect(svc).toContain("batchUpdateMeasurementPercentages");
    const batchFn = svc.slice(
      svc.indexOf("async function batchUpdateMeasurementPercentages"),
      svc.indexOf("export async function upsertMeasurement"),
    );
    expect(batchFn).toContain('rpc("lose2kg_batch_update_measurement_pcts"');
    expect(batchFn).toContain("weight_change_pct");
    expect(batchFn).toContain("updated_at");
    // Must never include weight source-of-truth fields in the batch payload
    expect(batchFn).not.toContain("weight_kg");
    expect(batchFn).not.toContain("measured_at");
    expect(batchFn).not.toContain("created_at");
    expect(batchFn).not.toContain(".upsert(");
    const recalc = svc.slice(
      svc.indexOf("async function recalculateParticipantTickets"),
      svc.indexOf("export async function applyLiveMeasurementReading"),
    );
    expect(recalc).toContain("batchUpdateMeasurementPercentages");
    expect(recalc).not.toMatch(/for\s*\(\s*const m of measurements\s*\)[\s\S]*?\.update\(\s*\{\s*weight_change_pct/);
  });

  it("migration 089 pct RPC only updates weight_change_pct and updated_at", () => {
    const sql = src("supabase/migrations/089_lose2kg_batch_measurement_pcts.sql");
    expect(sql).toContain("lose2kg_batch_update_measurement_pcts");
    const updateBlock = sql.slice(
      sql.toLowerCase().indexOf("update public.lose2kg_measurements"),
      sql.toLowerCase().indexOf("end;"),
    );
    expect(updateBlock).toContain("weight_change_pct");
    expect(updateBlock).toContain("updated_at");
    expect(updateBlock.toLowerCase()).not.toContain("weight_kg");
    expect(updateBlock.toLowerCase()).not.toContain("measured_at");
    expect(updateBlock.toLowerCase()).not.toContain("created_at");
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("truncate");
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

  it("public member search requires 2+ chars and caps at 20 results", () => {
    const svc = src("src/lib/lose2kg/questionnaire.ts");
    const searchFn = svc.slice(
      svc.indexOf("export async function searchPublicSurveyMembers"),
      svc.indexOf("export type QuestionnaireSubmitInput"),
    );
    expect(searchFn).toContain("q.length < 2");
    expect(searchFn).toContain(", 20)");
    expect(searchFn).not.toContain(", 40)");
    expect(searchFn).toContain('.select("id, name")');
    expect(searchFn).not.toContain("email");
    expect(searchFn).not.toContain("phone");
    expect(searchFn).toContain("findSettingsBySurveyToken");

    const page = src("src/components/lose2kg/Lose2kgSurveyPage.tsx");
    expect(page).toContain("query.trim().length < 2");
  });

  it("coach is optional; inviter required; sameCoach maps to inviter", () => {
    const page = src("src/components/lose2kg/Lose2kgSurveyPage.tsx");
    const canSubmit = page.slice(
      page.indexOf("const canSubmit = useMemo"),
      page.indexOf("function toggleHelp"),
    );
    expect(canSubmit).not.toContain("!sameCoach && !coach");
    expect(canSubmit).not.toMatch(/if\s*\(\s*!sameCoach\s*&&\s*!coach/);
    expect(page).toContain("同邀請人");
    expect(page).toContain("coachMemberId: sameCoach ? inviter?.id : coach?.id ?? null");

    const svc = src("src/lib/lose2kg/questionnaire.ts");
    const validate = svc.slice(
      svc.indexOf("function validateSubmitInput"),
      svc.indexOf("export async function submitPublicSurvey"),
    );
    expect(validate).toContain("sameCoachAsInviter");
    expect(validate).toContain("input.inviterMemberId");
    expect(validate).toMatch(/coachMemberId\?\.trim\(\)\s*\|\|\s*null/);
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
