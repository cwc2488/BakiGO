/**
 * Server-side human-readable ticket calculation breakdown (lose2kg V4).
 * UI must only render this payload — never reimplement ticket math client-side.
 */

import {
  applyWeightReading,
  computeWeightChangePct,
  type MilestoneRecord,
  type TicketLedgerEvent,
} from "@/lib/lose2kg/milestones";
import type {
  Lose2kgMeasurement,
  Lose2kgTicketEvent,
  Lose2kgWeightMilestone,
} from "@/types/lose2kg";

export type Lose2kgTicketBreakdownMeasurement = {
  slot: 1 | 2 | 3 | 4;
  date: string | null;
  weightKg: number | null;
  changePct: number | null;
  description: string;
  ticketDelta: number;
};

export type Lose2kgTicketBreakdownMilestone = {
  percent: number;
  everAchieved: true;
  currentlyActive: boolean;
  firstAchievedSlot: number | null;
};

export type Lose2kgTicketBreakdownExtra = {
  id: string;
  at: string;
  description: string;
  delta: number;
};

export type Lose2kgTicketBreakdown = {
  participantId: string;
  displayName: string;
  baselineKg: number | null;
  currentKg: number | null;
  currentChangePct: number | null;
  measurements: Lose2kgTicketBreakdownMeasurement[];
  milestones: Lose2kgTicketBreakdownMilestone[];
  extraTickets: Lose2kgTicketBreakdownExtra[];
  summary: {
    weightTickets: number;
    extraTickets: number;
    totalTickets: number;
  };
};

/** Trim + require ≥2 characters. */
export function validateExtraTicketReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 2) {
    const err = new Error("請填寫額外票說明（至少 2 個字）。");
    (err as Error & { code?: string }).code = "EXTRA_TICKET_REASON_REQUIRED";
    throw err;
  }
  return trimmed;
}

function formatPct(pct: number): string {
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return pct <= 0 ? `-${text}%` : `+${text}%`;
}

function describeSlotEvents(
  events: TicketLedgerEvent[],
  slot: 1 | 2 | 3 | 4,
  changePct: number | null,
): { description: string; ticketDelta: number } {
  if (slot === 1) {
    return { description: "基準體重（第 1 週量測不發票）", ticketDelta: 0 };
  }

  const awards = events.filter((e) => e.eventType === "weight_milestone_awarded");
  const revokes = events.filter((e) => e.eventType === "weight_ticket_revoked");
  const corrections = events.filter((e) => e.eventType === "correction");
  const ticketDelta = events.reduce((sum, e) => sum + e.delta, 0);

  if (awards.length === 0 && revokes.length === 0 && corrections.length === 0) {
    if (changePct == null) return { description: "尚未量測", ticketDelta: 0 };
    return {
      description: `目前 ${formatPct(changePct)}，沒有跨越新的完整 1%`,
      ticketDelta: 0,
    };
  }

  const parts: string[] = [];
  if (changePct != null && revokes.length > 0) {
    parts.push(`體重回升至 ${formatPct(changePct)}`);
  }
  for (const e of awards) {
    parts.push(e.reason ?? `首次達成 -${e.relatedMilestone}%`);
  }
  for (const e of corrections) {
    parts.push(e.reason ?? `量測修正後恢復有效 -${e.relatedMilestone}%`);
  }
  for (const e of revokes) {
    parts.push(e.reason ?? `復胖失去 -${e.relatedMilestone}%`);
  }
  return { description: parts.join("；"), ticketDelta };
}

