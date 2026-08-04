import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import type { AppMember } from "@/lib/config/app-config";
import type { BakiEvent } from "@/types/baki-event";
import { QUALIFICATION_EVENT_KEYS } from "./event-types";

const QUALIFICATION_RANK_ORDER: Array<{ eventKey: string; rankKey: string }> = [
  { eventKey: QUALIFICATION_EVENT_KEYS.SUPERVISOR, rankKey: RANK_KEYS.SUPERVISOR },
  { eventKey: QUALIFICATION_EVENT_KEYS.WORLD_TEAM, rankKey: RANK_KEYS.WORLD_TEAM },
  {
    eventKey: QUALIFICATION_EVENT_KEYS.PROMOTION_GROUP,
    rankKey: RANK_KEYS.PROMOTION_GROUP,
  },
  { eventKey: QUALIFICATION_EVENT_KEYS.WEALTH_GROUP, rankKey: RANK_KEYS.WEALTH_GROUP },
  { eventKey: QUALIFICATION_EVENT_KEYS.PRESIDENT, rankKey: RANK_KEYS.PRESIDENT },
];

const RANK_ORDER = QUALIFICATION_RANK_ORDER.map((item) => item.rankKey);

function resolveRankFromEvents(events: BakiEvent[], memberId: string): string | null {
  const qualificationEvents = events
    .filter(
      (event) =>
        event.memberId === memberId && event.eventCategory === "qualification",
    )
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));

  for (const rankEntry of QUALIFICATION_RANK_ORDER.slice().reverse()) {
    const matched = qualificationEvents.find(
      (event) => event.eventTypeKey === rankEntry.eventKey,
    );
    if (matched) {
      return rankEntry.rankKey;
    }
  }

  return null;
}

export function applyMemberStateFromEvents(
  members: AppMember[],
  events: BakiEvent[],
): AppMember[] {
  return members.map((member) => {
    const rankKey = resolveRankFromEvents(events, member.id);
    if (!rankKey) {
      return member;
    }

    const currentIndex = RANK_ORDER.indexOf(member.rankKey);
    const nextIndex = RANK_ORDER.indexOf(rankKey);
    const resolvedRank =
      nextIndex >= 0 && (currentIndex < 0 || nextIndex >= currentIndex)
        ? rankKey
        : member.rankKey;

    return {
      ...member,
      rankKey: resolvedRank,
    };
  });
}
