import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { resolveAiV2CycleWindow } from "@/lib/coaching/ai/v2/lifecycle";
import type { CoachingPlanSnapshot } from "@/types/coaching";
import type {
  CoachingAiV2GenerationDraft,
  CoachingAiV2Day21ReflectionJson,
  CoachingAiV2TurnChannel,
} from "@/types/coaching-ai-v2";
import type { CoachingAiV2MemoryStore } from "@/lib/coaching/ai/v2/memory-store";
import { enrichTurnContentForAi } from "@/lib/go21/conversation-quality";

export type PersistV2MemoryResult = {
  ok: boolean;
  duplicate: boolean;
  customerTurnId: string | null;
  coachTurnId: string | null;
  coachMessage: string | null;
};

export type Go21TurnByClientRequest = {
  id: string;
  content: string;
  role: "customer" | "coach" | "system" | string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AcceptGo21CustomerTurnResult = {
  ok: boolean;
  duplicate: boolean;
  customerTurnId: string | null;
  coachTurn: { id: string; content: string } | null;
  errorMessage: string | null;
};

/**
 * Best-effort Supabase persistence for V2 memory.
 * Persists BOTH customer + coach turns (authoritative conversation history).
 * Safe no-op when service client unavailable or tables not yet migrated.
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
  /** Customer-facing text/photo placeholder — never vision system blobs. */
  customerDisplayContent?: string | null;
  customerChannel?: CoachingAiV2TurnChannel;
  customerMetadata?: Record<string, unknown>;
  clientRequestId?: string | null;
  /** When set, customer row was already accepted — do not insert again. */
  existingCustomerTurnId?: string | null;
  skipCustomerInsert?: boolean;
}): Promise<PersistV2MemoryResult> {
  if (!isSupabaseServiceConfigured()) {
    return { ok: false, duplicate: false, customerTurnId: null, coachTurnId: null, coachMessage: null };
  }

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
      if (!ownerMemberId) {
        return { ok: false, duplicate: false, customerTurnId: null, coachTurnId: null, coachMessage: null };
      }
    }

    // Idempotency: one clientRequestId → one customer + one coach turn
    if (input.clientRequestId?.trim()) {
      const existingPair = await findGo21TurnsByClientRequestId({
        enrollmentId: input.enrollmentId,
        clientRequestId: input.clientRequestId.trim(),
      });
      if (existingPair.coach) {
        return {
          ok: true,
          duplicate: true,
          customerTurnId: existingPair.customer?.id ?? input.existingCustomerTurnId ?? null,
          coachTurnId: existingPair.coach.id,
          coachMessage: existingPair.coach.content,
        };
      }
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

    const turnChannel =
      input.channel === "free_message"
        ? "free_message"
        : input.channel === "day21"
          ? "day21"
          : "daily_log";
    const customerChannel = input.customerChannel ?? turnChannel;
    const customerContent = (input.customerDisplayContent?.trim() || "（訊息）").slice(0, 4000);
    const customerMeta: Record<string, unknown> = {
      ...(input.customerMetadata ?? {}),
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    };

    let customerTurnId: string | null = input.existingCustomerTurnId ?? null;
    const skipCustomer =
      Boolean(input.skipCustomerInsert) || Boolean(input.existingCustomerTurnId);

    if (!skipCustomer) {
      const { data: customerInserted, error: customerError } = await supabase
        .from("coaching_ai_turns")
        .insert({
          enrollment_id: input.enrollmentId,
          customer_id: input.customerId,
          owner_member_id: ownerMemberId,
          cycle_id: cycleId,
          log_date: input.logDate,
          role: "customer",
          channel: customerChannel,
          content: customerContent,
          content_summary:
            typeof customerMeta.visionEvidenceSummary === "string"
              ? String(customerMeta.visionEvidenceSummary).slice(0, 400)
              : null,
          metadata: customerMeta,
        })
        .select("id")
        .maybeSingle();
      if (customerError) {
        console.error("[coaching_ai_v2] customer turn persist failed", customerError);
      } else {
        customerTurnId = (customerInserted?.id as string | undefined) ?? null;
      }
    }

    const { data: coachInserted, error: coachError } = await supabase
      .from("coaching_ai_turns")
      .insert({
        enrollment_id: input.enrollmentId,
        customer_id: input.customerId,
        owner_member_id: ownerMemberId,
        cycle_id: cycleId,
        log_date: input.logDate,
        role: "coach",
        channel: turnChannel,
        content: input.coachMessage.slice(0, 4000),
        intention: input.draft.meta.intention,
        metadata: {
          safetyTriggered: input.draft.meta.safetyTriggered,
          escalationSuggested: input.draft.meta.escalationSuggested,
          ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
          ...(customerTurnId ? { replyToCustomerTurnId: customerTurnId } : {}),
        },
      })
      .select("id")
      .maybeSingle();
    if (coachError) {
      console.error("[coaching_ai_v2] coach turn persist failed", coachError);
    }
    const coachTurnId = (coachInserted?.id as string | undefined) ?? null;

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

    return {
      ok: skipCustomer ? Boolean(coachTurnId) : Boolean(customerTurnId || coachTurnId),
      duplicate: false,
      customerTurnId,
      coachTurnId,
      coachMessage: input.coachMessage,
    };
  } catch (error) {
    console.error("[coaching_ai_v2] persistV2MemoryFromSupabaseIfConfigured", error);
    return { ok: false, duplicate: false, customerTurnId: null, coachTurnId: null, coachMessage: null };
  }
}

