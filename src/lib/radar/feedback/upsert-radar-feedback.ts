import { randomUUID } from "node:crypto";
import { resolveDailyPipelineRunDate } from "../pipeline/run-date";
import { whyFromExtractionForFeedback } from "./why-shown";
import type { RadarRepository } from "../repository/types";
import { buildRadarFeedbackEvaluationContext } from "./evaluation-context";
import {
  isRadarFeedbackValue,
  isRadarRejectionReason,
  type MemberRadarRecommendationFeedback,
  type RadarFeedbackValue,
  type RadarRejectionReason,
} from "./types";

export type UpsertRadarFeedbackResult =
  | {
      ok: true;
      feedback: MemberRadarRecommendationFeedback;
      today_snapshot_unchanged: true;
    }
  | {
      ok: false;
      error: string;
      status: 400 | 403 | 404;
    };

export async function upsertRadarFeedback(input: {
  repo: RadarRepository;
  member_id: string;
  candidate_id: string;
  feedback: string;
  rejection_reason?: string | null;
  optional_note?: string | null;
  now?: Date;
}): Promise<UpsertRadarFeedbackResult> {
  if (!isRadarFeedbackValue(input.feedback)) {
    return { ok: false, error: "feedback 必須是值得開發或不值得開發", status: 400 };
  }
  const feedback = input.feedback as RadarFeedbackValue;

  let rejection_reason: RadarRejectionReason | null = null;
  let optional_note: string | null = null;

  if (feedback === "not_worth_developing") {
    const reason = input.rejection_reason?.trim() ?? "";
    if (!isRadarRejectionReason(reason)) {
      return { ok: false, error: "請選擇不值得開發的原因", status: 400 };
    }
    rejection_reason = reason;
    if (reason === "other") {
      const note = input.optional_note?.trim() ?? "";
      optional_note = note.length > 0 ? note.slice(0, 200) : null;
    }
  }

  const now = input.now ?? new Date();
  const recommendation_date = resolveDailyPipelineRunDate({ now });
  const snapshot = await input.repo.getMemberDailyTop20(input.member_id, recommendation_date);
  if (!snapshot) {
    return { ok: false, error: "今天還沒有你的推薦名單", status: 404 };
  }
  const onSnapshot = snapshot.items.some((item) => item.candidateId === input.candidate_id);
  if (!onSnapshot) {
    return { ok: false, error: "這位不在你今天的推薦名單", status: 403 };
  }

  const existing = await input.repo.getMemberRadarRecommendationFeedback({
    member_id: input.member_id,
    candidate_id: input.candidate_id,
    recommendation_date,
  });

  const scores = await input.repo.listMemberScoreSnapshots({
    member_id: input.member_id,
    snapshot_date: recommendation_date,
  });
  const score = scores.find((row) => row.candidate_id === input.candidate_id) ?? null;
  const analysis = score?.analysis_run_id
    ? await input.repo.getAnalysisRun(score.analysis_run_id)
    : null;
  const extraction = analysis?.status === "succeeded" ? analysis.extraction_json : null;
  const why = extraction ? whyFromExtractionForFeedback(extraction) : [];
  const recommendation_reason_shown = why[0] ?? null;

  const evaluation_context =
    existing?.evaluation_context ??
    buildRadarFeedbackEvaluationContext({
      pipeline_run_id: snapshot.pipeline_run_id,
      overall_score: score?.overall_score ?? null,
      recommendation_reason_shown,
      prompt_version: analysis?.prompt_version ?? null,
      extraction,
      location_level: score?.location_level ?? null,
    });

  const updated_at = now.toISOString();
  const row: MemberRadarRecommendationFeedback = {
    id: existing?.id ?? randomUUID(),
    member_id: input.member_id,
    candidate_id: input.candidate_id,
    recommendation_date,
    feedback,
    rejection_reason,
    optional_note,
    evaluation_context,
    created_at: existing?.created_at ?? updated_at,
    updated_at,
  };

  const saved = await input.repo.upsertMemberRadarRecommendationFeedback(row);
  return { ok: true, feedback: saved, today_snapshot_unchanged: true };
}

export async function listMemberRadarFeedbackForDate(input: {
  repo: RadarRepository;
  member_id: string;
  recommendation_date: string;
}): Promise<MemberRadarRecommendationFeedback[]> {
  return input.repo.listMemberRadarRecommendationFeedback({
    member_id: input.member_id,
    recommendation_date: input.recommendation_date,
  });
}
