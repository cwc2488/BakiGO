export type LeadTracking = {
  id: string;
  ownerMemberId: string;
  name: string;
  phone: string | null;
  contactChannel: string | null;
  notes: string | null;
  currentStatus: string | null;
  nextFollowUpAt: string | null;
  reminderEnabled: boolean;
  lastFollowedUpAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadTrackingHistory = {
  id: string;
  leadId: string;
  ownerMemberId: string;
  statusText: string;
  createdAt: string;
};

export type LeadTrackingFilter = "all" | "today" | "overdue" | "future";

export type LeadTrackingCreateInput = {
  name: string;
  phone?: string | null;
  contactChannel?: string | null;
  notes?: string | null;
  currentStatus?: string | null;
  nextFollowUpAt?: string | null;
  reminderEnabled?: boolean;
};

export type LeadTrackingUpdateInput = Partial<LeadTrackingCreateInput> & {
  lastFollowedUpAt?: string | null;
};

type LeadTrackingRow = {
  id: string;
  owner_member_id: string;
  name: string;
  phone: string | null;
  contact_channel: string | null;
  notes: string | null;
  current_status: string | null;
  next_follow_up_at: string | null;
  reminder_enabled: boolean;
  last_followed_up_at: string | null;
  created_at: string;
  updated_at: string;
};

type LeadTrackingHistoryRow = {
  id: string;
  lead_id: string;
  owner_member_id: string;
  status_text: string;
  created_at: string;
};

export function mapLeadTrackingRow(row: LeadTrackingRow): LeadTracking {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    name: row.name,
    phone: row.phone,
    contactChannel: row.contact_channel,
    notes: row.notes,
    currentStatus: row.current_status,
    nextFollowUpAt: row.next_follow_up_at,
    reminderEnabled: row.reminder_enabled,
    lastFollowedUpAt: row.last_followed_up_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLeadTrackingHistoryRow(row: LeadTrackingHistoryRow): LeadTrackingHistory {
  return {
    id: row.id,
    leadId: row.lead_id,
    ownerMemberId: row.owner_member_id,
    statusText: row.status_text,
    createdAt: row.created_at,
  };
}

export function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function statusTextChanged(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  const left = (previous ?? "").trim();
  const right = (next ?? "").trim();
  if (!right) {
    return false;
  }
  return left !== right;
}
