/** Taiwan mobile phone normalization + validation for transformation leads. */

export function normalizeTaiwanPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Accepts Taiwan mobile numbers: 09xxxxxxxx (10 digits).
 * Also accepts +8869xxxxxxxx after normalization.
 */
export function isValidTaiwanMobilePhone(raw: string): boolean {
  const digits = normalizeTaiwanPhone(raw);
  if (/^09\d{8}$/.test(digits)) return true;
  if (/^8869\d{8}$/.test(digits)) return true;
  return false;
}

export function formatTaiwanMobilePhone(raw: string): string {
  const digits = normalizeTaiwanPhone(raw);
  if (/^8869\d{8}$/.test(digits)) {
    return `0${digits.slice(3)}`;
  }
  return digits;
}
