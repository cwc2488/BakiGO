/** AI Radar Scoring Engine v1 — locked policy version. */
export const AI_RADAR_SCORING_VERSION = "v1" as const;

export const SCORING_WEIGHTS = {
  changeWindow: 40,
  needsFit: 25,
  contactability: 20,
  coreTraits: 5,
  activity: 5,
  location: 5,
  total: 100,
} as const;

export const CHANGE_WINDOW_SUBCAPS = {
  changeIntent: 12,
  behavioralChange: 13,
  solutionGap: 15,
} as const;

export const CONTACTABILITY_SUBCAPS = {
  naturalEntry: 12,
  interactionOpenness: 8,
} as const;

export const CORE_TRAIT_MAX = {
  consistency_resilience: 1.5,
  responsibility_commitment: 1.3,
  team_collaboration: 1.2,
  sharing_influence: 1.0,
} as const;

export const CHANGE_INTENT_POINTS = {
  none: 0,
  emerging: 4,
  clear: 8,
  strong: 12,
} as const;

export const BEHAVIORAL_CHANGE_POINTS = {
  none: 0,
  exploring: 4,
  trying: 9,
  committed_action: 13,
} as const;

export const SOLUTION_GAP_POINTS = {
  closed: 0,
  small: 5,
  open: 10,
  active_gap: 15,
} as const;

export const NEED_STRENGTH_RATIO = {
  none: 0,
  emerging: 0.33,
  clear: 0.67,
  strong: 1.0,
} as const;

export const NEED_RELEVANCE_MULTIPLIER = {
  unrelated: 0,
  adjacent: 0.25,
  relevant: 0.75,
  high_fit: 1.0,
} as const;

export const NATURAL_ENTRY_POINTS = {
  none: 0,
  generic: 4,
  relevant: 8,
  high_leverage: 12,
} as const;

export const INTERACTION_OPENNESS_POINTS = {
  low: 0,
  limited: 2,
  open: 5,
  highly_open: 8,
} as const;

export const ACTIVITY_FRESHNESS_POINTS = [
  { maxDays: 3, points: 5 },
  { maxDays: 7, points: 4 },
  { maxDays: 14, points: 3 },
  { maxDays: 30, points: 2 },
  { maxDays: 60, points: 1 },
] as const;

export const LOCATION_POINTS = {
  same_district: 5,
  same_city: 4,
  nearby_city: 3,
  far: 1,
  unknown: 0,
  /** Member has no development areas configured — neutral baseline, not candidate unknown. */
  member_context_neutral: 2.5,
} as const;

export const EVIDENCE_STRENGTH_BASE = {
  positive_strong: 2,
  positive: 1,
  neutral: 0,
  contradictory: -1,
  contradictory_strong: -2,
} as const;

export const EVIDENCE_QUALITY_MULTIPLIER = {
  direct: 1.0,
  contextual: 0.75,
  ambiguous: 0.25,
} as const;

export const TRAIT_LEVEL_TARGET_RATIO = {
  insufficient: 0.5,
  weak: 0.25,
  moderate: 0.5,
  strong: 0.75,
  very_strong: 1.0,
} as const;

export const TRAIT_LEVEL_THRESHOLDS = {
  weak: 0,
  moderate: 0.75,
  strong: 1.5,
  very_strong: 1.5,
} as const;

export const CONFIDENCE_WEIGHTS = {
  temporal_coverage: 0.35,
  contradiction_consistency: 0.3,
  cross_context_consistency: 0.2,
  evidence_volume: 0.15,
} as const;

export const TEMPORAL_BUCKET_COVERAGE = {
  0: 0,
  1: 0.4,
  2: 0.7,
  3: 1.0,
} as const;

export const CROSS_CONTEXT_COVERAGE = {
  0: 0,
  1: 0.4,
  2: 0.7,
  3: 1.0,
} as const;

export const CONTRADICTION_CONSISTENCY_MAP = {
  insufficient: 0.5,
  none: 1.0,
  weak: 0.75,
  moderate: 0.5,
  strong: 0.25,
} as const;

export const PROFILE_OBSERVABILITY_THRESHOLDS = {
  lowMax: 9,
  mediumMax: 29,
} as const;

export const NEEDS_FIT_MAX = SCORING_WEIGHTS.needsFit;
