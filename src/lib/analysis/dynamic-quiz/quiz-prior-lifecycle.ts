import {
  emptyHypothesisSeq,
  type CorrectionEvent,
  type HypothesisKind,
  type HypothesisLifecycleChange,
  type HypothesisSeq,
  type HypothesisStatus,
  type QuizPrior,
  type QuizPriorClaim,
} from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

const LIVE: HypothesisStatus[] = ["active", "confirmed", "weakened"];
const DEAD: HypothesisStatus[] = ["rejected", "superseded"];

const KIND_PREFIX: Record<HypothesisKind, string> = {
  motivation: "mot",
  barrier: "bar",
  tradeoff: "trd",
  behavior_pattern: "pat",
  readiness: "rdy",
};

const PREFIX_KIND: Record<string, HypothesisKind> = {
  mot: "motivation",
  bar: "barrier",
  trd: "tradeoff",
  pat: "behavior_pattern",
  rdy: "readiness",
};

/** Generic self-correction cues. Linguistic, not topic- or persona-specific. */
export const EXPLICIT_CORRECTION_RE =
  /其實不是|不是因為這個|不是因為|不是沒|不是為了|我比較在意的是|我現在最(怕|在意)|我最怕的是|搞錯了|我講錯|剛才講錯|真正(擔心的是|是)|其實我自己也/;

export function isExplicitCorrection(text: string): boolean {
  return EXPLICIT_CORRECTION_RE.test(text.trim());
}

export function normalizeQuizClaim(
  raw: Partial<QuizPriorClaim> | null | undefined,
  fallbackKind: HypothesisKind,
  fallbackId: string,
): QuizPriorClaim {
  const status = DEAD.includes(raw?.status as HypothesisStatus)
    ? (raw!.status as HypothesisStatus)
    : LIVE.includes(raw?.status as HypothesisStatus)
      ? (raw!.status as HypothesisStatus)
      : "active";
  return {
    id: String(raw?.id || fallbackId).slice(0, 40),
    kind: (raw?.kind as HypothesisKind) || fallbackKind,
    claim: String(raw?.claim || "").slice(0, 180),
    confidence: raw?.confidence === "high" || raw?.confidence === "medium" ? raw.confidence : "low",
    evidence: Array.isArray(raw?.evidence) ? raw.evidence.map((e) => String(e).slice(0, 120)).slice(0, 6) : [],
    status,
  };
}

function normalizeClaimText(claim: string): string {
  return claim.replace(/\s+/g, "").replace(/[，。、．.!?！？]/g, "").toLowerCase();
}

