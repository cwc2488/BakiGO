import { randomUUID } from "node:crypto";
import { buildCanonicalFingerprints, shouldReanalyzeLlm } from "../analysis/fingerprint";
import { assembleAnalysisScoringInput } from "../extraction/assemble-analysis-scoring-input";
import {
  applyExtractionConformance,
  type ConformanceAction,
} from "../extraction/extraction-conformance";
import {
  validateAiRadarExtraction,
  type ValidationIssue,
  type ValidationResult,
} from "../extraction/validate-ai-radar-extraction";
import type { CandidateContentCorpus } from "../normalization/schema";
import type { RadarRepository } from "../repository/types";
import {
  analyzeWithRepair,
  createAiRadarLlmProvider,
  type AiRadarLlmProvider,
  type LlmAnalyzeResult,
  type LlmUsage,
} from "./provider";
import { AI_RADAR_MODEL_ID, AI_RADAR_PROMPT_VERSION } from "./prompt";

/** A forbidden score/rank field is a policy breach, not a shape slip: never re-ask. */
function isRepairable(issues: ValidationIssue[]): boolean {
  return issues.every((issue) => issue.code !== "FORBIDDEN_SCORE_FIELD");
}

function conformAndValidate(
  llm: LlmAnalyzeResult,
  corpus: CandidateContentCorpus,
): { validated: ValidationResult; actions: ConformanceAction[] } {
  const conformed = applyExtractionConformance(llm.extraction, { corpus });
  return {
    validated: validateAiRadarExtraction(conformed.data, { corpus }),
    actions: conformed.actions,
  };
}

export type AnalyzeCandidateDecision = {
  reanalyze: boolean;
  analysis_input_fingerprint: string;
  corpus_fingerprint: string;
  cached_analysis_run_id: string | null;
};

export function buildAnalyzeFingerprints(
  corpus: CandidateContentCorpus,
  profile_semantic_hash: string | null = null,
) {
  return buildCanonicalFingerprints({
    corpus,
    profile_semantic_hash,
    prompt_version: AI_RADAR_PROMPT_VERSION,
    model_id: AI_RADAR_MODEL_ID,
  });
}

export async function decideAnalyzeCandidate(
  repo: RadarRepository,
  corpus: CandidateContentCorpus,
): Promise<AnalyzeCandidateDecision> {
  const profile_semantic_hash =
    (await repo.getCandidate(corpus.candidate_id))?.profile_semantic_hash ?? null;
  const { corpus_fingerprint, analysis_input_fingerprint } = buildAnalyzeFingerprints(
    corpus,
    profile_semantic_hash,
  );
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
    return { kind: "cache_hit" as const, analysis_run: cached, decision, telemetry: null };
  }

  let llm;
  try {
    llm = await analyzeWithRepair(provider, {
      candidate_id: input.corpus.candidate_id,
      corpus: input.corpus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM analyze failed";
    const failed = await input.repo.insertAnalysisRun({
      id: randomUUID(),
      candidate_id: input.corpus.candidate_id,
      status: "failed",
      analysis_input_fingerprint: decision.analysis_input_fingerprint,
      corpus_fingerprint: decision.corpus_fingerprint,
      profile_semantic_hash: null,
      normalization_run_id: input.normalization_run_id,
      extraction_json: null,
      prompt_version: AI_RADAR_PROMPT_VERSION,
      model_id: AI_RADAR_MODEL_ID,
      error_code: message.includes("OPENAI_STRUCTURED_OUTPUTS_UNSUPPORTED")
        ? "STRUCTURED_OUTPUTS_UNSUPPORTED"
        : "LLM_UPSTREAM",
      error_message: message,
    });
    return { kind: "failed" as const, analysis_run: failed, decision, telemetry: null };
  }

  let attempt = conformAndValidate(llm, input.corpus);
  const conformanceActions = new Set<ConformanceAction>(attempt.actions);
  const usage: LlmUsage[] = llm.usage ? [llm.usage] : [];
  let openaiCalls = 1;
  let repairAttempted = false;

  if (!attempt.validated.success && isRepairable(attempt.validated.issues)) {
    repairAttempted = true;
    const issues = attempt.validated.issues.map(
      (issue) => `${issue.path}: ${issue.message}`,
    );
    try {
      const repairLlm = await provider.analyze({
        candidate_id: input.corpus.candidate_id,
        corpus: input.corpus,
        repair: { issues },
      });
      openaiCalls += 1;
      if (repairLlm.usage) usage.push(repairLlm.usage);
      const repaired = conformAndValidate(repairLlm, input.corpus);
      for (const action of repaired.actions) conformanceActions.add(action);
      if (repaired.validated.success) {
        llm = { ...repairLlm, repaired: true };
        attempt = repaired;
      }
    } catch {
      // A failed repair stays failed: no fixture, no fallback content.
    }
  }

  const telemetry = {
    openai_calls: openaiCalls,
    repair_attempted: repairAttempted,
    repair_succeeded: repairAttempted && attempt.validated.success,
    conformance_actions: [...conformanceActions],
    usage,
  };

  const validated = attempt.validated;
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
    return { kind: "failed" as const, analysis_run: failed, decision, telemetry };
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

  return { kind: "analyzed" as const, analysis_run: analysisRun, decision, telemetry };
}
