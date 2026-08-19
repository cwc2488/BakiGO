import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RESET_ANIMAL_ASSET_ORDER, RESET_ANIMAL_ASSETS } from "@/lib/analysis/reset/reset-art";
import { RESET_ANIMAL_COPY, RESET_ANIMAL_PERSONALITY, RESET_CONVERSATION_CTA } from "@/lib/analysis/reset/reset-animals";
import { RESET_META_KEY } from "@/lib/analysis/reset/reset-path";
import { resolveAnalysisAttribution } from "@/lib/analysis/analysis-attribution";
import { resolve21dOwnership } from "@/lib/analysis/handoff/experience-21d-attribution";
import { isSocialCrawlerUserAgent } from "@/lib/quiz/partner/quiz-partner-crawler";
import { mergeFatLossQuizAttribution, getShareParams } from "@/lib/quiz/fat-loss/session-storage";
import {
  canShareResultImageFile,
  isNativeShareAbort,
  NATIVE_SHARE_COMPLETED_EVENT,
} from "@/lib/quiz/viral/quiz-result-share-capability";
import {
  canonicalResultShareDisplay,
  canonicalResultShareHref,
  normalizeResultShareCode,
} from "@/lib/quiz/viral/quiz-result-share-codes";
import {
  QUIZ_RESULT_SHARE_CTA,
  QUIZ_RESULT_SHARE_FALLBACK_CTA,
  QUIZ_RESULT_SHARE_FALLBACK_HINT,
  QUIZ_RESULT_SHARE_NUDGE,
  buildQuizResultShareCopy,
  findForbiddenShareCopy,
  flattenQuizResultShareCopy,
} from "@/lib/quiz/viral/quiz-result-share-copy";
import { deriveResultShareFunnelCounts } from "@/lib/quiz/viral/quiz-result-share-funnel";
import { containRect, QUIZ_RESULT_SHARE_LAYOUT } from "@/lib/quiz/viral/quiz-result-share-layout";
import { RESET_QUIZ_QUESTIONS } from "@/lib/analysis/reset/reset-quiz";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("QUIZ-VIRAL-01", () => {
  it("1–4. A–F share visuals are public animal copy, contain-fit, no private/sales text", () => {
    expect(QUIZ_RESULT_SHARE_LAYOUT.aspect).toBe("9:16");
    expect(QUIZ_RESULT_SHARE_LAYOUT.width).toBe(1080);
    expect(QUIZ_RESULT_SHARE_LAYOUT.height).toBe(1920);
    expect(QUIZ_RESULT_SHARE_LAYOUT.characterFit).toBe("contain");
    expect(QUIZ_RESULT_SHARE_LAYOUT.bottomSafe).toBeGreaterThanOrEqual(160);
    expect(QUIZ_RESULT_SHARE_LAYOUT.topSafe).toBeGreaterThanOrEqual(160);

    for (const type of RESET_ANIMAL_ASSET_ORDER) {
      const copy = buildQuizResultShareCopy(type);
      const flat = flattenQuizResultShareCopy(copy);
      expect(copy.animalName).toBe(RESET_ANIMAL_COPY[type].animalName);
      expect(copy.personality).toBe(RESET_ANIMAL_PERSONALITY[type]);
      expect(copy.characterSrc).toBe(RESET_ANIMAL_ASSETS[type].image);
      expect(existsSync(resolve(process.cwd(), `public${copy.characterSrc}`))).toBe(true);
      expect(findForbiddenShareCopy(flat)).toEqual([]);
      expect(flat).not.toMatch(/why_now|bottleneck|brief_json|readiness|transcript/i);
    }

    const dest = containRect(2000, 1000, QUIZ_RESULT_SHARE_LAYOUT.character);
    expect(dest.width).toBeLessThanOrEqual(QUIZ_RESULT_SHARE_LAYOUT.character.width);
    expect(dest.height).toBeLessThanOrEqual(QUIZ_RESULT_SHARE_LAYOUT.character.height);
    expect(dest.width / dest.height).toBeCloseTo(2, 5);
  });

  it("5–6. native file share vs unsupported fallback copy", () => {
    expect(canShareResultImageFile()).toBe(false);
    expect(QUIZ_RESULT_SHARE_CTA).toBe("分享我的結果");
    expect(QUIZ_RESULT_SHARE_FALLBACK_CTA).toBe("儲存分享圖");
    expect(QUIZ_RESULT_SHARE_FALLBACK_HINT).toBe("儲存後就可以分享到 IG 限時動態");
    expect(src("src/components/reset/ResetResultShareBar.tsx")).toContain("canShareResultImageFile");
    expect(src("src/components/reset/ResetResultShareBar.tsx")).toContain("downloadBlob");
    expect(src("src/components/reset/ResetResultShareBar.tsx")).not.toMatch(/instagram.*api|direct-share/i);
  });

  it("7–8. share click and native share-sheet resolved events are honest", () => {
    expect(NATIVE_SHARE_COMPLETED_EVENT).toBe("native_share_completed");
    expect(isNativeShareAbort({ name: "AbortError" })).toBe(true);
    expect(isNativeShareAbort({ name: "TypeError" })).toBe(false);
    const bar = src("src/components/reset/ResetResultShareBar.tsx");
    expect(bar).toContain("result_share_clicked");
    expect(bar).toContain("native_share_completed");
    expect(bar).toContain("result_share_fallback_saved");
    expect(bar).not.toContain("instagram_story_posted");
    expect(src("src/lib/quiz/viral/quiz-result-share-service.ts")).not.toContain("instagram_story_posted");
  });

  it("9. crawler UA is not a human visit", () => {
    expect(isSocialCrawlerUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isSocialCrawlerUserAgent("Mozilla/5.0 iPhone")).toBe(false);
    expect(src("src/lib/quiz/viral/quiz-result-share-service.ts")).toContain("isSocialCrawlerUserAgent");
    expect(src("src/lib/quiz/viral/quiz-result-share-service.ts")).toContain('humanHeader !== "1"');
    expect(src("src/components/reset/ResetLandingPage.tsx")).toContain("/api/quiz/result-shares/landing-view");
    expect(src("src/components/reset/ResetLandingPage.tsx")).toContain("x-baki-human");
  });

  it("10–12. result share attribution does not break /q or /r precedence", () => {
    const resultId = "55555555-5555-4555-8555-555555555555";
    expect(
      resolveAnalysisAttribution({
        growthShareId: "gs",
        quizShareCode: "ABC123",
        referrerMemberId: "member",
        resultShareId: resultId,
      }).sourceType,
    ).toBe("referral_share");
    expect(
      resolveAnalysisAttribution({
        growthShareId: null,
        quizShareCode: "ABC123",
        referrerMemberId: "member",
        resultShareId: resultId,
      }).sourceType,
    ).toBe("quiz_member_share");
    expect(
      resolveAnalysisAttribution({
        growthShareId: null,
        quizShareCode: null,
        referrerMemberId: null,
        resultShareId: resultId,
      }).sourceType,
    ).toBe("result_share");

    const qPage = src("src/app/q/[code]/page.tsx");
    expect(qPage).toContain('dest.set("share"');
    expect(qPage).not.toContain('dest.set("rs"');
    expect(src("src/app/s/[code]/page.tsx")).toContain('dest.set("rs"');
    expect(src("src/app/s/[code]/page.tsx")).not.toContain('dest.set("share", normalized)');
    expect(canonicalResultShareHref("ab12cd")).toBe("https://bakigo.tw/s/AB12CD");
    expect(canonicalResultShareDisplay("ab12cd")).toBe("bakigo.tw/s/AB12CD");
    expect(normalizeResultShareCode("ab12cd")).toBe("AB12CD");
  });

  it("client attribution merge: /r and /q survive /s, /s is additive", () => {
    const afterR = mergeFatLossQuizAttribution({}, { referralShareToken: "opaque-r" });
    const afterQ = mergeFatLossQuizAttribution(afterR, { shareCode: "PARTNR" });
    const afterS = mergeFatLossQuizAttribution(afterQ, { resultShareCode: "RESULT" });
    expect(afterS.referralShareToken).toBe("opaque-r");
    expect(afterS.shareCode).toBe("PARTNR");
    expect(afterS.resultShareCode).toBe("RESULT");

    const sCannotClear = mergeFatLossQuizAttribution(afterS, {
      referralShareToken: null,
      shareCode: null,
      resultShareCode: "OTHER",
    });
    expect(sCannotClear.referralShareToken).toBe("opaque-r");
    expect(sCannotClear.shareCode).toBe("PARTNR");
    expect(sCannotClear.resultShareCode).toBe("RESULT");

    const params = getShareParams(new URLSearchParams("rs=ab12cd&share=PARTNR&gs=opaque-r"));
    expect(params.resultShareCode).toBe("AB12CD");
    expect(params.shareCode).toBe("PARTNR");
    expect(params.referralShareToken).toBe("opaque-r");
  });

  it("13–16. referred quiz start/complete/report/21d interest are queryable", () => {
    const counts = deriveResultShareFunnelCounts({
      events: [
        { event: "result_share_clicked" },
        { event: "native_share_completed" },
      ],
      humanViews: 8,
      sessionIds: ["s1", "s2", "s3", "s4"],
      sessions: [
        { answers_json: { [RESET_META_KEY]: { act: "quiz" } } },
        { answers_json: { [RESET_META_KEY]: { act: "reveal", quiz: { result: { primaryType: "E" } } } } },
        { answers_json: { [RESET_META_KEY]: { act: "report", report: { why_now: "private" } } } },
        { answers_json: { [RESET_META_KEY]: { act: "conversation", quiz: { result: {} } } } },
      ],
      interestSessionIds: ["s3"],
    });
    expect(counts.shareClicked).toBe(1);
    expect(counts.nativeShareCompleted).toBe(1);
    expect(counts.humanViews).toBe(8);
    expect(counts.quizStarted).toBe(4);
    expect(counts.quizCompleted).toBe(3);
    expect(counts.reportReady).toBe(1);
    expect(counts.interested21d).toBe(1);
    expect(src("src/lib/quiz/viral/quiz-result-share-funnel.ts")).toContain('eq("result_share_id", resultShareId)');
    expect(src("src/lib/analysis/analysis-session-service.ts")).toContain("resultShareCode: input.resultShareCode");
    expect(src("src/components/reset/ResetLandingPage.tsx")).toContain("resultShareCode: share.resultShareCode");
  });

  it("17. anonymous source session does not become a Partner", () => {
    expect(src("src/lib/quiz/viral/quiz-result-share-service.ts")).toContain("source_owner_member_id: null");
    expect(src("src/lib/quiz/viral/quiz-result-share-service.ts")).toContain("source_customer_id: null");
    expect(src("src/app/s/[code]/page.tsx")).not.toMatch(/owner_member_id|memberId/);
    const ownership = resolve21dOwnership({
      sourceType: "result_share",
      growthShareId: null,
      growthShareOwnerMemberId: null,
      quizShareCode: null,
      referrerMemberId: "partner-should-not-win",
    });
    expect(ownership.assignment).toBe("unassigned");
    expect(ownership.ownerMemberId).toBeNull();
  });

  it("18. no unauthenticated Partner query of result-share funnel", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/api/quiz/result-shares/funnel/route.ts"))).toBe(false);
    expect(src("src/app/api/quiz/21d/performance/route.ts")).toContain("getPartnerQuizFunnel");
    expect(src("src/app/api/quiz/21d/performance/route.ts")).not.toContain("getResultShareFunnel");
    expect(src("src/app/api/quiz/result-shares/route.ts")).toContain("requireAnalysisSessionRowByToken");
  });

  it("19. RESET Quiz V2 scoring and Reveal art stay frozen", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    expect(RESET_QUIZ_QUESTIONS[0]!.options.map((option) => option.id)).toEqual([
      "Q1_E",
      "Q1_A",
      "Q1_D",
      "Q1_F",
      "Q1_B",
      "Q1_C",
    ]);
    const reveal = src("src/components/reset/ResetExperienceViews.tsx");
    const revealFn = reveal.slice(reveal.indexOf("export function ResetRevealView"));
    expect(revealFn).toContain("你比較像——");
    expect(revealFn).toContain("ResetAnimalVisual");
    expect(revealFn).toContain("RESET_CONVERSATION_CTA");
    expect(RESET_CONVERSATION_CTA).toBe("讓 AI 真正認識我");
    expect(revealFn.indexOf("ResetResultShareBar")).toBeGreaterThan(0);
    expect(revealFn.indexOf("ResetResultShareBar")).toBeLessThan(revealFn.indexOf("{RESET_CONVERSATION_CTA}"));
    expect(src("src/app/globals.css")).toContain("object-fit: contain");
    expect(src("src/app/globals.css")).toContain(".rx-cta-secondary");
  });

  it("20. QUIZ-PARTNER /q primitive is not reused for consumer result shares", () => {
    expect(src("src/app/q/[code]/page.tsx")).toContain('dest.set("share"');
    expect(src("docs/DATABASE.md")).toContain("quiz_result_shares");
    expect(src("src/lib/quiz/viral/quiz-result-share-service.ts")).toContain("quiz_result_shares");
    expect(src("src/lib/quiz/quiz-service.ts")).toContain("getOrCreatePermanentShareLink");
    expect(src("src/components/reset/ResetLandingPage.tsx")).toContain("shareCode: share.shareCode");
    expect(src("src/components/reset/ResetLandingPage.tsx")).toContain("/api/quiz/partner/landing-view");
  });

  it("21. 21D handoff still copies session authority and never invents a partner from /s", () => {
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).toContain("loadSessionAttribution");
    expect(src("src/lib/analysis/handoff/experience-21d-attribution.ts")).toContain("result_share");
    expect(src("docs/DATABASE.md")).toContain("experience_21d_interests");
  });

  it("22. Coaching 037 files are not rewritten by viral share", () => {
    expect(src("src/lib/quiz/viral/quiz-result-share-service.ts")).not.toContain("coaching_daily_logs");
    expect(src("src/components/reset/ResetResultShareBar.tsx")).not.toContain("高潛力");
    expect(src("src/lib/quiz/viral/quiz-result-share-copy.ts")).not.toContain("事業夥伴");
    expect(QUIZ_RESULT_SHARE_NUDGE).toBe("分享看看朋友都測到哪一隻 👀");
  });

  it("N. Reveal share is secondary; 9:16 card keeps character box inside frame", () => {
    const css = src("src/app/globals.css");
    expect(css).toContain(".rx-reveal {");
    expect(css).toContain("overflow: visible");
    expect(css).toContain(".rx-animal-art-reveal");
    expect(QUIZ_RESULT_SHARE_LAYOUT.character.x + QUIZ_RESULT_SHARE_LAYOUT.character.width).toBeLessThanOrEqual(1080);
    expect(
      QUIZ_RESULT_SHARE_LAYOUT.footInvite.y + QUIZ_RESULT_SHARE_LAYOUT.footInvite.height,
    ).toBeLessThanOrEqual(1920 - 80);
  });
});
