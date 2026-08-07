import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import type { DownlineCloudDataCache } from "@/lib/cloud/downline-cloud-data";
import { getDownlineEvents } from "@/lib/cloud/downline-cloud-data";
import { getMemberDisplayName } from "@/lib/members/member-service";
import { collectDownlineByDepth } from "@/lib/organization/collect-downline-by-depth";
import type { DownlineMemberRef } from "@/lib/organization/collect-downline-by-depth";
import { buildMemberActivitySummary } from "@/lib/organization/member-activity-summary";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { DownlinePartnerSuggestion } from "@/types/downline-partner";
import type { Member } from "@/types/member";
import type { EntityId, ISODateString } from "@/types";

const MEETING_PRIORITY = 3200;
const NEW_CUSTOMER_PRIORITY = 2900;
const MAX_SUGGESTIONS = 8;

function generationLabel(generation: number): string {
  if (generation === 1) {
    return "直推";
  }
  if (generation === 2) {
    return "二代";
  }
  return "三代";
}

export function collectDownlinePartnerSignals(input: {
  viewerMemberId: EntityId;
  viewerRankKey: string;
  members: Member[];
  referenceDate: ISODateString;
  storage: StorageAdapter;
  downlineCache?: DownlineCloudDataCache;
  maxGenerations?: number;
  /** 若提供，以組織圖下線為準（與雲端 relationship 一致）。 */
  downlineRefs?: DownlineMemberRef[];
}): DownlinePartnerSuggestion[] {
  if (!isCareerRankAtOrAbove(input.viewerRankKey, RANK_KEYS.PROMOTION_GROUP)) {
    return [];
  }

  const downlineRefs =
    input.downlineRefs ??
    collectDownlineByDepth(input.members, input.viewerMemberId, input.maxGenerations ?? 3);
  const signals: DownlinePartnerSuggestion[] = [];

  for (const { memberId, generation } of downlineRefs) {
    const member = input.members.find((item) => item.id === memberId);
    if (!member || member.status !== "active") {
      continue;
    }

    const displayName = getMemberDisplayName(member);
    const supplementalEvents = getDownlineEvents(memberId, input.downlineCache);
    const activity = buildMemberActivitySummary(
      memberId,
      input.referenceDate,
      input.storage,
      supplementalEvents,
    );
    const genLabel = generationLabel(generation);

    if (activity.monthlyMeetings === 0) {
      signals.push({
        memberId,
        displayName,
        generation,
        signalKey: `downline_no_meetings_${memberId}`,
        title: `${displayName} 本月還沒參與會議，跟他聊聊`,
        description: `${genLabel}下線 · 會議人數等於收入，帶的人越多，收入越高。`,
        actionHref: `/members/${memberId}`,
        enginePriority: MEETING_PRIORITY,
      });
    }

    if (activity.monthlyNewCustomers === 0) {
      signals.push({
        memberId,
        displayName,
        generation,
        signalKey: `downline_no_new_customers_${memberId}`,
        title: `${displayName} 都沒新客人，需要跟他聊聊`,
        description: `${genLabel}下線 · 協助補名單、量測與諮詢節奏。`,
        actionHref: `/members/${memberId}`,
        enginePriority: NEW_CUSTOMER_PRIORITY,
      });
    }
  }

  return Array.from(
    signals.reduce<Map<string, DownlinePartnerSuggestion>>((byMember, signal) => {
      const existing = byMember.get(signal.memberId);
      if (!existing || signal.enginePriority > existing.enginePriority) {
        byMember.set(signal.memberId, signal);
      }
      return byMember;
    }, new Map()).values(),
  ).sort((left, right) => {
      if (left.enginePriority !== right.enginePriority) {
        return right.enginePriority - left.enginePriority;
      }
      if (left.generation !== right.generation) {
        return left.generation - right.generation;
      }
      return left.displayName.localeCompare(right.displayName, "zh-Hant");
    })
    .slice(0, MAX_SUGGESTIONS);
}
