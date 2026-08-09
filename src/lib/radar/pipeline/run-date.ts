const TAIPEI_TIMEZONE = "Asia/Taipei";

export function formatRunDateInTimezone(date: Date, timezone = TAIPEI_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function resolveDailyPipelineRunDate(input?: {
  run_date?: string;
  now?: Date;
  timezone?: string;
}): string {
  if (input?.run_date) return input.run_date;
  return formatRunDateInTimezone(input?.now ?? new Date(), input?.timezone ?? TAIPEI_TIMEZONE);
}
