import type {
  CoachingAiV2Hypothesis,
  CoachingAiV2HypothesisOp,
  CoachingAiV2HypothesisStatus,
  CoachingAiV2MemoryBundle,
  CoachingAiV2MemoryItem,
  CoachingAiV2MemoryWrite,
  CoachingAiV2OpenLoop,
  CoachingAiV2OpenLoopOp,
  CoachingAiV2OpenLoopStatus,
  CoachingAiV2Turn,
  CoachingAiV2TurnChannel,
  CoachingAiV2TurnRole,
  CoachingAiV2Cycle,
  CoachingAiV2CycleStatus,
  CoachingAiV2Day21Reflection,
  CoachingAiV2Day21ReflectionJson,
  CoachingAiV2Intention,
  CoachingAiV2MemoryCategory,
  CoachingAiV2MemoryStatus,
} from "@/types/coaching-ai-v2";
import {
  COACHING_AI_V2_HYPOTHESIS_LIMIT,
  COACHING_AI_V2_MEMORY_LIMIT,
  COACHING_AI_V2_OPEN_LOOP_LIMIT,
  COACHING_AI_V2_OPEN_LOOP_STALE_DAYS,
  COACHING_AI_V2_RECENT_TURN_LIMIT,
} from "@/types/coaching-ai-v2";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { buildLifecycleSnapshot, resolveAiV2CycleWindow } from "@/lib/coaching/ai/v2/lifecycle";
import type { CoachingPlanSnapshot } from "@/types/coaching";

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

/** In-memory store for tests + local simulation. Supabase adapter wraps the same interface. */
export class CoachingAiV2MemoryStore {
  cycles = new Map<string, CoachingAiV2Cycle>();
  memory = new Map<string, CoachingAiV2MemoryItem>();
  openLoops = new Map<string, CoachingAiV2OpenLoop>();
  hypotheses = new Map<string, CoachingAiV2Hypothesis>();
  turns = new Map<string, CoachingAiV2Turn>();
  reflections = new Map<string, CoachingAiV2Day21Reflection>();

  async ensureActiveCycle(input: {
    enrollmentId: string;
    customerId: string;
    ownerMemberId: string;
    enrollmentStartedAt: string | null | undefined;
    plannedEndAt?: string | null;
    planSnapshot?: CoachingPlanSnapshot | null;
  }): Promise<CoachingAiV2Cycle | null> {
    const existing = [...this.cycles.values()].find(
      (c) => c.enrollmentId === input.enrollmentId && c.status === "active",
    );
    if (existing) return existing;

    const window = resolveAiV2CycleWindow({
      enrollmentStartedAt: input.enrollmentStartedAt,
      plannedEndAt: input.plannedEndAt,
      planSnapshot: input.planSnapshot,
    });
    if (!window) return null;

    const cycle: CoachingAiV2Cycle = {
      id: newId(),
      enrollmentId: input.enrollmentId,
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      cycleIndex: 1,
      startDate: window.startDate,
      plannedEndDate: window.plannedEndDate,
      status: "active",
      day21ReflectionId: null,
      completedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.cycles.set(cycle.id, cycle);
    return cycle;
  }

  async getActiveCycle(enrollmentId: string): Promise<CoachingAiV2Cycle | null> {
    return (
      [...this.cycles.values()].find((c) => c.enrollmentId === enrollmentId && c.status === "active") ??
      null
    );
  }

  async completeCycle(cycleId: string, reflectionId?: string | null): Promise<void> {
    const cycle = this.cycles.get(cycleId);
    if (!cycle) return;
    cycle.status = "completed";
    cycle.completedAt = nowIso();
    cycle.day21ReflectionId = reflectionId ?? cycle.day21ReflectionId;
    cycle.updatedAt = nowIso();
  }

  async loadMemoryBundle(input: {
    enrollmentId: string;
    logDate: string;
    recentTurnLimit?: number;
  }): Promise<CoachingAiV2MemoryBundle> {
    const cycle = await this.getActiveCycle(input.enrollmentId);
    const lifecycle = buildLifecycleSnapshot({ cycle, logDate: input.logDate });
    const turnLimit = input.recentTurnLimit ?? COACHING_AI_V2_RECENT_TURN_LIMIT;

    const recentTurns = [...this.turns.values()]
      .filter((t) => t.enrollmentId === input.enrollmentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, turnLimit)
      .reverse();

    const durableMemory = [...this.memory.values()]
      .filter((m) => m.enrollmentId === input.enrollmentId && m.status === "active")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, COACHING_AI_V2_MEMORY_LIMIT);

    const openLoops = [...this.openLoops.values()]
      .filter(
        (l) =>
          l.enrollmentId === input.enrollmentId && (l.status === "open" || l.status === "waiting"),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, COACHING_AI_V2_OPEN_LOOP_LIMIT);

    const hypotheses = [...this.hypotheses.values()]
      .filter(
        (h) =>
          h.enrollmentId === input.enrollmentId &&
          (h.status === "active" || h.status === "weakened" || h.status === "confirmed"),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, COACHING_AI_V2_HYPOTHESIS_LIMIT);

    return { recentTurns, durableMemory, openLoops, hypotheses, lifecycle };
  }

