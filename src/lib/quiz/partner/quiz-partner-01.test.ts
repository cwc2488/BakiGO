import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateShareCode } from "@/lib/quiz/quiz-service";
import { isSocialCrawlerUserAgent } from "@/lib/quiz/partner/quiz-partner-crawler";
import {
  QUIZ_PARTNER_EMPTY_RATE,
  QUIZ_PARTNER_OG_DESCRIPTION,
  QUIZ_PARTNER_OG_FORBIDDEN,
  QUIZ_PARTNER_OG_TITLE,
  buildPartnerContactActions,
  canonicalQuizShareDisplay,
  canonicalQuizShareHref,
  formatFunnelRate,
  isOpaqueShareCode,
  sortQuizPartnerLeads,
  toQuizPartnerUiStatus,
} from "@/lib/quiz/partner/quiz-partner-presentation";
import { summarizePartner21dInterests } from "@/lib/analysis/handoff/experience-21d-service";
import { RESET_QUIZ_QUESTIONS } from "@/lib/analysis/reset/reset-quiz";
import { RESET_CONVERSATION_REASONING_PROMPT, buildResetConversationSystemPrompt } from "@/lib/analysis/reset/reset-prompts";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("QUIZ-PARTNER-01", () => {
  it("A. permanent short link is get-or-create, not minted every share", () => {
    expect(src("src/lib/quiz/quiz-service.ts")).toContain("getOrCreatePermanentShareLink");
    expect(src("src/lib/quiz/quiz-service.ts")).toContain('order("created_at", { ascending: true })');
    expect(src("src/app/api/quiz/21d/share/route.ts")).toContain("getOrCreatePermanentShareLink");
  });

  it("B. short link is opaque 5–7 chars, never a UUID / private id", () => {
    for (let i = 0; i < 12; i += 1) {
      const code = generateShareCode();
      expect(code.length).toBeGreaterThanOrEqual(5);
      expect(code.length).toBeLessThanOrEqual(7);
      expect(isOpaqueShareCode(code)).toBe(true);
    }
    expect(isOpaqueShareCode("not-a-uuid-but-too-long")).toBe(false);
    expect(isOpaqueShareCode("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(canonicalQuizShareHref("abc123")).toBe("https://bakigo.tw/q/ABC123");
    expect(canonicalQuizShareDisplay("abc123")).toBe("bakigo.tw/q/ABC123");
    expect(src("src/app/q/[code]/page.tsx")).not.toMatch(/memberId|owner_member_id|herbalife/i);
  });

  it("C. /q/code preserves attribution into RESET session create", () => {
    expect(src("src/components/reset/ResetLandingPage.tsx")).toContain("shareCode: share.shareCode");
    expect(src("src/app/api/analysis/sessions/route.ts")).toContain("shareCode: body.shareCode");
    expect(src("src/lib/analysis/reset/reset-service.ts")).toContain("shareCode: input.shareCode");
    expect(src("src/lib/analysis/analysis-session-service.ts")).toContain("shareCode: input.shareCode");
    expect(src("src/lib/quiz/quiz-service.ts")).toContain("resolveReferrerFromShare");
  });

  it("D. member A lead is owner-scoped; member B cannot list it", () => {
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).toContain('.eq("owner_member_id", ownerMemberId)');
    expect(src("src/app/api/quiz/21d/route.ts")).toContain("getMemberIdFromRequest");
    expect(src("src/app/api/quiz/21d/[id]/route.ts")).toContain("getMemberIdFromRequest");
    expect(src("src/lib/auth/public-paths.ts")).not.toMatch(/normalized === "\/quiz\/21d"/);
  });

  it("E. badge counts only interested / 待聯絡", () => {
    const summary = summarizePartner21dInterests([
      { status: "interested", createdAt: "2026-08-16T00:00:00.000Z" },
      { status: "interested", createdAt: "2026-08-16T00:00:00.000Z" },
      { status: "contacted", createdAt: "2026-08-16T00:00:00.000Z" },
      { status: "joined", createdAt: "2026-08-16T00:00:00.000Z" },
    ]);
    expect(summary.badge).toBe(2);
    expect(summary.waiting).toBe(2);
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).toContain('.eq("status", "interested")');
  });

  it("F–H. status mapping, sort, and close has no side effects", () => {
    expect(toQuizPartnerUiStatus("interested")).toBe("waiting");
    expect(toQuizPartnerUiStatus("contacted")).toBe("contacted");
    expect(toQuizPartnerUiStatus("considering")).toBe("contacted");
    expect(toQuizPartnerUiStatus("joined")).toBe("joined");
    expect(toQuizPartnerUiStatus("declined")).toBe("declined");
    const sorted = sortQuizPartnerLeads([
      { id: "joined", status: "joined", createdAt: "2026-08-16T12:00:00.000Z" },
      { id: "old-wait", status: "interested", createdAt: "2026-08-16T08:00:00.000Z" },
      { id: "new-wait", status: "interested", createdAt: "2026-08-16T10:00:00.000Z" },
      { id: "contacted", status: "contacted", createdAt: "2026-08-16T09:00:00.000Z", updatedAt: "2026-08-16T11:00:00.000Z" },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["new-wait", "old-wait", "contacted", "joined"]);
    const service = src("src/lib/analysis/handoff/experience-21d-service.ts");
    expect(service).toContain('next: "contacted" | "joined" | "declined"');
    expect(service).not.toContain("coaching_enrollments");
    expect(src("src/app/api/quiz/21d/[id]/route.ts")).toContain("mark_joined");
    expect(src("src/app/api/quiz/21d/[id]/route.ts")).toContain("mark_declined");
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).toContain("確定這位顧客已完成 21 天體驗成交？");
  });

  it("I–K. Instagram / LINE / phone partner actions, no Email", () => {
    expect(buildPartnerContactActions("instagram", "xiaomei")?.openHref).toBe(
      "https://www.instagram.com/xiaomei/",
    );
    expect(buildPartnerContactActions("line", "myline")?.copyLabel).toBe("複製 LINE ID");
    expect(buildPartnerContactActions("line", "myline")?.openHref).toBeNull();
    expect(buildPartnerContactActions("phone", "0912345678")).toMatchObject({
      openHref: "tel:0912345678",
      copyLabel: "複製",
    });
    expect(buildPartnerContactActions("email", "a@b.com")).toBeNull();
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).toContain("開啟 Instagram");
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).toContain("複製 LINE ID");
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).not.toContain("Email");
  });

  it("L. public analysis token still cannot leak coach brief", () => {
    expect(src("src/app/api/analysis/reset/[token]/route.ts")).not.toContain("brief_json");
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).toContain("toPublicHandoff");
    expect(src("src/app/api/quiz/21d/[id]/route.ts")).toContain("getMemberIdFromRequest");
  });

  it("M. OG metadata is psychology quiz, not sales / MLM / 21D", () => {
    const blob = [
      QUIZ_PARTNER_OG_TITLE,
      QUIZ_PARTNER_OG_DESCRIPTION,
      src("src/lib/quiz/partner/quiz-partner-share-metadata.ts"),
      src("src/app/q/[code]/layout.tsx"),
      src("src/app/quiz/fat-loss/layout.tsx"),
    ].join("\n");
    expect(QUIZ_PARTNER_OG_TITLE).toBe("你比較像哪一種動物？｜Baki GO 心理測驗");
    expect(QUIZ_PARTNER_OG_DESCRIPTION).toBe(
      "6 個生活情境，看看你在想改變自己的時候，最容易進入哪一種模式。",
    );
    for (const word of QUIZ_PARTNER_OG_FORBIDDEN) {
      expect(blob).not.toContain(word);
    }
    expect(existsSync(resolve(process.cwd(), "public/reset/og-quiz-share.png"))).toBe(true);
  });

  it("N. crawler preview does not increment human funnel", () => {
    expect(isSocialCrawlerUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isSocialCrawlerUserAgent("Mozilla/5.0")).toBe(false);
    expect(src("src/app/api/quiz/partner/landing-view/route.ts")).toContain("recordPartnerLandingView");
    expect(src("src/lib/quiz/partner/quiz-partner-funnel.ts")).toContain("isSocialCrawlerUserAgent");
    expect(src("src/lib/quiz/partner/quiz-partner-funnel.ts")).toContain('humanHeader !== "1"');
    expect(src("src/app/q/[code]/page.tsx")).not.toContain("redirect(");
    expect(src("src/components/reset/ResetLandingPage.tsx")).toContain("/api/quiz/partner/landing-view");
    expect(src("src/app/q/[code]/page.tsx")).not.toContain("landing-view");
  });

  it("O. funnel zero data is 還沒有資料, never NaN/Infinity", () => {
    expect(formatFunnelRate(0, 0)).toBe(QUIZ_PARTNER_EMPTY_RATE);
    expect(formatFunnelRate(1, 0)).toBe(QUIZ_PARTNER_EMPTY_RATE);
    expect(formatFunnelRate(1, 2)).toBe("50%");
    expect(formatFunnelRate(Number.NaN, 2)).toBe(QUIZ_PARTNER_EMPTY_RATE);
    expect(src("src/lib/quiz/partner/quiz-partner-presentation.ts")).toContain(QUIZ_PARTNER_EMPTY_RATE);
    expect(src("src/components/quiz/QuizPartnerPerformancePanel.tsx")).toContain("QUIZ_PARTNER_EMPTY_RATE");
  });

  it("P. RESET Quiz V2 remains frozen", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    expect(RESET_QUIZ_QUESTIONS[0]!.options).toHaveLength(6);
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain("/reset/landing-final.png");
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
  });

  it("Q. 21D handoff consumer invitation / contact capture remain", () => {
    expect(src("src/lib/analysis/handoff/experience-21d-path.ts")).toContain("我想了解我的 21 天方案");
    expect(src("src/lib/analysis/handoff/experience-21d-contact.ts")).toContain("instagram");
    expect(src("src/lib/analysis/handoff/experience-21d-contact.ts")).toContain("EXPERIENCE_21D_CONSUMER_CHANNELS");
  });

  it("R. Coaching 037 remains untouched", () => {
    expect(src("src/lib/coaching/coaching-service.ts")).not.toContain("experience_21d_interests");
    expect(src("src/lib/quiz/partner/quiz-partner-funnel.ts")).not.toContain("coaching_enrollments");
  });

  it("preview harness exists without writing production tables", () => {
    const preview = src("src/app/quiz/21d/preview/page.tsx");
    expect(preview).toContain("isProductionRuntime");
    expect(preview).toContain("notFound");
    const stories = src("src/components/quiz/QuizPartnerPreviewStories.tsx");
    for (const shot of [
      "partner-leads",
      "partner-leads-empty",
      "partner-lead-detail",
      "partner-contacted",
      "partner-closed",
      "partner-share",
      "partner-performance",
    ]) {
      expect(stories).toContain(shot);
    }
    expect(src("src/lib/quiz/partner/quiz-partner-fixtures.ts")).toContain("xiaomei.life");
    expect(src("src/components/quiz/QuizPartnerPreviewPage.tsx")).toContain('walk") === "21d-start"');
    const walk = src("src/components/quiz/Quiz21dStartPreviewWalk.tsx");
    expect(walk).toContain("deriveExperience21dSchedule");
    expect(walk).toContain("成交只代表這筆名單已確認。要開始陪跑，請先建立顧客。");
    expect(walk).toContain("拿到產品");
    expect(walk).toContain("開始陪跑");
    expect(walk).toContain("預計完成");
    expect(walk).toContain("這位顧客目前已在 21 天體驗中");
    expect(walk).not.toContain("fetchWithMemberAuth");
    expect(walk).not.toContain("/api/quiz/21d");
    expect(walk).not.toContain("/api/coaching/experience-21d");
  });
});
