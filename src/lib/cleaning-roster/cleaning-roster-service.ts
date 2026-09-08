import { drawCleaningRoster } from "@/lib/cleaning-roster/draw";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  CLEANING_ROSTER_BASE_WEIGHT,
  CLEANING_ROSTER_HISTORY_LIMIT,
  type CleaningRosterArea,
  type CleaningRosterBootstrap,
  type CleaningRosterHistoryRound,
  type CleaningRosterMember,
  type CleaningRosterPreview,
  type CleaningRosterPreviewAssignment,
  type CleaningRosterPreviewRester,
} from "@/types/cleaning-roster";
import { randomUUID } from "node:crypto";

export class CleaningRosterError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "cleaning_roster_error",
  ) {
    super(message);
    this.name = "CleaningRosterError";
  }
}

function db() {
  return createSupabaseServiceClient();
}

function nowIso() {
  return new Date().toISOString();
}

function mapArea(row: Record<string, unknown>): CleaningRosterArea {
  return {
    id: String(row.id),
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
    status: row.status === "deleted" ? "deleted" : "active",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMember(row: Record<string, unknown>): CleaningRosterMember {
  return {
    id: String(row.id),
    name: String(row.name),
    currentWeight: Number(row.current_weight ?? CLEANING_ROSTER_BASE_WEIGHT),
    totalAssignments: Number(row.total_assignments ?? 0),
    consecutiveRestRounds: Number(row.consecutive_rest_rounds ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    status: row.status === "deleted" ? "deleted" : "active",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new CleaningRosterError("名稱不可空白。", 400, "invalid_name");
  }
  if (name.length > 60) {
    throw new CleaningRosterError("名稱過長（最多 60 字）。", 400, "invalid_name");
  }
  return name;
}

export async function listAreas(includeDeleted = false): Promise<CleaningRosterArea[]> {
  let query = db()
    .from("cleaning_roster_areas")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeDeleted) {
    query = query.eq("status", "active");
  }
  const { data, error } = await query;
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  return (data ?? []).map((row) => mapArea(row as Record<string, unknown>));
}

export async function listMembers(includeDeleted = false): Promise<CleaningRosterMember[]> {
  let query = db()
    .from("cleaning_roster_members")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeDeleted) {
    query = query.eq("status", "active");
  }
  const { data, error } = await query;
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  return (data ?? []).map((row) => mapMember(row as Record<string, unknown>));
}

export async function createArea(name: string): Promise<CleaningRosterArea> {
  const normalized = normalizeName(name);
  const areas = await listAreas();
  const sortOrder = areas.length === 0 ? 0 : Math.max(...areas.map((a) => a.sortOrder)) + 1;
  const { data, error } = await db()
    .from("cleaning_roster_areas")
    .insert({
      name: normalized,
      sort_order: sortOrder,
      status: "active",
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  return mapArea(data as Record<string, unknown>);
}

export async function updateArea(id: string, name: string): Promise<CleaningRosterArea> {
  const normalized = normalizeName(name);
  const { data, error } = await db()
    .from("cleaning_roster_areas")
    .update({ name: normalized, updated_at: nowIso() })
    .eq("id", id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  if (!data) throw new CleaningRosterError("找不到此區域。", 404, "not_found");
  return mapArea(data as Record<string, unknown>);
}

export async function deleteArea(id: string): Promise<void> {
  const { data, error } = await db()
    .from("cleaning_roster_areas")
    .update({ status: "deleted", updated_at: nowIso() })
    .eq("id", id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  if (!data) throw new CleaningRosterError("找不到此區域。", 404, "not_found");
}

export async function createMember(name: string): Promise<CleaningRosterMember> {
  const normalized = normalizeName(name);
  const members = await listMembers();
  const sortOrder = members.length === 0 ? 0 : Math.max(...members.map((m) => m.sortOrder)) + 1;
  const { data, error } = await db()
    .from("cleaning_roster_members")
    .insert({
      name: normalized,
      current_weight: CLEANING_ROSTER_BASE_WEIGHT,
      total_assignments: 0,
      consecutive_rest_rounds: 0,
      sort_order: sortOrder,
      status: "active",
      updated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  return mapMember(data as Record<string, unknown>);
}

export async function updateMember(id: string, name: string): Promise<CleaningRosterMember> {
  const normalized = normalizeName(name);
  const { data, error } = await db()
    .from("cleaning_roster_members")
    .update({ name: normalized, updated_at: nowIso() })
    .eq("id", id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  if (!data) throw new CleaningRosterError("找不到此人員。", 404, "not_found");
  return mapMember(data as Record<string, unknown>);
}

export async function deleteMember(id: string): Promise<void> {
  const { data, error } = await db()
    .from("cleaning_roster_members")
    .update({ status: "deleted", updated_at: nowIso() })
    .eq("id", id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  if (!data) throw new CleaningRosterError("找不到此人員。", 404, "not_found");
}

export async function listHistory(
  limit = CLEANING_ROSTER_HISTORY_LIMIT,
): Promise<CleaningRosterHistoryRound[]> {
  const { data: rounds, error } = await db()
    .from("cleaning_roster_rounds")
    .select("id, confirmed_at")
    .order("confirmed_at", { ascending: false })
    .limit(limit);
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  if (!rounds?.length) return [];

  const roundIds = rounds.map((round) => String(round.id));
  const { data: assignmentRows, error: assignmentError } = await db()
    .from("cleaning_roster_assignments")
    .select("*")
    .in("round_id", roundIds)
    .order("sort_order", { ascending: true });
  if (assignmentError) {
    throw new CleaningRosterError(assignmentError.message, 500, "db_error");
  }

  const byRound = new Map<string, CleaningRosterHistoryRound>();
  for (const round of rounds) {
    byRound.set(String(round.id), {
      id: String(round.id),
      confirmedAt: String(round.confirmed_at),
      assignments: [],
      resting: [],
    });
  }

  for (const row of assignmentRows ?? []) {
    const record = row as Record<string, unknown>;
    const round = byRound.get(String(record.round_id));
    if (!round) continue;
    const entry = {
      areaId: record.area_id ? String(record.area_id) : null,
      memberId: record.member_id ? String(record.member_id) : null,
      areaName: record.area_name_snapshot ? String(record.area_name_snapshot) : null,
      memberName: String(record.member_name_snapshot),
      role: record.role === "rest" ? ("rest" as const) : ("assigned" as const),
      sortOrder: Number(record.sort_order ?? 0),
    };
    if (entry.role === "rest") {
      round.resting.push(entry);
    } else {
      round.assignments.push(entry);
    }
  }

  return rounds.map((round) => byRound.get(String(round.id))!);
}

async function getFairnessResetAt(): Promise<string | null> {
  const { data, error } = await db()
    .from("cleaning_roster_meta")
    .select("fairness_reset_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new CleaningRosterError(error.message, 500, "db_error");
  return data?.fairness_reset_at ? String(data.fairness_reset_at) : null;
}

export async function bootstrapCleaningRoster(): Promise<CleaningRosterBootstrap> {
  const [areas, members, history, fairnessResetAt] = await Promise.all([
    listAreas(),
    listMembers(),
    listHistory(),
    getFairnessResetAt(),
  ]);
  return { areas, members, history, fairnessResetAt };
}

/** Preview only — never mutates weights or history. */
export async function previewDraw(): Promise<CleaningRosterPreview> {
  const [areas, members] = await Promise.all([listAreas(), listMembers()]);
  if (areas.length === 0) {
    throw new CleaningRosterError("先新增至少一個打掃區域", 400, "no_areas");
  }
  if (members.length === 0) {
    throw new CleaningRosterError("先新增至少一位參與人員", 400, "no_members");
  }

  const result = drawCleaningRoster(
    areas.map((area) => ({ id: area.id, name: area.name })),
    members.map((member) => ({
      id: member.id,
      name: member.name,
      weight: member.currentWeight,
    })),
  );

  return {
    idempotencyKey: randomUUID(),
    assignments: result.assignments,
    resting: result.resting,
  };
}

export async function confirmDraw(input: {
  confirmedByMemberId: string;
  idempotencyKey: string;
  assignments: CleaningRosterPreviewAssignment[];
  resting: CleaningRosterPreviewRester[];
}): Promise<{ roundId: string; duplicate: boolean; bootstrap: CleaningRosterBootstrap }> {
  const key = input.idempotencyKey?.trim();
  if (!key || key.length < 8) {
    throw new CleaningRosterError("缺少有效的抽籤確認鍵。", 400, "invalid_idempotency");
  }

  const [areas, members] = await Promise.all([listAreas(), listMembers()]);
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const memberById = new Map(members.map((member) => [member.id, member]));

  if (areas.length === 0) {
    throw new CleaningRosterError("先新增至少一個打掃區域", 400, "no_areas");
  }
  if (members.length === 0) {
    throw new CleaningRosterError("先新增至少一位參與人員", 400, "no_members");
  }
  if (input.assignments.length !== areas.length) {
    throw new CleaningRosterError("預覽與目前區域數量不一致，請重新抽籤。", 400, "stale_preview");
  }

  const assignedMemberIds = new Set<string>();
  const normalizedAssignments = input.assignments.map((assignment) => {
    const area = areaById.get(assignment.areaId);
    const member = memberById.get(assignment.memberId);
    if (!area || !member) {
      throw new CleaningRosterError("預覽資料已過期，請重新抽籤。", 400, "stale_preview");
    }
    assignedMemberIds.add(member.id);
    return {
      area_id: area.id,
      area_name: area.name,
      member_id: member.id,
      member_name: member.name,
    };
  });

  if (members.length >= areas.length) {
    if (assignedMemberIds.size !== areas.length) {
      throw new CleaningRosterError("同一輪不可重複指派同一人（區域數 ≤ 人數時）。", 400, "duplicate_worker");
    }
  }

  const expectedRestIds = new Set(
    members.filter((member) => !assignedMemberIds.has(member.id)).map((member) => member.id),
  );
  const restingIds = new Set(input.resting.map((item) => item.memberId));
  if (
    expectedRestIds.size !== restingIds.size ||
    [...expectedRestIds].some((id) => !restingIds.has(id))
  ) {
    throw new CleaningRosterError("休息名單與預覽不一致，請重新抽籤。", 400, "stale_preview");
  }

  const normalizedResting = [...expectedRestIds].map((memberId) => {
    const member = memberById.get(memberId)!;
    return { member_id: member.id, member_name: member.name };
  });

  const { data, error } = await db().rpc("confirm_cleaning_roster_round", {
    p_idempotency_key: key,
    p_confirmed_by_member_id: input.confirmedByMemberId,
    p_assignments: normalizedAssignments,
    p_resting: normalizedResting,
  });

  if (error) {
    throw new CleaningRosterError(error.message, 500, "confirm_failed");
  }

  const payload = data as { round_id?: string; duplicate?: boolean } | null;
  const roundId = payload?.round_id ? String(payload.round_id) : "";
  if (!roundId) {
    throw new CleaningRosterError("確認失敗，請再試一次。", 500, "confirm_failed");
  }

  const bootstrap = await bootstrapCleaningRoster();
  return {
    roundId,
    duplicate: Boolean(payload?.duplicate),
    bootstrap,
  };
}

export async function resetFairness(): Promise<CleaningRosterBootstrap> {
  const now = nowIso();
  const { error: memberError } = await db()
    .from("cleaning_roster_members")
    .update({
      current_weight: CLEANING_ROSTER_BASE_WEIGHT,
      total_assignments: 0,
      consecutive_rest_rounds: 0,
      updated_at: now,
    })
    .eq("status", "active");
  if (memberError) throw new CleaningRosterError(memberError.message, 500, "db_error");

  const { error: metaError } = await db().from("cleaning_roster_meta").upsert({
    id: "default",
    fairness_reset_at: now,
    updated_at: now,
  });
  if (metaError) throw new CleaningRosterError(metaError.message, 500, "db_error");

  return bootstrapCleaningRoster();
}
