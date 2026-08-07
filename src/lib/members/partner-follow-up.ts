import { getCurrentMember } from "@/lib/auth/auth-service";
import { loadPartnerCareMembers } from "@/lib/auth/member-management-access";
import { todayISODate } from "@/lib/config/app-config";
import { getPartnerCareMeta } from "@/lib/repositories/partner-care-meta-repository";
import { createMemberWorkspaceRepository } from "@/lib/repositories/member-workspace-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import type { Member } from "@/types/member";
import type { MemberWorkspaceData } from "@/types/member-workspace";
import type { PartnerCareMeta } from "@/lib/repositories/partner-care-meta-repository";

export interface PartnerFollowUpHint {
  memberId: EntityId;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export interface DailyPartnerFollowUpItem {
  member: Member;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export interface DailyPartnerFollowUpSnapshot {
  count: number;
  items: DailyPartnerFollowUpItem[];
}

const URGENCY_RANK = { high: 0, medium: 1, low: 2 } as const;

function daysBetween(left: string, right: string): number {
  const start = new Date(left);
  const end = new Date(right);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

function latestDate(dates: string[]): string | null {
  if (dates.length === 0) {
    return null;
  }
  return dates.sort((left, right) => right.localeCompare(left))[0];
}

export function buildPartnerFollowUpHints(
  member: Member,
  workspace: MemberWorkspaceData,
  meta: PartnerCareMeta | undefined,
  today: string = todayISODate(),
): PartnerFollowUpHint[] {
  const hints: PartnerFollowUpHint[] = [];

  if (meta?.nextFollowUpDate && meta.nextFollowUpDate <= today) {
    hints.push({
      memberId: member.id,
      reason: "到了你設定的追蹤日",
      urgency: "high",
    });
  }

  const lastInBodyDate = workspace.inBodyRecords[0]?.recordDate ?? null;
  const lastCoachNoteDate = workspace.coachNotes[0]?.noteDate ?? null;
  const lastInteraction = latestDate(
    [lastInBodyDate, lastCoachNoteDate, meta?.lastContactDate].filter(
      (value): value is string => Boolean(value),
    ),
  );

  if (!lastInBodyDate) {
    hints.push({
      memberId: member.id,
      reason: "還沒有量測紀錄",
      urgency: "medium",
    });
  } else {
    const daysSinceInBody = daysBetween(lastInBodyDate, today);
    if (daysSinceInBody >= 14 && meta?.lastContactDate !== today) {
      hints.push({
        memberId: member.id,
        reason: `已 ${daysSinceInBody} 天沒量測`,
        urgency: daysSinceInBody >= 21 ? "high" : "medium",
      });
    }
  }

  if (lastInteraction) {
    const daysSinceInteraction = daysBetween(lastInteraction, today);
    if (daysSinceInteraction >= 14 && meta?.lastContactDate !== today) {
      hints.push({
        memberId: member.id,
        reason: `已 ${daysSinceInteraction} 天沒互動`,
        urgency: daysSinceInteraction >= 21 ? "high" : "medium",
      });
    }
  } else {
    hints.push({
      memberId: member.id,
      reason: "新夥伴，建議主動關心",
      urgency: "medium",
    });
  }

  const latestNote = workspace.coachNotes[0];
  if (latestNote && latestNote.followUpItems.length > 0) {
    hints.push({
      memberId: member.id,
      reason: "有待追蹤事項",
      urgency: "medium",
    });
  }

  return hints;
}

export function buildDailyPartnerFollowUpSnapshot(
  storage: StorageAdapter,
  viewer: Member | null = getCurrentMember(storage),
  today: string = todayISODate(),
): DailyPartnerFollowUpSnapshot {
  if (!viewer) {
    return { count: 0, items: [] };
  }

  const workspaceRepo = createMemberWorkspaceRepository(storage);
  const downline = loadPartnerCareMembers(viewer, storage);

  const items = downline
    .flatMap((member) => {
      const workspace = workspaceRepo.loadWorkspace(member.id);
      const meta = getPartnerCareMeta(storage, member.id);
      const hints = buildPartnerFollowUpHints(member, workspace, meta, today);
      const topHint = hints.sort(
        (left, right) => URGENCY_RANK[left.urgency] - URGENCY_RANK[right.urgency],
      )[0];
      if (!topHint) {
        return [];
      }
      return [{ member, reason: topHint.reason, urgency: topHint.urgency }];
    })
    .sort((left, right) => URGENCY_RANK[left.urgency] - URGENCY_RANK[right.urgency]);

  return { count: items.length, items };
}
