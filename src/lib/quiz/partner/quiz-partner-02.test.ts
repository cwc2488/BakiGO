import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RESET_QUIZ_SUPPORT } from "@/lib/analysis/reset/reset-animals";
import {
  RESET_QUIZ_QUESTIONS,
  RESET_QUIZ_V2_MATRIX,
  RESET_QUIZ_VERSION,
  scoreResetQuiz,
} from "@/lib/analysis/reset/reset-quiz";
import { RESET_CONVERSATION_REASONING_PROMPT, buildResetConversationSystemPrompt } from "@/lib/analysis/reset/reset-prompts";
import { QUIZ_PARTNER_OG_DESCRIPTION, QUIZ_PARTNER_OG_TITLE } from "@/lib/quiz/partner/quiz-partner-presentation";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const Q1_NEW =
  "你原本打算今天好好顧一下自己的體態，但忙了一整天，終於有自己的時間。這時候，你通常會怎麼做？";
const Q1_OLD = "忙了一整天，終於有自己的時間。你最容易出現哪種狀態？";

describe("QUIZ-PARTNER-02", () => {
  it("1. Q1 exact copy is the stimulus/context clarification", () => {
    expect(RESET_QUIZ_QUESTIONS[0]!.text).toBe(Q1_NEW);
    expect(RESET_QUIZ_QUESTIONS[0]!.text).not.toBe(Q1_OLD);
    expect(RESET_QUIZ_SUPPORT).toBe("憑第一個直覺選就好。");
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain("RESET_QUIZ_SUPPORT");
  });

  it("2. Q1 six option IDs are unchanged", () => {
    expect(RESET_QUIZ_QUESTIONS[0]!.options.map((option) => option.id)).toEqual([
      "Q1_E",
      "Q1_A",
      "Q1_D",
      "Q1_F",
      "Q1_B",
      "Q1_C",
    ]);
  });

  it("3. Q1 scoring mapping and option labels are unchanged", () => {
    expect(RESET_QUIZ_V2_MATRIX.Q1).toEqual({
      A: { primary: "A", secondary: "B" },
      B: { primary: "B", secondary: "C" },
      C: { primary: "C", secondary: "D" },
      D: { primary: "D", secondary: "E" },
      E: { primary: "E", secondary: "F" },
      F: { primary: "F", secondary: "A" },
    });
    expect(RESET_QUIZ_QUESTIONS[0]!.options.map((option) => option.label)).toEqual([
      "老實說，我現在連想都不太想想，只想休息。",
      "今天夠辛苦了，先做點讓自己開心的事吧。",
      "我會開始想，到底怎麼安排才是最有效的方法？",
      "基本上還是會照原本節奏，只是會把今天做不到的部分調整掉。",
      "今天就算了，明天狀態好一點再開始。",
      "不行，今天已經亂掉了，明天一定要全部拉回來。",
    ]);
    expect(RESET_QUIZ_QUESTIONS[0]!.displayOrder).toEqual(["E", "A", "D", "F", "B", "C"]);
    expect(RESET_QUIZ_VERSION).toBe("reset_quiz_v2");
  });

  it("4–5. owner archives own lead via authenticated API; non-owner cannot", () => {
    const route = src("src/app/api/quiz/21d/[id]/route.ts");
    const service = src("src/lib/analysis/handoff/experience-21d-service.ts");
    expect(route).toContain('action === "archive"');
    expect(route).toContain("getMemberIdFromRequest");
    expect(route).toContain("archivePartner21dInterest(memberId, id)");
    expect(service).toContain("export async function archivePartner21dInterest");
    expect(service).toContain('.eq("owner_member_id", ownerMemberId)');
    expect(service).toContain('.is("archived_at", null)');
    const archiveFn = service.slice(service.indexOf("export async function archivePartner21dInterest"));
    expect(archiveFn).toContain('.eq("owner_member_id", ownerMemberId)');
    expect(archiveFn).not.toContain(".delete(");
  });

  it("7. archive is soft delete, not physical delete", () => {
    expect(src("docs/DATABASE.md")).toContain("archived_at");
    const service = src("src/lib/analysis/handoff/experience-21d-service.ts");
    expect(service).toContain("archived_at: archivedAt");
    expect(service).not.toMatch(/from\("experience_21d_interests"\)[\s\S]{0,80}\.delete\(/);
    expect(src("src/app/api/quiz/21d/[id]/route.ts")).not.toContain(".delete(");
  });

  it("8–10. archived leads are excluded from list, badge, and performance 21D counts", () => {
    const service = src("src/lib/analysis/handoff/experience-21d-service.ts");
    const listFn = service.slice(
      service.indexOf("export async function listPartner21dInterests"),
      service.indexOf("export async function getPartner21dInterest"),
    );
    const badgeFn = service.slice(
      service.indexOf("export async function countPartner21dWaiting"),
      service.indexOf("export async function listPartner21dInterests"),
    );
    expect(listFn).toContain('.is("archived_at", null)');
    expect(badgeFn).toContain('.is("archived_at", null)');
    expect(src("src/lib/quiz/partner/quiz-partner-funnel.ts")).toContain('.is("archived_at", null)');
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).toContain("確定刪除這筆名單？");
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).toContain(
      "刪除後不會再出現在 21 天名單中，也不會計入工作台成效。",
    );
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).toContain('router.replace("/quiz/21d")');
  });

  it("11–13. archive preserves analysis session, funnel events, and attribution", () => {
    const service = src("src/lib/analysis/handoff/experience-21d-service.ts");
    const start = service.indexOf("export async function archivePartner21dInterest");
    const end = service.indexOf("export async function assertPublicTokenCannotReadBrief");
    const archiveFn = service.slice(start, end);
    expect(archiveFn).toContain("archived_at: archivedAt");
    expect(archiveFn).not.toContain("analysis_sessions");
    expect(archiveFn).not.toContain("experience_21d_funnel_events");
    expect(archiveFn).not.toContain("quiz_share_links");
    expect(archiveFn).not.toContain("coaching_enrollments");
    expect(archiveFn).not.toContain("customers");
    expect(archiveFn).not.toContain("brief_json");
  });

  it("14. public RESET / consumer interest lookup is not archived-filtered", () => {
    const service = src("src/lib/analysis/handoff/experience-21d-service.ts");
    const consumerLookup = service.slice(
      service.indexOf("export async function getInterestBySessionId"),
      service.indexOf("export async function request21dInterest"),
    );
    expect(consumerLookup).toContain('.eq("analysis_session_id", sessionId)');
    expect(consumerLookup).not.toContain("archived_at");
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain("temperature: 0.7");
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain("/reset/landing-final.png");
  });

  it("15–18. RESET V2 / 21D / partner / Coaching 037 regressions stay in place", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    expect(RESET_QUIZ_QUESTIONS.slice(1).map((question) => question.id)).toEqual(["Q2", "Q3", "Q4", "Q5", "Q6"]);
    expect(scoreResetQuiz([{ questionId: "Q1", optionId: "Q1_A" }]).scores.A).toBe(2);
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
    expect(src("src/lib/analysis/handoff/experience-21d-path.ts")).toContain("我想了解我的 21 天方案");
    expect(QUIZ_PARTNER_OG_TITLE).toBe("你比較像哪一種動物？｜Baki GO 心理測驗");
    expect(QUIZ_PARTNER_OG_DESCRIPTION).toBe(
      "6 個生活情境，看看你在想改變自己的時候，最容易進入哪一種模式。",
    );
    expect(src("src/lib/quiz/quiz-service.ts")).toContain("getOrCreatePermanentShareLink");
    expect(src("src/lib/coaching/coaching-service.ts")).not.toContain("experience_21d_interests");
    expect(src("docs/DATABASE.md")).toContain("experience_21d_interests");
    expect(src("docs/DATABASE.md")).toContain("quiz_partner_landing_views");
    expect(src("src/lib/analysis/handoff/experience-21d-contact.ts")).toContain("instagram");
  });
});
