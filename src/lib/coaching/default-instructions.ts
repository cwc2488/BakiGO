import type { CoachingPlanSnapshot } from "@/types/coaching";

export const DEFAULT_COACHING_PLAN_SNAPSHOT: CoachingPlanSnapshot = {
  version: 1,
  dietaryGuidelines: [
    "本陪跑方案建議減少或避開：醬汁很多的料理",
    "加工食品",
    "雞皮",
    "包子、水餃、鍋貼等高油脂麵皮類",
    "麵包、吐司、蛋糕",
    "麵類",
    "洋芋片",
    "油飯、粽子",
    "羹類",
    "湯類等較難掌握內容與份量的食物",
  ],
  dailyInstructions: {
    wakeUp: [
      "起床後先喝溫熱水",
      "依教練指示使用茶粉",
    ],
    breakfast: [
      "依教練指示沖泡奶昔",
      "依教練指示服用錠片",
    ],
    lunch: [
      "依教練指示服用錠片",
      "正常午餐，避開上述高油、高糖、加工或較難控制的食物",
    ],
    dinner: [
      "依教練指示服用錠片",
      "依教練指示沖泡奶昔",
    ],
    snacks: [
      "不餓不需要額外吃",
      "餓時可依教練規則選擇青菜、肉、蛋等",
    ],
    hydration: [
      "依教練指示補充水分",
      "睡前依教練指示補充飲水",
    ],
    sleep: [
      "依教練指示調整就寢時間",
    ],
  },
  reportingRules: [
    "每日飲食需要回報",
    "餐點以「拍照」為主要操作，文字為補充",
    "水分、睡眠、運動、排便也請簡單回報",
    "不需要計算卡路里或營養素",
    "持續回報比完美更重要",
  ],
  coachNotes: "",
};

export function cloneDefaultCoachingPlanSnapshot(): CoachingPlanSnapshot {
  return structuredClone(DEFAULT_COACHING_PLAN_SNAPSHOT);
}

export function parseCoachingPlanSnapshot(value: unknown): CoachingPlanSnapshot {
  if (!value || typeof value !== "object") {
    return cloneDefaultCoachingPlanSnapshot();
  }

  const raw = value as Partial<CoachingPlanSnapshot>;
  const defaults = cloneDefaultCoachingPlanSnapshot();

  return {
    version: 1,
    dietaryGuidelines: Array.isArray(raw.dietaryGuidelines)
      ? raw.dietaryGuidelines.filter((item): item is string => typeof item === "string")
      : defaults.dietaryGuidelines,
    dailyInstructions: {
      wakeUp: Array.isArray(raw.dailyInstructions?.wakeUp)
        ? raw.dailyInstructions.wakeUp.filter((item): item is string => typeof item === "string")
        : defaults.dailyInstructions.wakeUp,
      breakfast: Array.isArray(raw.dailyInstructions?.breakfast)
        ? raw.dailyInstructions.breakfast.filter((item): item is string => typeof item === "string")
        : defaults.dailyInstructions.breakfast,
      lunch: Array.isArray(raw.dailyInstructions?.lunch)
        ? raw.dailyInstructions.lunch.filter((item): item is string => typeof item === "string")
        : defaults.dailyInstructions.lunch,
      dinner: Array.isArray(raw.dailyInstructions?.dinner)
        ? raw.dailyInstructions.dinner.filter((item): item is string => typeof item === "string")
        : defaults.dailyInstructions.dinner,
      snacks: Array.isArray(raw.dailyInstructions?.snacks)
        ? raw.dailyInstructions.snacks.filter((item): item is string => typeof item === "string")
        : defaults.dailyInstructions.snacks,
      hydration: Array.isArray(raw.dailyInstructions?.hydration)
        ? raw.dailyInstructions.hydration.filter((item): item is string => typeof item === "string")
        : defaults.dailyInstructions.hydration,
      sleep: Array.isArray(raw.dailyInstructions?.sleep)
        ? raw.dailyInstructions.sleep.filter((item): item is string => typeof item === "string")
        : defaults.dailyInstructions.sleep,
    },
    reportingRules: Array.isArray(raw.reportingRules)
      ? raw.reportingRules.filter((item): item is string => typeof item === "string")
      : defaults.reportingRules,
    coachNotes: typeof raw.coachNotes === "string" ? raw.coachNotes : defaults.coachNotes ?? "",
    experience21d: parseExperience21d(raw.experience21d),
  };
}

function parseExperience21d(
  value: CoachingPlanSnapshot["experience21d"] | undefined,
): CoachingPlanSnapshot["experience21d"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const productReceivedDate = String(value.productReceivedDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(productReceivedDate)) return undefined;
  const interestId = typeof value.interestId === "string" && value.interestId.trim() ? value.interestId.trim() : undefined;
  return { productReceivedDate, interestId };
}
