import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolve21dOwnership } from "@/lib/analysis/handoff/experience-21d-attribution";
import { compileCoachHandoffBrief } from "@/lib/analysis/handoff/experience-21d-brief";
import {
  EXPERIENCE_21D_CONSUMER_CHANNELS,
  format21dPartnerContact,
  hasUsableContact,
  parse21dContact,
} from "@/lib/analysis/handoff/experience-21d-contact";
import { build21dInvitation, build21dInvitationBridge } from "@/lib/analysis/handoff/experience-21d-invitation";
import {
  EXPERIENCE_21D_FORBIDDEN_CONSUMER,
  EXPERIENCE_21D_HEADING,
  EXPERIENCE_21D_PRIMARY_CTA,
  EXPERIENCE_21D_SOURCE,
} from "@/lib/analysis/handoff/experience-21d-path";
import { toPublicHandoff } from "@/lib/analysis/handoff/experience-21d-service";
import { createInitialResetSession, type ResetTurn } from "@/lib/analysis/reset/reset-contract";
import { RESET_QUIZ_QUESTIONS } from "@/lib/analysis/reset/reset-quiz";
import { buildResetReportFixture } from "@/lib/analysis/reset/reset-report";
import {
  RESET_CONVERSATION_REASONING_PROMPT,
  buildResetConversationSystemPrompt,
} from "@/lib/analysis/reset/reset-prompts";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function turn(id: string, role: ResetTurn["role"], text: string): ResetTurn {
  return { id, role, text, createdAt: "2026-08-16T00:00:00.000Z" };
}

const report = buildResetReportFixture();

