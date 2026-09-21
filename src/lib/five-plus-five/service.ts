import { mapCloudMemberRow, mapCloudRelationshipRow } from "@/lib/cloud/cloud-member-mapper";
import {
  resolveDayStatus,
  sumPeriod,
} from "@/lib/five-plus-five/stats";
import {
  fivePlusFiveToday,
  getBusinessWeekRange,
  getMonthRange,
  computeSubmittedOnTime,
  addCalendarDays,
  isValidISOCalendarDate,
  daysElapsedInMonthThrough,
  isReportDateStillOpen,
} from "@/lib/five-plus-five/dates";
import { FIVE_PLUS_FIVE_RULES, resolveFivePlusFiveTargets } from "@/lib/five-plus-five/rules";
import {
  canViewerAccessMember,
  collectDescendantsWithGeneration,
} from "@/lib/five-plus-five/org-access";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";
import type {
  FivePlusFiveMemberDetail,
  FivePlusFiveMyStats,
  FivePlusFiveOrgMemberStatus,
  FivePlusFiveOrgSummary,
  FivePlusFivePeriodTotals,
  FivePlusFiveReportRow,
} from "@/types/five-plus-five";

type DbReportRow = {
  id: string;
  member_id: string;
  report_date: string;
  fish_pool_count: number;
  invitation_five_steps_count: number;
  first_submitted_at: string;
  updated_at: string;
  submitted_on_time: boolean;
  created_at: string;
};

type RpcStatsPayload = {
  today: DbReportRow | null;
  week: { fish_pool: number; invitation_five_steps: number };
  month: {
    fish_pool: number;
    invitation_five_steps: number;
    on_time_days: number;
  };
  history: { fish_pool: number; invitation_five_steps: number };
  recent: DbReportRow[];
  streak_on_time_days: number;
};

export function mapReportRow(row: DbReportRow): FivePlusFiveReportRow {
  return {
    id: row.id,
    memberId: row.member_id,
    reportDate: row.report_date,
    fishPoolCount: row.fish_pool_count,
    invitationFiveStepsCount: row.invitation_five_steps_count,
    firstSubmittedAt: row.first_submitted_at,
    updatedAt: row.updated_at,
    submittedOnTime: row.submitted_on_time,
    createdAt: row.created_at,
  };
}

/** Integers only — no silent floor/round/truncate. */
export function normalizeCount(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  if (value < 0 || value > FIVE_PLUS_FIVE_RULES.maxReasonableCount) return null;
  return value;
}

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new FivePlusFiveServiceError("Service unavailable", 503);
  }
  return createSupabaseServiceClient();
}

export class FivePlusFiveServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FivePlusFiveServiceError";
    this.status = status;
  }
}

function migrationPending(error: { message: string; code?: string }): boolean {
  return (
    error.message.includes("five_plus_five_reports") ||
    error.message.includes("get_five_plus_five_member_stats") ||
    error.code === "42P01" ||
    error.code === "42883"
  );
}

export async function loadCloudOrgGraph(): Promise<{
  members: CloudMember[];
  relationships: CloudOrganizationRelationship[];
}> {
  const supabase = requireService();
  const [membersRes, relRes] = await Promise.all([
    supabase.from("members").select("*").order("created_at", { ascending: true }),
    supabase.from("organization_relationships").select("*"),
  ]);
  if (membersRes.error) throw new FivePlusFiveServiceError(membersRes.error.message, 500);
  if (relRes.error) throw new FivePlusFiveServiceError(relRes.error.message, 500);

  return {
    members: (membersRes.data ?? []).map((row) => mapCloudMemberRow(row as never)),
    relationships: (relRes.data ?? []).map((row) => mapCloudRelationshipRow(row as never)),
  };
}

export async function loadMemberById(memberId: string): Promise<CloudMember | null> {
  const supabase = requireService();
  const { data, error } = await supabase.from("members").select("*").eq("id", memberId).maybeSingle();
  if (error) throw new FivePlusFiveServiceError(error.message, 500);
  return data ? mapCloudMemberRow(data as never) : null;
}

