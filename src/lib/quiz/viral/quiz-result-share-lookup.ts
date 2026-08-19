import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import { normalizeResultShareCode } from "@/lib/quiz/viral/quiz-result-share-codes";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export type QuizResultShareRecord = {
  id: string;
  code: string;
  sourceAnalysisSessionId: string;
  sourceCustomerId: string | null;
  sourceOwnerMemberId: string | null;
  animalType: PersonalityType;
  createdAt: string;
  disabledAt: string | null;
};

export function mapQuizResultShareRow(row: {
  id: string;
  code: string;
  source_analysis_session_id: string;
  source_customer_id: string | null;
  source_owner_member_id: string | null;
  animal_type: string;
  created_at: string;
  disabled_at: string | null;
}): QuizResultShareRecord {
  return {
    id: row.id,
    code: row.code,
    sourceAnalysisSessionId: row.source_analysis_session_id,
    sourceCustomerId: row.source_customer_id,
    sourceOwnerMemberId: row.source_owner_member_id,
    animalType: row.animal_type as PersonalityType,
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
  };
}

export async function resolveActiveResultShare(
  code: string | null | undefined,
): Promise<QuizResultShareRecord | null> {
  const normalized = normalizeResultShareCode(code);
  if (!normalized) return null;
  if (!isSupabaseServiceConfigured()) return null;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("quiz_result_shares")
    .select("*")
    .eq("code", normalized)
    .is("disabled_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return mapQuizResultShareRow(data);
}
