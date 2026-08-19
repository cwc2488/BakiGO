import { RESET_META_KEY } from "@/lib/analysis/reset/reset-path";
import {
  formatFunnelRate,
  rangeStartIso,
  type QuizPartnerRange,
} from "@/lib/quiz/partner/quiz-partner-presentation";
import { getOrCreatePermanentShareLink } from "@/lib/quiz/quiz-service";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import { isSocialCrawlerUserAgent } from "@/lib/quiz/partner/quiz-partner-crawler";

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

function inRange(iso: string, startIso: string | null): boolean {
  if (!startIso) return true;
  return iso >= startIso;
}

export type QuizPartnerFunnel = {
  range: QuizPartnerRange;
  sources: {
    humanViews: "quiz_partner_landing_views (client POST, crawler UA rejected)";
    quizStarted: "analysis_sessions created, attributed to this member";
    quizCompleted: "analysis_sessions __resetV1 act beyond quiz, or quiz.result present";
    reportReady: "analysis_sessions __resetV1.report present";
    interested21d: "experience_21d_interests owned by this member";
    joined: "experience_21d_interests status = joined";
  };
  counts: {
    humanViews: number;
    quizStarted: number;
    quizCompleted: number;
    reportReady: number;
    interested21d: number;
    joined: number;
  };
  rates: {
    quizComplete: string;
    reportTo21d: string;
    interestToJoined: string;
  };
};

export async function recordPartnerLandingView(input: {
  shareCode: string;
  userAgent?: string | null;
  humanHeader?: string | null;
}): Promise<{ recorded: boolean }> {
  if (isSocialCrawlerUserAgent(input.userAgent)) {
    return { recorded: false };
  }
  if (input.humanHeader !== "1") {
    return { recorded: false };
  }
  const code = input.shareCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{5,7}$/.test(code)) {
    return { recorded: false };
  }
  const supabase = requireService();
  const { data } = await supabase
    .from("quiz_share_links")
    .select("owner_member_id, share_code")
    .eq("share_code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (!data?.owner_member_id) {
    return { recorded: false };
  }
  try {
    const { error } = await supabase.from("quiz_partner_landing_views").insert({
      owner_member_id: data.owner_member_id,
      share_code: data.share_code,
    });
    return { recorded: !error };
  } catch {
    return { recorded: false };
  }
}

export async function getPartnerQuizFunnel(
  ownerMemberId: string,
  range: QuizPartnerRange = "month",
): Promise<QuizPartnerFunnel> {
  const supabase = requireService();
  const start = rangeStartIso(range);
  const share = await getOrCreatePermanentShareLink(ownerMemberId);
  const { data: links } = await supabase
    .from("quiz_share_links")
    .select("share_code")
    .eq("owner_member_id", ownerMemberId)
    .eq("is_active", true);
  const codes = (links ?? []).map((row) => String(row.share_code));
  if (!codes.includes(share.shareCode)) codes.push(share.shareCode);

  const { data: growthShares } = await supabase
    .from("growth_shares")
    .select("id")
    .eq("owner_member_id", ownerMemberId);
  const growthIds = (growthShares ?? []).map((row) => String(row.id));

  let viewsQuery = supabase
    .from("quiz_partner_landing_views")
    .select("id", { count: "exact", head: true })
    .eq("owner_member_id", ownerMemberId);
  if (start) viewsQuery = viewsQuery.gte("created_at", start);
  const views = await viewsQuery;
  const humanViews = views.error ? 0 : (views.count ?? 0);

  const { data: byReferrer } = await supabase
    .from("analysis_sessions")
    .select("id, created_at, answers_json, referrer_member_id, quiz_share_code, growth_share_id")
    .eq("referrer_member_id", ownerMemberId);
  const { data: byCode } =
    codes.length > 0
      ? await supabase
          .from("analysis_sessions")
          .select("id, created_at, answers_json, referrer_member_id, quiz_share_code, growth_share_id")
          .in("quiz_share_code", codes)
      : { data: [] };
  const { data: byGrowth } =
    growthIds.length > 0
      ? await supabase
          .from("analysis_sessions")
          .select("id, created_at, answers_json, referrer_member_id, quiz_share_code, growth_share_id")
          .in("growth_share_id", growthIds)
      : { data: [] };

  const sessions = new Map<string, { created_at: string; answers_json: Record<string, unknown> | null }>();
  for (const row of [...(byReferrer ?? []), ...(byCode ?? []), ...(byGrowth ?? [])]) {
    if (!inRange(String(row.created_at), start)) continue;
    sessions.set(String(row.id), {
      created_at: String(row.created_at),
      answers_json: (row.answers_json as Record<string, unknown> | null) ?? null,
    });
  }

  let quizCompleted = 0;
  let reportReady = 0;
  for (const session of sessions.values()) {
    const reset = readReset(session.answers_json);
    const completed = Boolean(
      reset && (reset.act === "reveal" || reset.act === "conversation" || reset.act === "report" || reset.quiz?.result),
    );
    if (completed) quizCompleted += 1;
    if (reset?.report || reset?.act === "report") reportReady += 1;
  }

  let interestsQuery = supabase
    .from("experience_21d_interests")
    .select("id, status, created_at")
    .eq("owner_member_id", ownerMemberId)
    .is("archived_at", null);
  if (start) interestsQuery = interestsQuery.gte("created_at", start);
  const { data: interests } = await interestsQuery;
  const interestRows = interests ?? [];
  const joined = interestRows.filter((row) => row.status === "joined").length;

  const counts = {
    humanViews,
    quizStarted: sessions.size,
    quizCompleted,
    reportReady,
    interested21d: interestRows.length,
    joined,
  };

  return {
    range,
    sources: {
      humanViews: "quiz_partner_landing_views (client POST, crawler UA rejected)",
      quizStarted: "analysis_sessions created, attributed to this member",
      quizCompleted: "analysis_sessions __resetV1 act beyond quiz, or quiz.result present",
      reportReady: "analysis_sessions __resetV1.report present",
      interested21d: "experience_21d_interests owned by this member",
      joined: "experience_21d_interests status = joined",
    },
    counts,
    rates: {
      quizComplete: formatFunnelRate(counts.quizCompleted, counts.quizStarted),
      reportTo21d: formatFunnelRate(counts.interested21d, counts.reportReady),
      interestToJoined: formatFunnelRate(counts.joined, counts.interested21d),
    },
  };
}