export async function assertCanViewMember(
  viewerId: string,
  targetMemberId: string,
): Promise<{ viewer: CloudMember; target: CloudMember; generation: number | null }> {
  const { members, relationships } = await loadCloudOrgGraph();
  const viewer = members.find((m) => m.id === viewerId);
  if (!viewer) throw new FivePlusFiveServiceError("Viewer not found", 401);
  const target = members.find((m) => m.id === targetMemberId);
  if (!target) throw new FivePlusFiveServiceError("Member not found", 404);

  const isPresident = viewer.currentLevel === "president" || viewer.role === "president";
  const allowed = canViewerAccessMember({
    viewer,
    targetMemberId,
    members,
    relationships,
    canSeeAll: isPresident,
  });
  if (!allowed) {
    throw new FivePlusFiveServiceError("Forbidden", 403);
  }

  let generation: number | null = null;
  if (viewer.id !== target.id) {
    const descendants = collectDescendantsWithGeneration(viewer, members, relationships);
    generation = descendants.find((d) => d.memberId === target.id)?.generation ?? null;
  } else {
    generation = 0;
  }

  return { viewer, target, generation };
}

async function fetchReportsForMembers(
  memberIds: string[],
  fromDate?: string,
): Promise<FivePlusFiveReportRow[]> {
  if (memberIds.length === 0) return [];
  const supabase = requireService();
  const out: FivePlusFiveReportRow[] = [];
  const chunkSize = 200;
  for (let i = 0; i < memberIds.length; i += chunkSize) {
    const chunk = memberIds.slice(i, i + chunkSize);
    let query = supabase.from("five_plus_five_reports").select("*").in("member_id", chunk);
    if (fromDate) {
      query = query.gte("report_date", fromDate);
    }
    const { data, error } = await query;
    if (error) {
      if (migrationPending(error)) {
        throw new FivePlusFiveServiceError("Migration pending: five_plus_five_reports", 503);
      }
      throw new FivePlusFiveServiceError(error.message, 500);
    }
    for (const row of data ?? []) {
      out.push(mapReportRow(row as DbReportRow));
    }
  }
  return out;
}

/** Assemble stats from DB aggregates — never requires full history rows. */
export function buildMyStatsFromAggregates(input: {
  todayReport: FivePlusFiveReportRow | null;
  week: FivePlusFivePeriodTotals;
  month: FivePlusFivePeriodTotals;
  history: FivePlusFivePeriodTotals;
  streakOnTimeDays: number;
  monthOnTimeDays: number;
  today: string;
  memberName: string;
  now?: Date;
}): FivePlusFiveMyStats {
  const now = input.now ?? new Date();
  const targets = resolveFivePlusFiveTargets();
  const weekRange = getBusinessWeekRange(input.today);
  const todayFish = input.todayReport?.fishPoolCount ?? 0;
  const todayInvite = input.todayReport?.invitationFiveStepsCount ?? 0;
  const hasReport = Boolean(input.todayReport);
  const elapsedDays = daysElapsedInMonthThrough(input.today);
  const monthOnTimeRatePercent =
    elapsedDays <= 0 ? 0 : Math.round((input.monthOnTimeDays / elapsedDays) * 100);

  return {
    today: {
      fishPool: todayFish,
      invitationFiveSteps: todayInvite,
      fishTarget: targets.fishPoolDaily,
      fishMet: hasReport && todayFish >= targets.fishPoolDaily,
      hasReport,
      status: resolveDayStatus({
        reportDate: input.today,
        report: input.todayReport,
        today: input.today,
        fishDailyTarget: targets.fishPoolDaily,
        now,
      }),
      submittedOnTime: input.todayReport?.submittedOnTime ?? null,
      firstSubmittedAt: input.todayReport?.firstSubmittedAt ?? null,
    },
    week: {
      ...input.week,
      fishTarget: targets.fishPoolWeekly,
      invitationTarget: targets.invitationFiveStepsWeekly,
      fishMet: input.week.fishPool >= targets.fishPoolWeekly,
      invitationMet: input.week.invitationFiveSteps >= targets.invitationFiveStepsWeekly,
      weekStart: weekRange.start,
      weekEnd: weekRange.end,
    },
    month: input.month,
    history: input.history,
    streakOnTimeDays: input.streakOnTimeDays,
    monthOnTimeRatePercent,
    monthOnTimeDays: input.monthOnTimeDays,
    monthElapsedDays: elapsedDays,
    targets,
    todayDate: input.today,
    memberName: input.memberName,
  };
}

