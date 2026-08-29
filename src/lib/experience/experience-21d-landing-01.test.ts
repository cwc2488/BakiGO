import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EXPERIENCE_21D_LANDING,
  EXPERIENCE_21D_LANDING_VERSION,
  isExperience21dConsultationPreference,
} from "@/lib/experience/experience-21d-landing-copy";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Experience 21d landing V1", () => {
  it("keeps Baki Go brand and forbids invented brands / hard-sell claims", () => {
    const copy = JSON.stringify(EXPERIENCE_21D_LANDING);
    expect(copy).toContain("Baki Go");
    expect(copy).not.toMatch(/FitMind/i);
    expect(copy).not.toContain("立即購買");
    expect(copy).not.toContain("保證瘦");
    expect(copy).not.toContain("免費");
    expect(EXPERIENCE_21D_LANDING.consult.options[0]?.id).toBe("text");
    expect(EXPERIENCE_21D_LANDING.consult.options[0]?.recommended).toBe(true);
  });

  it("validates consultation preferences", () => {
    expect(isExperience21dConsultationPreference("text")).toBe(true);
    expect(isExperience21dConsultationPreference("phone")).toBe(true);
    expect(isExperience21dConsultationPreference("in_person")).toBe(true);
    expect(isExperience21dConsultationPreference("video")).toBe(false);
    expect(EXPERIENCE_21D_LANDING_VERSION).toBe("experience_21d_v1");
  });

  it("routes analysis CTA to experience landing and rejects forged partner ids", () => {
    const page = readSrc("src/components/reset/ResetExperiencePage.tsx");
    const api = readSrc("src/app/api/experience/21d/[token]/route.ts");
    const publicPaths = readSrc("src/lib/auth/public-paths.ts");
    expect(page).toContain("/experience/21d/");
    expect(page).not.toContain('action: "21d_interest"');
    expect(api).toContain("forged_share_id");
    expect(api).toContain("ownerMemberId");
    expect(publicPaths).toContain('"/experience/"');
  });

  it("reuses experience_21d_interests attribution and adds additive migration", () => {
    const service = readSrc("src/lib/experience/experience-21d-landing-service.ts");
    const interest = readSrc("src/lib/analysis/handoff/experience-21d-service.ts");
    const migration = readSrc("supabase/migrations/063_experience_21d_consultation_v1.sql");
    expect(service).toContain("request21dInterest");
    expect(service).toContain("requireAnalysisSessionRowByToken");
    expect(interest).toContain("consultation_preference");
    expect(interest).toContain("loadSessionAttribution");
    expect(migration).toContain("consultation_preference");
    expect(migration).toContain("text");
    expect(migration).toContain("phone");
    expect(migration).toContain("in_person");
    expect(migration).toContain("21d_landing_viewed");
  });

  it("renders five intentional landing sections", () => {
    const ui = readSrc("src/components/experience/Experience21dLandingPage.tsx");
    expect(ui).toContain("e21d-hero");
    expect(ui).toContain('id="e21d-support"');
    expect(ui).toContain('id="e21d-flow"');
    expect(ui).toContain('id="e21d-suitable"');
    expect(ui).toContain("copy.consult.primaryCta");
    expect(ui).toContain('id="e21d-consult"');
    expect(ui).toContain("/experience/21d/art-hero-portrait.jpg");
    expect(ui).toContain("e21d-scroll-bar");
  });
});
