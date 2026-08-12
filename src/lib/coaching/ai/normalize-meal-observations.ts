import type { CoachingMealObservation } from "@/types/coaching-signals";

const CLARIFICATION_PATTERN =
  /還有沒有搭配|除了.{0,8}還有|還有吃別的|其他東西|其他食物|有沒有搭配/;

const SOLID_FOOD_HINT =
  /蛋|青菜|蔬菜|沙拉|雞胸|魚|肉|便當|飯|麵包|水果|堅果|豆腐|優格|yogurt|egg|salad|veg/i;

/**
 * Normalize observation fields used by DecisionContext.
 * solidFoodObserved=true forbids "有沒有搭配其他食物" clarifications.
 */
export function normalizeMealObservation(observation: CoachingMealObservation): CoachingMealObservation {
  const foodsJoined = observation.observedFoods.join(" ");
  const evidenceJoined = (observation.evidenceText ?? []).join(" ");
  const hasSolidHint =
    observation.solidFoodObserved === true ||
    observation.visibleProteinSource === true ||
    observation.visibleVegetables === true ||
    SOLID_FOOD_HINT.test(foodsJoined) ||
    SOLID_FOOD_HINT.test(evidenceJoined);

  let solidFoodObserved = observation.solidFoodObserved;
  if (hasSolidHint && solidFoodObserved !== true) {
    solidFoodObserved = true;
  }

  let followUpQuestion = observation.followUpQuestion ?? null;
  let noOtherFoodVisible = observation.noOtherFoodVisible;

  if (solidFoodObserved === true) {
    noOtherFoodVisible = false;
    if (followUpQuestion && CLARIFICATION_PATTERN.test(followUpQuestion)) {
      followUpQuestion = null;
    }
  }

  return {
    ...observation,
    solidFoodObserved,
    noOtherFoodVisible,
    followUpQuestion,
  };
}

export function normalizeMealObservations(
  observations: CoachingMealObservation[],
): CoachingMealObservation[] {
  return observations.map(normalizeMealObservation);
}
