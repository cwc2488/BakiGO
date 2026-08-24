export type CustomerBodyFormValues = {
  recordDate: string;
  age: string;
  weightKg: string;
  skeletalMuscleKg: string;
  bmi: string;
  bodyFatPercent: string;
  visceralFatLevel: string;
  basalMetabolicRate: string;
  bodyAge: string;
  note: string;
};

export function emptyCustomerBodyForm(today: string): CustomerBodyFormValues {
  return {
    recordDate: today,
    age: "",
    weightKg: "",
    skeletalMuscleKg: "",
    bmi: "",
    bodyFatPercent: "",
    visceralFatLevel: "",
    basalMetabolicRate: "",
    bodyAge: "",
    note: "",
  };
}

export function parseCustomerBodyNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function bodyRecordToFormValues(record: {
  recordDate: string;
  age: number | null;
  weightKg: number | null;
  skeletalMuscleKg: number | null;
  bmi: number | null;
  bodyFatPercent: number | null;
  visceralFatLevel: number | null;
  basalMetabolicRate: number | null;
  bodyAge: number | null;
  note?: string;
}): CustomerBodyFormValues {
  const num = (value: number | null) => (value === null || value === undefined ? "" : String(value));
  return {
    recordDate: record.recordDate,
    age: num(record.age),
    weightKg: num(record.weightKg),
    skeletalMuscleKg: num(record.skeletalMuscleKg),
    bmi: num(record.bmi),
    bodyFatPercent: num(record.bodyFatPercent),
    visceralFatLevel: num(record.visceralFatLevel),
    basalMetabolicRate: num(record.basalMetabolicRate),
    bodyAge: num(record.bodyAge),
    note: record.note ?? "",
  };
}