function claimsMatch(a: string, b: string): boolean {
  const na = normalizeClaimText(a);
  const nb = normalizeClaimText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function isProgramId(id: string): boolean {
  return /^(mot|bar|trd|pat|rdy|narr)_\d+$/.test(id);
}

export function seqFromPrior(prior: QuizPrior | null | undefined, existing?: HypothesisSeq): HypothesisSeq {
  const seq = { ...(existing ?? emptyHypothesisSeq()) };
  for (const h of prior?.hypotheses ?? []) {
    const match = /^(mot|bar|trd|pat|rdy)_(\d+)$/.exec(h.id);
    if (!match) continue;
    const kind = PREFIX_KIND[match[1]];
    if (!kind) continue;
    seq[kind] = Math.max(seq[kind], Number(match[2]));
  }
  return seq;
}

export function ensureQuizPriorHypotheses(prior: QuizPrior): QuizPrior {
  const motivation = normalizeQuizClaim(prior.likely_primary_motivation, "motivation", "mot_1");
  const barriers = (prior.likely_barriers ?? []).map((c, i) => normalizeQuizClaim(c, "barrier", `bar_${i + 1}`));
  const tradeoffs = (prior.possible_tradeoffs ?? []).map((c, i) =>
    normalizeQuizClaim(c, "tradeoff", `trd_${i + 1}`),
  );
  const patterns = (prior.possible_behavior_pattern ?? []).map((c, i) =>
    normalizeQuizClaim(c, "behavior_pattern", `pat_${i + 1}`),
  );
  const existing = (prior.hypotheses ?? []).map((c, i) => normalizeQuizClaim(c, c.kind ?? "motivation", `mot_${i + 1}`));
  const seeded = existing.length
    ? existing
    : [motivation, ...barriers, ...tradeoffs, ...patterns].filter((h) => h.claim.trim());
  return {
    ...prior,
    unverified: true,
    likely_primary_motivation: motivation,
    likely_barriers: barriers,
    possible_tradeoffs: tradeoffs,
    possible_behavior_pattern: patterns,
    hypotheses: seeded.slice(0, 10),
  };
}

export function stabilizeQuizPrior(
  incoming: QuizPrior,
  previous: QuizPrior | null | undefined,
  seq: HypothesisSeq,
): { prior: QuizPrior; seq: HypothesisSeq } {
  const raw = ensureQuizPriorHypotheses(incoming);
  const nextSeq: HypothesisSeq = { ...seqFromPrior(previous, seq) };
  const prevHyps = previous?.hypotheses ?? [];
  const used = new Set<string>();

  function assignId(kind: HypothesisKind, claim: string, gptId?: string): string {
    const prev = prevHyps.find((h) => h.kind === kind && claimsMatch(h.claim, claim) && !used.has(h.id));
    if (prev && isProgramId(prev.id)) {
      used.add(prev.id);
      return prev.id;
    }
    if (gptId && isProgramId(gptId) && !used.has(gptId) && prevHyps.some((h) => h.id === gptId && h.kind === kind)) {
      used.add(gptId);
      return gptId;
    }
    nextSeq[kind] += 1;
    const id = `${KIND_PREFIX[kind]}_${nextSeq[kind]}`;
    used.add(id);
    return id;
  }

  const hypotheses = raw.hypotheses.map((h) => ({
    ...h,
    id: assignId(h.kind, h.claim, h.id),
  }));

  const liveMot =
    hypotheses.find((h) => h.kind === "motivation" && LIVE.includes(h.status)) ??
    hypotheses.find((h) => h.kind === "motivation");
  const liveBars = hypotheses.filter((h) => h.kind === "barrier" && LIVE.includes(h.status)).slice(0, 4);
  const liveTrd = hypotheses.filter((h) => h.kind === "tradeoff" && LIVE.includes(h.status)).slice(0, 4);
  const livePat = hypotheses.filter((h) => h.kind === "behavior_pattern" && LIVE.includes(h.status)).slice(0, 4);

  return {
    prior: {
      ...raw,
      hypotheses,
      likely_primary_motivation: liveMot
        ? { ...raw.likely_primary_motivation, ...liveMot, claim: liveMot.claim }
        : { ...raw.likely_primary_motivation, id: assignId("motivation", raw.likely_primary_motivation.claim) },
      likely_barriers: liveBars.length ? liveBars : raw.likely_barriers.map((b) => ({ ...b, id: assignId("barrier", b.claim, b.id) })),
      possible_tradeoffs: liveTrd.length ? liveTrd : raw.possible_tradeoffs,
      possible_behavior_pattern: livePat.length ? livePat : raw.possible_behavior_pattern,
    },
    seq: nextSeq,
  };
}

export function diffHypothesisLifecycle(
  before: QuizPrior | null | undefined,
  after: QuizPrior,
  source: HypothesisLifecycleChange["source"],
  reason: string,
): HypothesisLifecycleChange[] {
  const prev = new Map(
    (before?.hypotheses ?? []).map((h) => [h.id || h.claim, normalizeQuizClaim(h, h.kind ?? "motivation", h.id || h.claim)]),
  );
  const now = new Date().toISOString();
  const changes: HypothesisLifecycleChange[] = [];
  for (const hyp of after.hypotheses ?? []) {
    const previous = prev.get(hyp.id) ?? [...prev.values()].find((h) => h.kind === hyp.kind && claimsMatch(h.claim, hyp.claim));
    if (!previous) {
      changes.push({
        hypothesisId: hyp.id,
        claim: hyp.claim,
        from: "absent",
        to: hyp.status,
        reason,
        source,
        at: now,
      });
      continue;
    }
    if (previous.status !== hyp.status || previous.claim !== hyp.claim) {
      changes.push({
        hypothesisId: previous.id,
        claim: hyp.claim,
        from: previous.status,
        to: hyp.status,
        reason,
        source,
        at: now,
      });
    }
  }
  return changes;
}

function headlineClaimIds(prior: QuizPrior): string[] {
  const ids = [prior.likely_primary_motivation?.id, prior.likely_barriers?.[0]?.id].filter(Boolean) as string[];
  return [...new Set(ids)];
}

function nextCorrId(events: CorrectionEvent[]): string {
  const max = events.reduce((n, e) => {
    const match = /^corr_(\d+)$/.exec(e.id);
    return match ? Math.max(n, Number(match[1])) : n;
  }, 0);
  return `corr_${max + 1}`;
}

function nextNarrId(hypotheses: QuizPriorClaim[]): string {
  const max = hypotheses.reduce((n, h) => {
    const match = /^narr_(\d+)$/.exec(h.id);
    return match ? Math.max(n, Number(match[1])) : n;
  }, 0);
  return `narr_${max + 1}`;
}

/**
 * Latest explicit human correction becomes narrative authority.
 * Headline quiz claims (primary motivation + lead barrier) are superseded as primary.
 * Other confirmed facts/barriers remain as supporting evidence.
 */
export function applyInterviewCorrection(
  prior: QuizPrior | null | undefined,
  userText: string,
  options?: { turn?: string; existingEvents?: CorrectionEvent[] },
): { prior: QuizPrior | null; changes: HypothesisLifecycleChange[]; events: CorrectionEvent[] } {
  const existingEvents = [...(options?.existingEvents ?? [])];
  if (!prior) return { prior: null, changes: [], events: existingEvents };
  const ensured = ensureQuizPriorHypotheses(prior);
  const trimmed = userText.trim().slice(0, 180);
  if (!trimmed || existingEvents.some((event) => event.user_text === trimmed)) {
    return { prior: ensured, changes: [], events: existingEvents };
  }
  if (!isExplicitCorrection(userText)) {
    return { prior: ensured, changes: [], events: existingEvents };
  }

  const now = new Date().toISOString();
  const changes: HypothesisLifecycleChange[] = [];
  const headline = new Set(headlineClaimIds(ensured));
  const prevActive = existingEvents.filter((e) => e.status === "active");
  for (const event of prevActive) {
    for (const id of [event.id.replace("corr_", "narr_"), ...event.supersedes_claim_ids]) {
      headline.add(id);
    }
  }

  const hypotheses = ensured.hypotheses.map((h) => {
    const shouldSupersede =
      LIVE.includes(h.status) && (headline.has(h.id) || h.id.startsWith("narr_"));
    if (!shouldSupersede) return h;
    changes.push({
      hypothesisId: h.id,
      claim: h.claim,
      from: h.status,
      to: "superseded",
      reason: "explicit_interview_correction",
      source: "interview_correction",
      at: now,
    });
    return { ...h, status: "superseded" as const, evidence: [...h.evidence, userText.slice(0, 120)].slice(0, 6) };
  });

  const narrId = nextNarrId(hypotheses);
  const newClaim: QuizPriorClaim = {
    id: narrId,
    kind: "motivation",
    claim: trimmed,
    confidence: "high",
    evidence: [trimmed.slice(0, 120)],
    status: "confirmed",
  };
  hypotheses.push(newClaim);
  changes.push({
    hypothesisId: narrId,
    claim: newClaim.claim,
    from: "absent",
    to: "confirmed",
    reason: "explicit_interview_correction",
    source: "interview_correction",
    at: now,
  });

  const events: CorrectionEvent[] = existingEvents.map((event) =>
    event.status === "active" ? { ...event, status: "superseded" as const } : event,
  );
  events.push({
    id: nextCorrId(existingEvents),
    turn: options?.turn || "user",
    user_text: trimmed,
    new_claim: newClaim.claim,
    supersedes_claim_ids: [...headline],
    authority: "explicit_user_correction",
    status: "active",
  });

  const next: QuizPrior = {
    ...ensured,
    hypotheses: [newClaim, ...hypotheses.filter((h) => h.id !== narrId)].slice(0, 10),
    likely_primary_motivation: newClaim,
    contradictions: [...ensured.contradictions, "訪談明確訂正了先前主敘事"].slice(0, 6),
    confidence: {
      overall: "medium",
      motivation: "high",
      barrier: ensured.confidence.barrier,
    },
  };

  return { prior: next, changes, events };
}

export function applyInterviewCorrectionsFromTranscript(
  prior: QuizPrior | null | undefined,
  transcript: Array<{ role: string; text: string }>,
  existingEvents?: CorrectionEvent[],
): { prior: QuizPrior | null; changes: HypothesisLifecycleChange[]; events: CorrectionEvent[] } {
  let current = prior ?? null;
  const changes: HypothesisLifecycleChange[] = [];
  let events = [...(existingEvents ?? [])];
  let turn = 0;
  for (const row of transcript) {
    if (row.role !== "user") continue;
    turn += 1;
    const applied = applyInterviewCorrection(current, row.text, { turn: `user_${turn}`, existingEvents: events });
    current = applied.prior;
    changes.push(...applied.changes);
    events = applied.events;
  }
  return { prior: current, changes, events };
}

export function activeNarrativeAuthority(events: CorrectionEvent[] | null | undefined): CorrectionEvent | null {
  return [...(events ?? [])].reverse().find((e) => e.status === "active") ?? null;
}

export function liveHypotheses(prior: QuizPrior | null | undefined): QuizPriorClaim[] {
  return (prior?.hypotheses ?? []).filter((h) => LIVE.includes(h.status));
}

export function discardedHypotheses(prior: QuizPrior | null | undefined): QuizPriorClaim[] {
  return (prior?.hypotheses ?? []).filter((h) => DEAD.includes(h.status));
}

export function sanitizeQuizPriorForLayer2(prior: QuizPrior): QuizPrior {
  const ensured = ensureQuizPriorHypotheses(prior);
  const live = liveHypotheses(ensured);
  const liveMotivation =
    live.find((h) => h.kind === "motivation") ??
    ({
      id: "mot_cleared",
      kind: "motivation",
      claim: "（測驗主因已失效，請用 narrativeAuthority）",
      confidence: "low",
      evidence: [],
      status: "rejected",
    } satisfies QuizPriorClaim);
  return {
    ...ensured,
    likely_primary_motivation: liveMotivation,
    likely_barriers: live.filter((h) => h.kind === "barrier").slice(0, 4),
    possible_tradeoffs: live.filter((h) => h.kind === "tradeoff").slice(0, 4),
    possible_behavior_pattern: live.filter((h) => h.kind === "behavior_pattern").slice(0, 4),
    hypotheses: ensured.hypotheses,
  };
}

export function splitQuizPriorForInterview(prior: QuizPrior | null | undefined) {
  if (!prior) {
    return { active: [] as QuizPriorClaim[], rejected_or_superseded: [] as QuizPriorClaim[] };
  }
  const ensured = ensureQuizPriorHypotheses(prior);
  return {
    active: liveHypotheses(ensured),
    rejected_or_superseded: discardedHypotheses(ensured),
  };
}
