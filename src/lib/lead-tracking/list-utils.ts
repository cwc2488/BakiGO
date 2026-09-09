import { APP_TIMEZONE, todayISODate } from "@/lib/config/app-config";
import type { LeadTracking, LeadTrackingFilter } from "@/lib/lead-tracking/types";

function taipeiDateOfInstant(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function classifyLeadFollowUp(
  lead: LeadTracking,
  now: Date = new Date(),
): "overdue" | "today" | "future" | "none" {
  if (!lead.nextFollowUpAt) {
    return "none";
  }
  const followDate = taipeiDateOfInstant(lead.nextFollowUpAt);
  const today = todayISODate(now);
  if (followDate < today) {
    return "overdue";
  }
  if (followDate === today) {
    return "today";
  }
  return "future";
}

export function filterLeads(
  leads: LeadTracking[],
  filter: LeadTrackingFilter,
  now: Date = new Date(),
): LeadTracking[] {
  if (filter === "all") {
    return leads;
  }
  return leads.filter((lead) => classifyLeadFollowUp(lead, now) === filter);
}

/**
 * Default sort: overdue → today → nearest future → no date last.
 * Within a bucket, sooner follow-up first; then updated_at desc.
 */
export function sortLeadsForList(leads: LeadTracking[], now: Date = new Date()): LeadTracking[] {
  const rank = (lead: LeadTracking): number => {
    const bucket = classifyLeadFollowUp(lead, now);
    if (bucket === "overdue") return 0;
    if (bucket === "today") return 1;
    if (bucket === "future") return 2;
    return 3;
  };

  return [...leads].sort((left, right) => {
    const rankDiff = rank(left) - rank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const leftAt = left.nextFollowUpAt ? Date.parse(left.nextFollowUpAt) : Number.POSITIVE_INFINITY;
    const rightAt = right.nextFollowUpAt ? Date.parse(right.nextFollowUpAt) : Number.POSITIVE_INFINITY;
    if (leftAt !== rightAt) {
      return leftAt - rightAt;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function summarizeStatus(status: string | null | undefined, max = 36): string {
  const text = (status ?? "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

export function formatFollowUpLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return "未設定";
  }
  const date = taipeiDateOfInstant(iso);
  const today = todayISODate(now);
  const time = new Intl.DateTimeFormat("zh-TW", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

  if (date < today) {
    return `逾期 ${date} ${time}`;
  }
  if (date === today) {
    return `今天 ${time}`;
  }
  return `${date} ${time}`;
}

export function countLeadBadges(
  leads: LeadTracking[],
  now: Date = new Date(),
): { today: number; overdue: number } {
  let today = 0;
  let overdue = 0;
  for (const lead of leads) {
    const bucket = classifyLeadFollowUp(lead, now);
    if (bucket === "today") today += 1;
    if (bucket === "overdue") overdue += 1;
  }
  return { today, overdue };
}
