import { isSourceFresh } from "../analysis/fingerprint";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import { NEED_TYPE_DEFINITIONS, isNeedTypeSlug } from "../fit-policy/need-types";
import { pickPartnerWhyLines } from "../semantics/recommendation-reason";
import type { MemberRadarRecommendationFeedback } from "../feedback/types";
import type { CandidateContentCorpus } from "../normalization/schema";
import type {
  CandidateRecord,
  RefreshStateRecord,
} from "../repository/types";
import type { RankedCandidate } from "../scoring/types";

export type RadarPartnerFreshness = "fresh" | "stale" | "unknown";

export type RadarPartnerNotice =
  | "no_public_posts"
  | "below_profile_threshold"
  | "stale"
  | "source_unavailable"
  | "insufficient_evidence";

export type RadarPartnerEvidence = {
  kind: "post" | "profile";
  url: string;
  summary: string | null;
};

export type RadarPartnerCard = {
  candidate_id: string;
  username: string | null;
  profile_url: string | null;
  score: number;
  primary_need: string | null;
  change_signal: string | null;
  why: string[];
  why_insufficient: boolean;
  evidence: RadarPartnerEvidence[];
  freshness: RadarPartnerFreshness;
  notices: RadarPartnerNotice[];
  /** This member's own evaluation for today's recommendation; never another member's. */
  feedback: MemberRadarRecommendationFeedback | null;
};

/**
 * One candidate this member is developing. Their own protection window is their
 * own business; no other Partner's claim is ever represented here.
 */
export type RadarPartnerDevelopmentItem = {
  candidate_id: string;
  username: string | null;
  protected_until: string;
  protection_expired: boolean;
};

export type RadarPartnerFeed = {
  snapshot_date: string | null;
  generated_at: string | null;
  recommendation_count: number;
  /** Daily ceiling from the Rule Engine — copy must never restate a number. */
  daily_cap: number;
  list_size: "empty" | "partial" | "full";
  empty_reason: "no_snapshot" | "all_handled" | null;
  items: RadarPartnerCard[];
  my_development: RadarPartnerDevelopmentItem[];
};

/** Shown when the candidate was claimed by someone else between render and click. */
export const RADAR_CLAIM_COLLISION_MESSAGE = "這位目前無法開始開發，系統已為你移除。";

/** Protection dates read as a date, in the Partner's own timezone. */
export function formatProtectionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const CHANGE_INTENT_LABEL: Record<string, string> = {
  emerging: "開始想改變",
  clear: "改變意圖清楚",
  strong: "改變意圖很強",
};

const BEHAVIORAL_LABEL: Record<string, string> = {
  exploring: "正在摸索怎麼改",
  trying: "已經在嘗試",
  committed_action: "已經開始行動",
};

const SOLUTION_GAP_LABEL: Record<string, string> = {
  small: "解法還差一點",
  open: "還沒找到解法",
  active_gap: "正在找解法",
};

/** Business errors already carry partner-safe zh copy; anything else must not reach the card. */
const PARTNER_SAFE_ERROR_STATUSES = new Set([400, 403, 404, 409]);

export function radarErrorMessage(input: {
  status: number;
  error?: string | null;
  fallback: string;
}): string {
  if (input.status === 401) return "登入已過期，請重新登入後再試。";
  if (PARTNER_SAFE_ERROR_STATUSES.has(input.status) && input.error?.trim()) {
    return input.error.trim();
  }
  return input.fallback;
}

const CARD_LINE_BUDGET = 80;
const SENTENCE_ENDINGS = ["。", "！", "？", "!", "?", "."];
/** Below this a sentence is too short to stand alone as the whole reason. */
const MIN_SENTENCE_KEEP = 20;

