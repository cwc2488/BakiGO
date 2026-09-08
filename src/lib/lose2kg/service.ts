import {
  applyManualTicketDelta,
  applyWeightReading,
  computeDefaultMeasurementDates,
  computeWeightChangePct,
  rebuildMilestonesForCorrectedWeights,
  totalTickets,
  type MilestoneRecord,
} from "@/lib/lose2kg/milestones";
import {
  cryptoRandom,
  pickEqualWinner,
  pickWeightedWinnersWithoutReplacement,
} from "@/lib/lose2kg/draw";
import { Lose2kgError } from "@/lib/lose2kg/api";
import {
  generateLose2kgPublicToken,
  hashLose2kgPublicToken,
  normalizeLose2kgToken,
} from "@/lib/lose2kg/tokens";
import { buildPublicShareUrl } from "@/lib/app/public-origin";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type {
  Lose2kgDraw,
  Lose2kgMeasurement,
  Lose2kgMeasurementSlot,
  Lose2kgParticipant,
  Lose2kgPeriod,
  Lose2kgPeriodStatus,
  Lose2kgPrize,
  Lose2kgPublicTempDrawPage,
  Lose2kgPublicTicketPage,
  Lose2kgTempDrawSession,
  Lose2kgTicketEvent,
  Lose2kgWeightMilestone,
} from "@/types/lose2kg";
import { randomUUID } from "node:crypto";

function db() {
  return createSupabaseServiceClient();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(raw: string, label = "名稱"): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Lose2kgError(`${label}不可空白。`, 400, "invalid_name");
  if (name.length > 60) throw new Lose2kgError(`${label}過長（最多 60 字）。`, 400, "invalid_name");
  return name;
}

