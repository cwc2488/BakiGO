import type { StructuredCoachDirective, DirectiveMealSlot } from "@/lib/coaching/directive-meal-verification";
import { DIRECTIVE_MEAL_SLOTS } from "@/lib/coaching/directive-meal-verification";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";

export type CoachDirectiveRecord = StructuredCoachDirective & {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  currentFocus: string | null;
  currentPriority: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapSlot(raw: unknown): DirectiveMealSlot {
  const value = String(raw ?? "general");
  return (DIRECTIVE_MEAL_SLOTS as readonly string[]).includes(value)
    ? (value as DirectiveMealSlot)
    : "general";
}

function mapStatus(raw: unknown): StructuredCoachDirective["status"] {
  const value = String(raw ?? "active");
  if (value === "paused" || value === "completed" || value === "active") return value;
  return "active";
}

function mapRow(row: Record<string, unknown>): CoachDirectiveRecord {
  const instruction =
    (row.coach_instruction != null ? String(row.coach_instruction).trim() : "") ||
    (row.current_focus != null ? String(row.current_focus).trim() : "");
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    customerId: String(row.customer_id),
    ownerMemberId: String(row.owner_member_id),
    mealSlot: mapSlot(row.meal_slot),
    instructionText: instruction,
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveUntil: row.effective_until != null ? String(row.effective_until).slice(0, 10) : null,
    status: mapStatus(row.status),
    customerVisible: row.customer_visible !== false,
    currentFocus: row.current_focus != null ? String(row.current_focus) : null,
    currentPriority: row.current_priority != null ? String(row.current_priority) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listCoachDirectivesForEnrollment(input: {
  enrollmentId: string;
  ownerMemberId: string;
}): Promise<CoachDirectiveRecord[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_directives")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("owner_member_id", input.ownerMemberId)
    .order("effective_from", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("does not exist")) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function listActiveStructuredDirectivesForDay(input: {
  enrollmentId: string;
  logDate: string;
}): Promise<StructuredCoachDirective[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_directives")
    .select("*")
    .eq("enrollment_id", input.enrollmentId)
    .eq("status", "active");

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("does not exist")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((d) => {
      if (input.logDate < d.effectiveFrom) return false;
      if (d.effectiveUntil && input.logDate > d.effectiveUntil) return false;
      return true;
    })
    .map((d) => ({
      id: d.id,
      mealSlot: d.mealSlot,
      instructionText: d.instructionText,
      effectiveFrom: d.effectiveFrom,
      effectiveUntil: d.effectiveUntil,
      status: d.status,
      customerVisible: d.customerVisible,
    }));
}

export async function createCoachDirective(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  mealSlot: DirectiveMealSlot;
  instructionText: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  customerVisible?: boolean;
}): Promise<CoachDirectiveRecord> {
  const text = input.instructionText.trim();
  if (!text) throw new Error("指示內容不可空白");
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("coaching_coach_directives")
    .insert({
      enrollment_id: input.enrollmentId,
      customer_id: input.customerId,
      owner_member_id: input.ownerMemberId,
      meal_slot: input.mealSlot,
      coach_instruction: text,
      current_focus: text,
      current_priority: null,
      effective_from: input.effectiveFrom,
      effective_until: input.effectiveUntil ?? null,
      status: "active",
      customer_visible: input.customerVisible !== false,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function updateCoachDirective(input: {
  directiveId: string;
  ownerMemberId: string;
  mealSlot?: DirectiveMealSlot;
  instructionText?: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  status?: StructuredCoachDirective["status"];
  customerVisible?: boolean;
}): Promise<CoachDirectiveRecord> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.mealSlot) patch.meal_slot = input.mealSlot;
  if (input.instructionText !== undefined) {
    const text = input.instructionText.trim();
    if (!text) throw new Error("指示內容不可空白");
    patch.coach_instruction = text;
    patch.current_focus = text;
  }
  if (input.effectiveFrom) patch.effective_from = input.effectiveFrom;
  if (input.effectiveUntil !== undefined) patch.effective_until = input.effectiveUntil;
  if (input.status) patch.status = input.status;
  if (input.customerVisible !== undefined) patch.customer_visible = input.customerVisible;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_directives")
    .update(patch)
    .eq("id", input.directiveId)
    .eq("owner_member_id", input.ownerMemberId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
  return mapRow(data as Record<string, unknown>);
}
