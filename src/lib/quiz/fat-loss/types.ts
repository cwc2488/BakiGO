export type PersonalityType = "A" | "B" | "C" | "D" | "E" | "F";

export type UrgencyLevel = "low" | "medium" | "high" | "very_high";
export type ReadinessLevel = "low" | "medium" | "high" | "very_high";
export type InteractionPriority = "low" | "medium" | "high" | "very_high";

export type PersonalityScores = Record<PersonalityType, number>;

export type FatLossQuizAnswers = {
  [questionNumber: string]: string | string[];
};

export type FatLossQuizResult = {
  primaryType: PersonalityType;
  secondaryType: PersonalityType;
  personalityScores: PersonalityScores;
  urgency: UrgencyLevel;
  readiness: ReadinessLevel;
  actionHistory: string[];
  primaryGoal: string;
  interactionPriority: InteractionPriority;
};

export type PersonalityProfile = {
  type: PersonalityType;
  animalName: string;
  tagline: string;
  emoji: string;
  accent: string;
  headline: string;
  coreInsight: string;
  scenarios: string[];
  suggestions: string[];
  aiDirection: string;
};

export const PERSONALITY_TYPES: PersonalityType[] = ["A", "B", "C", "D", "E", "F"];

export const FAT_LOSS_QUIZ_SLUG = "fat-loss";
