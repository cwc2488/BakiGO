import { RESET_META_KEY } from "@/lib/analysis/reset/reset-path";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";

type ResetPacked = {
  act?: string;
  quiz?: { result?: unknown };
  report?: unknown;
};

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new AnalysisSessionError("Analysis service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

function readReset(answers: Record<string, unknown> | null): ResetPacked | null {
  const packed = answers?.[RESET_META_KEY];
  if (!packed || typeof packed !== "object") return null;
  return packed as ResetPacked;
}

export type ResultShareFunnel = {
  resultShareId: string;
  code: string;
  animalType: string;
  sources: {
    shareClicked: "quiz_result_share_events result_share_clicked";
    nativeShareCompleted: "quiz_result_share_events native_share_completed (share sheet resolved, not Instagram posted)";
    fallbackSaved: "quiz_result_share_events result_share_fallback_saved";
    humanViews: "quiz_result_share_views (client POST, crawler UA rejected)";
    quizStarted: "analysis_sessions.result_share_id";
    quizCompleted: "analysis_sessions __resetV1 act beyond quiz, or quiz.result present";
    reportReady: "analysis_sessions __resetV1.report present";
    interested21d: "experience_21d_interests on attributed sessions";
  };
  counts: {
    shareClicked: number;
    nativeShareCompleted: number;
    fallbackSaved: number;
    humanViews: number;
    quizStarted: number;
    quizCompleted: number;
    reportReady: number;
    interested21d: number;
  };
};

function countEvents(
  rows: Array<{ event: string }> | null,
  event: string,
): number {
  return (rows ?? []).filter((row) => row.event === event).length;
}

export async function getResultShareFunnel(resultShareId: string): Promise<ResultShareFunnel | null> {
  const supabase = requireService();
  const { data: share } = await supabase
    .from("quiz_result_shares")
    .select("id, code, animal_type")
    .eq("id", resultShareId)
    .maybeSingle();
  if (!share) return null;

  const { data: events } = await supabase
    .from("quiz_result_share_events")
    .select("event")
    .eq("result_share_id", resultShareId);

  const views = await supabase
    .from("quiz_result_share_views")
    .select("id", { count: "exact", head: true })
    .eq("result_share_id", resultShareId);

  const { data: sessions } = await supabase
    .from("analysis_sessions")
    .select("id, answers_json")
    .eq("result_share_id", resultShareId);

  const sessionRows = sessions ?? [];
  let quizCompleted = 0;
  let reportReady = 0;
  for (const session of sessionRows) {
    const reset = readReset((session.answers_json as Record<string, unknown> | null) ?? null);
    const completed = Boolean(
      reset && (reset.act === "reveal" || reset.act === "conversation" || reset.act === "report" || reset.quiz?.result),
    );
    if (completed) quizCompleted += 1;
    if (reset?.report || reset?.act === "report") reportReady += 1;
  }

  const sessionIds = sessionRows.map((row) => String(row.id));
  let interested21d = 0;
  if (sessionIds.length > 0) {
    const { count } = await supabase
      .from("experience_21d_interests")
      .select("id", { count: "exact", head: true })
      .in("analysis_session_id", sessionIds)
      .is("archived_at", null);
    interested21d = count ?? 0;
  }

  return {
    resultShareId: String(share.id),
    code: String(share.code),
    animalType: String(share.animal_type),
    sources: {
      shareClicked: "quiz_result_share_events result_share_clicked",
      nativeShareCompleted:
        "quiz_result_share_events native_share_completed (share sheet resolved, not Instagram posted)",
      fallbackSaved: "quiz_result_share_events result_share_fallback_saved",
      humanViews: "quiz_result_share_views (client POST, crawler UA rejected)",
      quizStarted: "analysis_sessions.result_share_id",
      quizCompleted: "analysis_sessions __resetV1 act beyond quiz, or quiz.result present",
      reportReady: "analysis_sessions __resetV1.report present",
      interested21d: "experience_21d_interests on attributed sessions",
    },
    counts: {
      shareClicked: countEvents(events, "result_share_clicked"),
      nativeShareCompleted: countEvents(events, "native_share_completed"),
      fallbackSaved: countEvents(events, "result_share_fallback_saved"),
      humanViews: views.error ? 0 : (views.count ?? 0),
      quizStarted: sessionRows.length,
      quizCompleted,
      reportReady,
      interested21d,
    },
  };
}

/** Pure helper for tests: derive funnel counts from already-loaded rows. */
export function deriveResultShareFunnelCounts(input: {
  events: Array<{ event: string }>;
  humanViews: number;
  sessions: Array<{ answers_json: Record<string, unknown> | null }>;
  interestSessionIds: string[];
  sessionIds: string[];
}): ResultShareFunnel["counts"] {
  let quizCompleted = 0;
  let reportReady = 0;
  for (const session of input.sessions) {
    const reset = readReset(session.answers_json);
    const completed = Boolean(
      reset && (reset.act === "reveal" || reset.act === "conversation" || reset.act === "report" || reset.quiz?.result),
    );
    if (completed) quizCompleted += 1;
    if (reset?.report || reset?.act === "report") reportReady += 1;
  }
  const idSet = new Set(input.sessionIds);
  return {
    shareClicked: countEvents(input.events, "result_share_clicked"),
    nativeShareCompleted: countEvents(input.events, "native_share_completed"),
    fallbackSaved: countEvents(input.events, "result_share_fallback_saved"),
    humanViews: input.humanViews,
    quizStarted: input.sessions.length,
    quizCompleted,
    reportReady,
    interested21d: input.interestSessionIds.filter((id) => idSet.has(id)).length,
  };
}
