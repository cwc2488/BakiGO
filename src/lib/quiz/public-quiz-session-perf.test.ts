import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialResetSession, toPublicView } from "@/lib/analysis/reset/reset-contract";
import {
  stashResetBootExperience,
  takeResetBootExperience,
} from "@/lib/analysis/reset/reset-boot-cache";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/**
 * PUBLIC-QUIZ-SESSION-PERF-01
 * Session create must not sequentially reload/rate-limit/re-persist;
 * create response must carry Q1 experience for boot cache.
 */
describe("PUBLIC-QUIZ-SESSION-PERF-01", () => {
  it("collapses reset session create to attribution + three inserts (no reload persist chain)", () => {
    const service = src("src/lib/analysis/reset/reset-service.ts");
    expect(service).toContain("export async function createResetPreviewSession");
    expect(service).toContain("Promise.all([");
    expect(service).toContain("getFatLossQuizIdCached");
    expect(service).toContain("resolveReferrerFromShare");
    expect(service).toContain("resolveValidatedGrowthShareId");
    expect(service).toContain("resolveActiveResultShare");
    expect(service).toContain("packResetSession(resetSession)");
    expect(service).toContain('analysis_state: "questions_in_progress"');
    // Must not use the slow generic native→reload→rate-limit→insert→persist chain.
    expect(service).not.toContain("createNativeAnalysisSession");
    const start = service.indexOf("export async function createResetPreviewSession");
    const next = service.indexOf("\nexport async function ", start + 1);
    const createFn = service.slice(start, next === -1 ? undefined : next);
    expect(createFn).not.toContain("await persist(");
    expect(createFn).not.toContain("assertCreateRateLimit");
    expect(createFn).not.toContain("loadCompletedQuizResult");
    expect(createFn).toContain('from("quiz_responses")');
    expect(createFn).toContain('from("quiz_results")');
    expect(createFn).toContain('from("analysis_sessions")');
  });

  it("returns experience from create route and stashes it for Q1 boot", () => {
    const route = src("src/app/api/analysis/sessions/route.ts");
    expect(route).toContain("experience: created.experience");
    expect(route).toContain("Server-Timing");

    const landing = src("src/components/reset/ResetLandingPage.tsx");
    expect(landing).toContain("stashResetBootExperience");
    expect(landing).toContain("payload.experience");

    const page = src("src/components/reset/ResetExperiencePage.tsx");
    expect(page).toContain("takeResetBootExperience");
    expect(page).toContain("useLayoutEffect");
  });

  it("boot cache round-trips a valid Q1 experience once", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      configurable: true,
    });
    const experience = toPublicView(createInitialResetSession());
    const token = "perf-boot-token-example-0123456789abcdef";
    stashResetBootExperience(token, experience);
    const first = takeResetBootExperience(token);
    expect(first?.act).toBe("quiz");
    expect(first?.quiz.question?.id).toBeTruthy();
    expect(takeResetBootExperience(token)).toBeNull();
  });

  it("keeps immediate busy feedback and attribution payload", () => {
    const landing = src("src/components/reset/ResetLandingPage.tsx");
    expect(landing).toContain("flushSync");
    expect(landing).toContain("startInFlight");
    expect(landing).toContain("shareCode: share.shareCode");
    expect(landing).toContain("resultShareCode: share.resultShareCode");
    expect(landing).toContain("referralShareToken: share.referralShareToken");
  });
});
