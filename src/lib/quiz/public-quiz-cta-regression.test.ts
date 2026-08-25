import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/**
 * PUBLIC-QUIZ-CTA-REGRESSION-01
 * Guards the unauthenticated consumer funnel:
 * public landing →「開始測驗」hit target → analysis session → quiz.
 * Must fail if the CTA renders but is not actionable (missing CSS hit area / handler / route).
 */
describe("PUBLIC-QUIZ-CTA-REGRESSION-01", () => {
  it("wires public /quiz/fat-loss landing to ResetLandingPage start flow", () => {
    expect(src("src/app/quiz/fat-loss/page.tsx")).toContain("ResetLandingPage");

    const landing = src("src/components/reset/ResetLandingPage.tsx");
    expect(landing).toContain("handleStart");
    expect(landing).toContain('fetch("/api/analysis/sessions"');
    expect(landing).toContain('entry: "reset_v1"');
    expect(landing).toContain("router.push(`/analysis/${payload.token}`)");
    expect(landing).toContain("onStart={() => void handleStart()}");
  });

  it("keeps「開始測驗」as an actionable invisible hit over the landing KV", () => {
    const views = src("src/components/reset/ResetExperienceViews.tsx");
    const landingView = views.split("export function ResetQuizView")[0]!;

    expect(landingView).toContain('aria-label="開始測驗"');
    expect(landingView).toContain('className="rx-kv-hit"');
    expect(landingView).toContain("onClick={onStart}");
    expect(landingView).toContain("/reset/landing-final.png");
    expect(landingView).toMatch(/<button[\s\S]*className="rx-kv-hit"[\s\S]*onClick=\{onStart\}/);
  });

  it("ships ART-01 CSS so .rx-kv-hit covers the painted CTA (not a zero-size button)", () => {
    const css = src("src/app/globals.css");

    expect(css).toContain("/* ART-01 — feminine consumer art. Scoped to .reset-xp only. */");
    expect(css).toContain(".rx-kv-hit");
    expect(css).toContain(".rx-kv-img");
    expect(css).toMatch(/\.rx-kv \{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.rx-kv-img \{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(
      /\.rx-kv-hit \{[^}]*position:\s*absolute[^}]*width:\s*59%[^}]*height:\s*6\.8%/,
    );
  });

  it("does not replace Partner Hub with the public consumer landing", () => {
    expect(src("src/app/quiz/21d/page.tsx")).toContain("QuizPartnerWorkbench");
    expect(src("src/components/quiz/QuizPartnerWorkbench.tsx")).toContain("21 天名單");
    expect(src("src/app/quiz/fat-loss/page.tsx")).not.toContain("QuizPartnerWorkbench");
  });
});