async function fetchMemberStatsBundle(
  memberId: string,
  today: string,
  now: Date,
): Promise<{
  todayReport: FivePlusFiveReportRow | null;
  week: FivePlusFivePeriodTotals;
  month: FivePlusFivePeriodTotals;
  history: FivePlusFivePeriodTotals;
  streakOnTimeDays: number;
  monthOnTimeDays: number;
  recent: FivePlusFiveReportRow[];
}> {
  const supabase = requireService();
  const week = getBusinessWeekRange(today);
  const month = getMonthRange(today);
  const treatTodayAsOpen = isReportDateStillOpen(today, now);

  const { data, error } = await supabase.rpc("get_five_plus_five_member_stats", {
    p_member_id: memberId,
    p_today: today,
    p_week_start: week.start,
    p_week_end: week.end,
    p_month_start: month.start,
    p_treat_today_as_open: treatTodayAsOpen,
    p_recent_days: 30,
    p_streak_lookback_days: 400,
  });

  if (error) {
    if (migrationPending(error)) {
      throw new FivePlusFiveServiceError("Migration pending: five_plus_five_reports", 503);
    }
    throw new FivePlusFiveServiceError(error.message, 500);
  }

  const payload = data as RpcStatsPayload;
  const todayReport = payload.today ? mapReportRow(payload.today) : null;
  const recent = (payload.recent ?? []).map((row) => mapReportRow(row));

  return {
    todayReport,
    week: {
      fishPool: Number(payload.week?.fish_pool ?? 0),
      invitationFiveSteps: Number(payload.week?.invitation_five_steps ?? 0),
    },
    month: {
      fishPool: Number(payload.month?.fish_pool ?? 0),
      invitationFiveSteps: Number(payload.month?.invitation_five_steps ?? 0),
    },
    history: {
      fishPool: Number(payload.history?.fish_pool ?? 0),
      invitationFiveSteps: Number(payload.history?.invitation_five_steps ?? 0),
    },
    streakOnTimeDays: Number(payload.streak_on_time_days ?? 0),
    monthOnTimeDays: Number(payload.month?.on_time_days ?? 0),
    recent,
  };
}

/** Exported for tests — proves we never call unbounded history select. */
export const STATS_FETCH_STRATEGY = "rpc_aggregate_get_five_plus_five_member_stats" as const;

export async function getMyStats(
  memberId: string,
  now: Date = new Date(),
): Promise<{ stats: FivePlusFiveMyStats; todayReport: FivePlusFiveReportRow | null }> {
  const member = await loadMemberById(memberId);
  if (!member) throw new FivePlusFiveServiceError("Member not found", 401);

  const today = fivePlusFiveToday(now);
  const bundle = await fetchMemberStatsBundle(memberId, today, now);
  const stats = buildMyStatsFromAggregates({
    todayReport: bundle.todayReport,
    week: bundle.week,
    month: bundle.month,
    history: bundle.history,
    streakOnTimeDays: bundle.streakOnTimeDays,
    monthOnTimeDays: bundle.monthOnTimeDays,
    today,
    memberName: member.name,
    now,
  });
  return { stats, todayReport: bundle.todayReport };
}

