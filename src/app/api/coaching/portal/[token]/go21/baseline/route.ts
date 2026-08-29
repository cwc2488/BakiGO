import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured, createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError, resolveActiveCoachingPortal } from "@/lib/coaching/coaching-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";

export const runtime = "nodejs";

/** Save Go21 baseline profile + optional body metrics. */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    const body = (await request.json()) as {
      sex?: string;
      birthDate?: string | null;
      birthYear?: number | null;
      heightCm?: number | null;
      weightKg?: number | null;
      bodyFatPercent?: number | null;
      skeletalMuscleKg?: number | null;
      visceralFatLevel?: number | null;
      basalMetabolicRate?: number | null;
      skipOptional?: boolean;
    };

    if (!body.sex || !["male", "female", "other", "prefer_not_to_say"].includes(body.sex)) {
      return NextResponse.json({ error: "請選擇生理性別" }, { status: 400 });
    }
    if (body.heightCm == null || !Number.isFinite(body.heightCm) || body.heightCm < 100 || body.heightCm > 250) {
      return NextResponse.json({ error: "請填寫合理身高 (cm)" }, { status: 400 });
    }
    if (body.weightKg == null || !Number.isFinite(body.weightKg) || body.weightKg < 30 || body.weightKg > 250) {
      return NextResponse.json({ error: "請填寫合理體重 (kg)" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const today = coachingTodayLogDate();

    const customerPatch: Record<string, unknown> = {
      sex: body.sex,
      height_cm: body.heightCm,
      updated_at: new Date().toISOString(),
    };
    if (body.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) {
      customerPatch.birth_date = body.birthDate;
      customerPatch.birth_year = Number(body.birthDate.slice(0, 4));
    } else if (body.birthYear != null && body.birthYear >= 1920 && body.birthYear <= new Date().getFullYear()) {
      customerPatch.birth_year = body.birthYear;
    }

    const { error: customerError } = await supabase
      .from("customers")
      .update(customerPatch)
      .eq("id", portal.customerId)
      .eq("owner_member_id", portal.ownerMemberId);
    if (customerError) {
      throw new CoachingServiceError(customerError.message, 500);
    }

    const { data: existingBody } = await supabase
      .from("body_composition_records")
      .select("id")
      .eq("customer_id", portal.customerId)
      .eq("record_date", today)
      .maybeSingle();

    const bodyPayload = {
      weight_kg: body.weightKg,
      body_fat_percent: body.skipOptional ? null : body.bodyFatPercent ?? null,
      skeletal_muscle_kg: body.skipOptional ? null : body.skeletalMuscleKg ?? null,
      visceral_fat_level: body.skipOptional ? null : body.visceralFatLevel ?? null,
      basal_metabolic_rate: body.skipOptional ? null : body.basalMetabolicRate ?? null,
      updated_at: new Date().toISOString(),
    };

    if (existingBody?.id) {
      await supabase.from("body_composition_records").update(bodyPayload).eq("id", existingBody.id);
    } else {
      await supabase.from("body_composition_records").insert({
        id: crypto.randomUUID(),
        customer_id: portal.customerId,
        record_date: today,
        ...bodyPayload,
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, recordDate: today });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法儲存初始身體資料");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
