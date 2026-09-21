import { mapCloudMemberRow, mapCloudRelationshipRow } from "@/lib/cloud/cloud-member-mapper";
import {
  buildMyStats,
  resolveDayStatus,
  sumPeriod,
} from "@/lib/five-plus-five/stats";
import {
  fivePlusFiveToday,
  getBusinessWeekRange,
  computeSubmittedOnTime,
  addCalendarDays,
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

export function normalizeCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (n < 0 || n > FIVE_PLUS_FIVE_RULES.maxReasonableCount) return null;
  return n;
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
  let query = supabase
    .from("five_plus_five_reports")
    .select("*")
    .in("member_id", memberIds);
  if (fromDate) {
    query = query.gte("report_date", fromDate);
  }
  const { data, error } = await query;
  if (error) {
    if (error.message.includes("five_plus_five_reports") || error.code === "42P01") {
      throw new FivePlusFiveServiceError("Migration pending: five_plus_five_reports", 503);
    }
    throw new FivePlusFiveServiceError(error.message, 500);
  }
  return (data ?? []).map((row) => mapReportRow(row as DbReportRow));
}

async function fetchAllReportsForMember(memberId: string): Promise<FivePlusFiveReportRow[]> {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("five_plus_five_reports")
    .select("*")
    .eq("member_id", memberId)
    .order("report_date", { ascending: false });
  if (error) {
    if (error.message.includes("five_plus_five_reports") || error.code === "42P01") {
      throw new FivePlusFiveServiceError("Migration pending: five_plus_five_reports", 503);
    }
    throw new FivePlusFiveServiceError(error.message, 500);
  }
  return (data ?? []).map((row) => mapReportRow(row as DbReportRow));
}

export async function getMyStats(
  memberId: string,
  now: Date = new Date(),
): Promise<{ stats: FivePlusFiveMyStats; todayReport: FivePlusFiveReportRow | null }> {
  const member = await loadMemberById(memberId);
  if (!member) throw new FivePlusFiveServiceError("Member not found", 401);

  const today = fivePlusFiveToday(now);
  const reports = await fetchAllReportsForMember(memberId);
  const todayReport = reports.find((r) => r.reportDate === today) ?? null;
  const stats = buildMyStats({
    reports,
    todayReport,
    today,
    memberName: member.name,
    now,
  });
  return { stats, todayReport };
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
  const isPast = input.reportDate < today;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) {
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
    if (
      existingError.message.includes("five_plus_five_reports") ||
      existingError.code === "42P01"
    ) {
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
  // Past dates are always 補登 (false). Today open → true.
  void isPast;
  void isReportDateStillOpen;

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
      // Race: another insert won — update instead without touching on-time
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

  // Batch: one query for all descendant reports in current week (+ today)
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

  // Default sort: neediest first
  // 1 overdue 2 not yet 3 fish unmet 4 invite unmet 5 done
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
  const reports = await fetchAllReportsForMember(targetMemberId);
  const todayReport = reports.find((r) => r.reportDate === today) ?? null;
  const stats = buildMyStats({
    reports,
    todayReport,
    today,
    memberName: target.name,
    now,
  });

  const targets = resolveFivePlusFiveTargets();
  const byDate = new Map(reports.map((r) => [r.reportDate, r]));
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
