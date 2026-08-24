import { formatRunDateInTimezone } from "../pipeline/run-date";

export type MemberRadarRegionPreference = {
  member_id: string;
  current_city: string | null;
  current_district: string | null;
  pending_city: string | null;
  pending_district: string | null;
  pending_effective_date: string | null;
  updated_at: string;
};

export type EffectiveRadarRegion = {
  city: string | null;
  district: string | null;
  source: "current" | "pending" | "none";
  pending_city: string | null;
  pending_district: string | null;
  pending_effective_date: string | null;
};

export function taipeiCalendarDate(now: Date = new Date()): string {
  return formatRunDateInTimezone(now, "Asia/Taipei");
}

export function nextTaipeiCalendarDate(now: Date = new Date()): string {
  const today = taipeiCalendarDate(now);
  const [year, month, day] = today.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function resolveEffectiveRadarRegion(
  preference: MemberRadarRegionPreference | null,
  runDate: string,
): EffectiveRadarRegion {
  if (!preference) {
    return {
      city: null,
      district: null,
      source: "none",
      pending_city: null,
      pending_district: null,
      pending_effective_date: null,
    };
  }

  const pendingDate = preference.pending_effective_date;
  const pendingDue =
    Boolean(preference.pending_city) &&
    Boolean(pendingDate) &&
    pendingDate !== null &&
    pendingDate <= runDate;

  if (pendingDue) {
    return {
      city: preference.pending_city,
      district: preference.pending_district,
      source: "pending",
      pending_city: preference.pending_city,
      pending_district: preference.pending_district,
      pending_effective_date: preference.pending_effective_date,
    };
  }

  if (preference.current_city) {
    return {
      city: preference.current_city,
      district: preference.current_district,
      source: "current",
      pending_city: preference.pending_city,
      pending_district: preference.pending_district,
      pending_effective_date: preference.pending_effective_date,
    };
  }

  return {
    city: null,
    district: null,
    source: "none",
    pending_city: preference.pending_city,
    pending_district: preference.pending_district,
    pending_effective_date: preference.pending_effective_date,
  };
}

export function planRegionChange(input: {
  existing: MemberRadarRegionPreference | null;
  member_id: string;
  city: string;
  district: string | null;
  now?: Date;
}): MemberRadarRegionPreference {
  const now = input.now ?? new Date();
  const tomorrow = nextTaipeiCalendarDate(now);
  const updated_at = now.toISOString();

  if (!input.existing?.current_city) {
    return {
      member_id: input.member_id,
      current_city: input.city,
      current_district: input.district,
      pending_city: null,
      pending_district: null,
      pending_effective_date: null,
      updated_at,
    };
  }

  const sameAsCurrent =
    input.existing.current_city === input.city &&
    (input.existing.current_district ?? null) === (input.district ?? null);

  if (sameAsCurrent) {
    return {
      ...input.existing,
      pending_city: null,
      pending_district: null,
      pending_effective_date: null,
      updated_at,
    };
  }

  return {
    member_id: input.member_id,
    current_city: input.existing.current_city,
    current_district: input.existing.current_district,
    pending_city: input.city,
    pending_district: input.district,
    pending_effective_date: tomorrow,
    updated_at,
  };
}

export function promoteDueRegionPreference(
  preference: MemberRadarRegionPreference,
  runDate: string,
): MemberRadarRegionPreference {
  const effective = resolveEffectiveRadarRegion(preference, runDate);
  if (effective.source !== "pending") return preference;
  return {
    ...preference,
    current_city: effective.city,
    current_district: effective.district,
    pending_city: null,
    pending_district: null,
    pending_effective_date: null,
  };
}

export function regionEquals(
  left: { city: string | null; district: string | null } | null,
  right: { city: string | null; district: string | null } | null,
): boolean {
  return (left?.city ?? null) === (right?.city ?? null) && (left?.district ?? null) === (right?.district ?? null);
}
