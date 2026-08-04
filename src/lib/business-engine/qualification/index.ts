export {
  evaluateQualification,
  evaluateQualifications,
  evaluateQualificationForRank,
  QualificationEvaluator,
} from "./evaluator";
export { buildQualificationContext } from "./build-context";
export type { BuildQualificationContextInput } from "./build-context";
export {
  buildQualificationNextSteps,
  selectActiveQualificationResult,
} from "./build-next-steps";
export type {
  QualificationConditionResult,
  QualificationEvaluationContext,
  QualificationGap,
  QualificationMonthlySnapshot,
  QualificationResult,
} from "./types";

import { DEFAULT_QUALIFICATION_RULES } from "../rules/qualification";
import { evaluateQualification } from "./evaluator";
import type { QualificationEvaluationContext, QualificationResult } from "./types";

export function evaluateAllQualificationRules(
  context: QualificationEvaluationContext,
  config = DEFAULT_QUALIFICATION_RULES,
): QualificationResult[] {
  return Object.values(config.rules).map((rule) => evaluateQualification(rule, context));
}
