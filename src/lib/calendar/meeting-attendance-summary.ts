import { loadSharedCalendarAttendance } from "@/lib/calendar/calendar-attendance-storage";
import { loadAllMembers } from "@/lib/members/member-service";
import { getVisibleMembers } from "@/lib/auth/organization-access";
import { getCurrentMember } from "@/lib/auth/auth-service";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

export interface MeetingAttendanceParticipant {
  memberId: string;
  name: string;
  newFriendsCount: number;
}

export interface MeetingAttendanceSummary {
  totalParticipants: number;
  totalNewFriends: number;
  participants: MeetingAttendanceParticipant[];
}

export function buildMeetingAttendanceSummary(
  sharedEventId: string,
  storage: StorageAdapter,
): MeetingAttendanceSummary {
  const viewer = getCurrentMember(storage);
  const members = loadAllMembers(storage);
  const visibleMembers = viewer ? getVisibleMembers(viewer, members) : members;
  const visibleIds = new Set(visibleMembers.map((member) => member.id));

  const participants = loadSharedCalendarAttendance(storage)
    .filter(
      (item) => item.sharedEventId === sharedEventId && visibleIds.has(item.memberId),
    )
    .map((item) => {
      const member = members.find((candidate) => candidate.id === item.memberId);
      return {
        memberId: item.memberId,
        name: member?.nickname ?? member?.displayName ?? "夥伴",
        newFriendsCount: item.newFriendsCount ?? 0,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));

  return {
    totalParticipants: participants.length,
    totalNewFriends: participants.reduce((sum, item) => sum + item.newFriendsCount, 0),
    participants,
  };
}
