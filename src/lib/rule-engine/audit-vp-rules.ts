import {
  DEFAULT_VP_RULES,
  type VpRulesConfig,
} from "@/lib/business-engine/rules/vp";
import type { RuleMissingEntry } from "@/types/rule-engine";

function pushMissing(
  entries: RuleMissingEntry[],
  ruleKey: string,
  engine: string,
  target: number | null | undefined,
): void {
  if (target === null || target === undefined || Number.isNaN(target)) {
    entries.push({ ruleKey, engine });
  }
}

export function auditVpRules(
  rules: VpRulesConfig = DEFAULT_VP_RULES,
): RuleMissingEntry[] {
  const entries: RuleMissingEntry[] = [];

  pushMissing(entries, "vpRules.rollingWindowMonths", "vp", rules.rollingWindowMonths);

  Object.entries(rules.targets).forEach(([targetKey, targetRule]) => {
    pushMissing(entries, `vpRules.${targetKey}`, "vp", targetRule.amount);
  });

  rules.sources.forEach((source) => {
    if (source.multiplier === null || Number.isNaN(source.multiplier)) {
      entries.push({
        ruleKey: `vpRules.sources.${source.sourceKey}.multiplier`,
        engine: "vp",
      });
    }
  });

  return entries;
}