/** Keeps a card line inside the mobile budget, ending on a sentence or a whole word. */
function clipSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= CARD_LINE_BUDGET) return cleaned;

  const window = cleaned.slice(0, CARD_LINE_BUDGET);
  const sentenceEnd = Math.max(...SENTENCE_ENDINGS.map((mark) => window.lastIndexOf(mark)));
  if (sentenceEnd >= MIN_SENTENCE_KEEP) {
    return window.slice(0, sentenceEnd + 1).trim();
  }

  const wordEnd = window.lastIndexOf(" ");
  const kept = wordEnd >= MIN_SENTENCE_KEEP ? window.slice(0, wordEnd) : window;
  return `${kept.trim()}…`;
}

function threadsProfileUrl(username: string | null): string | null {
  if (!username) return null;
  return `https://www.threads.net/@${username}`;
}

function hasRefs(refs: Array<{ content_id: string }> | undefined): boolean {
  return Boolean(refs && refs.length > 0);
}

function primaryNeedLabel(extraction: AiRadarExtractionV1): string | null {
  if (extraction.needs.availability !== "available") return null;
  const ranked = [...extraction.needs.items]
    .filter((item) => item.strength !== "none" && hasRefs(item.source_refs))
    .sort((a, b) => {
      const order = { none: 0, emerging: 1, clear: 2, strong: 3 };
      return order[b.strength] - order[a.strength];
    });
  const top = ranked[0];
  if (!top) return null;
  // Canonical need label wins: the model's free-text label is not guaranteed to be zh-TW.
  if (isNeedTypeSlug(top.need_type)) return NEED_TYPE_DEFINITIONS[top.need_type].label_zh;
  if (top.label?.trim()) return top.label.trim();
  return null;
}

function changeSignalLabel(extraction: AiRadarExtractionV1): string | null {
  const intent = extraction.change_window.change_intent;
  if (intent.availability === "available" && hasRefs(intent.source_refs) && intent.level !== "none") {
    return CHANGE_INTENT_LABEL[intent.level] ?? null;
  }
  const behavior = extraction.change_window.behavioral_change;
  if (behavior.availability === "available" && hasRefs(behavior.source_refs) && behavior.level !== "none") {
    return BEHAVIORAL_LABEL[behavior.level] ?? null;
  }
  const gap = extraction.change_window.solution_gap;
  if (gap.availability === "available" && hasRefs(gap.source_refs) && gap.level !== "closed") {
    return SOLUTION_GAP_LABEL[gap.level] ?? null;
  }
  return null;
}

function whyFromExtraction(extraction: AiRadarExtractionV1): string[] {
  const understanding = extraction.candidate_understanding;
  const fallback: string[] = [];
  const intent = extraction.change_window.change_intent;
  if (intent.availability === "available" && hasRefs(intent.source_refs) && intent.reasoning.trim()) {
    fallback.push(clipSentence(intent.reasoning));
  }
  if (extraction.needs.availability === "available") {
    const evidenced = extraction.needs.items.find(
      (item) => item.strength !== "none" && hasRefs(item.source_refs) && item.reasoning.trim(),
    );
    if (evidenced) fallback.push(clipSentence(evidenced.reasoning));
  }

  return pickPartnerWhyLines({
    recommendation_reason_zh: understanding?.recommendation_reason_zh ?? null,
    advisory_reasons: extraction.advisory?.recommendation_reasons,
    fallback_reasons: fallback,
    need_owner: understanding?.need_owner,
  }).map(clipSentence);
}