export async function findTurnByClientRequestId(input: {
  enrollmentId: string;
  clientRequestId: string;
  role?: "customer" | "coach";
}): Promise<{ id: string; content: string; metadata: Record<string, unknown> } | null> {
  const pair = await findGo21TurnsByClientRequestId({
    enrollmentId: input.enrollmentId,
    clientRequestId: input.clientRequestId,
  });
  if (input.role === "coach") {
    return pair.coach
      ? { id: pair.coach.id, content: pair.coach.content, metadata: pair.coach.metadata }
      : null;
  }
  if (input.role === "customer") {
    return pair.customer
      ? {
          id: pair.customer.id,
          content: pair.customer.content,
          metadata: pair.customer.metadata,
        }
      : null;
  }
  const hit = pair.coach ?? pair.customer;
  return hit ? { id: hit.id, content: hit.content, metadata: hit.metadata } : null;
}

export async function findGo21TurnsByClientRequestId(input: {
  enrollmentId: string;
  clientRequestId: string;
}): Promise<{
  customer: Go21TurnByClientRequest | null;
  coach: Go21TurnByClientRequest | null;
}> {
  if (!isSupabaseServiceConfigured()) return { customer: null, coach: null };
  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from("coaching_ai_turns")
      .select("id, content, metadata, role, created_at")
      .eq("enrollment_id", input.enrollmentId)
      .contains("metadata", { clientRequestId: input.clientRequestId })
      .order("created_at", { ascending: true })
      .limit(8);
    let customer: Go21TurnByClientRequest | null = null;
    let coach: Go21TurnByClientRequest | null = null;
    for (const row of data ?? []) {
      if (!row?.id) continue;
      const mapped: Go21TurnByClientRequest = {
        id: String(row.id),
        content: String(row.content ?? ""),
        role: String(row.role ?? ""),
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {},
        createdAt: String(row.created_at ?? ""),
      };
      if (mapped.role === "customer" && !customer) customer = mapped;
      if (mapped.role === "coach" && !coach) coach = mapped;
    }
    return { customer, coach };
  } catch {
    return { customer: null, coach: null };
  }
}

/**
 * Durability boundary: accept exactly one canonical customer turn for a clientRequestId.
 * Does not require AI generation success.
 */
