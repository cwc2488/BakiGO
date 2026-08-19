/** Preview native_v1 entry: skip the legacy 12-question personality quiz. No migration. */

export const NATIVE_V1_SEED_KEY = "__native_v1_seed" as const;

export function isNativeSeedAnswers(answers: unknown): boolean {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  return (answers as Record<string, unknown>)[NATIVE_V1_SEED_KEY] === true;
}
