/**
 * Lose2kg weight / milestone / ticket pure business logic.
 *
 * Invariants:
 * - Percent change always vs measurement-1 baseline.
 * - Each integer loss milestone (-1%, -2%, ...) awards at most once per participant/period.
 * - Rebound revokes weight tickets; re-achieving a revoked milestone does NOT restore.
 * - Activity tickets are independent of weight tickets.
 */

export type MilestoneTicketState = "active" | "revoked";

export type MilestoneRecord = {
  milestonePercent: number; // positive integer meaning -N%
  ticketState: MilestoneTicketState;
};

export type TicketLedgerEvent = {
  eventType:
    | "weight_milestone_awarded"
    | "weight_ticket_revoked"
    | "manual_add"
    | "manual_remove"
    | "correction";
  delta: number;
  relatedMilestone: number | null;
  reason: string | null;
};

export type WeightRecalcResult = {
  weightChangePct: number | null;
  milestones: MilestoneRecord[];
  weightTicketBalance: number;
  events: TicketLedgerEvent[];
};

/**
 * weight_change_pct = (current - baseline) / baseline * 100
 * Loss is negative.
 */
export function computeWeightChangePct(baselineKg: number, currentKg: number): number {
  if (!(baselineKg > 0) || !Number.isFinite(baselineKg) || !Number.isFinite(currentKg)) {
    throw new Error("Invalid weight values.");
  }
  return ((currentKg - baselineKg) / baselineKg) * 100;
}

/**
 * Integer loss milestones achieved at `currentKg` relative to baseline.
 * Uses cross-multiply compare to avoid JS float edge cases:
 *   milestone N achieved when current * 100 <= baseline * (100 - N)
 */
export function achievedMilestonePercents(baselineKg: number, currentKg: number): number[] {
  if (!(baselineKg > 0) || !Number.isFinite(baselineKg) || !Number.isFinite(currentKg)) {
    return [];
  }
  const result: number[] = [];
  for (let n = 1; n <= 100; n += 1) {
    if (currentKg * 100 <= baselineKg * (100 - n) + 1e-6) {
      result.push(n);
    } else {
      break;
    }
  }
  return result;
}

function cloneMilestones(rows: readonly MilestoneRecord[]): MilestoneRecord[] {
  return rows.map((row) => ({ ...row }));
}

/**
 * Apply one post-baseline weight reading onto milestone/ticket state (live path).
 * Re-achieving a previously revoked milestone does NOT restore the ticket.
 */
export function applyWeightReading(
  existing: readonly MilestoneRecord[],
  baselineKg: number,
  currentKg: number,
): { milestones: MilestoneRecord[]; events: TicketLedgerEvent[]; weightTicketBalance: number } {
  const milestones = cloneMilestones(existing);
  const byPercent = new Map(milestones.map((m) => [m.milestonePercent, m]));
  const events: TicketLedgerEvent[] = [];
  const achieved = new Set(achievedMilestonePercents(baselineKg, currentKg));

  for (const n of [...achieved].sort((a, b) => a - b)) {
    if (!byPercent.has(n)) {
      const row: MilestoneRecord = { milestonePercent: n, ticketState: "active" };
      milestones.push(row);
      byPercent.set(n, row);
      events.push({
        eventType: "weight_milestone_awarded",
        delta: 1,
        relatedMilestone: n,
        reason: `首次達成 -${n}%`,
      });
    }
  }

  for (const row of milestones) {
    if (row.ticketState === "active" && !achieved.has(row.milestonePercent)) {
      row.ticketState = "revoked";
      events.push({
        eventType: "weight_ticket_revoked",
        delta: -1,
        relatedMilestone: row.milestonePercent,
        reason: `復胖失去 -${row.milestonePercent}%`,
      });
    }
  }

  return {
    milestones,
    events,
    weightTicketBalance: milestones.filter((m) => m.ticketState === "active").length,
  };
}

/**
 * Live chronological replay. No restore after revoke (CASE 4).
 */
export function replayLiveWeightSequence(
  startMilestones: readonly MilestoneRecord[],
  baselineKg: number,
  weightsAfterBaseline: readonly (number | null)[],
): WeightRecalcResult {
  let milestones = cloneMilestones(startMilestones);
  const events: TicketLedgerEvent[] = [];
  let lastPct: number | null = null;

  for (const weight of weightsAfterBaseline) {
    if (weight == null || !Number.isFinite(weight)) continue;
    lastPct = computeWeightChangePct(baselineKg, weight);
    const step = applyWeightReading(milestones, baselineKg, weight);
    milestones = step.milestones;
    events.push(...step.events);
  }

  return {
    weightChangePct: lastPct,
    milestones,
    weightTicketBalance: milestones.filter((m) => m.ticketState === "active").length,
    events,
  };
}

