import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type {
  CoachNote,
  InBodyRecord,
  MemberDashboardSnapshot,
  MemberTimelineEntry,
  MemberTimelineKind,
  MemberWorkspaceData,
  ProgressPhotoRecord,
} from "@/types/member-workspace";
import {
  MEMBER_TIMELINE_KIND_LABELS,
  PROGRESS_PHOTO_ANGLE_LABELS,
} from "@/types/member-workspace";

function formatInBodySummary(record: InBodyRecord): string {
  const parts: string[] = [];
  if (record.weightKg !== null) {
    parts.push(`${record.weightKg} kg`);
  }
  if (record.bodyFatPercent !== null) {
    parts.push(`體脂 ${record.bodyFatPercent}%`);
  }
  if (record.skeletalMuscleKg !== null) {
    parts.push(`骨骼肌 ${record.skeletalMuscleKg} kg`);
  }
  return parts.length > 0 ? parts.join(" · ") : "體組成紀錄";
}

export function buildMemberTimeline(
  metrics: MemberComputedMetrics,
  workspace: MemberWorkspaceData,
): MemberTimelineEntry[] {
  const entries: MemberTimelineEntry[] = [];

  workspace.inBodyRecords.forEach((record) => {
    entries.push({
      id: `inbody-${record.id}`,
      kind: "inbody",
      label: "體組成量測",
      eventDate: record.recordDate,
      subtitle: formatInBodySummary(record),
    });
  });

  workspace.progressPhotos.forEach((photo) => {
    entries.push({
      id: `photo-${photo.id}`,
      kind: "progress_photo",
      label: `進度照片 · ${PROGRESS_PHOTO_ANGLE_LABELS[photo.angle]}`,
      eventDate: photo.photoDate,
      subtitle: photo.note?.trim() || PROGRESS_PHOTO_ANGLE_LABELS[photo.angle],
    });
  });

  workspace.coachNotes.forEach((note) => {
    entries.push({
      id: `coach-${note.id}`,
      kind: "coach_note",
      label: `教練筆記 · ${note.category}`,
      eventDate: note.noteDate,
      subtitle: note.content,
    });
  });

  metrics.eventCenter.events
    .filter((event) => event.category === "transaction")
    .forEach((event) => {
      entries.push({
        id: `tx-${event.id}`,
        kind: "transaction",
        label: event.label,
        eventDate: event.eventDate,
        subtitle: event.subtitle,
      });
    });

  metrics.gamification.achievements.forEach((achievement) => {
    entries.push({
      id: `achievement-${achievement.achievementKey}-${achievement.unlockedAt}`,
      kind: "achievement",
      label: achievement.title,
      eventDate: achievement.unlockedAt,
      subtitle: achievement.description,
    });
  });

  metrics.missions.allMissions
    .filter((mission) => mission.status === "completed")
    .forEach((mission) => {
      entries.push({
        id: `mission-${mission.id}`,
        kind: "mission",
        label: mission.title,
        eventDate: metrics.missions.referenceDate,
        subtitle: `+${mission.xp} 積分`,
      });
    });

  return entries.sort((left, right) => right.eventDate.localeCompare(left.eventDate));
}

export function selectMemberDashboard(
  metrics: MemberComputedMetrics,
  workspace: MemberWorkspaceData,
): MemberDashboardSnapshot {
  const topMission = metrics.missions.dailyMissionSet.missions[0];
  const topPriority = metrics.presidentAI.topPriorities[0];
  const lastInBody = workspace.inBodyRecords[0] ?? null;
  const lastTransaction =
    metrics.eventCenter.events.find((event) => event.category === "transaction") ?? null;
  const lastConsultation =
    workspace.coachNotes.find((note) => note.category === "諮詢") ??
    workspace.coachNotes[0] ??
    null;

  return {
    currentRank: metrics.promotionProgress.currentRankName,
    vp: metrics.vp.totalVp,
    missionLabel: topMission?.title ?? "今日沒有任務",
    presidentAiLabel: topPriority?.title ?? metrics.presidentAI.focusMode.label,
    monthlyTransactionCount: metrics.retailHouse.houses[0]?.transactionCount ?? 0,
    lastInBodyDate: lastInBody?.recordDate ?? null,
    lastInBodySummary: lastInBody ? formatInBodySummary(lastInBody) : null,
    lastTransactionDate: lastTransaction?.eventDate ?? null,
    lastTransactionSummary: lastTransaction?.subtitle ?? null,
    lastConsultationDate: lastConsultation?.noteDate ?? null,
    lastConsultationSummary: lastConsultation?.content ?? null,
  };
}

export function getTimelineKindLabel(kind: MemberTimelineKind): string {
  return MEMBER_TIMELINE_KIND_LABELS[kind];
}

export function findLatestConsultation(notes: CoachNote[]): CoachNote | null {
  return notes.find((note) => note.category === "諮詢") ?? null;
}

export function findLatestInBody(records: InBodyRecord[]): InBodyRecord | null {
  return records[0] ?? null;
}

export function findLatestPhoto(photos: ProgressPhotoRecord[]): ProgressPhotoRecord | null {
  return photos[0] ?? null;
}
