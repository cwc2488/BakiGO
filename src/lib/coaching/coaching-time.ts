const COACHING_TIMEZONE = "Asia/Taipei";

export function coachingTodayLogDate(timeZone = COACHING_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function coachingTimezoneLabel(): string {
  return COACHING_TIMEZONE;
}