/**
 * Full rebuild after measurement correction.
 *
 * - Prior milestone percents stay "ever awarded" (unique, never re-award).
 * - Walk corrected weights chronologically.
 * - First time a prior-awarded milestone is achieved in this walk → activate once
 *   (correction delta), then revoke-without-restore for the rest of the walk.
 * - Brand-new milestones → normal award.
 */
export function rebuildMilestonesForCorrectedWeights(
  priorMilestonePercents: readonly number[],
  baselineKg: number | null,
  weightsAfterBaseline: readonly (number | null)[],
): WeightRecalcResult {
  if (baselineKg == null || !(baselineKg > 0)) {
    return {
      weightChangePct: null,
      milestones: [...new Set(priorMilestonePercents)].map((n) => ({
        milestonePercent: n,
        ticketState: "revoked" as const,
      })),
      weightTicketBalance: 0,
      events: [],
    };
  }

  const milestones: MilestoneRecord[] = [...new Set(priorMilestonePercents)]
    .sort((a, b) => a - b)
    .map((n) => ({ milestonePercent: n, ticketState: "revoked" as const }));
  const byPercent = new Map(milestones.map((m) => [m.milestonePercent, m]));
  const events: TicketLedgerEvent[] = [];
  const activatedOnce = new Set<number>();
  let lastPct: number | null = null;

  for (const weight of weightsAfterBaseline) {
    if (weight == null || !Number.isFinite(weight)) continue;
    lastPct = computeWeightChangePct(baselineKg, weight);
    const achieved = new Set(achievedMilestonePercents(baselineKg, weight));

    for (const n of [...achieved].sort((a, b) => a - b)) {
      const existing = byPercent.get(n);
      if (!existing) {
        const row: MilestoneRecord = { milestonePercent: n, ticketState: "active" };
        milestones.push(row);
        byPercent.set(n, row);
        activatedOnce.add(n);
        events.push({
          eventType: "weight_milestone_awarded",
          delta: 1,
          relatedMilestone: n,
          reason: `首次達成 -${n}%`,
        });
      } else if (existing.ticketState === "revoked" && !activatedOnce.has(n)) {
        existing.ticketState = "active";
        activatedOnce.add(n);
        events.push({
          eventType: "correction",
          delta: 1,
          relatedMilestone: n,
          reason: `量測修正後恢復有效 -${n}%`,
        });
      }
    }

    for (const row of milestones) {
      if (row.ticketState === "active" && !achieved.has(row.milestonePercent)) {
        row.ticketState = "revoked";
        events.push({
          eventType: "weight_ticket_revoked",
          delta: -1,
          relatedMilestone: row.milestonePercent,
          reason: `復胖失去 -${row.milestonePercent}%`,
        });
      }
    }
  }

  return {
    weightChangePct: lastPct,
    milestones,
    weightTicketBalance: milestones.filter((m) => m.ticketState === "active").length,
    events,
  };
}

export function totalTickets(weightTickets: number, activityTickets: number): number {
  return Math.max(0, weightTickets) + Math.max(0, activityTickets);
}

export function applyManualTicketDelta(
  currentActivityBalance: number,
  delta: number,
): { nextBalance: number; appliedDelta: number } {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("手動票數必須是非零整數。");
  }
  if (delta > 0) {
    return { nextBalance: currentActivityBalance + delta, appliedDelta: delta };
  }
  const appliedDelta = Math.max(delta, -currentActivityBalance);
  return { nextBalance: currentActivityBalance + appliedDelta, appliedDelta };
}

/** Default measurement dates: first Thursday on/after chosen date, then +7/+14/+21. */
export function computeDefaultMeasurementDates(firstMeasureDateIso: string): [string, string, string, string] {
  const base = parseDateOnly(firstMeasureDateIso);
  const thursday = toThursdayOnOrAfter(base);
  return [
    formatDateOnly(thursday),
    formatDateOnly(addDays(thursday, 7)),
    formatDateOnly(addDays(thursday, 14)),
    formatDateOnly(addDays(thursday, 21)),
  ];
}

function parseDateOnly(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) throw new Error("日期格式須為 YYYY-MM-DD。");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) throw new Error("無效日期。");
  return date;
}

function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** JS: 0=Sun ... 4=Thu */
function toThursdayOnOrAfter(date: Date): Date {
  const day = date.getUTCDay();
  const delta = (4 - day + 7) % 7;
  return addDays(date, delta);
}