export function buildTicketBreakdown(input: {
  participantId: string;
  displayName: string;
  measurements: Lose2kgMeasurement[];
  measurementDates: [string, string, string, string];
  milestones: Lose2kgWeightMilestone[];
  events: Lose2kgTicketEvent[];
  showWeights: boolean;
  weightTicketBalance: number;
  activityTicketBalance: number;
}): Lose2kgTicketBreakdown {
  const bySlot = new Map<number, Lose2kgMeasurement>();
  for (const m of input.measurements) bySlot.set(m.slot, m);

  const slot1Weight = bySlot.get(1)?.weightKg ?? null;
  const baselineKg = slot1Weight != null && slot1Weight > 0 ? slot1Weight : null;

  let state: MilestoneRecord[] = [];
  const firstAchievedSlot = new Map<number, number>();
  const measurementRows: Lose2kgTicketBreakdownMeasurement[] = [];

  let currentKg: number | null = baselineKg;
  let currentChangePct: number | null = baselineKg != null ? 0 : null;

  for (const slot of [1, 2, 3, 4] as const) {
    const m = bySlot.get(slot);
    const weightKg = m?.weightKg ?? null;
    const date = input.measurementDates[slot - 1] ?? null;

    if (slot === 1) {
      measurementRows.push({
        slot,
        date,
        weightKg: input.showWeights ? weightKg : null,
        changePct: weightKg != null && baselineKg != null ? 0 : null,
        description: weightKg != null ? "基準體重（第 1 週量測不發票）" : "尚未建立基準",
        ticketDelta: 0,
      });
      continue;
    }

    if (baselineKg == null || weightKg == null || !(weightKg > 0)) {
      measurementRows.push({
        slot,
        date,
        weightKg: input.showWeights ? weightKg : null,
        changePct: null,
        description:
          weightKg != null && weightKg > 0 && baselineKg == null
            ? "等待第1次基準體重"
            : "尚未量測",
        ticketDelta: 0,
      });
      continue;
    }

    const changePct = computeWeightChangePct(baselineKg, weightKg);
    const step = applyWeightReading(state, baselineKg, weightKg);
    for (const e of step.events) {
      if (
        e.eventType === "weight_milestone_awarded" &&
        e.relatedMilestone != null &&
        !firstAchievedSlot.has(e.relatedMilestone)
      ) {
        firstAchievedSlot.set(e.relatedMilestone, slot);
      }
    }
    state = step.milestones;
    currentKg = weightKg;
    currentChangePct = changePct;
    const { description, ticketDelta } = describeSlotEvents(step.events, slot, changePct);
    measurementRows.push({
      slot,
      date,
      weightKg: input.showWeights ? weightKg : null,
      changePct,
      description,
      ticketDelta,
    });
  }

  const dbMilestones = [...input.milestones].sort(
    (a, b) => a.milestonePercent - b.milestonePercent,
  );
  const milestoneRows: Lose2kgTicketBreakdownMilestone[] = dbMilestones.map((m) => ({
    percent: m.milestonePercent,
    everAchieved: true as const,
    currentlyActive: m.ticketState === "active",
    firstAchievedSlot: firstAchievedSlot.get(m.milestonePercent) ?? null,
  }));

  for (const row of state) {
    if (!milestoneRows.some((m) => m.percent === row.milestonePercent)) {
      milestoneRows.push({
        percent: row.milestonePercent,
        everAchieved: true,
        currentlyActive: row.ticketState === "active",
        firstAchievedSlot: firstAchievedSlot.get(row.milestonePercent) ?? null,
      });
    }
  }
  milestoneRows.sort((a, b) => a.percent - b.percent);

  const extraTickets: Lose2kgTicketBreakdownExtra[] = input.events
    .filter((e) => e.eventType === "manual_add" || e.eventType === "manual_remove")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({
      id: e.id,
      at: e.createdAt,
      description: e.reason?.trim() ? e.reason.trim() : "舊版額外票紀錄",
      delta: e.delta,
    }));

  return {
    participantId: input.participantId,
    displayName: input.displayName,
    baselineKg: input.showWeights ? baselineKg : null,
    currentKg: input.showWeights ? currentKg : null,
    currentChangePct,
    measurements: measurementRows,
    milestones: milestoneRows,
    extraTickets,
    summary: {
      weightTickets: input.weightTicketBalance,
      extraTickets: input.activityTicketBalance,
      totalTickets: input.weightTicketBalance + input.activityTicketBalance,
    },
  };
}
