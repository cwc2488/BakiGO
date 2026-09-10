import { Lose2kgError } from "@/lib/lose2kg/api";
import {
  hashStaffPassword,
  hashStaffSessionToken,
  isValidStaffPassword,
  LOSE2KG_STAFF_SESSION_HOURS,
  verifyStaffPassword,
} from "@/lib/lose2kg/staff-auth";
import { mintStaffSessionToken } from "@/lib/lose2kg/staff-session-cookie";
import {
  generateLose2kgPublicToken,
  hashLose2kgPublicToken,
  normalizeLose2kgToken,
} from "@/lib/lose2kg/tokens";
import { decryptLose2kgToken, encryptLose2kgToken } from "@/lib/lose2kg/token-crypto";
import { buildPublicShareUrl } from "@/lib/app/public-origin";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type {
  Lose2kgDraw,
  Lose2kgLiveDashboard,
  Lose2kgMeasurement,
  Lose2kgParticipant,
  Lose2kgPeriod,
  Lose2kgPeriodStatus,
  Lose2kgPrize,
} from "@/types/lose2kg";
import {
  createParticipant,
  createTempDrawSession,
  executeFormalDraw,
  getParticipantDetail,
  getTicketBreakdownForParticipant,
  listParticipants,
  listPrizes,
  upsertMeasurement,
  adjustActivityTickets,
  voidFormalDraw,
  voidTempDrawSession,
  executePublicTempDraw,
  getPublicTempDrawPage,
} from "@/lib/lose2kg/service";
import type { Lose2kgTicketBreakdown } from "@/lib/lose2kg/ticket-breakdown";

function db() {
  return createSupabaseServiceClient();
}

function nowIso() {
  return new Date().toISOString();
}