export async function acceptGo21CustomerTurn(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  content: string;
  channel: CoachingAiV2TurnChannel;
  metadata?: Record<string, unknown>;
  clientRequestId?: string | null;
}): Promise<AcceptGo21CustomerTurnResult> {
  if (!isSupabaseServiceConfigured()) {
    return {
      ok: false,
      duplicate: false,
      customerTurnId: null,
      coachTurn: null,
      errorMessage: "service_unavailable",
    };
  }

  const clientRequestId = input.clientRequestId?.trim() || null;
  if (clientRequestId) {
    const existing = await findGo21TurnsByClientRequestId({
      enrollmentId: input.enrollmentId,
      clientRequestId,
    });
    if (existing.customer || existing.coach) {
      return {
        ok: true,
        duplicate: true,
        customerTurnId: existing.customer?.id ?? null,
        coachTurn: existing.coach
          ? { id: existing.coach.id, content: existing.coach.content }
          : null,
        errorMessage: null,
      };
    }
  }

  try {
    const supabase = createSupabaseServiceClient();
    const metadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      ...(clientRequestId ? { clientRequestId } : {}),
    };
    const { data, error } = await supabase
      .from("coaching_ai_turns")
      .insert({
        enrollment_id: input.enrollmentId,
        customer_id: input.customerId,
        owner_member_id: input.ownerMemberId,
        log_date: input.logDate,
        role: "customer",
        channel: input.channel,
        content: input.content.slice(0, 4000),
        content_summary:
          typeof metadata.visionEvidenceSummary === "string"
            ? String(metadata.visionEvidenceSummary).slice(0, 400)
            : null,
        metadata,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // Lost-response / race: another request may have accepted the same clientRequestId.
      if (clientRequestId) {
        const raced = await findGo21TurnsByClientRequestId({
          enrollmentId: input.enrollmentId,
          clientRequestId,
        });
        if (raced.customer || raced.coach) {
          return {
            ok: true,
            duplicate: true,
            customerTurnId: raced.customer?.id ?? null,
            coachTurn: raced.coach
              ? { id: raced.coach.id, content: raced.coach.content }
              : null,
            errorMessage: null,
          };
        }
      }
      return {
        ok: false,
        duplicate: false,
        customerTurnId: null,
        coachTurn: null,
        errorMessage: error.message?.slice(0, 200) ?? "customer_persist_failed",
      };
    }

    return {
      ok: true,
      duplicate: false,
      customerTurnId: (data?.id as string | undefined) ?? null,
      coachTurn: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      ok: false,
      duplicate: false,
      customerTurnId: null,
      coachTurn: null,
      errorMessage: error instanceof Error ? error.message.slice(0, 200) : "customer_persist_failed",
    };
  }
}

/**
 * Hydrate process-local V2 store from durable Supabase rows so cold starts
 * still have recent conversation + vision evidence + open loops.
 */
