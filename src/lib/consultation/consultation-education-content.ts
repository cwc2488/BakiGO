import type { ConsultationGoalType } from "@/types/consultation";
import { CONSULTATION_GOAL_TYPE_LABELS } from "@/lib/consultation/consultation-flow-engine";

export type ConsultationEducationCard = {
  goalType: ConsultationGoalType;
  goalLabel: string;
  transitionLine: string;
  mindsetLine: string;
  teachingPoints: string[];
  suggestedScript: string;
};

const BASE_TRANSITION = "讓我告訴你，他們是怎麼做到的。";
const BASE_MINDSET = "改變身材之前，先改變腦袋。";

const SHARED_POINTS = [
  "運動／訓練提供刺激，身體才會有理由調整。",
  "恢復需要足夠的營養與能量支持，不是越少吃越好。",
  "睡眠與休息也是恢復的一部分，和訓練、飲食一樣重要。",
];

function card(
  goalType: ConsultationGoalType,
  energyFocus: string,
  scriptExtra: string,
): ConsultationEducationCard {
  return {
    goalType,
    goalLabel: CONSULTATION_GOAL_TYPE_LABELS[goalType],
    transitionLine: BASE_TRANSITION,
    mindsetLine: BASE_MINDSET,
    teachingPoints: [...SHARED_POINTS, energyFocus],
    suggestedScript: `${BASE_TRANSITION} ${BASE_MINDSET} ${scriptExtra}`,
  };
}

export const CONSULTATION_EDUCATION_CARDS: Record<ConsultationGoalType, ConsultationEducationCard> = {
  fat_loss: card(
    "fat_loss",
    "減脂方向會依個人狀況調整整體能量攝取，重點是穩定、可持續，不是極端節食。",
    "可以跟客人說：成功案例不是只靠意志力硬撐，而是讓訓練、營養、休息一起配合，慢慢把體脂降下來。",
  ),
  muscle_gain: card(
    "muscle_gain",
    "增肌方向通常需要足夠的蛋白質與整體能量，讓訓練後的身體有材料可以修復、變強。",
    "可以跟客人說：肌肉不是只靠練就長出來，還需要吃對、睡夠，讓每次訓練的刺激真的被身體用上。",
  ),
  body_recomposition: card(
    "body_recomposition",
    "體態重組會同時看訓練刺激、營養分配與恢復，讓線條和體脂一起往更好的方向走。",
    "可以跟客人說：很多人不是只缺運動，而是訓練、飲食、作息沒有一起配合，所以線條一直卡關。",
  ),
  health: card(
    "health",
    "健康改善會先從規律作息、均衡飲食、適度活動開始，讓身體有穩定的恢復節奏。",
    "可以跟客人說：先讓生活節奏穩下來，身體才有空間慢慢變好，不需要一次做很多改變。",
  ),
  other: card(
    "other",
    "不論目標是什麼，核心都是：訓練提供刺激，營養與休息支持恢復，再依個人方向調整。",
    "可以跟客人說：成功案例的共同點，是把運動、飲食、休息當成一套系統，而不是只盯一個方法。",
  ),
};

export function getConsultationEducationCard(
  goalType: ConsultationGoalType | undefined,
): ConsultationEducationCard {
  return CONSULTATION_EDUCATION_CARDS[goalType ?? "other"];
}
