/**
 * Deterministic bowel movement signal — non-diagnostic.
 */

export type BowelSignalLevel = "normal" | "elevated_today" | "repeated_elevated";

export type BowelSignalResult = {
  level: BowelSignalLevel;
  todayCount: number | null;
  recentHighDays: number;
  coachCopy: string | null;
  customerCopy: string | null;
  /** Soft medical seek wording only when discomfort context present. */
  suggestProfessionalCare: boolean;
};

const HIGH_COUNT = 4;

export function assessBowelMovementSignal(input: {
  todayCount: number | null | undefined;
  /** Recent days' counts newest-first excluding today optional. */
  recentCounts?: Array<number | null | undefined>;
  customerNote?: string | null;
}): BowelSignalResult {
  const today =
    input.todayCount != null && Number.isFinite(input.todayCount)
      ? Math.max(0, Math.floor(Number(input.todayCount)))
      : null;
  const recent = (input.recentCounts ?? [])
    .map((c) => (c != null && Number.isFinite(c) ? Math.floor(Number(c)) : null))
    .filter((c): c is number => c != null);
  const recentHighDays = recent.filter((c) => c >= HIGH_COUNT).length;
  const note = input.customerNote?.trim() ?? "";
  const discomfort = /不舒服|肚子痛|腹瀉|拉肚子|想吐|發燒|血/.test(note);
  const customerUsedMedicalWord = /腹瀉|拉肚子/.test(note);

  if (today == null) {
    return {
      level: "normal",
      todayCount: null,
      recentHighDays,
      coachCopy: null,
      customerCopy: null,
      suggestProfessionalCare: false,
    };
  }

  if (today < HIGH_COUNT && recentHighDays < 2) {
    return {
      level: "normal",
      todayCount: today,
      recentHighDays,
      coachCopy: null,
      customerCopy: null,
      suggestProfessionalCare: false,
    };
  }

  const repeated = today >= HIGH_COUNT && recentHighDays >= 1;
  const level: BowelSignalLevel = repeated ? "repeated_elevated" : "elevated_today";

  const coachCopy = repeated
    ? "近日排便次數偏多，建議關心顧客目前身體感受與水分／作息。"
    : "今天排便次數較多，建議關心顧客目前身體感受。";

  let customerCopy =
    "今天身體訊號比較忙碌一點，先注意水分與休息；如果有不舒服可以跟教練說。";
  if (customerUsedMedicalWord) {
    customerCopy = "你提到身體不太舒服，先多休息、補足水分；若持續不適，建議尋求醫療專業意見。";
  } else if (discomfort) {
    customerCopy =
      "今天身體有點不舒服的話，先放慢節奏、補充水分；如果情況持續或加重，建議尋求醫療專業意見。";
  }

  return {
    level,
    todayCount: today,
    recentHighDays,
    coachCopy,
    customerCopy,
    suggestProfessionalCare: discomfort || (repeated && today >= 6),
  };
}
