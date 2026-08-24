import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import { readResetSession } from "@/lib/analysis/reset/reset-contract";
import { generateShareCode } from "@/lib/quiz/quiz-service";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { isSocialCrawlerUserAgent } from "@/lib/quiz/partner/quiz-partner-crawler";
import { buildQuizResultShareCopy } from "@/lib/quiz/viral/quiz-result-share-copy";
import {
  mapQuizResultShareRow,
  resolveActiveResultShare,
  type QuizResultShareRecord,
} from "@/lib/quiz/viral/quiz-result-share-lookup";

export { resolveActiveResultShare, type QuizResultShareRecord } from "@/lib/quiz/viral/quiz-result-share-lookup";

export const RESULT_SHARE_EVENTS = [
  "result_reveal_viewed",
  "result_share_clicked",
  "native_share_completed",
  "result_share_fallback_saved",
] as const;

export type ResultShareEvent = (typeof RESULT_SHARE_EVENTS)[number];

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

async function mintUniqueResultShareCode(): Promise<string> {
  const supabase = requireService();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateShareCode();
    const { data: resultHit } = await supabase
      .from("quiz_result_shares")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (resultHit) continue;
    const { data: partnerHit } = await supabase
      .from("quiz_share_links")
      .select("id")
      .eq("share_code", code)
      .maybeSingle();
    if (partnerHit) continue;
    return code;
  }
  throw new AnalysisSessionError("Could not mint a result share code.", 500, "code_mint_failed");
}

export async function getOrCreateResultShareForSession(input: {
  analysisSessionId: string;
  answersJson: Record<string, unknown> | null;
}): Promise<QuizResultShareRecord> {
  const supabase = requireService();
  const { data: existing } = await supabase
    .from("quiz_result_shares")
    .select("*")
    .eq("source_analysis_session_id", input.analysisSessionId)
    .maybeSingle();
  if (existing) return mapQuizResultShareRow(existing);

  const reset = readResetSession(input.answersJson);
  const animalType = reset?.animal?.type ?? reset?.quiz.result?.primaryType ?? null;
  if (!animalType || !reset || reset.act === "quiz") {
    throw new AnalysisSessionError("Result is not ready to share.", 409, "reveal_required");
  }

  const code = await mintUniqueResultShareCode();
  const { data, error } = await supabase
    .from("quiz_result_shares")
    .insert({
      code,
      source_analysis_session_id: input.analysisSessionId,
      source_customer_id: null,
      source_owner_member_id: null,
      animal_type: animalType,
    })
    .select("*")
    .single();

  if (error && /duplicate|unique/i.test(error.message)) {
    const { data: raced } = await supabase
      .from("quiz_result_shares")
      .select("*")
      .eq("source_analysis_session_id", input.analysisSessionId)
      .maybeSingle();
    if (raced) return mapQuizResultShareRow(raced);
  }
  if (error || !data) {
    throw new AnalysisSessionError(error?.message || "Failed to create result share.", 500, "create_failed");
  }
  return mapQuizResultShareRow(data);
}

export function publicResultSharePayload(share: QuizResultShareRecord) {
  const copy = buildQuizResultShareCopy(share.animalType);
  return {
    code: share.code,
    animalType: share.animalType,
    animalName: copy.animalName,
    personality: copy.personality,
    shareTitle: copy.shareTitle,
    shareText: copy.shareText,
  };
}

export async function recordResultShareEvent(input: {
  resultShareId: string;
  analysisSessionId?: string | null;
  event: ResultShareEvent;
}): Promise<{ recorded: boolean }> {
  if (!RESULT_SHARE_EVENTS.includes(input.event)) {
    return { recorded: false };
  }
  const supabase = requireService();
  try {
    const { error } = await supabase.from("quiz_result_share_events").insert({
      result_share_id: input.resultShareId,
      analysis_session_id: input.analysisSessionId ?? null,
      event: input.event,
    });
    if (error && input.event === "result_reveal_viewed" && /unique|duplicate/i.test(error.message)) {
      return { recorded: true };
    }
    return { recorded: !error };
  } catch {
    return { recorded: false };
  }
}

export async function recordResultShareLandingView(input: {
  code: string;
  userAgent?: string | null;
  humanHeader?: string | null;
}): Promise<{ recorded: boolean }> {
  if (isSocialCrawlerUserAgent(input.userAgent)) {
    return { recorded: false };
  }
  if (input.humanHeader !== "1") {
    return { recorded: false };
  }
  const share = await resolveActiveResultShare(input.code);
  if (!share) return { recorded: false };
  const supabase = requireService();
  try {
    const { error } = await supabase.from("quiz_result_share_views").insert({
      result_share_id: share.id,
    });
    return { recorded: !error };
  } catch {
    return { recorded: false };
  }
}
