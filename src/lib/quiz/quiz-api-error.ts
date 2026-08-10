import { SupabaseServiceConfigError } from "@/lib/supabase/service-client";

export function toQuizApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SupabaseServiceConfigError) {
    return error.message;
  }

  if (error instanceof TypeError && error.message.includes("ByteString")) {
    return "Quiz service configuration is invalid. Check SUPABASE_SERVICE_ROLE_KEY uses the JWT from Supabase Settings > API.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
