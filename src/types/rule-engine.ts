/** Priority 0 — shown when a required business rule is not yet defined. */
export const RULE_MISSING_LABEL = "規則待設定";

export const RULE_MISSING_DESCRIPTION = "等待使用者定義。";

export interface RuleMissingEntry {
  ruleKey: string;
  engine: string;
}

export interface RuleMissingState {
  label: typeof RULE_MISSING_LABEL;
  description: typeof RULE_MISSING_DESCRIPTION;
  entries: RuleMissingEntry[];
}

export interface RuleResolved<T> {
  ok: true;
  value: T;
  ruleKey: string;
}

export interface RuleUnresolved {
  ok: false;
  ruleKey: string;
  engine: string;
  label: typeof RULE_MISSING_LABEL;
  description: typeof RULE_MISSING_DESCRIPTION;
}

export type RuleResult<T> = RuleResolved<T> | RuleUnresolved;

export function createRuleMissing(ruleKey: string, engine: string): RuleUnresolved {
  return {
    ok: false,
    ruleKey,
    engine,
    label: RULE_MISSING_LABEL,
    description: RULE_MISSING_DESCRIPTION,
  };
}

export function resolveRuleTarget(
  target: number | null | undefined,
  ruleKey: string,
  engine: string,
): RuleResult<number> {
  if (target === null || target === undefined || Number.isNaN(target)) {
    return createRuleMissing(ruleKey, engine);
  }
  return { ok: true, value: target, ruleKey };
}

export function createRuleMissingState(entries: RuleMissingEntry[]): RuleMissingState {
  return {
    label: RULE_MISSING_LABEL,
    description: RULE_MISSING_DESCRIPTION,
    entries,
  };
}