function mapPeriod(row: Record<string, unknown>, publicToken?: string | null): Lose2kgPeriod {
  return {
    id: String(row.id),
    name: String(row.name),
    status: row.status as Lose2kgPeriodStatus,
    startDate: row.start_date ? String(row.start_date) : null,
    measurementDates: [
      String(row.measurement_date_1),
      String(row.measurement_date_2),
      String(row.measurement_date_3),
      String(row.measurement_date_4),
    ],
    publicToken: publicToken ?? null,
    publicEnabled: Boolean(row.public_enabled),
    createdByMemberId: row.created_by_member_id ? String(row.created_by_member_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapParticipant(row: Record<string, unknown>): Lose2kgParticipant {
  const weight = Number(row.weight_ticket_balance ?? 0);
  const activity = Number(row.activity_ticket_balance ?? 0);
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    name: String(row.name),
    publicDisplayName: String(row.public_display_name),
    status: row.status as Lose2kgParticipant["status"],
    note: row.note != null ? String(row.note) : null,
    sortOrder: Number(row.sort_order ?? 0),
    weightTicketBalance: weight,
    activityTicketBalance: activity,
    totalTicketBalance: totalTickets(weight, activity),
    currentWeightChangePct:
      row.current_weight_change_pct == null ? null : Number(row.current_weight_change_pct),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMeasurement(row: Record<string, unknown>): Lose2kgMeasurement {
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    participantId: String(row.participant_id),
    slot: Number(row.slot) as Lose2kgMeasurementSlot,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    measuredAt: row.measured_at ? String(row.measured_at) : null,
    weightChangePct: row.weight_change_pct == null ? null : Number(row.weight_change_pct),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPrize(row: Record<string, unknown>): Lose2kgPrize {
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    name: String(row.name),
    winnerCount: Number(row.winner_count ?? 1),
    sortOrder: Number(row.sort_order ?? 0),
    status: row.status as Lose2kgPrize["status"],
    allowDuplicateWinners: Boolean(row.allow_duplicate_winners),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDraw(row: Record<string, unknown>): Lose2kgDraw {
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    prizeId: String(row.prize_id),
    status: row.status as Lose2kgDraw["status"],
    winnerParticipantId: row.winner_participant_id ? String(row.winner_participant_id) : null,
    winnerNameSnapshot: row.winner_name_snapshot ? String(row.winner_name_snapshot) : null,
    winnerTicketCount: row.winner_ticket_count == null ? null : Number(row.winner_ticket_count),
    totalPoolTicketCount:
      row.total_pool_ticket_count == null ? null : Number(row.total_pool_ticket_count),
    randomMetadata: (row.random_metadata as Record<string, unknown> | null) ?? null,
    drawnByMemberId: row.drawn_by_member_id ? String(row.drawn_by_member_id) : null,
    drawnAt: row.drawn_at ? String(row.drawn_at) : null,
    voidedByMemberId: row.voided_by_member_id ? String(row.voided_by_member_id) : null,
    voidedAt: row.voided_at ? String(row.voided_at) : null,
    voidReason: row.void_reason ? String(row.void_reason) : null,
    idempotencyKey: String(row.idempotency_key),
    createdAt: String(row.created_at),
  };
}

function mapTempSession(row: Record<string, unknown>, publicToken?: string | null): Lose2kgTempDrawSession {
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    status: row.status as Lose2kgTempDrawSession["status"],
    publicToken: publicToken ?? (row.public_token_hint ? String(row.public_token_hint) : ""),
    winnerParticipantId: row.winner_participant_id ? String(row.winner_participant_id) : null,
    winnerNameSnapshot: row.winner_name_snapshot ? String(row.winner_name_snapshot) : null,
    entryCount: row.entry_count == null ? null : Number(row.entry_count),
    randomMetadata: (row.random_metadata as Record<string, unknown> | null) ?? null,
    createdByMemberId: row.created_by_member_id ? String(row.created_by_member_id) : null,
    drawnAt: row.drawn_at ? String(row.drawn_at) : null,
    voidedByMemberId: row.voided_by_member_id ? String(row.voided_by_member_id) : null,
    voidedAt: row.voided_at ? String(row.voided_at) : null,
    voidReason: row.void_reason ? String(row.void_reason) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEvent(row: Record<string, unknown>): Lose2kgTicketEvent {
  return {
    id: String(row.id),
    periodId: String(row.period_id),
    participantId: String(row.participant_id),
    eventType: row.event_type as Lose2kgTicketEvent["eventType"],
    delta: Number(row.delta),
    reason: row.reason != null ? String(row.reason) : null,
    relatedMeasurementId: row.related_measurement_id ? String(row.related_measurement_id) : null,
    relatedMilestone: row.related_milestone == null ? null : Number(row.related_milestone),
    createdByMemberId: row.created_by_member_id ? String(row.created_by_member_id) : null,
    createdAt: String(row.created_at),
  };
}

async function getPeriodRow(periodId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db()
    .from("lose2kg_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到此期活動。", 404, "not_found");
  return data as Record<string, unknown>;
}

export async function listPeriods(): Promise<{
  active: Lose2kgPeriod[];
  completed: Lose2kgPeriod[];
  draft: Lose2kgPeriod[];
}> {
  const { data, error } = await db()
    .from("lose2kg_periods")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  const periods = (data ?? []).map((row) => mapPeriod(row as Record<string, unknown>));
  return {
    active: periods.filter((p) => p.status === "active"),
    completed: periods.filter((p) => p.status === "completed"),
    draft: periods.filter((p) => p.status === "draft"),
  };
}

export async function createPeriod(input: {
  name: string;
  firstMeasurementDate: string;
  measurementDates?: [string, string, string, string];
  createdByMemberId: string;
}): Promise<Lose2kgPeriod> {
  const name = normalizeName(input.name, "期數名稱");
  const dates =
    input.measurementDates ?? computeDefaultMeasurementDates(input.firstMeasurementDate);
  const token = generateLose2kgPublicToken();
  const tokenHash = hashLose2kgPublicToken(token);

  const { data, error } = await db()
    .from("lose2kg_periods")
    .insert({
      name,
      status: "draft",
      start_date: dates[0],
      measurement_date_1: dates[0],
      measurement_date_2: dates[1],
      measurement_date_3: dates[2],
      measurement_date_4: dates[3],
      public_token_hash: tokenHash,
      public_token_hint: token.slice(0, 6),
      public_enabled: false,
      created_by_member_id: input.createdByMemberId,
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  const period = mapPeriod(data as Record<string, unknown>, token);

  await db().from("lose2kg_prizes").insert({
    period_id: period.id,
    name: "主要得獎者",
    winner_count: 1,
    sort_order: 0,
    status: "pending",
    allow_duplicate_winners: false,
    updated_at: nowIso(),
  });

  return period;
}

export async function updatePeriod(
  periodId: string,
  patch: {
    name?: string;
    status?: Lose2kgPeriodStatus;
    measurementDates?: [string, string, string, string];
    publicEnabled?: boolean;
  },
): Promise<Lose2kgPeriod> {
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name != null) updates.name = normalizeName(patch.name, "期數名稱");
  if (patch.status != null) {
    updates.status = patch.status;
    if (patch.status === "completed") updates.completed_at = nowIso();
  }
  if (patch.measurementDates) {
    updates.measurement_date_1 = patch.measurementDates[0];
    updates.measurement_date_2 = patch.measurementDates[1];
    updates.measurement_date_3 = patch.measurementDates[2];
    updates.measurement_date_4 = patch.measurementDates[3];
    updates.start_date = patch.measurementDates[0];
  }
  if (patch.publicEnabled != null) updates.public_enabled = patch.publicEnabled;

  const { data, error } = await db()
    .from("lose2kg_periods")
    .update(updates)
    .eq("id", periodId)
    .select("*")
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到此期活動。", 404, "not_found");
  return mapPeriod(data as Record<string, unknown>);
}

export async function regeneratePeriodPublicToken(periodId: string): Promise<{
  period: Lose2kgPeriod;
  publicUrl: string;
}> {
  await getPeriodRow(periodId);
  const token = generateLose2kgPublicToken();
  const { data, error } = await db()
    .from("lose2kg_periods")
    .update({
      public_token_hash: hashLose2kgPublicToken(token),
      public_token_hint: token.slice(0, 6),
      updated_at: nowIso(),
    })
    .eq("id", periodId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  const period = mapPeriod(data as Record<string, unknown>, token);
  return {
    period,
    publicUrl: buildPublicShareUrl(`/lose2kg/${token}`),
  };
}

export async function getPeriodPublicUrl(periodId: string, token: string): Promise<string> {
  void periodId;
  return buildPublicShareUrl(`/lose2kg/${token}`);
}

async function ensureMeasurementSlots(periodId: string, participantId: string): Promise<void> {
  const rows = [1, 2, 3, 4].map((slot) => ({
    period_id: periodId,
    participant_id: participantId,
    slot,
    updated_at: nowIso(),
  }));
  const { error } = await db().from("lose2kg_measurements").upsert(rows, {
    onConflict: "participant_id,slot",
    ignoreDuplicates: true,
  });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
}

export async function listParticipants(periodId: string): Promise<Lose2kgParticipant[]> {
  const { data, error } = await db()
    .from("lose2kg_participants")
    .select("*")
    .eq("period_id", periodId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return (data ?? []).map((row) => mapParticipant(row as Record<string, unknown>));
}

export async function listMeasurementsForPeriod(periodId: string): Promise<Lose2kgMeasurement[]> {
  const { data, error } = await db()
    .from("lose2kg_measurements")
    .select("*")
    .eq("period_id", periodId)
    .order("slot", { ascending: true });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return (data ?? []).map((row) => mapMeasurement(row as Record<string, unknown>));
}

export async function createParticipant(input: {
  periodId: string;
  name: string;
  publicDisplayName?: string;
  note?: string;
}): Promise<Lose2kgParticipant> {
  await getPeriodRow(input.periodId);
  const name = normalizeName(input.name, "姓名");
  const publicDisplayName = normalizeName(input.publicDisplayName?.trim() || name, "公開顯示名稱");
  const existing = await listParticipants(input.periodId);
  const sortOrder =
    existing.length === 0 ? 0 : Math.max(...existing.map((p) => p.sortOrder)) + 1;

  const { data, error } = await db()
    .from("lose2kg_participants")
    .insert({
      period_id: input.periodId,
      name,
      public_display_name: publicDisplayName,
      note: input.note?.trim() || null,
      sort_order: sortOrder,
      status: "active",
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  const participant = mapParticipant(data as Record<string, unknown>);
  await ensureMeasurementSlots(input.periodId, participant.id);
  return participant;
}

export async function updateParticipant(
  participantId: string,
  patch: {
    name?: string;
    publicDisplayName?: string;
    note?: string | null;
    status?: Lose2kgParticipant["status"];
  },
): Promise<Lose2kgParticipant> {
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name != null) updates.name = normalizeName(patch.name, "姓名");
  if (patch.publicDisplayName != null) {
    updates.public_display_name = normalizeName(patch.publicDisplayName, "公開顯示名稱");
  }
  if (patch.note !== undefined) updates.note = patch.note?.trim() || null;
  if (patch.status != null) updates.status = patch.status;

  const { data, error } = await db()
    .from("lose2kg_participants")
    .update(updates)
    .eq("id", participantId)
    .select("*")
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到參賽者。", 404, "not_found");
  return mapParticipant(data as Record<string, unknown>);
}

export async function removeParticipant(participantId: string): Promise<void> {
  const { data, error } = await db()
    .from("lose2kg_participants")
    .update({ status: "withdrawn", updated_at: nowIso() })
    .eq("id", participantId)
    .select("id")
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到參賽者。", 404, "not_found");
}

async function loadMilestones(participantId: string): Promise<MilestoneRecord[]> {
  const { data, error } = await db()
    .from("lose2kg_weight_milestones")
    .select("milestone_percent, ticket_state")
    .eq("participant_id", participantId);
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return (data ?? []).map((row) => ({
    milestonePercent: Number((row as Record<string, unknown>).milestone_percent),
    ticketState:
      (row as Record<string, unknown>).ticket_state === "active"
        ? ("active" as const)
        : ("revoked" as const),
  }));
}

async function persistMilestoneState(
  periodId: string,
  participantId: string,
  prior: MilestoneRecord[],
  next: MilestoneRecord[],
): Promise<void> {
  const priorMap = new Map(prior.map((m) => [m.milestonePercent, m]));
  for (const m of next) {
    const existing = priorMap.get(m.milestonePercent);
    if (!existing) {
      const { error } = await db().from("lose2kg_weight_milestones").insert({
        period_id: periodId,
        participant_id: participantId,
        milestone_percent: m.milestonePercent,
        ticket_state: m.ticketState,
        awarded_at: nowIso(),
        revoked_at: m.ticketState === "revoked" ? nowIso() : null,
      });
      if (error) {
        // Unique race: fall through to update
        if (!error.message.toLowerCase().includes("duplicate")) {
          throw new Lose2kgError(error.message, 500, "db_error");
        }
      } else {
        continue;
      }
    }
    if (!existing || existing.ticketState !== m.ticketState) {
      const { error } = await db()
        .from("lose2kg_weight_milestones")
        .update({
          ticket_state: m.ticketState,
          revoked_at: m.ticketState === "revoked" ? nowIso() : null,
        })
        .eq("participant_id", participantId)
        .eq("period_id", periodId)
        .eq("milestone_percent", m.milestonePercent);
      if (error) throw new Lose2kgError(error.message, 500, "db_error");
    }
  }
}

function diffMilestoneEvents(
  prior: MilestoneRecord[],
  next: MilestoneRecord[],
): {
  eventType: string;
  delta: number;
  reason: string | null;
  relatedMilestone: number | null;
}[] {
  const priorMap = new Map(prior.map((m) => [m.milestonePercent, m]));
  const events: {
    eventType: string;
    delta: number;
    reason: string | null;
    relatedMilestone: number | null;
  }[] = [];

  for (const m of next) {
    const prev = priorMap.get(m.milestonePercent);
    if (!prev) {
      if (m.ticketState === "active") {
        events.push({
          eventType: "weight_milestone_awarded",
          delta: 1,
          reason: `首次達成 -${m.milestonePercent}%`,
          relatedMilestone: m.milestonePercent,
        });
      }
      continue;
    }
    if (prev.ticketState === "active" && m.ticketState === "revoked") {
      events.push({
        eventType: "weight_ticket_revoked",
        delta: -1,
        reason: `復胖失去 -${m.milestonePercent}%`,
        relatedMilestone: m.milestonePercent,
      });
    } else if (prev.ticketState === "revoked" && m.ticketState === "active") {
      events.push({
        eventType: "correction",
        delta: 1,
        reason: `量測修正後恢復有效 -${m.milestonePercent}%`,
        relatedMilestone: m.milestonePercent,
      });
    }
  }
  return events;
}

async function insertTicketEvents(
  periodId: string,
  participantId: string,
  events: {
    eventType: string;
    delta: number;
    reason: string | null;
    relatedMilestone: number | null;
    relatedMeasurementId?: string | null;
    createdByMemberId?: string | null;
  }[],
): Promise<void> {
  if (events.length === 0) return;
  const { error } = await db().from("lose2kg_ticket_events").insert(
    events.map((e) => ({
      period_id: periodId,
      participant_id: participantId,
      event_type: e.eventType,
      delta: e.delta,
      reason: e.reason,
      related_milestone: e.relatedMilestone,
      related_measurement_id: e.relatedMeasurementId ?? null,
      created_by_member_id: e.createdByMemberId ?? null,
    })),
  );
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
}

async function syncParticipantTicketCaches(
  participantId: string,
  weightBalance: number,
  weightChangePct: number | null,
): Promise<Lose2kgParticipant> {
  const { data: current, error: readError } = await db()
    .from("lose2kg_participants")
    .select("*")
    .eq("id", participantId)
    .single();
  if (readError) throw new Lose2kgError(readError.message, 500, "db_error");

  const { data, error } = await db()
    .from("lose2kg_participants")
    .update({
      weight_ticket_balance: weightBalance,
      current_weight_change_pct: weightChangePct,
      updated_at: nowIso(),
    })
    .eq("id", participantId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  void current;
  return mapParticipant(data as Record<string, unknown>);
}

export async function upsertMeasurement(input: {
  participantId: string;
  slot: Lose2kgMeasurementSlot;
  weightKg: number | null;
  reason?: string;
  editedByMemberId: string;
}): Promise<{ participant: Lose2kgParticipant; measurements: Lose2kgMeasurement[] }> {
  if (input.weightKg != null && (!(input.weightKg > 0) || !Number.isFinite(input.weightKg))) {
    throw new Lose2kgError("體重必須大於 0。", 400, "invalid_weight");
  }

  const { data: participantRow, error: pErr } = await db()
    .from("lose2kg_participants")
    .select("*")
    .eq("id", input.participantId)
    .maybeSingle();
  if (pErr) throw new Lose2kgError(pErr.message, 500, "db_error");
  if (!participantRow) throw new Lose2kgError("找不到參賽者。", 404, "not_found");
  const periodId = String((participantRow as Record<string, unknown>).period_id);

  await ensureMeasurementSlots(periodId, input.participantId);

  const { data: existingMeas, error: mErr } = await db()
    .from("lose2kg_measurements")
    .select("*")
    .eq("participant_id", input.participantId)
    .order("slot", { ascending: true });
  if (mErr) throw new Lose2kgError(mErr.message, 500, "db_error");

  const measurements = (existingMeas ?? []).map((row) =>
    mapMeasurement(row as Record<string, unknown>),
  );
  const target = measurements.find((m) => m.slot === input.slot);
  if (!target) throw new Lose2kgError("找不到量測欄位。", 404, "not_found");

  const oldWeight = target.weightKg;
  const { error: updErr } = await db()
    .from("lose2kg_measurements")
    .update({
      weight_kg: input.weightKg,
      measured_at: input.weightKg == null ? null : nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", target.id);
  if (updErr) throw new Lose2kgError(updErr.message, 500, "db_error");

  if (oldWeight !== input.weightKg) {
    await db().from("lose2kg_measurement_audits").insert({
      period_id: periodId,
      participant_id: input.participantId,
      measurement_id: target.id,
      slot: input.slot,
      old_weight_kg: oldWeight,
      new_weight_kg: input.weightKg,
      reason: input.reason?.trim() || null,
      edited_by_member_id: input.editedByMemberId,
    });
  }

  return recalculateParticipantTickets(input.participantId, input.editedByMemberId);
}

async function recalculateParticipantTickets(
  participantId: string,
  memberId: string | null,
): Promise<{ participant: Lose2kgParticipant; measurements: Lose2kgMeasurement[] }> {
  const { data: participantRow, error: pErr } = await db()
    .from("lose2kg_participants")
    .select("*")
    .eq("id", participantId)
    .single();
  if (pErr) throw new Lose2kgError(pErr.message, 500, "db_error");
  const periodId = String((participantRow as Record<string, unknown>).period_id);

  const { data: measRows, error: mErr } = await db()
    .from("lose2kg_measurements")
    .select("*")
    .eq("participant_id", participantId)
    .order("slot", { ascending: true });
  if (mErr) throw new Lose2kgError(mErr.message, 500, "db_error");

  const measurements = (measRows ?? []).map((row) => mapMeasurement(row as Record<string, unknown>));
  const baseline = measurements.find((m) => m.slot === 1)?.weightKg ?? null;
  const after = [2, 3, 4].map(
    (slot) => measurements.find((m) => m.slot === slot)?.weightKg ?? null,
  );

  // Update per-slot percentage display
  for (const m of measurements) {
    let pct: number | null = null;
    if (baseline != null && m.weightKg != null && m.slot >= 2) {
      pct = computeWeightChangePct(baseline, m.weightKg);
    } else if (m.slot === 1) {
      pct = null;
    }
    await db()
      .from("lose2kg_measurements")
      .update({ weight_change_pct: pct, updated_at: nowIso() })
      .eq("id", m.id);
  }

  const prior = await loadMilestones(participantId);
  const priorPercents = prior.map((m) => m.milestonePercent);

  // Rebuild from corrected measurement series. activatedOnce prevents CASE-4 restore.
  const rebuilt = rebuildMilestonesForCorrectedWeights(priorPercents, baseline, after);
  const diffEvents = diffMilestoneEvents(prior, rebuilt.milestones);

  await persistMilestoneState(periodId, participantId, prior, rebuilt.milestones);
  await insertTicketEvents(
    periodId,
    participantId,
    diffEvents.map((e) => ({
      ...e,
      createdByMemberId: memberId,
    })),
  );

  // Slot 1 alone never awards tickets
  const weightBalance = baseline == null ? 0 : rebuilt.weightTicketBalance;
  const latestPct =
    baseline != null && after.some((w) => w != null)
      ? rebuilt.weightChangePct
      : null;

  const participant = await syncParticipantTicketCaches(participantId, weightBalance, latestPct);

  const { data: refreshed, error: rErr } = await db()
    .from("lose2kg_measurements")
    .select("*")
    .eq("participant_id", participantId)
    .order("slot", { ascending: true });
  if (rErr) throw new Lose2kgError(rErr.message, 500, "db_error");

  return {
    participant,
    measurements: (refreshed ?? []).map((row) => mapMeasurement(row as Record<string, unknown>)),
  };
}

/**
 * Incremental live apply for a newly filled slot (optional fast path).
 * Full recalculate is used by upsertMeasurement for correctness after any edit.
 */
export async function applyLiveMeasurementReading(
  participantId: string,
  weightKg: number,
  memberId: string | null,
): Promise<void> {
  const { data: participantRow, error } = await db()
    .from("lose2kg_participants")
    .select("*")
    .eq("id", participantId)
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  const periodId = String((participantRow as Record<string, unknown>).period_id);

  const { data: measRows } = await db()
    .from("lose2kg_measurements")
    .select("*")
    .eq("participant_id", participantId)
    .eq("slot", 1)
    .maybeSingle();
  const baseline = measRows ? Number((measRows as Record<string, unknown>).weight_kg) : null;
  if (baseline == null || !(baseline > 0)) return;

  const prior = await loadMilestones(participantId);
  const step = applyWeightReading(prior, baseline, weightKg);
  await persistMilestoneState(periodId, participantId, prior, step.milestones);
  await insertTicketEvents(
    periodId,
    participantId,
    diffMilestoneEvents(prior, step.milestones).map((e) => ({
      ...e,
      createdByMemberId: memberId,
    })),
  );
  await syncParticipantTicketCaches(
    participantId,
    step.weightTicketBalance,
    computeWeightChangePct(baseline, weightKg),
  );
}

export async function adjustActivityTickets(input: {
  participantId: string;
  delta: number;
  reason: string;
  createdByMemberId: string;
  eventDate?: string;
}): Promise<Lose2kgParticipant> {
  const reason = input.reason.trim();
  if (!reason) throw new Lose2kgError("請填寫原因。", 400, "reason_required");

  const { data: row, error } = await db()
    .from("lose2kg_participants")
    .select("*")
    .eq("id", input.participantId)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!row) throw new Lose2kgError("找不到參賽者。", 404, "not_found");

  const periodId = String((row as Record<string, unknown>).period_id);
  const current = Number((row as Record<string, unknown>).activity_ticket_balance ?? 0);
  const { nextBalance, appliedDelta } = applyManualTicketDelta(current, input.delta);
  if (appliedDelta === 0) {
    throw new Lose2kgError("活動票已為 0，無法再扣。", 400, "activity_floor");
  }

  const { data: updated, error: uErr } = await db()
    .from("lose2kg_participants")
    .update({ activity_ticket_balance: nextBalance, updated_at: nowIso() })
    .eq("id", input.participantId)
    .select("*")
    .single();
  if (uErr) throw new Lose2kgError(uErr.message, 500, "db_error");

  await insertTicketEvents(periodId, input.participantId, [
    {
      eventType: appliedDelta > 0 ? "manual_add" : "manual_remove",
      delta: appliedDelta,
      reason: input.eventDate ? `${reason}（${input.eventDate}）` : reason,
      relatedMilestone: null,
      createdByMemberId: input.createdByMemberId,
    },
  ]);

  return mapParticipant(updated as Record<string, unknown>);
}

export async function getParticipantDetail(participantId: string): Promise<{
  participant: Lose2kgParticipant;
  measurements: Lose2kgMeasurement[];
  milestones: Lose2kgWeightMilestone[];
  events: Lose2kgTicketEvent[];
}> {
  const { data: row, error } = await db()
    .from("lose2kg_participants")
    .select("*")
    .eq("id", participantId)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!row) throw new Lose2kgError("找不到參賽者。", 404, "not_found");

  const [{ data: meas }, { data: miles }, { data: events }] = await Promise.all([
    db()
      .from("lose2kg_measurements")
      .select("*")
      .eq("participant_id", participantId)
      .order("slot", { ascending: true }),
    db()
      .from("lose2kg_weight_milestones")
      .select("*")
      .eq("participant_id", participantId)
      .order("milestone_percent", { ascending: true }),
    db()
      .from("lose2kg_ticket_events")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    participant: mapParticipant(row as Record<string, unknown>),
    measurements: (meas ?? []).map((r) => mapMeasurement(r as Record<string, unknown>)),
    milestones: (miles ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        participantId: String(row.participant_id),
        periodId: String(row.period_id),
        milestonePercent: Number(row.milestone_percent),
        ticketState: row.ticket_state === "active" ? "active" : "revoked",
        awardedAt: String(row.awarded_at),
        revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      };
    }),
    events: (events ?? []).map((r) => mapEvent(r as Record<string, unknown>)),
  };
}

export async function listPrizes(periodId: string): Promise<Lose2kgPrize[]> {
  const { data, error } = await db()
    .from("lose2kg_prizes")
    .select("*")
    .eq("period_id", periodId)
    .order("sort_order", { ascending: true });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return (data ?? []).map((r) => mapPrize(r as Record<string, unknown>));
}

export async function createPrize(input: {
  periodId: string;
  name: string;
  winnerCount?: number;
}): Promise<Lose2kgPrize> {
  const name = normalizeName(input.name, "獎項名稱");
  const winnerCount = input.winnerCount ?? 1;
  if (!Number.isInteger(winnerCount) || winnerCount < 1) {
    throw new Lose2kgError("得獎人數至少為 1。", 400, "invalid_winner_count");
  }
  const prizes = await listPrizes(input.periodId);
  const sortOrder = prizes.length === 0 ? 0 : Math.max(...prizes.map((p) => p.sortOrder)) + 1;
  const { data, error } = await db()
    .from("lose2kg_prizes")
    .insert({
      period_id: input.periodId,
      name,
      winner_count: winnerCount,
      sort_order: sortOrder,
      status: "pending",
      allow_duplicate_winners: false,
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return mapPrize(data as Record<string, unknown>);
}

export async function listDraws(periodId: string): Promise<Lose2kgDraw[]> {
  const { data, error } = await db()
    .from("lose2kg_draws")
    .select("*")
    .eq("period_id", periodId)
    .order("created_at", { ascending: false });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return (data ?? []).map((r) => mapDraw(r as Record<string, unknown>));
}

async function periodWinnerIds(periodId: string): Promise<Set<string>> {
  const { data, error } = await db()
    .from("lose2kg_draws")
    .select("winner_participant_id")
    .eq("period_id", periodId)
    .eq("status", "completed");
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as Record<string, unknown>).winner_participant_id;
    if (id) ids.add(String(id));
  }

  const { data: winners } = await db()
    .from("lose2kg_draw_winners")
    .select("participant_id, draw_id")
    .not("participant_id", "is", null);
  const drawIds = new Set(
    (await listDraws(periodId)).filter((d) => d.status === "completed").map((d) => d.id),
  );
  for (const row of winners ?? []) {
    const r = row as Record<string, unknown>;
    if (drawIds.has(String(r.draw_id)) && r.participant_id) {
      ids.add(String(r.participant_id));
    }
  }
  return ids;
}

export async function executeFormalDraw(input: {
  periodId: string;
  prizeId: string;
  drawnByMemberId: string;
  idempotencyKey?: string;
}): Promise<{ draw: Lose2kgDraw; duplicate: boolean; winners: { id: string; name: string; tickets: number }[] }> {
  const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();
  const prizes = await listPrizes(input.periodId);
  const prize = prizes.find((p) => p.id === input.prizeId);
  if (!prize) throw new Lose2kgError("找不到獎項。", 404, "not_found");
  if (prize.status === "drawn") {
    const existing = (await listDraws(input.periodId)).find(
      (d) => d.prizeId === prize.id && d.status === "completed",
    );
    if (existing) {
      return {
        draw: existing,
        duplicate: true,
        winners: existing.winnerParticipantId
          ? [
              {
                id: existing.winnerParticipantId,
                name: existing.winnerNameSnapshot ?? "",
                tickets: existing.winnerTicketCount ?? 0,
              },
            ]
          : [],
      };
    }
  }

  const participants = (await listParticipants(input.periodId)).filter((p) => p.status === "active");
  const excluded = prize.allowDuplicateWinners ? new Set<string>() : await periodWinnerIds(input.periodId);
  const pool = participants
    .filter((p) => !excluded.has(p.id) && p.totalTicketBalance > 0)
    .map((p) => ({
      id: p.id,
      name: p.publicDisplayName || p.name,
      tickets: p.totalTicketBalance,
    }));

  if (pool.length < prize.winnerCount) {
    throw new Lose2kgError("有效參賽者或票數不足，無法抽獎。", 400, "insufficient_pool");
  }

  const picked = pickWeightedWinnersWithoutReplacement(pool, prize.winnerCount, cryptoRandom);
  const winnersPayload = picked.winners.map((w) => ({
    participant_id: w.id,
    name: w.name,
    ticket_count: w.tickets,
  }));

  const { data, error } = await db().rpc("confirm_lose2kg_formal_draw", {
    p_idempotency_key: idempotencyKey,
    p_period_id: input.periodId,
    p_prize_id: input.prizeId,
    p_winners: winnersPayload,
    p_total_pool_ticket_count: picked.totalTickets,
    p_random_metadata: { rolls: picked.rolls, algorithm: "weighted_tickets_v1" },
    p_drawn_by_member_id: input.drawnByMemberId,
  });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  const result = data as {
    draw_id: string;
    duplicate: boolean;
    winner_participant_id: string;
    winner_name_snapshot: string;
    status: string;
  };

  const { data: drawRow, error: dErr } = await db()
    .from("lose2kg_draws")
    .select("*")
    .eq("id", result.draw_id)
    .single();
  if (dErr) throw new Lose2kgError(dErr.message, 500, "db_error");

  return {
    draw: mapDraw(drawRow as Record<string, unknown>),
    duplicate: Boolean(result.duplicate),
    winners: picked.winners.map((w) => ({ id: w.id, name: w.name, tickets: w.tickets })),
  };
}

export async function voidFormalDraw(input: {
  drawId: string;
  reason: string;
  voidedByMemberId: string;
}): Promise<Lose2kgDraw> {
  const reason = input.reason.trim();
  if (!reason) throw new Lose2kgError("請填寫作廢原因。", 400, "reason_required");

  const { data: drawRow, error } = await db()
    .from("lose2kg_draws")
    .select("*")
    .eq("id", input.drawId)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!drawRow) throw new Lose2kgError("找不到抽獎紀錄。", 404, "not_found");
  if ((drawRow as Record<string, unknown>).status === "void") {
    return mapDraw(drawRow as Record<string, unknown>);
  }

  const { data: updated, error: uErr } = await db()
    .from("lose2kg_draws")
    .update({
      status: "void",
      void_reason: reason,
      voided_by_member_id: input.voidedByMemberId,
      voided_at: nowIso(),
    })
    .eq("id", input.drawId)
    .eq("status", "completed")
    .select("*")
    .maybeSingle();
  if (uErr) throw new Lose2kgError(uErr.message, 500, "db_error");
  if (!updated) throw new Lose2kgError("抽獎紀錄無法作廢。", 409, "conflict");

  await db()
    .from("lose2kg_prizes")
    .update({ status: "pending", updated_at: nowIso() })
    .eq("id", String((updated as Record<string, unknown>).prize_id));

  return mapDraw(updated as Record<string, unknown>);
}

export async function createTempDrawSession(input: {
  periodId: string;
  createdByMemberId: string;
  presentParticipantIds: string[];
}): Promise<{ session: Lose2kgTempDrawSession; publicUrl: string }> {
  await getPeriodRow(input.periodId);
  const participants = await listParticipants(input.periodId);
  const byId = new Map(participants.map((p) => [p.id, p]));
  if (input.presentParticipantIds.length === 0) {
    throw new Lose2kgError("請至少選擇一位出席參賽者。", 400, "empty_pool");
  }

  const token = generateLose2kgPublicToken();
  const { data: session, error } = await db()
    .from("lose2kg_temp_draw_sessions")
    .insert({
      period_id: input.periodId,
      status: "pending",
      public_token_hash: hashLose2kgPublicToken(token),
      public_token_hint: token.slice(0, 6),
      created_by_member_id: input.createdByMemberId,
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  const presentSet = new Set(input.presentParticipantIds);
  const entries = participants
    .filter((p) => p.status === "active")
    .map((p) => ({
      session_id: String((session as Record<string, unknown>).id),
      participant_id: p.id,
      participant_name_snapshot: p.publicDisplayName || p.name,
      present: presentSet.has(p.id),
    }));

  // Also allow selecting ids that exist
  for (const id of presentSet) {
    if (!byId.has(id)) throw new Lose2kgError("參賽者不屬於此期。", 400, "invalid_participant");
  }

  const { error: eErr } = await db().from("lose2kg_temp_draw_entries").insert(entries);
  if (eErr) throw new Lose2kgError(eErr.message, 500, "db_error");

  return {
    session: mapTempSession(session as Record<string, unknown>, token),
    publicUrl: buildPublicShareUrl(`/lose2kg/draw/${token}`),
  };
}

export async function listTempDrawSessions(periodId?: string): Promise<Lose2kgTempDrawSession[]> {
  let query = db()
    .from("lose2kg_temp_draw_sessions")
    .select("*")
    .order("created_at", { ascending: false });
  if (periodId) query = query.eq("period_id", periodId);
  const { data, error } = await query;
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return (data ?? []).map((r) => mapTempSession(r as Record<string, unknown>));
}

export async function voidTempDrawSession(input: {
  sessionId: string;
  reason: string;
  voidedByMemberId: string;
}): Promise<Lose2kgTempDrawSession> {
  const reason = input.reason.trim();
  if (!reason) throw new Lose2kgError("請填寫作廢原因。", 400, "reason_required");
  const { data, error } = await db()
    .from("lose2kg_temp_draw_sessions")
    .update({
      status: "void",
      void_reason: reason,
      voided_by_member_id: input.voidedByMemberId,
      voided_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", input.sessionId)
    .in("status", ["pending", "completed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到臨時抽獎場次。", 404, "not_found");
  return mapTempSession(data as Record<string, unknown>);
}

export async function getPeriodBootstrap(periodId: string): Promise<{
  period: Lose2kgPeriod;
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  prizes: Lose2kgPrize[];
  draws: Lose2kgDraw[];
  tempSessions: Lose2kgTempDrawSession[];
}> {
  const period = mapPeriod(await getPeriodRow(periodId));
  const [participants, measurements, prizes, draws, tempSessions] = await Promise.all([
    listParticipants(periodId),
    listMeasurementsForPeriod(periodId),
    listPrizes(periodId),
    listDraws(periodId),
    listTempDrawSessions(periodId),
  ]);
  return { period, participants, measurements, prizes, draws, tempSessions };
}

// --- Public surfaces ---

export async function getPublicTicketPage(tokenRaw: string): Promise<Lose2kgPublicTicketPage> {
  const token = normalizeLose2kgToken(tokenRaw);
  if (!token) throw new Lose2kgError("無效連結。", 404, "not_found");
  const hash = hashLose2kgPublicToken(token);

  const { data: period, error } = await db()
    .from("lose2kg_periods")
    .select("*")
    .eq("public_token_hash", hash)
    .eq("public_enabled", true)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!period) throw new Lose2kgError("此公開頁未開放或不存在。", 404, "not_found");

  const periodId = String((period as Record<string, unknown>).id);
  const { data: participants, error: pErr } = await db()
    .from("lose2kg_participants")
    .select("public_display_name, weight_ticket_balance, activity_ticket_balance, status, created_at")
    .eq("period_id", periodId)
    .eq("status", "active");
  if (pErr) throw new Lose2kgError(pErr.message, 500, "db_error");

  const rows = (participants ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      const total =
        Number(row.weight_ticket_balance ?? 0) + Number(row.activity_ticket_balance ?? 0);
      return {
        publicDisplayName: String(row.public_display_name),
        totalTickets: total,
        createdAt: String(row.created_at),
      };
    })
    .sort((a, b) => {
      if (b.totalTickets !== a.totalTickets) return b.totalTickets - a.totalTickets;
      const nameCmp = a.publicDisplayName.localeCompare(b.publicDisplayName, "zh-Hant");
      if (nameCmp !== 0) return nameCmp;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .map(({ publicDisplayName, totalTickets }) => ({ publicDisplayName, totalTickets }));

  const p = period as Record<string, unknown>;
  return {
    periodName: String(p.name),
    measurementDates: [
      String(p.measurement_date_1),
      String(p.measurement_date_2),
      String(p.measurement_date_3),
      String(p.measurement_date_4),
    ],
    participants: rows,
  };
}

export async function getPublicTempDrawPage(tokenRaw: string): Promise<Lose2kgPublicTempDrawPage> {
  const token = normalizeLose2kgToken(tokenRaw);
  if (!token) throw new Lose2kgError("無效連結。", 404, "not_found");
  const hash = hashLose2kgPublicToken(token);

  const { data: session, error } = await db()
    .from("lose2kg_temp_draw_sessions")
    .select("*")
    .eq("public_token_hash", hash)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!session) throw new Lose2kgError("找不到此抽獎場次。", 404, "not_found");
  if ((session as Record<string, unknown>).status === "void") {
    throw new Lose2kgError("此抽獎已作廢。", 410, "void");
  }

  const sessionId = String((session as Record<string, unknown>).id);
  const periodId = String((session as Record<string, unknown>).period_id);
  const period = await getPeriodRow(periodId);

  const { data: entries, error: eErr } = await db()
    .from("lose2kg_temp_draw_entries")
    .select("*")
    .eq("session_id", sessionId)
    .eq("present", true)
    .order("participant_name_snapshot", { ascending: true });
  if (eErr) throw new Lose2kgError(eErr.message, 500, "db_error");

  const presentNames = (entries ?? []).map((r) =>
    String((r as Record<string, unknown>).participant_name_snapshot),
  );

  return {
    periodName: String((period as Record<string, unknown>).name),
    status: (session as Record<string, unknown>).status as Lose2kgTempDrawSession["status"],
    entryCount: presentNames.length,
    presentNames,
    winnerName: (session as Record<string, unknown>).winner_name_snapshot
      ? String((session as Record<string, unknown>).winner_name_snapshot)
      : null,
  };
}

export async function executePublicTempDraw(tokenRaw: string): Promise<{
  winnerName: string;
  duplicate: boolean;
  status: string;
}> {
  const token = normalizeLose2kgToken(tokenRaw);
  if (!token) throw new Lose2kgError("無效連結。", 404, "not_found");
  const hash = hashLose2kgPublicToken(token);

  const { data: session, error } = await db()
    .from("lose2kg_temp_draw_sessions")
    .select("*")
    .eq("public_token_hash", hash)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!session) throw new Lose2kgError("找不到此抽獎場次。", 404, "not_found");

  const sessionRow = session as Record<string, unknown>;
  if (sessionRow.status === "completed") {
    return {
      winnerName: String(sessionRow.winner_name_snapshot ?? ""),
      duplicate: true,
      status: "completed",
    };
  }
  if (sessionRow.status === "void") {
    throw new Lose2kgError("此抽獎已作廢。", 410, "void");
  }

  const sessionId = String(sessionRow.id);
  const { data: entries, error: eErr } = await db()
    .from("lose2kg_temp_draw_entries")
    .select("*")
    .eq("session_id", sessionId)
    .eq("present", true);
  if (eErr) throw new Lose2kgError(eErr.message, 500, "db_error");

  const pool = (entries ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.participant_id),
      name: String(row.participant_name_snapshot),
    };
  });
  if (pool.length === 0) throw new Lose2kgError("沒有可抽獎的參賽者。", 400, "empty_pool");

  const picked = pickEqualWinner(pool, cryptoRandom);

  const { data: result, error: rpcErr } = await db().rpc("execute_lose2kg_temp_draw", {
    p_session_id: sessionId,
    p_winner_participant_id: picked.winner.id,
    p_winner_name_snapshot: picked.winner.name,
    p_entry_count: picked.poolSize,
    p_random_metadata: { roll: picked.roll, algorithm: "equal_v1" },
  });
  if (rpcErr) throw new Lose2kgError(rpcErr.message, 500, "db_error");

  const payload = result as {
    winner_name_snapshot: string;
    duplicate: boolean;
    status: string;
  };

  return {
    winnerName: String(payload.winner_name_snapshot ?? picked.winner.name),
    duplicate: Boolean(payload.duplicate),
    status: String(payload.status),
  };
}
