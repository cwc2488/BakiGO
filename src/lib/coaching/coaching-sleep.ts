/** Normalize Postgres time ("HH:MM:SS") or input ("HH:MM") to minutes from midnight. */
export function parseClockTimeToMinutes(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/** Minutes from midnight → "HH:MM" for `<input type="time">`. */
export function formatMinutesToClockTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeClockTimeInput(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  const minutes = parseClockTimeToMinutes(value);
  if (minutes == null) {
    return null;
  }
  return formatMinutesToClockTime(minutes);
}

/** Cross-midnight safe: 23:30 → 07:00 = 7h30m; 00:30 → 07:30 = 7h. */
export function calculateSleepDurationMinutes(bedtime: string, wakeTime: string): number | null {
  const bedMinutes = parseClockTimeToMinutes(bedtime);
  const wakeMinutes = parseClockTimeToMinutes(wakeTime);
  if (bedMinutes == null || wakeMinutes == null) {
    return null;
  }

  let end = wakeMinutes;
  if (end <= bedMinutes) {
    end += 24 * 60;
  }

  const duration = end - bedMinutes;
  if (duration <= 0 || duration > 24 * 60) {
    return null;
  }

  return duration;
}

export function formatSleepDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}小時`;
  }
  return `${hours}小時${minutes}分`;
}

export function computeSleepDurationLabel(bedtime: string, wakeTime: string): string | null {
  const minutes = calculateSleepDurationMinutes(bedtime, wakeTime);
  if (minutes == null) {
    return null;
  }
  return formatSleepDurationMinutes(minutes);
}

export function formatSleepTimeRange(bedtime: string | null, wakeTime: string | null): string | null {
  if (!bedtime || !wakeTime) {
    return null;
  }
  return `${bedtime} → ${wakeTime}`;
}
