import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  EXPERIENCE_21D_LANDING,
  EXPERIENCE_21D_LANDING_VERSION,
  isExperience21dConsultationPreference,
} from "@/lib/experience/experience-21d-landing-copy";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Experience 21d landing V2 (full original artworks)", () => {
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
    expect(EXPERIENCE_21D_LANDING_VERSION).toBe("experience_21d_v2");
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

  it("ships five full original artworks and uses them as the primary visual", () => {
    const assets = [
      "public/images/experience-21d/01-hero.png",
      "public/images/experience-21d/02-support.png",
      "public/images/experience-21d/03-journey.png",
      "public/images/experience-21d/04-low-pressure.png",
      "public/images/experience-21d/05-consultation.png",
    ];
    for (const rel of assets) {
      const abs = resolve(process.cwd(), rel);
      expect(existsSync(abs), rel).toBe(true);
      expect(statSync(abs).size).toBeGreaterThan(1_000_000);
    }

    const ui = readSrc("src/components/experience/Experience21dLandingPage.tsx");
    expect(ui).toContain("/images/experience-21d/01-hero.png");
    expect(ui).toContain("/images/experience-21d/02-support.png");
    expect(ui).toContain("/images/experience-21d/03-journey.png");
    expect(ui).toContain("/images/experience-21d/04-low-pressure.png");
    expect(ui).toContain("/images/experience-21d/05-consultation.png");
    expect(ui).toContain('id="e21d-support"');
    expect(ui).toContain('id="e21d-flow"');
    expect(ui).toContain('id="e21d-suitable"');
    expect(ui).toContain('id="e21d-consult"');
    expect(ui).toContain("copy.consult.primaryCta");
    expect(ui).toContain("copy.consult.options");
    expect(ui).toContain("consultationPreference");
    expect(ui).not.toContain("/experience/21d/art-hero-portrait.jpg");
    expect(ui).not.toContain("object-fit: cover");
    expect(ui).not.toContain("e21d-timeline");
    expect(ui).not.toContain("e21d-soft-card");
  });
});
