import { createSupabaseServiceClient } from "@/lib/supabase/service-client";

export async function upsertBodyRecordFromChat(input: {
  customerId: string;
  ownerMemberId: string;
  recordDate: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  skeletalMuscleKg: number | null;
  visceralFatLevel: number | null;
  basalMetabolicRate: number | null;
}): Promise<{ created: boolean; updated: boolean; error: string | null }> {
  const supabase = createSupabaseServiceClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId)
    .maybeSingle();
  if (customerError) {
    return { created: false, updated: false, error: customerError.message };
  }
  if (!customer) {
    return { created: false, updated: false, error: "customer_isolation_failed" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("body_composition_records")
    .select(
      "id, weight_kg, body_fat_percent, skeletal_muscle_kg, visceral_fat_level, basal_metabolic_rate",
    )
    .eq("customer_id", input.customerId)
    .eq("record_date", input.recordDate)
    .maybeSingle();
  if (existingError) {
    return { created: false, updated: false, error: existingError.message };
  }

  const safePayload = {
    weight_kg: input.weightKg ?? existing?.weight_kg ?? null,
    body_fat_percent: input.bodyFatPercent ?? existing?.body_fat_percent ?? null,
    skeletal_muscle_kg: input.skeletalMuscleKg ?? existing?.skeletal_muscle_kg ?? null,
    visceral_fat_level: input.visceralFatLevel ?? existing?.visceral_fat_level ?? null,
    basal_metabolic_rate: input.basalMetabolicRate ?? existing?.basal_metabolic_rate ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("body_composition_records")
      .update(safePayload)
      .eq("id", existing.id)
      .eq("customer_id", input.customerId);
    if (updateError) {
      return { created: false, updated: false, error: updateError.message };
    }
    return { created: false, updated: true, error: null };
  }

  const { error: insertError } = await supabase.from("body_composition_records").insert({
    id: crypto.randomUUID(),
    customer_id: input.customerId,
    record_date: input.recordDate,
    ...safePayload,
    created_at: new Date().toISOString(),
  });
  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) {
      const { data: raced } = await supabase
        .from("body_composition_records")
        .select("id")
        .eq("customer_id", input.customerId)
        .eq("record_date", input.recordDate)
        .maybeSingle();
      if (raced?.id) {
        const { error: retryError } = await supabase
          .from("body_composition_records")
          .update(safePayload)
          .eq("id", raced.id)
          .eq("customer_id", input.customerId);
        if (retryError) return { created: false, updated: false, error: retryError.message };
        return { created: false, updated: true, error: null };
      }
    }
    return { created: false, updated: false, error: insertError.message };
  }
  return { created: true, updated: false, error: null };
}