  async appendTurn(input: {
    enrollmentId: string;
    customerId: string;
    ownerMemberId: string;
    cycleId?: string | null;
    logDate?: string | null;
    role: CoachingAiV2TurnRole;
    channel: CoachingAiV2TurnChannel;
    content: string;
    contentSummary?: string | null;
    aiOutputId?: string | null;
    intention?: CoachingAiV2Intention | string | null;
    metadata?: Record<string, unknown>;
  }): Promise<CoachingAiV2Turn> {
    const existingCount = [...this.turns.values()].filter(
      (t) => t.enrollmentId === input.enrollmentId,
    ).length;
    const turn: CoachingAiV2Turn = {
      id: newId(),
      enrollmentId: input.enrollmentId,
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      cycleId: input.cycleId ?? null,
      logDate: input.logDate ?? null,
      turnIndex: existingCount + 1,
      role: input.role,
      channel: input.channel,
      content: input.content.slice(0, 4000),
      contentSummary: input.contentSummary?.slice(0, 400) ?? null,
      aiOutputId: input.aiOutputId ?? null,
      intention: input.intention ?? null,
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    };
    this.turns.set(turn.id, turn);
    return turn;
  }

  async applyMemoryWrites(input: {
    enrollmentId: string;
    customerId: string;
    ownerMemberId: string;
    cycleId?: string | null;
    logDate?: string | null;
    writes: CoachingAiV2MemoryWrite[];
  }): Promise<CoachingAiV2MemoryItem[]> {
    const created: CoachingAiV2MemoryItem[] = [];
    for (const write of input.writes.slice(0, 4)) {
      const content = write.content.trim().slice(0, 500);
      if (!content) continue;
      // Dedup near-identical active memory
      const duplicate = [...this.memory.values()].find(
        (m) =>
          m.enrollmentId === input.enrollmentId &&
          m.status === "active" &&
          m.content === content,
      );
      if (duplicate) continue;
      const item: CoachingAiV2MemoryItem = {
        id: newId(),
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
        cycleId: input.cycleId ?? null,
        category: write.category,
        content,
        evidenceSummary: write.evidenceSummary?.slice(0, 400) ?? null,
        confidence: clamp01(write.confidence ?? 0.6),
        sourceLogDate: input.logDate ?? null,
        sourceTurnId: null,
        status: "active",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.memory.set(item.id, item);
      created.push(item);
    }
    return created;
  }

  async applyOpenLoopOps(input: {
    enrollmentId: string;
    customerId: string;
    ownerMemberId: string;
    cycleId?: string | null;
    logDate?: string | null;
    ops: CoachingAiV2OpenLoopOp[];
  }): Promise<void> {
    for (const op of input.ops.slice(0, 4)) {
      if (op.op === "create") {
        const loop: CoachingAiV2OpenLoop = {
          id: newId(),
          enrollmentId: input.enrollmentId,
          customerId: input.customerId,
          ownerMemberId: input.ownerMemberId,
          cycleId: input.cycleId ?? null,
          subject: op.subject.slice(0, 120),
          detail: op.detail.slice(0, 400),
          status: op.status ?? "open",
          dueLogDate: op.dueLogDate ?? null,
          createdLogDate: input.logDate ?? null,
          resolvedLogDate: null,
          resolutionNote: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        this.openLoops.set(loop.id, loop);
        continue;
      }
      const existing = this.openLoops.get(op.id);
      if (!existing || existing.enrollmentId !== input.enrollmentId) continue;
      if (op.op === "resolve" || op.op === "abandon") {
        existing.status = op.op === "resolve" ? "resolved" : "abandoned";
        existing.resolvedLogDate = input.logDate ?? null;
        existing.resolutionNote = op.resolutionNote?.slice(0, 400) ?? null;
        existing.updatedAt = nowIso();
      } else if (op.op === "update") {
        if (op.detail) existing.detail = op.detail.slice(0, 400);
        if (op.dueLogDate !== undefined) existing.dueLogDate = op.dueLogDate;
        if (op.status) existing.status = op.status;
        existing.updatedAt = nowIso();
      }
    }
  }

  async applyHypothesisOps(input: {
    enrollmentId: string;
    customerId: string;
    ownerMemberId: string;
    cycleId?: string | null;
    ops: CoachingAiV2HypothesisOp[];
  }): Promise<void> {
    for (const op of input.ops.slice(0, 4)) {
      if (op.op === "create") {
        const hyp: CoachingAiV2Hypothesis = {
          id: newId(),
          enrollmentId: input.enrollmentId,
          customerId: input.customerId,
          ownerMemberId: input.ownerMemberId,
          cycleId: input.cycleId ?? null,
          statement: op.statement.slice(0, 400),
          supportingEvidence: (op.supportingEvidence ?? []).slice(0, 6),
          contradictingEvidence: [],
          confidence: clamp01(op.confidence ?? 0.5),
          status: "active",
          revisedIntoId: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        this.hypotheses.set(hyp.id, hyp);
        continue;
      }
      const existing = this.hypotheses.get(op.id);
      if (!existing || existing.enrollmentId !== input.enrollmentId) continue;
      if (op.op === "support") {
        existing.supportingEvidence = [...existing.supportingEvidence, op.evidence].slice(0, 8);
        existing.confidence = clamp01(op.confidence ?? Math.min(1, existing.confidence + 0.1));
        existing.status = existing.confidence >= 0.85 ? "confirmed" : "active";
        existing.updatedAt = nowIso();
      } else if (op.op === "contradict") {
        existing.contradictingEvidence = [...existing.contradictingEvidence, op.evidence].slice(
          0,
          8,
        );
        existing.confidence = clamp01(op.confidence ?? Math.max(0, existing.confidence - 0.2));
        existing.status = existing.confidence <= 0.25 ? "rejected" : "weakened";
        existing.updatedAt = nowIso();
      } else if (op.op === "reject" || op.op === "confirm") {
        if (op.evidence) {
          const list =
            op.op === "confirm" ? existing.supportingEvidence : existing.contradictingEvidence;
          list.push(op.evidence);
        }
        existing.status = op.op === "confirm" ? "confirmed" : "rejected";
        existing.confidence = op.op === "confirm" ? Math.max(existing.confidence, 0.85) : 0.1;
        existing.updatedAt = nowIso();
      } else if (op.op === "revise") {
        const revised: CoachingAiV2Hypothesis = {
          id: newId(),
          enrollmentId: input.enrollmentId,
          customerId: input.customerId,
          ownerMemberId: input.ownerMemberId,
          cycleId: input.cycleId ?? null,
          statement: op.statement.slice(0, 400),
          supportingEvidence: (op.supportingEvidence ?? []).slice(0, 6),
          contradictingEvidence: [],
          confidence: clamp01(op.confidence ?? 0.5),
          status: "active",
          revisedIntoId: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        existing.status = "revised";
        existing.revisedIntoId = revised.id;
        existing.updatedAt = nowIso();
        this.hypotheses.set(revised.id, revised);
      }
    }
  }

  async staleOpenLoops(enrollmentId: string, todayLogDate: string): Promise<number> {
    const cutoff = addCalendarDays(todayLogDate, -COACHING_AI_V2_OPEN_LOOP_STALE_DAYS);
    let count = 0;
    for (const loop of this.openLoops.values()) {
      if (loop.enrollmentId !== enrollmentId) continue;
      if (loop.status !== "open" && loop.status !== "waiting") continue;
      const anchor = loop.dueLogDate ?? loop.createdLogDate;
      if (anchor && anchor < cutoff) {
        loop.status = "abandoned";
        loop.resolutionNote = "stale_auto_abandoned";
        loop.updatedAt = nowIso();
        count += 1;
      }
    }
    return count;
  }

  async saveDay21Reflection(input: {
    enrollmentId: string;
    customerId: string;
    ownerMemberId: string;
    cycleId: string;
    reflectionJson: CoachingAiV2Day21ReflectionJson;
    customerMessage: string;
    coachSummary?: string | null;
    model?: string | null;
    promptVersion?: string | null;
  }): Promise<CoachingAiV2Day21Reflection> {
    const reflection: CoachingAiV2Day21Reflection = {
      id: newId(),
      enrollmentId: input.enrollmentId,
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      cycleId: input.cycleId,
      reflectionJson: input.reflectionJson,
      customerMessage: input.customerMessage.slice(0, 6000),
      coachSummary: input.coachSummary?.slice(0, 2000) ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      createdAt: nowIso(),
    };
    this.reflections.set(reflection.id, reflection);
    await this.completeCycle(input.cycleId, reflection.id);
    return reflection;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export type CoachingAiV2MemoryStoreLike = CoachingAiV2MemoryStore;

/** Singleton for process-local fixture/eval runs (not Production persistence). */
let sharedInMemoryStore: CoachingAiV2MemoryStore | null = null;

export function getSharedInMemoryV2Store(): CoachingAiV2MemoryStore {
  if (!sharedInMemoryStore) sharedInMemoryStore = new CoachingAiV2MemoryStore();
  return sharedInMemoryStore;
}

export function resetSharedInMemoryV2Store(): void {
  sharedInMemoryStore = new CoachingAiV2MemoryStore();
}

// Re-export types used by mappers
export type {
  CoachingAiV2CycleStatus,
  CoachingAiV2MemoryCategory,
  CoachingAiV2MemoryStatus,
  CoachingAiV2OpenLoopStatus,
  CoachingAiV2HypothesisStatus,
};
