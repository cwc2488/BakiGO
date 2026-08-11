/** Fields that must never appear in coaching generation input sent to an LLM. */
export const COACHING_GENERATION_EXCLUDED_PII_KEYS = [
  "phone",
  "email",
  "token",
  "portalToken",
  "signedUrl",
  "signed_url",
  "ownerMemberId",
  "owner_member_id",
  "mealEntryId",
  "password",
  "auth",
] as const;

export const COACHING_GENERATION_PII_POLICY = {
  allowed: [
    "displayName — natural address in AI copy only",
    "goal, heightCm, sex, region, occupation — coaching context",
    "meal text notes, sleep/exercise/water/bowel/customer notes",
    "body composition measurements (weight, body fat, muscle, visceral, BMI)",
    "coach directives (focus, priority, instruction)",
    "primary meal storagePath (breakfast/lunch/dinner only, selected) — worker resolves images server-side",
    "prior AI inference fields with provenance ai_inference",
    "deterministic intervention context with provenance deterministic",
  ],
  excluded: [
    "phone, email, portal token, member auth identifiers",
    "signed URLs or public photo URLs",
    "internal DB ids in fingerprint payload (mealEntryId, sourceOutputId excluded from fingerprint)",
    "conversation history",
    "snack/drink/fourth_meal photo refs",
  ],
} as const;

export function collectForbiddenPiiMatches(value: unknown, path = ""): string[] {
  if (value == null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenPiiMatches(item, `${path}[${index}]`));
  }

  const record = value as Record<string, unknown>;
  const matches: string[] = [];

  for (const [key, nested] of Object.entries(record)) {
    const keyLower = key.toLowerCase();
    if (COACHING_GENERATION_EXCLUDED_PII_KEYS.some((forbidden) => keyLower.includes(forbidden.toLowerCase()))) {
      matches.push(path ? `${path}.${key}` : key);
    }
    matches.push(...collectForbiddenPiiMatches(nested, path ? `${path}.${key}` : key));
  }

  return matches;
}

export function assertGenerationInputFreeOfExcludedPii(value: unknown): void {
  const matches = collectForbiddenPiiMatches(value);
  if (matches.length > 0) {
    throw new Error(`Generation input contains excluded PII keys: ${matches.join(", ")}`);
  }
}