export async function hydrateV2StoreFromSupabase(input: {
  store: CoachingAiV2MemoryStore;
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
}): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  try {
    const supabase = createSupabaseServiceClient();
    const [turns, memory, loops, hyps, cycle] = await Promise.all([
      supabase
        .from("coaching_ai_turns")
        .select("id, role, content, channel, log_date, created_at, intention, metadata, content_summary")
        .eq("enrollment_id", input.enrollmentId)
        .order("created_at", { ascending: false })
        .limit(24),
      supabase
        .from("coaching_ai_memory")
        .select(
          "id, category, content, evidence_summary, confidence, source_log_date, status, created_at, updated_at, cycle_id",
        )
        .eq("enrollment_id", input.enrollmentId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(16),
      supabase
        .from("coaching_ai_open_loops")
        .select(
          "id, subject, detail, status, due_log_date, created_log_date, resolved_log_date, resolution_note, created_at, updated_at, cycle_id",
        )
        .eq("enrollment_id", input.enrollmentId)
        .in("status", ["open", "waiting"])
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("coaching_ai_hypotheses")
        .select(
          "id, statement, supporting_evidence, contradicting_evidence, confidence, status, created_at, updated_at, cycle_id",
        )
        .eq("enrollment_id", input.enrollmentId)
        .in("status", ["active", "weakened", "confirmed"])
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("coaching_ai_cycles")
        .select(
          "id, cycle_index, start_date, planned_end_date, status, day21_reflection_id, completed_at, created_at, updated_at",
        )
        .eq("enrollment_id", input.enrollmentId)
        .eq("status", "active")
        .maybeSingle(),
    ]);

    if (cycle.data?.id && !input.store.cycles.has(String(cycle.data.id))) {
      input.store.cycles.set(String(cycle.data.id), {
        id: String(cycle.data.id),
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
        cycleIndex: Number(cycle.data.cycle_index ?? 1),
        startDate: String(cycle.data.start_date),
        plannedEndDate: String(cycle.data.planned_end_date),
        status: "active",
        day21ReflectionId: (cycle.data.day21_reflection_id as string | null) ?? null,
        completedAt: (cycle.data.completed_at as string | null) ?? null,
        createdAt: String(cycle.data.created_at ?? new Date().toISOString()),
        updatedAt: String(cycle.data.updated_at ?? new Date().toISOString()),
      });
    }

    const turnRows = [...((turns.data ?? []) as Array<Record<string, unknown>>)].reverse();
    let turnIndex = 0;
    for (const row of turnRows) {
      const id = String(row.id);
      if (input.store.turns.has(id)) continue;
      turnIndex += 1;
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      const display = String(row.content ?? "");
      const vision =
        typeof metadata.visionEvidenceSummary === "string"
          ? metadata.visionEvidenceSummary
          : typeof row.content_summary === "string"
            ? row.content_summary
            : null;
      const correction =
        typeof metadata.customerCorrection === "string" ? metadata.customerCorrection : null;
      const aiContent =
        row.role === "customer"
          ? enrichTurnContentForAi({
              displayContent: display,
              visionEvidenceSummary: vision,
              customerCorrection: correction,
            })
          : display;
      input.store.turns.set(id, {
        id,
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
        cycleId: (cycle.data?.id as string | undefined) ?? null,
        logDate: (row.log_date as string | null) ?? input.logDate,
        turnIndex,
        role: row.role as "customer" | "coach" | "system",
        channel: (row.channel as never) ?? "free_message",
        content: aiContent.slice(0, 4000),
        contentSummary: (row.content_summary as string | null) ?? null,
        aiOutputId: null,
        intention: (row.intention as string | null) ?? null,
        metadata,
        createdAt: String(row.created_at ?? new Date().toISOString()),
      });
    }

    for (const row of (memory.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id);
      if (input.store.memory.has(id)) continue;
      input.store.memory.set(id, {
        id,
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
        cycleId: (row.cycle_id as string | null) ?? null,
        category: row.category as never,
        content: String(row.content),
        evidenceSummary: (row.evidence_summary as string | null) ?? null,
        confidence: Number(row.confidence ?? 0.6),
        sourceLogDate: (row.source_log_date as string | null) ?? null,
        sourceTurnId: null,
        status: "active",
        createdAt: String(row.created_at ?? new Date().toISOString()),
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      });
    }

    for (const row of (loops.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id);
      if (input.store.openLoops.has(id)) continue;
      input.store.openLoops.set(id, {
        id,
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
        cycleId: (row.cycle_id as string | null) ?? null,
        subject: String(row.subject),
        detail: String(row.detail),
        status: row.status as never,
        dueLogDate: (row.due_log_date as string | null) ?? null,
        createdLogDate: String(row.created_log_date ?? input.logDate),
        resolvedLogDate: (row.resolved_log_date as string | null) ?? null,
        resolutionNote: (row.resolution_note as string | null) ?? null,
        createdAt: String(row.created_at ?? new Date().toISOString()),
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      });
    }

    for (const row of (hyps.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id);
      if (input.store.hypotheses.has(id)) continue;
      input.store.hypotheses.set(id, {
        id,
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
        cycleId: (row.cycle_id as string | null) ?? null,
        statement: String(row.statement),
        supportingEvidence: Array.isArray(row.supporting_evidence)
          ? (row.supporting_evidence as string[])
          : [],
        contradictingEvidence: Array.isArray(row.contradicting_evidence)
          ? (row.contradicting_evidence as string[])
          : [],
        confidence: Number(row.confidence ?? 0.5),
        status: row.status as never,
        revisedIntoId: null,
        createdAt: String(row.created_at ?? new Date().toISOString()),
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      });
    }

    return true;
  } catch (error) {
    console.error("[coaching_ai_v2] hydrateV2StoreFromSupabase", error);
    return false;
  }
}

/** Load recent vision evidence summaries from customer turns (no new Vision call). */
export async function loadRecentVisionEvidenceFromTurns(input: {
  enrollmentId: string;
  limit?: number;
}): Promise<Array<{ summary: string; correction: string | null; createdAt: string }>> {
  if (!isSupabaseServiceConfigured()) return [];
  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from("coaching_ai_turns")
      .select("metadata, created_at, content_summary")
      .eq("enrollment_id", input.enrollmentId)
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 5);
    const out: Array<{ summary: string; correction: string | null; createdAt: string }> = [];
    for (const row of data ?? []) {
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      const summary =
        (typeof metadata.visionEvidenceSummary === "string" && metadata.visionEvidenceSummary) ||
        (typeof row.content_summary === "string" && row.content_summary) ||
        null;
      if (!summary?.trim()) continue;
      out.push({
        summary: summary.trim(),
        correction:
          typeof metadata.customerCorrection === "string" ? metadata.customerCorrection : null,
        createdAt: String(row.created_at),
      });
    }
    return out;
  } catch {
    return [];
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
