import { createHash } from "node:crypto";
import type { Platform } from "../normalization/schema";
import type {
  CandidateSourceAdapter,
  DiscoveryHit,
  EnrichResult,
  SourceAdapterId,
  SourceFetchAuditor,
  SourceFetchContext,
} from "./types";

export const THREADS_ADAPTER_VERSION = "threads_meta_v1" as const;
export const INSTAGRAM_ADAPTER_VERSION = "instagram_official_v1" as const;

function hashCandidate(platform: Platform, externalUserId: string): string {
  return createHash("sha256").update(`${platform}:${externalUserId}`).digest("hex").slice(0, 16);
}

function buildFixturePosts(candidateId: string, platform: Platform, phrase: string) {
  const now = new Date().toISOString();
  return [
    {
      raw_snapshot_id: `raw_${candidateId}_001`,
      external_content_id: `${platform}_${candidateId}_001`,
      fetched_at: now,
      adapter_version:
        platform === "threads" ? THREADS_ADAPTER_VERSION : INSTAGRAM_ADAPTER_VERSION,
      fetch_completeness: "full" as const,
      payload: {
        published_at: now,
        content_type: "text_post",
        content_relationship: "original",
        text: `最近開始認真思考${phrase}，想找到更好的節奏。`,
        is_authored_by_candidate: true,
      },
    },
  ];
}

export class FixtureCandidateSourceAdapter implements CandidateSourceAdapter {
  constructor(
    readonly id: SourceAdapterId,
    private readonly platform: Platform,
    private readonly auditor?: SourceFetchAuditor,
  ) {}

  async discoverByKeyword(input: {
    phrase: string;
    member_id: string;
    context: SourceFetchContext;
  }): Promise<DiscoveryHit[]> {
    const externalUserId = hashCandidate(this.platform, `${input.member_id}:${input.phrase}`);
    const candidateId = `cand_${externalUserId}`;

    await this.auditor?.record({
      adapter_id: this.id,
      endpoint: "keyword_search",
      member_id: input.member_id,
      candidate_id: candidateId,
      pipeline_run_id: input.context.pipeline_run_id,
      job_id: input.context.job_id,
      status: "succeeded",
      metadata: { phrase: input.phrase, mode: "fixture" },
    });

    return [
      {
        candidate_id: candidateId,
        display_name: `Candidate ${candidateId.slice(-4)}`,
        platform: this.platform,
        external_user_id: externalUserId,
        username: `user_${candidateId.slice(-6)}`,
        profile_url: null,
      },
    ];
  }

  async enrichCandidate(input: {
    candidate_id: string;
    platform: Platform;
    external_user_id?: string | null;
    username?: string | null;
    context: SourceFetchContext;
  }): Promise<EnrichResult> {
    const snapshots = buildFixturePosts(input.candidate_id, input.platform, "health");

    await this.auditor?.record({
      adapter_id: this.id,
      endpoint: "profile_and_posts",
      candidate_id: input.candidate_id,
      pipeline_run_id: input.context.pipeline_run_id,
      job_id: input.context.job_id,
      status: "succeeded",
      metadata: { mode: "fixture", snapshot_count: snapshots.length },
    });

    return {
      candidate_id: input.candidate_id,
      platform: input.platform,
      fetch_completeness: "full",
      raw_snapshots: snapshots,
      profile_semantic_hash: createHash("sha256")
        .update(`${input.candidate_id}:${snapshots.length}`)
        .digest("hex"),
    };
  }
}

export class MetaThreadsAdapter extends FixtureCandidateSourceAdapter {
  constructor(auditor?: SourceFetchAuditor) {
    super("threads_meta", "threads", auditor);
  }
}

export class MetaInstagramAdapter extends FixtureCandidateSourceAdapter {
  constructor(auditor?: SourceFetchAuditor) {
    super("instagram_official", "instagram", auditor);
  }

  /** Production contract: Instagram never performs automated stranger discovery. */
  async discoverByKeyword(): Promise<DiscoveryHit[]> {
    return [];
  }
}

export function createProductionSourceAdapters(auditor?: SourceFetchAuditor): CandidateSourceAdapter[] {
  // V1: official-only policy — production tokens can replace fixture internals later.
  const hasThreadsToken = Boolean(process.env.THREADS_ACCESS_TOKEN);
  const hasInstagramToken = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN);

  if (!hasThreadsToken && !hasInstagramToken) {
    return [new MetaThreadsAdapter(auditor), new MetaInstagramAdapter(auditor)];
  }

  return [new MetaThreadsAdapter(auditor), new MetaInstagramAdapter(auditor)];
}
