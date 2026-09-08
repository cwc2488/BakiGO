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
  getPeriodBootstrap,
  listParticipants,
  listPrizes,
  listTempDrawSessions,
  upsertMeasurement,
  adjustActivityTickets,
  voidFormalDraw,
  voidTempDrawSession,
  executePublicTempDraw,
  getPublicTempDrawPage,
} from "@/lib/lose2kg/service";

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
      public_enabled: false,
      staff_token_hash: hashLose2kgPublicToken(staffToken),
      staff_token_hint: staffToken.slice(0, 6),
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

  // Rotate tokens on start so admin sees full URLs once.
  const liveToken = generateLose2kgPublicToken();
  const staffToken = generateLose2kgPublicToken();

  const { data, error } = await db()
    .from("lose2kg_periods")
    .update({
      status: "active",
      public_enabled: true,
      public_token_hash: hashLose2kgPublicToken(liveToken),
      public_token_hint: liveToken.slice(0, 6),
      staff_token_hash: hashLose2kgPublicToken(staffToken),
      staff_token_hint: staffToken.slice(0, 6),
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
  prizes: Lose2kgPrize[];
}> {
  const row = await getPeriodRow(periodId);
  const period = mapPeriodV2(row);
  const prizes = await listPrizes(periodId);
  // Tokens are only returned in full when freshly regenerated; otherwise show hint-based placeholder URLs if we don't have plaintext.
  return {
    period,
    liveUrl: null,
    staffUrl: null,
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
  prizes: Lose2kgPrize[];
  draws: Lose2kgDraw[];
  tempSessions: Awaited<ReturnType<typeof listTempDrawSessions>>;
}> {
  const data = await getPeriodBootstrap(periodId);
  const period = mapPeriodV2(await getPeriodRow(periodId));
  const { slot, nextDate } = currentMeasurementSlot(period.measurementDates);
  return {
    period,
    currentSlot: slot,
    nextMeasurementDate: nextDate,
    participants: data.participants,
    measurements: data.measurements,
    prizes: data.prizes,
    draws: data.draws,
    tempSessions: data.tempSessions,
  };
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
      publicDisplayName: p.publicDisplayName,
      totalTickets: p.totalTicketBalance,
      ...(period.publicShowWeights
        ? {
            weightChangePct: p.currentWeightChangePct,
            weightTickets: p.weightTicketBalance,
            activityTickets: p.activityTicketBalance,
          }
        : {}),
    }));

  const { data: draws } = await db()
    .from("lose2kg_draws")
    .select("*")
    .eq("period_id", periodId)
    .eq("status", "completed")
    .order("drawn_at", { ascending: false });

  const winners = (draws ?? []).map((d) => {
    const r = d as Record<string, unknown>;
    return {
      prizeHint: String(r.prize_id),
      winnerName: r.winner_name_snapshot ? String(r.winner_name_snapshot) : "—",
      drawnAt: r.drawn_at ? String(r.drawn_at) : null,
    };
  });

  // Attach prize names
  const prizes = await listPrizes(periodId);
  const prizeName = new Map(prizes.map((p) => [p.id, p.name]));
  const winnersNamed = winners.map((w) => ({
    ...w,
    prizeName: prizeName.get(w.prizeHint) ?? "獎項",
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
    liveDrawStatus: period.liveDrawStatus ?? "idle",
    publicShowWeights: Boolean(period.publicShowWeights),
    leaderboard,
    winners: winnersNamed.map(({ prizeName: name, winnerName, drawnAt }) => ({
      prizeName: name,
      winnerName,
      drawnAt,
    })),
  };
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
      message: `首次達成減重相關里程碑 · 體重票 +${delta}`,
      deltaTickets: delta,
      weightChangePct: pct,
    };
  } else if (delta < 0) {
    feedback = {
      kind: "revoked",
      message: `體重票 ${delta}`,
      deltaTickets: delta,
      weightChangePct: pct,
    };
  } else {
    feedback = {
      kind: "updated",
      message: "已更新，本次沒有新增抽獎券",
      deltaTickets: 0,
      weightChangePct: pct,
    };
  }
  return { ...result, feedback };
}
