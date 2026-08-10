import type {
  FatLossQuizAnswers,
  FatLossQuizResult,
  InteractionPriority,
  PersonalityScores,
  PersonalityType,
  ReadinessLevel,
  UrgencyLevel,
} from "./types";
import { ACTION_HISTORY_LABELS, FAT_LOSS_QUESTIONS, GOAL_LABELS } from "./questions";
import { PERSONALITY_TYPES } from "./types";

const TIE_BREAKER_QUESTIONS = [3, 4, 7] as const;

function emptyScores(): PersonalityScores {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
}

function asSingleAnswer(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function scorePersonality(answers: FatLossQuizAnswers): PersonalityScores {
  const scores = emptyScores();
  for (let questionNumber = 1; questionNumber <= 8; questionNumber += 1) {
    const answer = asSingleAnswer(answers[String(questionNumber)]);
    if (!answer || !PERSONALITY_TYPES.includes(answer as PersonalityType)) {
      continue;
    }
    scores[answer as PersonalityType] += 2;
  }
  return scores;
}

function tieBreakerRank(
  type: PersonalityType,
  answers: FatLossQuizAnswers,
): number {
  let rank = 0;
  for (const questionNumber of TIE_BREAKER_QUESTIONS) {
    const answer = asSingleAnswer(answers[String(questionNumber)]);
    if (answer === type) {
      rank += 1;
    }
  }
  return rank;
}

function pickTopTypes(scores: PersonalityScores, answers: FatLossQuizAnswers): {
  primaryType: PersonalityType;
  secondaryType: PersonalityType;
} {
  const ranked = PERSONALITY_TYPES.map((type) => ({
    type,
    score: scores[type],
    tieBreaker: tieBreakerRank(type, answers),
  })).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.tieBreaker - left.tieBreaker;
  });

  const primaryType = ranked[0]?.type ?? "A";
  const secondaryType = ranked[1]?.type ?? "B";
  return { primaryType, secondaryType };
}

function mapUrgency(answer: string | null): UrgencyLevel {
  switch (answer) {
    case "1":
      return "low";
    case "2":
      return "medium";
    case "3":
      return "high";
    case "4":
      return "very_high";
    default:
      return "medium";
  }
}

function mapReadiness(answer: string | null): ReadinessLevel {
  switch (answer) {
    case "1":
      return "low";
    case "2":
      return "medium";
    case "3":
      return "high";
    case "4":
      return "very_high";
    default:
      return "medium";
  }
}

function extractActionHistory(answers: FatLossQuizAnswers): string[] {
  const raw = answers["10"];
  if (!Array.isArray(raw)) {
    return [];
  }
  if (raw.includes("none")) {
    return [];
  }
  return raw.filter((item) => item !== "none");
}

function levelToNumeric(level: UrgencyLevel | ReadinessLevel): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "very_high":
      return 4;
  }
}

function normalizeActionHistory(count: number): number {
  if (count <= 0) {
    return 1;
  }
  if (count <= 2) {
    return 2;
  }
  if (count <= 4) {
    return 3;
  }
  return 4;
}

export function calculateInteractionPriority(input: {
  urgency: UrgencyLevel;
  readiness: ReadinessLevel;
  actionCount: number;
}): InteractionPriority {
  const score =
    levelToNumeric(input.urgency) * 0.35 +
    levelToNumeric(input.readiness) * 0.45 +
    normalizeActionHistory(input.actionCount) * 0.2;

  if (score <= 1.74) {
    return "low";
  }
  if (score <= 2.49) {
    return "medium";
  }
  if (score <= 3.24) {
    return "high";
  }
  return "very_high";
}

export function scoreFatLossQuiz(answers: FatLossQuizAnswers): FatLossQuizResult {
  const personalityScores = scorePersonality(answers);
  const { primaryType, secondaryType } = pickTopTypes(personalityScores, answers);
  const urgency = mapUrgency(asSingleAnswer(answers["9"]));
  const readiness = mapReadiness(asSingleAnswer(answers["11"]));
  const actionHistory = extractActionHistory(answers);
  const primaryGoal = asSingleAnswer(answers["12"]) ?? "other";

  return {
    primaryType,
    secondaryType,
    personalityScores,
    urgency,
    readiness,
    actionHistory,
    primaryGoal,
    interactionPriority: calculateInteractionPriority({
      urgency,
      readiness,
      actionCount: actionHistory.length,
    }),
  };
}

export function formatPrimaryGoal(goalId: string): string {
  return GOAL_LABELS[goalId] ?? goalId;
}

export function formatActionHistoryLabels(actionHistory: string[]): string[] {
  return actionHistory.map((item) => ACTION_HISTORY_LABELS[item] ?? item);
}

export function validateFatLossAnswers(answers: FatLossQuizAnswers): string | null {
  for (const question of FAT_LOSS_QUESTIONS) {
    const value = answers[String(question.number)];
    if (value === undefined || value === null || value === "") {
      return `Question ${question.number} is required.`;
    }
    if (question.type === "multi") {
      if (!Array.isArray(value) || value.length === 0) {
        return `Question ${question.number} requires at least one selection.`;
      }
    }
  }
  return null;
}