export async function upsertMyReport(input: {
  memberId: string;
  reportDate: string;
  fishPoolCount: number;
  invitationFiveStepsCount: number;
  now?: Date;
}): Promise<FivePlusFiveReportRow> {
  const now = input.now ?? new Date();
  const today = fivePlusFiveToday(now);
  const isToday = input.reportDate === today;

  if (!isValidISOCalendarDate(input.reportDate)) {
    throw new FivePlusFiveServiceError("Invalid report date", 400);
  }
  if (input.reportDate > today) {
    throw new FivePlusFiveServiceError("Cannot report future dates", 400);
  }

  const fish = normalizeCount(input.fishPoolCount);
  const invite = normalizeCount(input.invitationFiveStepsCount);
  if (fish === null || invite === null) {
    throw new FivePlusFiveServiceError("Counts must be integers >= 0", 400);
  }

  const supabase = requireService();
  const { data: existing, error: existingError } = await supabase
    .from("five_plus_five_reports")
    .select("*")
    .eq("member_id", input.memberId)
    .eq("report_date", input.reportDate)
    .maybeSingle();

  if (existingError) {
    if (migrationPending(existingError)) {
      throw new FivePlusFiveServiceError("Migration pending: five_plus_five_reports", 503);
    }
    throw new FivePlusFiveServiceError(existingError.message, 500);
  }

  const nowIso = now.toISOString();

  if (existing) {
    // Preserve first_submitted_at and submitted_on_time (first submit wins)
    const { data, error } = await supabase
      .from("five_plus_five_reports")
      .update({
        fish_pool_count: fish,
        invitation_five_steps_count: invite,
        updated_at: nowIso,
      })
      .eq("id", existing.id)
      .eq("member_id", input.memberId)
      .select("*")
      .single();
    if (error) throw new FivePlusFiveServiceError(error.message, 500);
    return mapReportRow(data as DbReportRow);
  }

  const submittedOnTime = isToday && computeSubmittedOnTime(input.reportDate, now);

  const { data, error } = await supabase
    .from("five_plus_five_reports")
    .insert({
      member_id: input.memberId,
      report_date: input.reportDate,
      fish_pool_count: fish,
      invitation_five_steps_count: invite,
      first_submitted_at: nowIso,
      updated_at: nowIso,
      submitted_on_time: submittedOnTime,
      created_at: nowIso,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: raced, error: raceErr } = await supabase
        .from("five_plus_five_reports")
        .update({
          fish_pool_count: fish,
          invitation_five_steps_count: invite,
          updated_at: nowIso,
        })
        .eq("member_id", input.memberId)
        .eq("report_date", input.reportDate)
        .select("*")
        .single();
      if (raceErr) throw new FivePlusFiveServiceError(raceErr.message, 500);
      return mapReportRow(raced as DbReportRow);
    }
    throw new FivePlusFiveServiceError(error.message, 500);
  }

  return mapReportRow(data as DbReportRow);
}

