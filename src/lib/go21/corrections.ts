import {
  upsertCoachingDailyLog,
  getCoachingDailyLogDetail,
  type ResolvedCoachingPortal,
} from "@/lib/coaching/coaching-service";
import type { Go21ExtractedEvent } from "@/types/go21";
import type { CoachingMealSlot } from "@/types/coaching";
import { upsertBodyRecordFromChat } from "@/lib/go21/body-record";

/**
 * Evidence-scoped corrections — no broad deletion.
 * Moves meal notes between dates/slots; updates same-day weight.
 */
export async function applyGo21Corrections(input: {
  portal: ResolvedCoachingPortal;
  extracted: Go21ExtractedEvent;
  messageLogDate: string;
}): Promise<{ applied: boolean; errors: string[] }> {
  const errors: string[] = [];
  let applied = false;

  for (const op of input.extracted.corrections) {
    try {
      if (op.kind === "event_date" && typeof op.from === "string" && typeof op.to === "string") {
        await moveMealEvidenceBetweenDates({
          portal: input.portal,
          fromDate: op.from,
          toDate: op.to,
          mealSlot: input.extracted.mealSlot,
          note: input.extracted.mealNote,
        });
        applied = true;
      }

      if (op.kind === "meal_slot" && typeof op.to === "string") {
        const logDate = input.extracted.eventDate ?? input.messageLogDate;
        const fromSlot = typeof op.from === "string" ? (op.from as CoachingMealSlot) : null;
        const toSlot = op.to as CoachingMealSlot;
        const detail = await getCoachingDailyLogDetail({
          enrollmentId: input.portal.enrollmentId,
          logDate,
        });
        const fromEntry = fromSlot
          ? detail.meals.find((m) => m.mealSlot === fromSlot)
          : undefined;
        const fromNote = fromEntry?.textNote || input.extracted.mealNote || null;
        const meals: Partial<Record<CoachingMealSlot, { textNote?: string | null }>> = {
          [toSlot]: { textNote: fromNote ?? `更正為${toSlot}` },
        };
        if (fromSlot && fromSlot !== toSlot) {
          meals[fromSlot] = { textNote: null };
        }
        await upsertCoachingDailyLog({
          portal: input.portal,
          logDate,
          meals,
          markSubmitted: false,
        });
        applied = true;
      }

      if (op.kind === "weight_kg" && typeof op.to === "number") {
        const logDate = input.extracted.eventDate ?? input.messageLogDate;
        const result = await upsertBodyRecordFromChat({
          customerId: input.portal.customerId,
          ownerMemberId: input.portal.ownerMemberId,
          recordDate: logDate,
          weightKg: op.to,
          bodyFatPercent: null,
          skeletalMuscleKg: null,
          visceralFatLevel: null,
          basalMetabolicRate: null,
        });
        if (result.error) errors.push(result.error);
        else applied = true;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "correction_failed");
      console.error(
        JSON.stringify({
          event: "go21_correction_failed",
          kind: op.kind,
          enrollmentId: input.portal.enrollmentId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return { applied, errors };
}

async function moveMealEvidenceBetweenDates(input: {
  portal: ResolvedCoachingPortal;
  fromDate: string;
  toDate: string;
  mealSlot: Go21ExtractedEvent["mealSlot"];
  note: string | null;
}): Promise<void> {
  if (input.fromDate === input.toDate) return;

  const fromDetail = await getCoachingDailyLogDetail({
    enrollmentId: input.portal.enrollmentId,
    logDate: input.fromDate,
  });

  const slot = input.mealSlot;
  let note = input.note;
  if (slot) {
    const fromEntry = fromDetail.meals.find((m) => m.mealSlot === slot);
    if (fromEntry?.textNote) note = fromEntry.textNote;
  }

  if (slot) {
    await upsertCoachingDailyLog({
      portal: input.portal,
      logDate: input.fromDate,
      meals: { [slot]: { textNote: `(已更正日期→${input.toDate})` } },
      markSubmitted: false,
    });
    await upsertCoachingDailyLog({
      portal: input.portal,
      logDate: input.toDate,
      meals: { [slot]: { textNote: note ?? `更正自 ${input.fromDate}` } },
      markSubmitted: false,
    });
  } else if (note) {
    const toDetail = await getCoachingDailyLogDetail({
      enrollmentId: input.portal.enrollmentId,
      logDate: input.toDate,
    });
    await upsertCoachingDailyLog({
      portal: input.portal,
      logDate: input.toDate,
      customerNote: [toDetail.customerNote, note, `（日期更正自 ${input.fromDate}）`]
        .filter(Boolean)
        .join("；"),
      markSubmitted: false,
    });
  }
}
