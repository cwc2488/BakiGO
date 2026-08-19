import type { PersonalityType } from "@/lib/quiz/fat-loss/types";

/**
 * Consumer-fun taxonomy audit (RESET-01):
 * Keep A–F. Patterns are behavioral tendencies, not diagnoses.
 * MECE-ish enough for a 6-question game; real people overlap.
 * Copy avoids shame ("管不住 / 不自律 / 失敗人格").
 */
export type ResetAnimalCopy = {
  type: PersonalityType;
  animalName: string;
  emoji: string;
  shortInterpretation: string;
};

export const RESET_ANIMAL_MECHANISM: Record<PersonalityType, string> = {
  A: "emotional_compensation",
  B: "initiation_delay",
  C: "all_or_nothing",
  D: "over_analysis",
  E: "resource_depletion",
  F: "optimization_bottleneck",
};

export const RESET_ANIMAL_COPY: Record<PersonalityType, ResetAnimalCopy> = {
  A: {
    type: "A",
    animalName: "療癒胖象",
    emoji: "🐘",
    shortInterpretation:
      "問題通常不是不知道怎麼瘦。\n\n當生活很累時，「先讓自己舒服一點」會比長期目標更有吸引力。\n\n所以真正需要處理的，可能不是更多飲食規則，而是你平常怎麼讓自己恢復。",
  },
  B: {
    type: "B",
    animalName: "明天樹懶",
    emoji: "🦥",
    shortInterpretation:
      "等工作沒那麼忙、等聚餐結束、等星期一、等狀態好一點。\n\n真正卡住你的可能不是方法，\n\n而是你把「開始」想成了一件需要準備好的大事。",
  },
  C: {
    type: "C",
    animalName: "暴衝兔",
    emoji: "🐰",
    shortInterpretation:
      "一決定改變，就希望一次做到最好。\n\n所以真正讓你反覆重來的，\n\n可能不是意志力不足，而是你的計畫只能在「100 分的你」身上運作。",
  },
  D: {
    type: "D",
    animalName: "跑輪倉鼠",
    emoji: "🐹",
    shortInterpretation:
      "飲食、運動、熱量、方法，你不是完全不知道。\n\n但資訊越多，越容易覺得還有一個更好的答案。\n\n你真正缺的可能不是更多知識，而是把力氣集中在最重要的一件事。",
  },
  E: {
    type: "E",
    animalName: "熬夜熊貓",
    emoji: "🐼",
    shortInterpretation:
      "工作、睡眠、責任、時間，把一天能用的力氣消耗得差不多。\n\n到了晚上還要「再努力減肥」自然很難。\n\n你的第一步可能不是更逼自己，而是先把可用的能量找回來。",
  },
  F: {
    type: "F",
    animalName: "突破獵豹",
    emoji: "🐆",
    shortInterpretation:
      "你通常已經知道一些方法，也有一定程度的執行能力。\n\n現在卡住的可能不是「要不要開始」，\n\n而是到底哪一個限制因素，正在阻止你進入下一個階段？",
  },
};

export const RESET_ANIMAL_DISCLAIMER =
  "這只是從你剛剛的選擇看到的傾向。真正讓你想改變、又一直卡住的原因，可能完全是另一件事。";

export const RESET_REVEAL_BRIDGE = [
  "這只是從 6 個情境看到的你。",
  "真正的原因，可能還藏在你沒有選項可以回答的地方。",
] as const;

/** Visual-only first line. Does not change scoring or compact quiz background. */
export const RESET_ANIMAL_PERSONALITY: Record<PersonalityType, string> = {
  A: "你很會照顧別人，也很需要一些方式照顧辛苦的自己。",
  B: "你不是不想開始，你一直在等一個比較適合開始的自己。",
  C: "你最大的問題可能不是不夠努力，而是每次都太努力。",
  D: "你可能比很多人都更認真研究怎麼改變。",
  E: "你不是沒有自制力，你可能只是已經沒有多少能量可以拿來自制。",
  F: "你不是從零開始的人。",
};

export const RESET_CONVERSATION_CTA = "讓 AI 真正認識我";

export const RESET_QUIZ_SUPPORT = "憑第一個直覺選就好。";
export const RESET_COMPOSER_PLACEHOLDER = "直接跟我說就好…";
export const RESET_THINKING_LINES = [
  "我在想你剛剛這句……",
  "我把前面幾句放在一起看……",
  "這裡好像有一個值得注意的地方……",
] as const;
