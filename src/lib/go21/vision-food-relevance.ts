import type { CoachingMealObservation } from "@/types/coaching-signals";

export type Go21VisionSubjectKind = "food" | "beverage" | "non_food" | "unclear";

export type Go21VisionFoodRelevance = {
  isFoodRelevant: boolean;
  subjectKind: Go21VisionSubjectKind;
  reason: string;
  visibleHint: string | null;
};

const NON_FOOD_LABEL_RE =
  /貓|狗|兔|寵物|動物|風景|自拍|人像|小孩|嬰兒|車子|文件|螢幕|截圖|meme|表情|手寫|發票|收據|風景照|月亮|天空/u;

const FOODISH_LABEL_RE =
  /飯|麵|麵包|蛋|肉|魚|菜|沙拉|便當|湯|奶昔|蛋白|水果|漢堡|雞|豬|牛|豆腐|粥|水餃|飲料|茶|咖啡|優格|堅果|薯條|披薩|壽司|炒|炸|烤|蒸|滷/u;

/**
 * Gate: is this vision observation reasonably food/beverage relevant?
 * Prefer explicit model fields when present; fall back to conservative heuristics.
 * Non-food → no meal evidence, no nutrition estimate, no plan food completion.
 */
/**
 * Prefer non-food subject labels over any leftover foodish tokens.
 * Never let stale meal names win the visible hint for a non-food image.
 */
export function pickGo21VisionVisibleHint(
  observation: CoachingMealObservation | null | undefined,
): string | null {
  if (!observation) return null;
  const foods = observation.observedFoods ?? [];
  const evidence = observation.evidenceText ?? [];
  const nonFood =
    foods.find((f) => NON_FOOD_LABEL_RE.test(f)) ??
    evidence.find((e) => NON_FOOD_LABEL_RE.test(e));
  if (nonFood) {
    const m = nonFood.match(NON_FOOD_LABEL_RE);
    return m?.[0] ?? nonFood.slice(0, 24);
  }
  // Prefer first non-foodish label
  const clean = foods.find((f) => f.trim() && !FOODISH_LABEL_RE.test(f));
  if (clean) return clean.slice(0, 40);
  return foods[0]?.slice(0, 40) ?? evidence[0]?.slice(0, 40) ?? null;
}

export function assessGo21VisionFoodRelevance(
  observation: CoachingMealObservation | null | undefined,
): Go21VisionFoodRelevance {
  if (!observation) {
    return {
      isFoodRelevant: false,
      subjectKind: "unclear",
      reason: "no_observation",
      visibleHint: null,
    };
  }

  const explicit = (observation as CoachingMealObservation & {
    isFoodRelevant?: boolean | null;
    subjectKind?: Go21VisionSubjectKind | null;
  }).isFoodRelevant;
  const subjectKind = (observation as CoachingMealObservation & {
    subjectKind?: Go21VisionSubjectKind | null;
  }).subjectKind;

  if (explicit === false || subjectKind === "non_food") {
    return {
      isFoodRelevant: false,
      subjectKind: "non_food",
      reason: "model_non_food",
      visibleHint: pickGo21VisionVisibleHint(observation),
    };
  }

  if (explicit === true || subjectKind === "food" || subjectKind === "beverage") {
    return {
      isFoodRelevant: true,
      subjectKind: subjectKind === "beverage" ? "beverage" : "food",
      reason: "model_food",
      visibleHint: observation.observedFoods?.[0] ?? null,
    };
  }

  const foods = (observation.observedFoods ?? []).join(" ");
  const evidence = (observation.evidenceText ?? []).join(" ");
  const blob = `${foods} ${evidence}`;

  // Non-food labels win even if foodish tokens somehow co-exist (stale merge residue)
  if (NON_FOOD_LABEL_RE.test(blob)) {
    return {
      isFoodRelevant: false,
      subjectKind: "non_food",
      reason: "heuristic_non_food_label",
      visibleHint: pickGo21VisionVisibleHint(observation),
    };
  }

  if (observation.shakeObserved || observation.solidFoodObserved === true) {
    return {
      isFoodRelevant: true,
      subjectKind: observation.shakeObserved ? "beverage" : "food",
      reason: "shake_or_solid_flag",
      visibleHint: observation.observedFoods?.[0] ?? null,
    };
  }

  if (FOODISH_LABEL_RE.test(blob)) {
    return {
      isFoodRelevant: true,
      subjectKind: "food",
      reason: "heuristic_food_label",
      visibleHint: observation.observedFoods?.[0] ?? null,
    };
  }

  if ((observation.observedFoods ?? []).length === 0) {
    return {
      isFoodRelevant: false,
      subjectKind: "unclear",
      reason: "empty_foods_uncertain",
      visibleHint: null,
    };
  }

  if (!FOODISH_LABEL_RE.test(blob)) {
    return {
      isFoodRelevant: false,
      subjectKind: "unclear",
      reason: "no_food_cues",
      visibleHint: pickGo21VisionVisibleHint(observation),
    };
  }

  return {
    isFoodRelevant: true,
    subjectKind: "food",
    reason: "default_food",
    visibleHint: observation.observedFoods?.[0] ?? null,
  };
}

export function buildGo21NonFoodEvidenceSummary(relevance: Go21VisionFoodRelevance): string {
  const hint = relevance.visibleHint ? `可見：${relevance.visibleHint}` : "非餐點影像";
  return `非餐點｜${hint}｜不建立飲食紀錄`;
}
