import { randomUUID } from "node:crypto";
import {
  computeAnalysisInputFingerprint,
  computeCorpusFingerprint,
  shouldReanalyzeLlm,
} from "../analysis/fingerprint";
import { assembleAnalysisScoringInput } from "../extraction/assemble-analysis-scoring-input";
import { validateAiRadarExtraction } from "../extraction/validate-ai-radar-extraction";
import type { CandidateContentCorpus } from "../normalization/schema";
import type { RadarRepository } from "../repository/types";
import { analyzeWithRepair, createAiRadarLlmProvider, type AiRadarLlmProvider } from "./provider";
import { AI_RADAR_MODEL_ID, AI_RADAR_PROMPT_VERSION } from "./prompt";

export type AnalyzeCandidateDecision = {
  reanalyze: boolean;
  analysis_input_fingerprint: string;
  corpus_fingerprint: string;
  cached_analysis_run_id: string | null;
};

export function buildAnalyzeFingerprints(corpus: CandidateContentCorpus) {
  const analyzable = corpus.items
    .filter((item) => item.is_analyzable)
    .map((item) => ({
      normalized_content_id: item.normalized_content_id,
      content_hash: item.content_hash,
    }));

  const corpus_fingerprint = computeCorpusFingerprint({
    analyzable_content: analyzable,
    profile_semantic_hash: null,
  });

  const analysis_input_fingerprint = computeAnalysisInputFingerprint({
    analyzable_content: analyzable,
    profile_semantic_hash: null,
    prompt_version: AI_RADAR_PROMPT_VERSION,
    model_id: AI_RADAR_MODEL_ID,
  });

  return { corpus_fingerprint, analysis_input_fingerprint, analyzable };
}

export async function decideAnalyzeCandidate(
  repo: RadarRepository,
  corpus: CandidateContentCorpus,
): Promise<AnalyzeCandidateDecision> {
  const { corpus_fingerprint, analysis_input_fingerprint } = buildAnalyzeFingerprints(corpus);
  const refresh = await repo.getRefreshState(corpus.candidate_id);
  const cached = await repo.findSuccessfulAnalysisByFingerprint({
    candidate_id: corpus.candidate_id,
    analysis_input_fingerprint,
  });

  if (cached) {
    return {
      reanalyze: false,
      analysis_input_fingerprint,
      corpus_fingerprint,
      cached_analysis_run_id: cached.id,
    };
  }

  const reanalyze = shouldReanalyzeLlm({
    force_reanalysis: refresh?.force_reanalysis ?? false,
    previous_analysis_input_fingerprint: refresh?.validated_extraction_fingerprint ?? null,
    next_analysis_input_fingerprint: analysis_input_fingerprint,
    previous_data_completeness: refresh?.data_completeness ?? null,
    next_data_completeness: corpus.data_completeness,
    corpus_materially_changed:
      Boolean(refresh?.corpus_fingerprint) && refresh?.corpus_fingerprint !== corpus_fingerprint,
    profile_semantic_hash_changed: false,
  });

  return {
    reanalyze,
    analysis_input_fingerprint,
    corpus_fingerprint,
    cached_analysis_run_id: null,
  };
}

export async function runCandidateAnalysis(input: {
  repo: RadarRepository;
  corpus: CandidateContentCorpus;
  normalization_run_id: string;
  provider?: AiRadarLlmProvider;
  referenceDate?: Date;
}) {
  const provider = input.provider ?? createAiRadarLlmProvider();
  const decision = await decideAnalyzeCandidate(input.repo, input.corpus);

  if (!decision.reanalyze && decision.cached_analysis_run_id) {
    const cached = await input.repo.getAnalysisRun(decision.cached_analysis_run_id);
    if (!cached) throw new Error("Cached analysis run missing");
    return { kind: "cache_hit" as const, analysis_run: cached, decision };
  }

  const llm = await analyzeWithRepair(provider, {
    candidate_id: input.corpus.candidate_id,
    corpus: input.corpus,
  });

  const validated = validateAiRadarExtraction(llm.extraction, { corpus: input.corpus });
  if (!validated.success) {
    const failed = await input.repo.insertAnalysisRun({
      id: randomUUID(),
      candidate_id: input.corpus.candidate_id,
      status: "failed",
      analysis_input_fingerprint: decision.analysis_input_fingerprint,
      corpus_fingerprint: decision.corpus_fingerprint,
      profile_semantic_hash: null,
      normalization_run_id: input.normalization_run_id,
      extraction_json: null,
      prompt_version: llm.prompt_version,
      model_id: llm.model_id,
      error_code: "SCHEMA_VALIDATION",
      error_message: validated.issues.map((issue) => issue.message).join("; "),
    });
    return { kind: "failed" as const, analysis_run: failed, decision };
  }

  const analysisRun = await input.repo.insertAnalysisRun({
    id: randomUUID(),
    candidate_id: input.corpus.candidate_id,
    status: "succeeded",
    analysis_input_fingerprint: decision.analysis_input_fingerprint,
    corpus_fingerprint: decision.corpus_fingerprint,
    profile_semantic_hash: null,
    normalization_run_id: input.normalization_run_id,
    extraction_json: validated.data,
    prompt_version: llm.prompt_version,
    model_id: llm.model_id,
  });

  assembleAnalysisScoringInput(validated.data, {
    corpus: input.corpus,
    referenceDate: input.referenceDate,
  });

  await input.repo.updateRefreshStateAfterNormalize({
    candidate_id: input.corpus.candidate_id,
    corpus_fingerprint: decision.corpus_fingerprint,
    profile_semantic_hash: null,
    data_completeness: input.corpus.data_completeness,
    current_analysis_run_id: analysisRun.id,
    validated_extraction_fingerprint: decision.analysis_input_fingerprint,
    now: input.referenceDate ?? new Date(),
  });

  return { kind: "analyzed" as const, analysis_run: analysisRun, decision };
}
