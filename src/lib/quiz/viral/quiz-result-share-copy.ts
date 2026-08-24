import { RESET_ANIMAL_COPY, RESET_ANIMAL_PERSONALITY } from "@/lib/analysis/reset/reset-animals";
import { RESET_ANIMAL_ASSETS } from "@/lib/analysis/reset/reset-art";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";

export const QUIZ_RESULT_SHARE_BRAND = "Baki GO";
export const QUIZ_RESULT_SHARE_KICKER = "我的改變模式是";
export const QUIZ_RESULT_SHARE_FOOT_QUESTION = "你是哪一種？";
export const QUIZ_RESULT_SHARE_FOOT_INVITE = "6 題測看看";
export const QUIZ_RESULT_SHARE_CTA = "分享我的結果";
export const QUIZ_RESULT_SHARE_NUDGE = "分享看看朋友都測到哪一隻 👀";
export const QUIZ_RESULT_SHARE_FALLBACK_CTA = "儲存分享圖";
export const QUIZ_RESULT_SHARE_FALLBACK_HINT = "儲存後就可以分享到 IG 限時動態";

export const QUIZ_RESULT_SHARE_FORBIDDEN = [
  "賀寶芙",
  "Herbalife",
  "21 天",
  "21天",
  "產品",
  "減重方案",
  "購買",
  "收入",
  "創業",
  "事業機會",
  "直銷",
  "成交",
  "優惠",
  "WHY_NOW",
  "why_now",
  "bottleneck",
  "Coach Brief",
  "readiness",
] as const;

export const QUIZ_RESULT_SHARE_PRIVATE_KEYS = [
  "conversation",
  "transcript",
  "why_now",
  "bottleneck",
  "first_change",
  "brief_json",
  "readiness",
  "contact",
  "phone",
  "line_id",
  "display_name",
] as const;

export type QuizResultSharePublicCopy = {
  animalType: PersonalityType;
  animalName: string;
  personality: string;
  characterSrc: string;
  brand: string;
  kicker: string;
  footQuestion: string;
  footInvite: string;
  shareTitle: string;
  shareText: string;
};

export function buildQuizResultShareCopy(animalType: PersonalityType): QuizResultSharePublicCopy {
  const animalName = RESET_ANIMAL_COPY[animalType].animalName;
  const personality = RESET_ANIMAL_PERSONALITY[animalType];
  return {
    animalType,
    animalName,
    personality,
    characterSrc: RESET_ANIMAL_ASSETS[animalType].image,
    brand: QUIZ_RESULT_SHARE_BRAND,
    kicker: QUIZ_RESULT_SHARE_KICKER,
    footQuestion: QUIZ_RESULT_SHARE_FOOT_QUESTION,
    footInvite: QUIZ_RESULT_SHARE_FOOT_INVITE,
    shareTitle: `我測到${animalName}｜Baki GO 心理測驗`,
    shareText: `我的改變模式是${animalName}。你是哪一種？6 題測看看`,
  };
}

export function flattenQuizResultShareCopy(copy: QuizResultSharePublicCopy): string {
  return [
    copy.brand,
    copy.kicker,
    copy.animalName,
    copy.personality,
    copy.footQuestion,
    copy.footInvite,
    copy.shareTitle,
    copy.shareText,
    QUIZ_RESULT_SHARE_CTA,
    QUIZ_RESULT_SHARE_NUDGE,
    QUIZ_RESULT_SHARE_FALLBACK_CTA,
    QUIZ_RESULT_SHARE_FALLBACK_HINT,
  ].join("\n");
}

export function findForbiddenShareCopy(text: string): string[] {
  return QUIZ_RESULT_SHARE_FORBIDDEN.filter((word) => text.includes(word));
}
