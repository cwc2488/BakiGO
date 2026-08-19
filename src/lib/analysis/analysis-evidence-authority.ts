import type { AnalysisAiInputSnapshot } from "@/lib/analysis/analysis-ai-schema";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";
import { compactQuizHistory, type DynamicQuizState } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";
import {
  activeNarrativeAuthority,
  applyInterviewCorrectionsFromTranscript,
  discardedHypotheses,
  ensureQuizPriorHypotheses,
  isExplicitCorrection,
  liveHypotheses,
  sanitizeQuizPriorForLayer2,
} from "@/lib/analysis/dynamic-quiz/quiz-prior-lifecycle";

export type EvidenceAuthorityItem = {
  source: "direct_interview_fact" | "confirmed_interview_synthesis" | "quiz_answer" | "quiz_hypothesis";
  text: string;
  field?: string;
};

export type EvidenceAuthorityBundle = {
  confirmed: EvidenceAuthorityItem[];
  unresolved: string[];
  rejectedOrSuperseded: Array<{ claim: string; kind: string; status: string; formerRole?: string }>;
  quizOnlyPrior: Array<{ claim: string; kind: string; status: string }>;
};

function knowledgeFields(understanding: unknown): Array<{ field: string; value: string; kind: string }> {
  if (!understanding || typeof understanding !== "object") return [];
  const out: Array<{ field: string; value: string; kind: string }> = [];
  for (const [field, raw] of Object.entries(understanding as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || !("kind" in raw) || !("value" in raw)) continue;
    const value = String((raw as { value?: unknown }).value ?? "").trim();
    const kind = String((raw as { kind?: unknown }).kind ?? "");
    if (!value) continue;
    out.push({ field, value: value.slice(0, 180), kind });
  }
  return out;
}

function interviewHypotheses(understanding: unknown): Array<{ claim: string; status: string }> {
  if (!understanding || typeof understanding !== "object") return [];
  const list = (understanding as { hypotheses?: unknown }).hypotheses;
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const claim = String((row as { claim?: unknown }).claim ?? "").trim();
      const status = String((row as { status?: unknown }).status ?? "");
      if (!claim) return null;
      return { claim: claim.slice(0, 180), status };
    })
    .filter((row): row is { claim: string; status: string } => Boolean(row));
}

export function buildEvidenceAuthority(input: {
  prior: QuizPrior | null | undefined;
  understanding?: unknown;
  interviewTranscript?: Array<{ role: string; text: string }>;
}): EvidenceAuthorityBundle {
  const prior = input.prior ? ensureQuizPriorHypotheses(input.prior) : null;
  const confirmed: EvidenceAuthorityItem[] = [];
  const unresolved: string[] = [...(prior?.unresolved ?? [])];

  for (const field of knowledgeFields(input.understanding)) {
    if (field.kind === "fact") {
      confirmed.push({ source: "direct_interview_fact", text: field.value, field: field.field });
    }
  }

  for (const hyp of interviewHypotheses(input.understanding)) {
    if (hyp.status === "confirmed") {
      confirmed.push({ source: "confirmed_interview_synthesis", text: hyp.claim });
    } else if (hyp.status === "proposed") {
      unresolved.push(hyp.claim);
    }
  }

  for (const turn of input.interviewTranscript ?? []) {
    if (turn.role !== "user") continue;
    if (isExplicitCorrection(turn.text)) {
      confirmed.push({
        source: "direct_interview_fact",
        text: turn.text.slice(0, 180),
        field: "explicit_correction",
      });
    }
  }

  const rejectedOrSuperseded = discardedHypotheses(prior).map((h) => ({
    claim: h.claim,
    kind: h.kind,
    status: h.status,
    formerRole: h.kind === "motivation" ? "primary_motivation" : h.kind,
  }));

  const quizOnlyPrior = liveHypotheses(prior)
    .filter((h) => !h.id.startsWith("narr_"))
    .map((h) => ({
      claim: h.claim,
      kind: h.kind,
      status: h.status,
    }));

  const seen = new Set<string>();
  const uniqueConfirmed = confirmed.filter((item) => {
    const key = `${item.source}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    confirmed: uniqueConfirmed.slice(0, 16),
    unresolved: [...new Set(unresolved)].slice(0, 8),
    rejectedOrSuperseded: rejectedOrSuperseded.slice(0, 10),
    quizOnlyPrior: quizOnlyPrior.slice(0, 10),
  };
}

export function buildNativeLayer2DynamicContext(input: {
  quizState?: DynamicQuizState | null;
  interviewState?: {
    understanding?: unknown;
    turns?: Array<{ role: string; text: string }>;
  } | null;
  extra?: Partial<NonNullable<AnalysisAiInputSnapshot["dynamicContext"]>>;
}): NonNullable<AnalysisAiInputSnapshot["dynamicContext"]> {
  const transcript = (input.interviewState?.turns ?? []).map((t) => ({ role: t.role, text: t.text }));
  const corrected = applyInterviewCorrectionsFromTranscript(
    input.quizState?.prior ?? null,
    transcript,
    input.quizState?.correctionEvents,
  );
  const prior = corrected.prior;
  const understanding = input.extra?.understanding ?? input.interviewState?.understanding;
  const evidenceAuthority = buildEvidenceAuthority({
    prior,
    understanding,
    interviewTranscript: transcript,
  });
  const active = activeNarrativeAuthority(corrected.events);
  return {
    primaryBranch: input.extra?.primaryBranch ?? null,
    completedSlots: input.extra?.completedSlots ?? [],
    activeBranches: input.extra?.activeBranches ?? [],
    reflections: input.extra?.reflections ?? [],
    derivedFacts: input.extra?.derivedFacts ?? [],
    understanding: understanding as NonNullable<AnalysisAiInputSnapshot["dynamicContext"]>["understanding"],
    conversationStage: input.extra?.conversationStage,
    quizPrior: prior
      ? {
          unverified: true as const,
          prior: sanitizeQuizPriorForLayer2(prior),
          history: input.quizState ? compactQuizHistory(input.quizState) : [],
        }
      : undefined,
    interviewTranscript: transcript,
    evidenceAuthority,
    narrativeAuthority: {
      active: active
        ? {
            claim: active.new_claim,
            user_text: active.user_text,
            authority: active.authority,
            supersedes_claim_ids: active.supersedes_claim_ids,
          }
        : null,
      superseded: corrected.events
        .filter((e) => e.status === "superseded")
        .map((e) => ({ claim: e.new_claim, user_text: e.user_text })),
    },
  };
}
