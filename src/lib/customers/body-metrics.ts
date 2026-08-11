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

export function computeAgeFromBirthDate(birthDate: string, recordDate: string): number | null {
  const birth = new Date(`${birthDate}T00:00:00`);
  const record = new Date(`${recordDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(record.getTime())) {
    return null;
  }

  let age = record.getFullYear() - birth.getFullYear();
  const monthDiff = record.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && record.getDate() < birth.getDate())) {
    age -= 1;
  }

  if (age <= 0 || age >= 120) {
    return null;
  }

  return age;
}

export function computeAgeFromCustomerProfile(
  profile: { birthDate?: string; birthYear?: number },
  recordDate: string,
): number | null {
  if (profile.birthDate) {
    return computeAgeFromBirthDate(profile.birthDate, recordDate);
  }
  return computeAgeFromBirthYear(profile.birthYear, recordDate);
}
