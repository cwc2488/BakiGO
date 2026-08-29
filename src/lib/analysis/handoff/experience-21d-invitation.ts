import type { ResetReport } from "@/lib/analysis/reset/reset-contract";
import {
  EXPERIENCE_21D_FOOTER,
  EXPERIENCE_21D_HEADING,
  EXPERIENCE_21D_INCLUDES,
  EXPERIENCE_21D_LANDING_CTA_HINT,
  EXPERIENCE_21D_PRIMARY_CTA,
  EXPERIENCE_21D_SECONDARY_CTA,
  EXPERIENCE_21D_TITLE,
} from "@/lib/analysis/handoff/experience-21d-path";

export type Experience21dInvitation = {
  heading: string;
  bridge: string;
  title: string;
  includes: Array<{ id: string; label: string }>;
  footer: string;
  primaryCta: string;
  secondaryCta: string;
};

export type Experience21dPublicInterest = {
  state: "none" | "needs_contact" | "created";
  needsContact: boolean;
};

export type Experience21dPublicHandoff = {
  invitation: Experience21dInvitation;
  interest: Experience21dPublicInterest;
};

function stripMarks(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function pickBridgeInsight(report: ResetReport): string {
  const source = stripMarks(report.first_change) || stripMarks(report.bottleneck);
  const sentence = source.split(/[。．]/)[0]?.trim() || source;
  return sentence.replace(/[。．]$/, "");
}

export function build21dInvitationBridge(report: ResetReport): string {
  const insight = pickBridgeInsight(report);
  return [
    "從剛才聊的內容來看，",
    "你現在最需要的不是再知道更多減重方法。",
    "",
    `**${insight}。**`,
    "",
    EXPERIENCE_21D_LANDING_CTA_HINT,
  ].join("\n");
}

export function build21dInvitation(report: ResetReport): Experience21dInvitation {
  return {
    heading: EXPERIENCE_21D_HEADING,
    bridge: build21dInvitationBridge(report),
    title: EXPERIENCE_21D_TITLE,
    includes: EXPERIENCE_21D_INCLUDES.map((item) => ({ id: item.id, label: item.label })),
    footer: EXPERIENCE_21D_FOOTER,
    primaryCta: EXPERIENCE_21D_PRIMARY_CTA,
    secondaryCta: EXPERIENCE_21D_SECONDARY_CTA,
  };
}
