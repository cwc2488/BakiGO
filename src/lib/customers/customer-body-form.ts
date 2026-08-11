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