function mapPeriodV2(row: Record<string, unknown>, tokens?: {
  liveToken?: string | null;
  staffToken?: string | null;
}): Lose2kgPeriod {
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
    publicToken: tokens?.liveToken ?? null,
    publicEnabled: Boolean(row.public_enabled),
    staffToken: tokens?.staffToken ?? null,
    hasStaffPassword: Boolean(row.staff_password_hash),
    publicShowWeights: Boolean(row.public_show_weights),
    liveDrawStatus: (row.live_draw_status as Lose2kgPeriod["liveDrawStatus"]) || "idle",
    createdByMemberId: row.created_by_member_id ? String(row.created_by_member_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
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

export function buildStaffUrl(token: string): string {
  return buildPublicShareUrl(`/lose2kg/staff/${token}`);
}

export function buildLiveUrl(token: string): string {
  return buildPublicShareUrl(`/lose2kg/live/${token}`);
}

/** Suggest next period name from existing count. */
export async function suggestNextPeriodName(): Promise<string> {
  const { count, error } = await db()
    .from("lose2kg_periods")
    .select("id", { count: "exact", head: true });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  const n = (count ?? 0) + 1;
  return `再瘦2公斤 第 ${n} 期`;
}

export async function createPeriodDraft(input: {
  name: string;
  firstMeasurementDate: string;
  measurementDates: [string, string, string, string];
  staffPassword: string;
  createdByMemberId: string;
}): Promise<{ period: Lose2kgPeriod; liveToken: string; staffToken: string }> {
  if (!isValidStaffPassword(input.staffPassword)) {
    throw new Lose2kgError("工作人員密碼須為 4～8 位英數。", 400, "invalid_password");
  }
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) {
    throw new Lose2kgError("期數名稱無效。", 400, "invalid_name");
  }

  const liveToken = generateLose2kgPublicToken();
  const staffToken = generateLose2kgPublicToken();

  const { data, error } = await db()
    .from("lose2kg_periods")
    .insert({
      name,
      status: "draft",
      start_date: input.measurementDates[0],
      measurement_date_1: input.measurementDates[0],
      measurement_date_2: input.measurementDates[1],
      measurement_date_3: input.measurementDates[2],
      measurement_date_4: input.measurementDates[3],
      public_token_hash: hashLose2kgPublicToken(liveToken),
      public_token_hint: liveToken.slice(0, 6),
      live_token_encrypted: encryptLose2kgToken(liveToken),
      public_enabled: false,
      staff_token_hash: hashLose2kgPublicToken(staffToken),
      staff_token_hint: staffToken.slice(0, 6),
      staff_token_encrypted: encryptLose2kgToken(staffToken),
      staff_password_hash: hashStaffPassword(input.staffPassword),
      staff_password_updated_at: nowIso(),
      public_show_weights: false,
      live_draw_status: "idle",
      created_by_member_id: input.createdByMemberId,
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  await db().from("lose2kg_prizes").insert({
    period_id: String((data as Record<string, unknown>).id),
    name: "主要得獎者",
    winner_count: 1,
    sort_order: 0,
    status: "pending",
    allow_duplicate_winners: false,
    updated_at: nowIso(),
  });

  const period = mapPeriodV2(data as Record<string, unknown>, {
    liveToken,
    staffToken,
  });
  return { period, liveToken, staffToken };
}

export async function startPeriod(periodId: string): Promise<{
  period: Lose2kgPeriod;
  liveUrl: string;
  staffUrl: string;
  liveToken: string;
  staffToken: string;
}> {
  const row = await getPeriodRow(periodId);
  if (!row.staff_password_hash) {
    throw new Lose2kgError("請先設定工作人員密碼。", 400, "password_required");
  }

  // Keep existing tokens when present (persistent URLs). Mint only if missing.
  let liveToken = decryptLose2kgToken(
    row.live_token_encrypted ? String(row.live_token_encrypted) : null,
  );
  let staffToken = decryptLose2kgToken(
    row.staff_token_encrypted ? String(row.staff_token_encrypted) : null,
  );
  if (!liveToken) liveToken = generateLose2kgPublicToken();
  if (!staffToken) staffToken = generateLose2kgPublicToken();

  const { data, error } = await db()
    .from("lose2kg_periods")
    .update({
      status: "active",
      public_enabled: true,
      public_token_hash: hashLose2kgPublicToken(liveToken),
      public_token_hint: liveToken.slice(0, 6),
      live_token_encrypted: encryptLose2kgToken(liveToken),
      staff_token_hash: hashLose2kgPublicToken(staffToken),
      staff_token_hint: staffToken.slice(0, 6),
      staff_token_encrypted: encryptLose2kgToken(staffToken),
      live_draw_status: "idle",
      updated_at: nowIso(),
    })
    .eq("id", periodId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  const period = mapPeriodV2(data as Record<string, unknown>, { liveToken, staffToken });
  return {
    period,
    liveToken,
    staffToken,
    liveUrl: buildLiveUrl(liveToken),
    staffUrl: buildStaffUrl(staffToken),
  };
}

export async function getAdminControlCenter(periodId: string): Promise<{
  period: Lose2kgPeriod;
  liveUrl: string | null;
  staffUrl: string | null;
  liveToken: string | null;
  staffToken: string | null;
  prizes: Lose2kgPrize[];
}> {
  const row = await getPeriodRow(periodId);
  const liveToken = decryptLose2kgToken(
    row.live_token_encrypted ? String(row.live_token_encrypted) : null,
  );
  const staffToken = decryptLose2kgToken(
    row.staff_token_encrypted ? String(row.staff_token_encrypted) : null,
  );
  const period = mapPeriodV2(row, { liveToken, staffToken });
  const prizes = await listPrizes(periodId);
  return {
    period,
    liveToken,
    staffToken,
    liveUrl: liveToken ? buildLiveUrl(liveToken) : null,
    staffUrl: staffToken ? buildStaffUrl(staffToken) : null,
    prizes,
  };
}

export async function regenerateLiveToken(periodId: string): Promise<{
  period: Lose2kgPeriod;
  liveUrl: string;
  liveToken: string;
}> {
  await getPeriodRow(periodId);
  const liveToken = generateLose2kgPublicToken();
  const { data, error } = await db()
    .from("lose2kg_periods")
    .update({
      public_token_hash: hashLose2kgPublicToken(liveToken),
      public_token_hint: liveToken.slice(0, 6),
      live_token_encrypted: encryptLose2kgToken(liveToken),
      public_enabled: true,
      updated_at: nowIso(),
    })
    .eq("id", periodId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  const period = mapPeriodV2(data as Record<string, unknown>, { liveToken });
  return { period, liveToken, liveUrl: buildLiveUrl(liveToken) };
}

export async function regenerateStaffToken(periodId: string): Promise<{
  period: Lose2kgPeriod;
  staffUrl: string;
  staffToken: string;
}> {
  await getPeriodRow(periodId);
  const staffToken = generateLose2kgPublicToken();
  const { data, error } = await db()
    .from("lose2kg_periods")
    .update({
      staff_token_hash: hashLose2kgPublicToken(staffToken),
      staff_token_hint: staffToken.slice(0, 6),
      staff_token_encrypted: encryptLose2kgToken(staffToken),
      staff_sessions_revoked_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", periodId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  await db()
    .from("lose2kg_staff_sessions")
    .update({ revoked_at: nowIso() })
    .eq("period_id", periodId)
    .is("revoked_at", null);

  const period = mapPeriodV2(data as Record<string, unknown>, { staffToken });
  return { period, staffToken, staffUrl: buildStaffUrl(staffToken) };
}

export async function updateStaffPassword(
  periodId: string,
  password: string,
): Promise<Lose2kgPeriod> {
  if (!isValidStaffPassword(password)) {
    throw new Lose2kgError("工作人員密碼須為 4～8 位英數。", 400, "invalid_password");
  }
  const { data, error } = await db()
    .from("lose2kg_periods")
    .update({
      staff_password_hash: hashStaffPassword(password),
      staff_password_updated_at: nowIso(),
      staff_sessions_revoked_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", periodId)
    .select("*")
    .single();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  await db()
    .from("lose2kg_staff_sessions")
    .update({ revoked_at: nowIso() })
    .eq("period_id", periodId)
    .is("revoked_at", null);

  return mapPeriodV2(data as Record<string, unknown>);
}

export async function revokeAllStaffSessions(periodId: string): Promise<void> {
  await db()
    .from("lose2kg_periods")
    .update({ staff_sessions_revoked_at: nowIso(), updated_at: nowIso() })
    .eq("id", periodId);
  await db()
    .from("lose2kg_staff_sessions")
    .update({ revoked_at: nowIso() })
    .eq("period_id", periodId)
    .is("revoked_at", null);
}

export async function updatePeriodV2Settings(
  periodId: string,
  patch: {
    name?: string;
    status?: Lose2kgPeriodStatus;
    measurementDates?: [string, string, string, string];
    publicShowWeights?: boolean;
    publicEnabled?: boolean;
  },
): Promise<Lose2kgPeriod> {
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name != null) updates.name = patch.name.trim();
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
  if (patch.publicShowWeights != null) updates.public_show_weights = patch.publicShowWeights;
  if (patch.publicEnabled != null) updates.public_enabled = patch.publicEnabled;

  const { data, error } = await db()
    .from("lose2kg_periods")
    .update(updates)
    .eq("id", periodId)
    .select("*")
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到此期活動。", 404, "not_found");
  return mapPeriodV2(data as Record<string, unknown>);
}

async function findPeriodByStaffToken(tokenRaw: string): Promise<Record<string, unknown>> {
  const token = normalizeLose2kgToken(tokenRaw);
  if (!token) throw new Lose2kgError("無效連結。", 404, "not_found");
  const { data, error } = await db()
    .from("lose2kg_periods")
    .select("*")
    .eq("staff_token_hash", hashLose2kgPublicToken(token))
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到工作站。", 404, "not_found");
  return data as Record<string, unknown>;
}

async function findPeriodByLiveToken(tokenRaw: string): Promise<Record<string, unknown>> {
  const token = normalizeLose2kgToken(tokenRaw);
  if (!token) throw new Lose2kgError("無效連結。", 404, "not_found");
  const hash = hashLose2kgPublicToken(token);
  const { data, error } = await db()
    .from("lose2kg_periods")
    .select("*")
    .eq("public_token_hash", hash)
    .maybeSingle();
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  if (!data) throw new Lose2kgError("找不到公開儀表板。", 404, "not_found");
  if (!(data as Record<string, unknown>).public_enabled) {
    throw new Lose2kgError("此公開頁未開放。", 404, "not_found");
  }
  return data as Record<string, unknown>;
}

export async function getStaffGateInfo(staffToken: string): Promise<{
  periodId: string;
  periodName: string;
  status: Lose2kgPeriodStatus;
}> {
  const row = await findPeriodByStaffToken(staffToken);
  return {
    periodId: String(row.id),
    periodName: String(row.name),
    status: row.status as Lose2kgPeriodStatus,
  };
}

export async function loginStaffWorkstation(input: {
  staffToken: string;
  password: string;
}): Promise<{ rawSessionToken: string; periodId: string; periodName: string }> {
  const row = await findPeriodByStaffToken(input.staffToken);
  const passwordHash = row.staff_password_hash ? String(row.staff_password_hash) : "";
  if (!passwordHash || !verifyStaffPassword(input.password, passwordHash)) {
    throw new Lose2kgError("密碼錯誤。", 401, "unauthorized");
  }

  const { raw, hash } = mintStaffSessionToken();
  const expiresAt = new Date(
    Date.now() + LOSE2KG_STAFF_SESSION_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await db().from("lose2kg_staff_sessions").insert({
    period_id: String(row.id),
    session_token_hash: hash,
    expires_at: expiresAt,
    last_seen_at: nowIso(),
  });
  if (error) throw new Lose2kgError(error.message, 500, "db_error");

  return {
    rawSessionToken: raw,
    periodId: String(row.id),
    periodName: String(row.name),
  };
}

export async function resolveStaffSession(
  rawSessionToken: string | null,
): Promise<{ periodId: string; sessionId: string } | null> {
  if (!rawSessionToken) return null;
  const hash = hashStaffSessionToken(rawSessionToken);
  const { data, error } = await db()
    .from("lose2kg_staff_sessions")
    .select("*")
    .eq("session_token_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  if (row.revoked_at) return null;
  if (new Date(String(row.expires_at)).getTime() <= Date.now()) return null;

  const period = await getPeriodRow(String(row.period_id));
  const revokedAt = period.staff_sessions_revoked_at
    ? new Date(String(period.staff_sessions_revoked_at)).getTime()
    : 0;
  const createdAt = new Date(String(row.created_at)).getTime();
  if (revokedAt && createdAt < revokedAt) return null;

  await db()
    .from("lose2kg_staff_sessions")
    .update({ last_seen_at: nowIso() })
    .eq("id", String(row.id));

  return { periodId: String(row.period_id), sessionId: String(row.id) };
}

export async function requireStaffPeriodAccess(input: {
  staffToken: string;
  rawSessionToken: string | null;
}): Promise<{ periodId: string; period: Lose2kgPeriod }> {
  const periodRow = await findPeriodByStaffToken(input.staffToken);
  const session = await resolveStaffSession(input.rawSessionToken);
  if (!session || session.periodId !== String(periodRow.id)) {
    throw new Lose2kgError("請先登入工作站。", 401, "unauthorized");
  }
  return {
    periodId: String(periodRow.id),
    period: mapPeriodV2(periodRow),
  };
}

function currentMeasurementSlot(dates: [string, string, string, string]): {
  slot: 1 | 2 | 3 | 4;
  nextDate: string | null;
} {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  let slot: 1 | 2 | 3 | 4 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (dates[i]! <= todayStr) slot = (i + 1) as 1 | 2 | 3 | 4;
  }
  const next = dates.find((d) => d > todayStr) ?? null;
  return { slot, nextDate: next };
}

export async function getStaffBootstrap(periodId: string): Promise<{
  period: Lose2kgPeriod;
  currentSlot: 1 | 2 | 3 | 4;
  nextMeasurementDate: string | null;
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  participantCount: number;
  totalTickets: number;
}> {
  const period = mapPeriodV2(await getPeriodRow(periodId));
  const [participants, measurements] = await Promise.all([
    listParticipants(periodId),
    (async () => {
      const { data, error } = await db()
        .from("lose2kg_measurements")
        .select("*")
        .eq("period_id", periodId)
        .order("slot", { ascending: true });
      if (error) throw new Lose2kgError(error.message, 500, "db_error");
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          periodId: String(r.period_id),
          participantId: String(r.participant_id),
          slot: Number(r.slot) as 1 | 2 | 3 | 4,
          weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
          measuredAt: r.measured_at ? String(r.measured_at) : null,
          weightChangePct: r.weight_change_pct == null ? null : Number(r.weight_change_pct),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        } satisfies Lose2kgMeasurement;
      });
    })(),
  ]);
  const active = participants.filter((p) => p.status === "active");
  const { slot, nextDate } = currentMeasurementSlot(period.measurementDates);
  return {
    period,
    currentSlot: slot,
    nextMeasurementDate: nextDate,
    participants,
    measurements,
    participantCount: active.length,
    totalTickets: active.reduce((sum, p) => sum + p.totalTicketBalance, 0),
  };
}

export async function getStaffDrawBootstrap(periodId: string): Promise<{
  prizes: Lose2kgPrize[];
  draws: Lose2kgDraw[];
}> {
  const [prizes, { data: draws, error }] = await Promise.all([
    listPrizes(periodId),
    db()
      .from("lose2kg_draws")
      .select("*")
      .eq("period_id", periodId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
  return {
    prizes,
    draws: (draws ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        periodId: String(r.period_id),
        prizeId: String(r.prize_id),
        status: r.status as Lose2kgDraw["status"],
        winnerParticipantId: r.winner_participant_id ? String(r.winner_participant_id) : null,
        winnerNameSnapshot: r.winner_name_snapshot ? String(r.winner_name_snapshot) : null,
        winnerTicketCount: r.winner_ticket_count == null ? null : Number(r.winner_ticket_count),
        totalPoolTicketCount:
          r.total_pool_ticket_count == null ? null : Number(r.total_pool_ticket_count),
        randomMetadata: (r.random_metadata as Record<string, unknown> | null) ?? null,
        drawnByMemberId: r.drawn_by_member_id ? String(r.drawn_by_member_id) : null,
        drawnAt: r.drawn_at ? String(r.drawn_at) : null,
        voidedByMemberId: r.voided_by_member_id ? String(r.voided_by_member_id) : null,
        voidedAt: r.voided_at ? String(r.voided_at) : null,
        voidReason: r.void_reason ? String(r.void_reason) : null,
        idempotencyKey: String(r.idempotency_key),
        createdAt: String(r.created_at),
      };
    }),
  };
}

/** Super Admin only: delete one period and all child rows via FK cascade. */
export async function deletePeriod(periodId: string): Promise<void> {
  await getPeriodRow(periodId);
  const { error } = await db().from("lose2kg_periods").delete().eq("id", periodId);
  if (error) throw new Lose2kgError(error.message, 500, "db_error");
}

export async function setLiveDrawStatus(
  periodId: string,
  status: "idle" | "drawing" | "revealed",
): Promise<void> {
  await db()
    .from("lose2kg_periods")
    .update({ live_draw_status: status, updated_at: nowIso() })
    .eq("id", periodId);
}

export async function staffExecuteFormalDraw(input: {
  periodId: string;
  prizeId: string;
  idempotencyKey?: string;
}): Promise<{
  draw: Lose2kgDraw;
  duplicate: boolean;
  winners: { id: string; name: string; tickets: number }[];
}> {
  await setLiveDrawStatus(input.periodId, "drawing");
  try {
    const result = await executeFormalDraw({
      periodId: input.periodId,
      prizeId: input.prizeId,
      drawnByMemberId: null,
      idempotencyKey: input.idempotencyKey,
    });
    await setLiveDrawStatus(input.periodId, "revealed");
    return result;
  } catch (error) {
    await setLiveDrawStatus(input.periodId, "idle");
    throw error;
  }
}

// Re-export staff-facing wrappers that use existing business logic
export {
  createParticipant as staffCreateParticipant,
  upsertMeasurement as staffUpsertMeasurement,
  adjustActivityTickets as staffAdjustActivityTickets,
  getParticipantDetail as staffGetParticipantDetail,
  createTempDrawSession as staffCreateTempDraw,
  voidTempDrawSession as staffVoidTempDraw,
  voidFormalDraw as staffVoidFormalDraw,
  listParticipants as staffListParticipants,
  executePublicTempDraw,
  getPublicTempDrawPage,
};

export async function getLiveDashboard(liveToken: string): Promise<Lose2kgLiveDashboard> {
  const row = await findPeriodByLiveToken(liveToken);
  const periodId = String(row.id);
  const period = mapPeriodV2(row);
  const { slot, nextDate } = currentMeasurementSlot(period.measurementDates);

  const participants = (await listParticipants(periodId)).filter((p) => p.status === "active");
  const totalTickets = participants.reduce((sum, p) => sum + p.totalTicketBalance, 0);
  const maxTickets = participants.reduce(
    (max, p) => Math.max(max, p.totalTicketBalance),
    0,
  );

  const leaderboard = [...participants]
    .sort((a, b) => {
      if (b.totalTicketBalance !== a.totalTicketBalance) {
        return b.totalTicketBalance - a.totalTicketBalance;
      }
      return a.publicDisplayName.localeCompare(b.publicDisplayName, "zh-Hant");
    })
    .map((p, index) => ({
      rank: index + 1,
      participantId: p.id,
      publicDisplayName: p.publicDisplayName,
      totalTickets: p.totalTicketBalance,
      weightTickets: p.weightTicketBalance,
      extraTickets: p.activityTicketBalance,
      ...(period.publicShowWeights
        ? {
            weightChangePct: p.currentWeightChangePct,
          }
        : {}),
    }));

  return {
    periodName: period.name,
    status: period.status,
    measurementDates: period.measurementDates,
    currentSlot: slot,
    nextMeasurementDate: nextDate,
    participantCount: participants.length,
    totalTickets,
    maxTickets,
    publicShowWeights: Boolean(period.publicShowWeights),
    leaderboard,
  };
}

/** Public read-only ticket breakdown (whitelist fields only). */
export async function getPublicTicketBreakdown(
  liveToken: string,
  participantId: string,
): Promise<Lose2kgTicketBreakdown> {
  const row = await findPeriodByLiveToken(liveToken);
  const periodId = String(row.id);
  const period = mapPeriodV2(row);
  const participants = await listParticipants(periodId);
  const participant = participants.find((p) => p.id === participantId && p.status === "active");
  if (!participant) throw new Lose2kgError("找不到參賽者。", 404, "not_found");
  return getTicketBreakdownForParticipant({
    participantId,
    showWeights: Boolean(period.publicShowWeights),
    displayName: participant.publicDisplayName,
  });
}

export type StaffMeasureResult = {
  participant: Lose2kgParticipant;
  measurements: Lose2kgMeasurement[];
  feedback: {
    kind: "milestone" | "updated" | "revoked";
    message: string;
    deltaTickets: number;
    weightChangePct: number | null;
  };
};

export async function staffQuickMeasure(input: {
  participantId: string;
  slot: 1 | 2 | 3 | 4;
  weightKg: number;
}): Promise<StaffMeasureResult> {
  const before = await getParticipantDetail(input.participantId);
  const beforeWeight = before.participant.weightTicketBalance;
  const result = await upsertMeasurement({
    participantId: input.participantId,
    slot: input.slot,
    weightKg: input.weightKg,
    reason: "現場量測",
    editedByMemberId: null,
  });
  const afterWeight = result.participant.weightTicketBalance;
  const delta = afterWeight - beforeWeight;
  const pct = result.participant.currentWeightChangePct;
  let feedback: StaffMeasureResult["feedback"];
  if (delta > 0) {
    feedback = {
      kind: "milestone",
      message: `🎟 +${delta} · 首次達成減重里程碑`,
      deltaTickets: delta,
      weightChangePct: pct,
    };
  } else if (delta < 0) {
    feedback = {
      kind: "revoked",
      message: `🎟 ${delta} · 體重票調整`,
      deltaTickets: delta,
      weightChangePct: pct,
    };
  } else {
    feedback = {
      kind: "updated",
      message: "✓ 已儲存",
      deltaTickets: 0,
      weightChangePct: pct,
    };
  }
  return { ...result, feedback };
}