describe("21D-HANDOFF-01", () => {
  it("A. attributed /r consumer resolves to growth share owner, never re-guessed at CTA", () => {
    const owned = resolve21dOwnership({
      sourceType: "referral_share",
      growthShareId: "gs-1",
      growthShareOwnerMemberId: "partner-a",
      quizShareCode: "ABC",
      referrerMemberId: "other-member",
    });
    expect(owned.assignment).toBe("partner");
    expect(owned.ownerMemberId).toBe("partner-a");
    expect(owned.attributionSourceType).toBe("referral_share");
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).toContain("loadSessionAttribution");
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).not.toMatch(/Math\.random|assign.*partner/);
  });

  it("B. anonymous / unassigned consumer is never given a fake partner", () => {
    const none = resolve21dOwnership({
      sourceType: "direct",
      growthShareId: null,
      growthShareOwnerMemberId: null,
      quizShareCode: null,
      referrerMemberId: null,
    });
    expect(none.assignment).toBe("unassigned");
    expect(none.ownerMemberId).toBeNull();

    const fromResultShare = resolve21dOwnership({
      sourceType: "result_share",
      growthShareId: null,
      growthShareOwnerMemberId: null,
      quizShareCode: null,
      referrerMemberId: null,
    });
    expect(fromResultShare.assignment).toBe("unassigned");
    expect(fromResultShare.ownerMemberId).toBeNull();
    expect(fromResultShare.attributionSourceType).toBe("result_share");
  });

  it("C. double click is one interest: unique analysis_session_id", () => {
    const sql = src("supabase/migrations/046_quiz_v2_production_recovery.sql");
    expect(sql).toContain("analysis_session_id uuid not null unique");
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).toContain('onConflict: "analysis_session_id"');
  });

  it("D. refresh after interest stays success via public state created", () => {
    const session = createInitialResetSession();
    session.act = "report";
    session.report = report;
    const publicHandoff = toPublicHandoff(session, { contact_channel: "phone", contact_value: "0912345678" });
    expect(publicHandoff?.interest.state).toBe("created");
    expect(JSON.stringify(publicHandoff)).not.toContain("readiness");
    expect(JSON.stringify(publicHandoff)).not.toContain("avoid_assumption");
    expect(JSON.stringify(publicHandoff)).not.toContain("suggested_opening");
  });

  it("E. existing contact identity skips redundant form", () => {
    expect(hasUsableContact({ contact_channel: "line", contact_value: "baki" })).toBe(true);
    const session = createInitialResetSession();
    session.act = "report";
    session.report = report;
    expect(toPublicHandoff(session, { contact_channel: "line", contact_value: "baki" })?.interest.needsContact).toBe(
      false,
    );
  });

  it("F. no contact identity requires minimal name + one channel", () => {
    expect(parse21dContact({ displayName: "小美", channel: "line", value: "myline" })).toEqual({
      displayName: "小美",
      channel: "line",
      value: "myline",
    });
    expect(parse21dContact({ displayName: "小美", channel: "instagram", value: "@bakigo" })).toEqual({
      displayName: "小美",
      channel: "instagram",
      value: "bakigo",
    });
    expect(parse21dContact({ displayName: "小美", channel: "instagram", value: "bakigo" })).toEqual({
      displayName: "小美",
      channel: "instagram",
      value: "bakigo",
    });
    expect(parse21dContact({ displayName: "小美", channel: "phone", value: "0912-345-678" })).toEqual({
      displayName: "小美",
      channel: "phone",
      value: "0912345678",
    });
    expect(parse21dContact({ displayName: "小美", channel: "instagram", value: "https://www.instagram.com/bakigo/" })).toBeNull();
    expect(parse21dContact({ displayName: "小美", channel: "email", value: "a@b.com" })).toBeNull();
    expect(parse21dContact({ displayName: "小美", channel: "phone", value: "123" })).toBeNull();
    expect(EXPERIENCE_21D_CONSUMER_CHANNELS.map((channel) => channel.id)).toEqual(["line", "instagram", "phone"]);
    expect(EXPERIENCE_21D_CONSUMER_CHANNELS.map((channel) => channel.label)).toEqual(["LINE", "Instagram", "手機"]);
    expect(EXPERIENCE_21D_CONSUMER_CHANNELS.map((channel) => channel.placeholder)).toEqual([
      "你的 LINE ID",
      "@你的IG帳號",
      "09xxxxxxxx",
    ]);
    expect(format21dPartnerContact("line", "myline")?.display).toBe("LINE：myline");
    expect(format21dPartnerContact("instagram", "bakigo")).toEqual({
      label: "Instagram",
      display: "Instagram：@bakigo",
      href: "https://www.instagram.com/bakigo/",
    });
    expect(format21dPartnerContact("phone", "0912345678")?.display).toBe("手機：0912345678");
    const consumerUi = src("src/components/reset/ResetExperienceViews.tsx");
    expect(consumerUi).toContain("一個聯絡方式");
    expect(consumerUi).toContain("EXPERIENCE_21D_CONSUMER_CHANNELS");
    expect(consumerUi).not.toContain("Email");
    expect(src("src/components/reset/ResetExperiencePage.tsx")).not.toContain('"email"');
    expect(src("src/components/quiz/Quiz21dInterestDetailPage.tsx")).toContain("開啟 Instagram");
    expect(src("supabase/migrations/046_quiz_v2_production_recovery.sql")).toContain("'instagram'");
    expect(src("supabase/migrations/046_quiz_v2_production_recovery.sql")).toContain("'email'");
    expect(src("src/components/reset/ResetExperienceViews.tsx")).not.toContain("體重");
    expect(src("src/components/reset/ResetExperienceViews.tsx")).not.toContain("為什麼想瘦");
  });

  it("G. coach brief uses evidence and says 尚未確認 instead of inventing", () => {
    const brief = compileCoachHandoffBrief({
      report,
      turns: [turn("u1", "user", "我想瘦")],
      quizPrimary: "A",
    });
    expect(brief.past_pattern).toBe("尚未確認");
    expect(brief.why_now).toContain("想改變");
    expect(JSON.stringify(brief)).not.toMatch(/保證瘦|Herbalife|NT\$|劑量/);
  });

  it("H. quiz A contradicted by spoken health concern — brief follows conversation", () => {
    const brief = compileCoachHandoffBrief({
      report: {
        ...report,
        why_now: "最近健檢數字開始讓你擔心，同時覺得精神狀態比以前差。",
        bottleneck: "不是不知道方法。工作疲勞後很難維持原本知道的做法。",
      },
      turns: [
        turn("u1", "user", "其實不是，我現在最怕的是健康出問題。"),
        turn("u2", "user", "健檢數字開始讓我緊張"),
      ],
      quizPrimary: "A",
    });
    expect(brief.why_now).toMatch(/健檢/);
    expect(brief.avoid_assumption).toContain("口頭證據已經蓋過測驗假設");
    expect(brief.important_context).toMatch(/健康|健檢/);
    expect(JSON.stringify(brief)).not.toContain("療癒胖象");
  });

  it("I. consumer public payload cannot include coach brief internals", () => {
    const session = createInitialResetSession();
    session.act = "report";
    session.report = report;
    const publicHandoff = toPublicHandoff(session, null);
    expect(publicHandoff?.invitation.heading).toBe(EXPERIENCE_21D_HEADING);
    expect(publicHandoff?.invitation.primaryCta).toBe(EXPERIENCE_21D_PRIMARY_CTA);
    const blob = JSON.stringify(publicHandoff);
    expect(blob).not.toContain("brief");
    expect(blob).not.toContain("READINESS");
    expect(src("src/app/api/analysis/reset/[token]/route.ts")).not.toContain("brief_json");
    expect(src("src/app/api/quiz/21d/[id]/route.ts")).toContain("getMemberIdFromRequest");
  });

  it("J. Production RESET Quiz V2 remains frozen", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    expect(RESET_QUIZ_QUESTIONS[0]!.options).toHaveLength(6);
    expect(src("src/lib/analysis/reset/reset-quiz.ts")).toContain('RESET_QUIZ_VERSION = "reset_quiz_v2"');
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain("/reset/landing-final.png");
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain("temperature: 0.7");
    expect(src("src/lib/analysis/reset/reset-report.ts")).toContain("why_now");
    expect(src("src/lib/analysis/reset/reset-report.ts")).not.toContain("21d");
  });

  it("K. Coaching 037 remains untouched", () => {
    expect(src("src/lib/coaching/coaching-service.ts")).not.toContain("experience_21d_interests");
    expect(src("src/lib/analysis/handoff/experience-21d-service.ts")).not.toContain("coaching_enrollments");
  });

  it("consumer invitation has no price/purchase language and uses report insight", () => {
    const invitation = build21dInvitation(report);
    const blob = JSON.stringify(invitation) + build21dInvitationBridge(report);
    for (const word of EXPERIENCE_21D_FORBIDDEN_CONSUMER) {
      expect(blob).not.toContain(word);
    }
    expect(invitation.bridge).toContain("從剛才聊的內容來看");
    expect(invitation.includes).toHaveLength(3);
    expect(EXPERIENCE_21D_SOURCE).toBe("reset_quiz_v2");
  });

  it("quiz member share uses referrer as owner", () => {
    const owned = resolve21dOwnership({
      sourceType: "quiz_member_share",
      growthShareId: null,
      growthShareOwnerMemberId: null,
      quizShareCode: "XYZ1",
      referrerMemberId: "member-q",
    });
    expect(owned.ownerMemberId).toBe("member-q");
    expect(owned.assignment).toBe("partner");
  });
});