function evidenceFromCorpus(input: {
  extraction: AiRadarExtractionV1;
  corpus: CandidateContentCorpus | null;
  username: string | null;
}): RadarPartnerEvidence[] {
  const refs: string[] = [];
  const intent = input.extraction.change_window.change_intent;
  if (intent.availability === "available") {
    refs.push(...intent.source_refs.map((ref) => ref.content_id));
  }
  if (input.extraction.needs.availability === "available") {
    for (const item of input.extraction.needs.items) {
      refs.push(...item.source_refs.map((ref) => ref.content_id));
    }
  }
  const seen = new Set<string>();
  const posts: RadarPartnerEvidence[] = [];
  for (const contentId of refs) {
    if (seen.has(contentId) || posts.length >= 2) continue;
    seen.add(contentId);
    const item = input.corpus?.items.find((row) => row.normalized_content_id === contentId);
    if (!item?.permalink) continue;
    const summary = clipSentence(item.candidate_commentary_text || item.text || "") || null;
    posts.push({ kind: "post", url: item.permalink, summary });
  }
  if (posts.length > 0) return posts;
  const profile = threadsProfileUrl(input.username);
  if (!profile) return [];
  return [{ kind: "profile", url: profile, summary: null }];
}

export function buildRadarPartnerCard(input: {
  ranked: RankedCandidate;
  candidate: CandidateRecord | null;
  extraction: AiRadarExtractionV1 | null;
  corpus: CandidateContentCorpus | null;
  refresh: RefreshStateRecord | null;
  now: Date;
  source_freshness_window_days: number;
}): RadarPartnerCard {
  const username = input.candidate?.normalized_username ?? null;
  const analyzableCount = input.corpus?.counts.analyzable_item_count ?? 0;
  const capability = input.refresh?.enrichment_capability_state ?? null;
  const sourceFresh = isSourceFresh({
    now: input.now,
    last_source_check_at: input.refresh?.last_source_check_at ?? null,
    source_freshness_window_days: input.source_freshness_window_days,
  });
  const freshness: RadarPartnerFreshness = input.refresh?.last_source_check_at
    ? sourceFresh
      ? "fresh"
      : "stale"
    : "unknown";

  const notices: RadarPartnerNotice[] = [];
  if (capability === "below_threads_profile_threshold" || analyzableCount === 0) {
    notices.push(capability === "below_threads_profile_threshold" ? "below_profile_threshold" : "no_public_posts");
  }
  if (freshness === "stale") notices.push("stale");
  if (capability === "source_unavailable" || capability === "rate_limited" || capability === "permission_required") {
    notices.push("source_unavailable");
  }

  const why = input.extraction ? whyFromExtraction(input.extraction) : [];
  const whyInsufficient = why.length === 0;
  if (whyInsufficient) notices.push("insufficient_evidence");

  return {
    candidate_id: input.ranked.candidateId,
    username,
    profile_url: threadsProfileUrl(username),
    score: input.ranked.display_overall_score,
    primary_need: input.extraction ? primaryNeedLabel(input.extraction) : null,
    change_signal: input.extraction ? changeSignalLabel(input.extraction) : null,
    why,
    why_insufficient: whyInsufficient,
    evidence: input.extraction
      ? evidenceFromCorpus({ extraction: input.extraction, corpus: input.corpus, username })
      : [],
    freshness,
    notices: [...new Set(notices)],
    feedback: null,
  };
}

export function buildRadarPartnerFeed(input: {
  snapshot_date: string;
  snapshot: { generated_at: string; items: RankedCandidate[] } | null;
  cards: RadarPartnerCard[];
  daily_cap: number;
  my_development?: RadarPartnerDevelopmentItem[];
}): RadarPartnerFeed {
  const my_development = input.my_development ?? [];
  if (!input.snapshot) {
    return {
      snapshot_date: input.snapshot_date,
      generated_at: null,
      recommendation_count: 0,
      daily_cap: input.daily_cap,
      list_size: "empty",
      empty_reason: "no_snapshot",
      items: [],
      my_development,
    };
  }
  const count = input.cards.length;
  return {
    snapshot_date: input.snapshot_date,
    generated_at: input.snapshot.generated_at,
    recommendation_count: count,
    daily_cap: input.daily_cap,
    list_size: count === 0 ? "empty" : count >= input.daily_cap ? "full" : "partial",
    empty_reason: count === 0 ? "all_handled" : null,
    items: input.cards,
    my_development,
  };
}
