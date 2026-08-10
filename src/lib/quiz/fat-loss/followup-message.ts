import type { FatLossQuizResult, PersonalityType } from "./types";
import { getPersonalityProfile } from "./personality-content";

const FOLLOWUP_TEMPLATES: Record<PersonalityType, string> = {
  A: "我看到你結果有一個地方滿有趣的，你比較不像不知道怎麼吃，而是累或壓力大的時候特別容易破功，你自己覺得這個準嗎？",
  B: "你的結果看起來不是不想改，而是開始這件事對你來說太重了。如果先從一個超小的第一步開始，你會想先從哪裡試？",
  C: "你這型很常不是不努力，而是一次做太滿。你覺得過去最容易在第幾週開始撐不住？",
  D: "你比較像是已經試過很多方法，但還沒找到最適合你的那一個。你現在覺得卡最久的點是什麼？",
  E: "你的結果很像是生活節奏常常把計畫打亂，不是你不認真。最近最常讓你亂掉的是工作、聚餐，還是作息？",
  F: "你不是從零開始，比較像差最後一個突破點。如果只能先調一個地方，你會想先動哪一塊？",
};

export function generateFollowupMessage(input: {
  result: FatLossQuizResult;
  respondentName: string;
}): string {
  const profile = getPersonalityProfile(input.result.primaryType);
  const base = FOLLOWUP_TEMPLATES[input.result.primaryType];
  const name = input.respondentName.trim();
  if (!name) {
    return base;
  }
  return `${name}，${base}`;
}

export function generateFollowupMessageWithContext(input: {
  result: FatLossQuizResult;
  respondentName: string;
  referrerName?: string | null;
}): string {
  const message = generateFollowupMessage(input);
  if (!input.referrerName) {
    return message;
  }
  return message;
}