export async function getOrganizationSummary(
  viewerId: string,
  now: Date = new Date(),
): Promise<FivePlusFiveOrgSummary> {
  const { members, relationships } = await loadCloudOrgGraph();
  const viewer = members.find((m) => m.id === viewerId);
  if (!viewer) throw new FivePlusFiveServiceError("Viewer not found", 401);

  const descendants = collectDescendantsWithGeneration(viewer, members, relationships);
  const today = fivePlusFiveToday(now);
  const week = getBusinessWeekRange(today);
  const targets = resolveFivePlusFiveTargets();

  const memberIds = descendants.map((d) => d.memberId);
  const reports = await fetchReportsForMembers(memberIds, week.start);

  const reportsByMember = new Map<string, FivePlusFiveReportRow[]>();
  for (const report of reports) {
    const list = reportsByMember.get(report.memberId) ?? [];
    list.push(report);
    reportsByMember.set(report.memberId, list);
  }

  const memberStatuses: FivePlusFiveOrgMemberStatus[] = descendants.map((desc) => {
    const memberReports = reportsByMember.get(desc.memberId) ?? [];
    const todayReport = memberReports.find((r) => r.reportDate === today) ?? null;
    const weekTotals = sumPeriod(memberReports, week.start, week.end);
    const status = resolveDayStatus({
      reportDate: today,
      report: todayReport,
      today,
      fishDailyTarget: targets.fishPoolDaily,
      now,
    });

    return {
      memberId: desc.memberId,
      memberName: desc.name,
      generation: desc.generation,
      todayFish: todayReport?.fishPoolCount ?? null,
      todayInvitation: todayReport?.invitationFiveStepsCount ?? null,
      weekInvitation: weekTotals.invitationFiveSteps,
      weekFish: weekTotals.fishPool,
      hasTodayReport: Boolean(todayReport),
      todayFishMet: Boolean(todayReport && todayReport.fishPoolCount >= targets.fishPoolDaily),
      weekInvitationMet: weekTotals.invitationFiveSteps >= targets.invitationFiveStepsWeekly,
      todayStatus: status,
      submittedOnTime: todayReport?.submittedOnTime ?? null,
    };
  });

  const orgPriority = (m: FivePlusFiveOrgMemberStatus): number => {
    if (m.todayStatus === "overdue_unreported") return 0;
    if (m.todayStatus === "not_yet_reported") return 1;
    if (m.todayStatus === "reported_fish_unmet") return 2;
    if (!m.weekInvitationMet) return 3;
    return 4;
  };

  memberStatuses.sort((a, b) => {
    const diff = orgPriority(a) - orgPriority(b);
    if (diff !== 0) return diff;
    if (a.generation !== b.generation) return a.generation - b.generation;
    return a.memberName.localeCompare(b.memberName, "zh-Hant");
  });

  const reportedToday = memberStatuses.filter((m) => m.hasTodayReport).length;
  const fishMetToday = memberStatuses.filter((m) => m.todayFishMet).length;
  const invitationMetThisWeek = memberStatuses.filter((m) => m.weekInvitationMet).length;

  return {
    todayDate: today,
    totalMembers: memberStatuses.length,
    reportedToday,
    fishMetToday,
    invitationMetThisWeek,
    notReportedToday: memberStatuses.length - reportedToday,
    members: memberStatuses,
    targets,
  };
}

export async function getMemberDetail(
  viewerId: string,
  targetMemberId: string,
  now: Date = new Date(),
): Promise<FivePlusFiveMemberDetail> {
  const { target, generation } = await assertCanViewMember(viewerId, targetMemberId);
  const today = fivePlusFiveToday(now);
  const fromDate = addCalendarDays(today, -29);
  const bundle = await fetchMemberStatsBundle(targetMemberId, today, now);
  const stats = buildMyStatsFromAggregates({
    todayReport: bundle.todayReport,
    week: bundle.week,
    month: bundle.month,
    history: bundle.history,
    streakOnTimeDays: bundle.streakOnTimeDays,
    monthOnTimeDays: bundle.monthOnTimeDays,
    today,
    memberName: target.name,
    now,
  });

  const targets = resolveFivePlusFiveTargets();
  const byDate = new Map(bundle.recent.map((r) => [r.reportDate, r]));
  const recentDays = [];
  for (let i = 0; i < 30; i += 1) {
    const date = addCalendarDays(today, -i);
    if (date < fromDate) break;
    const report = byDate.get(date) ?? null;
    recentDays.push({
      date,
      fishPoolCount: report?.fishPoolCount ?? null,
      invitationFiveStepsCount: report?.invitationFiveStepsCount ?? null,
      status: resolveDayStatus({
        reportDate: date,
        report,
        today,
        fishDailyTarget: targets.fishPoolDaily,
        now,
      }),
      submittedOnTime: report?.submittedOnTime ?? null,
      firstSubmittedAt: report?.firstSubmittedAt ?? null,
    });
  }

  return {
    memberId: target.id,
    memberName: target.name,
    generation: generation === 0 ? null : generation,
    stats,
    recentDays,
    readOnly: viewerId !== targetMemberId,
  };
}
