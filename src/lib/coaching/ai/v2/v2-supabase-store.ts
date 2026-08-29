import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { resolveAiV2CycleWindow } from "@/lib/coaching/ai/v2/lifecycle";
import type { CoachingPlanSnapshot } from "@/types/coaching";
import type { CoachingAiV2GenerationDraft, CoachingAiV2Day21ReflectionJson } from "@/types/coaching-ai-v2";

/**
 * Best-effort Supabase persistence for V2 memory.
 * Safe no-op when service client unavailable or tables not yet migrated.
 * Never throws to callers — logs and returns false.
 */
export async function persistV2MemoryFromSupabaseIfConfigured(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId?: string;
  draft: CoachingAiV2GenerationDraft;
  logDate: string;
  coachMessage: string;
  channel: "daily_log" | "free_message" | "day21";
  model: string;
  promptVersion: string;
  enrollmentStartedAt?: string | null;
  plannedEndAt?: string | null;
  planSnapshot?: CoachingPlanSnapshot | null;
}): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;

  try {
    const supabase = createSupabaseServiceClient();

    // Resolve owner from enrollment if not provided
    let ownerMemberId = input.ownerMemberId ?? "";
    if (!ownerMemberId) {
      const { data: enrollment } = await supabase
        .from("coaching_enrollments")
        .select("owner_member_id, started_at, planned_end_at, plan_snapshot_json")
        .eq("id", input.enrollmentId)
        .maybeSingle();
      ownerMemberId = (enrollment?.owner_member_id as string | undefined) ?? "";
      if (!ownerMemberId) return false;
    }

    const window = resolveAiV2CycleWindow({
      enrollmentStartedAt: input.enrollmentStartedAt,
      plannedEndAt: input.plannedEndAt,
      planSnapshot: input.planSnapshot,
    });

    let cycleId: string | null = null;
    if (window) {
      const { data: existing } = await supabase
        .from("coaching_ai_cycles")
        .select("id")
        .eq("enrollment_id", input.enrollmentId)
        .eq("status", "active")
        .maybeSingle();

      if (existing?.id) {
        cycleId = existing.id as string;
      } else {
        const { data: inserted, error } = await supabase
          .from("coaching_ai_cycles")
          .insert({
            enrollment_id: input.enrollmentId,
            customer_id: input.customerId,
            owner_member_id: ownerMemberId,
            cycle_index: 1,
            start_date: window.startDate,
            planned_end_date: window.plannedEndDate,
            status: "active",
          })
          .select("id")
          .maybeSingle();
        if (!error && inserted?.id) cycleId = inserted.id as string;
      }
    }

    // Turns
    await supabase.from("coaching_ai_turns").insert({
      enrollment_id: input.enrollmentId,
      customer_id: input.customerId,
      owner_member_id: ownerMemberId,
      cycle_id: cycleId,
      log_date: input.logDate,
      role: "coach",
      channel: input.channel === "free_message" ? "free_message" : input.channel,
      content: input.coachMessage.slice(0, 4000),
      intention: input.draft.meta.intention,
      metadata: {
        safetyTriggered: input.draft.meta.safetyTriggered,
        escalationSuggested: input.draft.meta.escalationSuggested,
      },
    });

    for (const write of input.draft.meta.memoryWrites.slice(0, 4)) {
      await supabase.from("coaching_ai_memory").insert({
        enrollment_id: input.enrollmentId,
        customer_id: input.customerId,
        owner_member_id: ownerMemberId,
        cycle_id: cycleId,
        category: write.category,
        content: write.content.slice(0, 500),
        evidence_summary: write.evidenceSummary?.slice(0, 400) ?? null,
        confidence: write.confidence ?? 0.6,
        source_log_date: input.logDate,
        status: "active",
      });
    }

    for (const op of input.draft.meta.openLoopOps.slice(0, 4)) {
      if (op.op === "create") {
        await supabase.from("coaching_ai_open_loops").insert({
          enrollment_id: input.enrollmentId,
          customer_id: input.customerId,
          owner_member_id: ownerMemberId,
          cycle_id: cycleId,
          subject: op.subject.slice(0, 120),
          detail: op.detail.slice(0, 400),
          status: op.status ?? "open",
          due_log_date: op.dueLogDate ?? null,
          created_log_date: input.logDate,
        });
      } else if (op.op === "resolve" || op.op === "abandon") {
        await supabase
          .from("coaching_ai_open_loops")
          .update({
            status: op.op === "resolve" ? "resolved" : "abandoned",
            resolved_log_date: input.logDate,
            resolution_note: op.resolutionNote ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id)
          .eq("enrollment_id", input.enrollmentId);
      } else if (op.op === "update") {
        await supabase
          .from("coaching_ai_open_loops")
          .update({
            detail: op.detail,
            due_log_date: op.dueLogDate,
            status: op.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id)
          .eq("enrollment_id", input.enrollmentId);
      }
    }

    for (const op of input.draft.meta.hypothesisOps.slice(0, 4)) {
      if (op.op === "create") {
        await supabase.from("coaching_ai_hypotheses").insert({
          enrollment_id: input.enrollmentId,
          customer_id: input.customerId,
          owner_member_id: ownerMemberId,
          cycle_id: cycleId,
          statement: op.statement.slice(0, 400),
          supporting_evidence: op.supportingEvidence ?? [],
          contradicting_evidence: [],
          confidence: op.confidence ?? 0.5,
          status: "active",
        });
      } else if (op.op === "contradict" || op.op === "support") {
        const { data: existing } = await supabase
          .from("coaching_ai_hypotheses")
          .select("supporting_evidence, contradicting_evidence, confidence")
          .eq("id", op.id)
          .eq("enrollment_id", input.enrollmentId)
          .maybeSingle();
        if (!existing) continue;
        const supporting = Array.isArray(existing.supporting_evidence)
          ? [...(existing.supporting_evidence as string[])]
          : [];
        const contradicting = Array.isArray(existing.contradicting_evidence)
          ? [...(existing.contradicting_evidence as string[])]
          : [];
        if (op.op === "support") supporting.push(op.evidence);
        else contradicting.push(op.evidence);
        const confidence =
          op.confidence ??
          (op.op === "support"
            ? Math.min(1, Number(existing.confidence ?? 0.5) + 0.1)
            : Math.max(0, Number(existing.confidence ?? 0.5) - 0.2));
        await supabase
          .from("coaching_ai_hypotheses")
          .update({
            supporting_evidence: supporting.slice(0, 8),
            contradicting_evidence: contradicting.slice(0, 8),
            confidence,
            status: op.op === "support" ? (confidence >= 0.85 ? "confirmed" : "active") : confidence <= 0.25 ? "rejected" : "weakened",
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id);
      } else if (op.op === "reject" || op.op === "confirm") {
        await supabase
          .from("coaching_ai_hypotheses")
          .update({
            status: op.op === "confirm" ? "confirmed" : "rejected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id)
          .eq("enrollment_id", input.enrollmentId);
      }
    }

    if (input.draft.meta.day21Reflection && cycleId) {
      await saveDay21ReflectionRow({
        supabase,
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId,
        cycleId,
        reflection: input.draft.meta.day21Reflection,
        customerMessage: input.coachMessage,
        model: input.model,
        promptVersion: input.promptVersion,
      });
    }

    return true;
  } catch (error) {
    console.error("[coaching_ai_v2] persistV2MemoryFromSupabaseIfConfigured", error);
    return false;
  }
}

async function saveDay21ReflectionRow(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  cycleId: string;
  reflection: CoachingAiV2Day21ReflectionJson;
  customerMessage: string;
  model: string;
  promptVersion: string;
}): Promise<void> {
  const { data: inserted } = await input.supabase
    .from("coaching_ai_day21_reflections")
    .upsert(
      {
        enrollment_id: input.enrollmentId,
        customer_id: input.customerId,
        owner_member_id: input.ownerMemberId,
        cycle_id: input.cycleId,
        reflection_json: input.reflection,
        customer_message: input.customerMessage.slice(0, 6000),
        coach_summary: input.reflection.nextActions.join("；").slice(0, 2000),
        model: input.model,
        prompt_version: input.promptVersion,
      },
      { onConflict: "cycle_id" },
    )
    .select("id")
    .maybeSingle();

  await input.supabase
    .from("coaching_ai_cycles")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      day21_reflection_id: inserted?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.cycleId);
}

export async function loadV2MemoryBundleFromSupabase(input: {
  enrollmentId: string;
  logDate: string;
}): Promise<null | {
  recentTurns: Array<{ role: string; content: string; channel: string; logDate: string | null }>;
  durableMemory: Array<{ category: string; content: string }>;
  openLoops: Array<{ id: string; subject: string; detail: string }>;
  hypotheses: Array<{ id: string; statement: string; confidence: number }>;
}> {
  if (!isSupabaseServiceConfigured()) return null;
  try {
    const supabase = createSupabaseServiceClient();
    const [turns, memory, loops, hyps] = await Promise.all([
      supabase
        .from("coaching_ai_turns")
        .select("role, content, channel, log_date, created_at")
        .eq("enrollment_id", input.enrollmentId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("coaching_ai_memory")
        .select("category, content, confidence")
        .eq("enrollment_id", input.enrollmentId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(16),
      supabase
        .from("coaching_ai_open_loops")
        .select("id, subject, detail, status, due_log_date")
        .eq("enrollment_id", input.enrollmentId)
        .in("status", ["open", "waiting"])
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("coaching_ai_hypotheses")
        .select("id, statement, confidence, status")
        .eq("enrollment_id", input.enrollmentId)
        .in("status", ["active", "weakened", "confirmed"])
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);

    return {
      recentTurns: ((turns.data ?? []) as Array<Record<string, unknown>>)
        .reverse()
        .map((t) => ({
          role: String(t.role),
          content: String(t.content),
          channel: String(t.channel),
          logDate: (t.log_date as string | null) ?? null,
        })),
      durableMemory: ((memory.data ?? []) as Array<Record<string, unknown>>).map((m) => ({
        category: String(m.category),
        content: String(m.content),
      })),
      openLoops: ((loops.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
        id: String(l.id),
        subject: String(l.subject),
        detail: String(l.detail),
      })),
      hypotheses: ((hyps.data ?? []) as Array<Record<string, unknown>>).map((h) => ({
        id: String(h.id),
        statement: String(h.statement),
        confidence: Number(h.confidence ?? 0.5),
      })),
    };
  } catch {
    return null;
  }
}
