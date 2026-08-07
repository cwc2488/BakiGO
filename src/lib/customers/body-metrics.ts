export function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null || heightCm <= 0) {
    return null;
  }

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

export function computeAgeFromBirthYear(
  birthYear: number | undefined,
  recordDate: string,
): number | null {
  if (!birthYear) {
    return null;
  }

  const recordYear = Number(recordDate.slice(0, 4));
  if (!Number.isFinite(recordYear)) {
    return null;
  }

  const age = recordYear - birthYear;
  if (age <= 0 || age >= 120) {
    return null;
  }

  return age;
}
