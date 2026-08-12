import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { isAllowedCoachingLogDate } from "@/lib/coaching/coaching-time";

export function requireAllowedCoachingLogDate(logDate: string): string {
  if (!isAllowedCoachingLogDate(logDate)) {
    throw new CoachingServiceError("只能回報最近 3 天（今天、昨天、前天）。", 400);
  }
  return logDate;
}
