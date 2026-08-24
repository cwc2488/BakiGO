import type { Platform } from "../normalization/schema";
import type {
  CandidateSourceAdapter,
  DiscoveryHit,
  EnrichResult,
  SourceFetchAuditor,
  SourceFetchContext,
} from "./types";

/**
 * Instagram is enrichment-only and out of RADAR-LIVE-01.
 * Never invent fixture posts for a real Threads candidate.
 */
export class OfficialInstagramAdapter implements CandidateSourceAdapter {
  readonly id = "instagram_official" as const;

  constructor(private readonly auditor?: SourceFetchAuditor) {}

  async discoverByKeyword(): Promise<DiscoveryHit[]> {
    return [];
  }

  async enrichCandidate(input: {
    candidate_id: string;
    platform: Platform;
    external_user_id?: string | null;
    username?: string | null;
    context: SourceFetchContext;
  }): Promise<EnrichResult> {
    await this.auditor?.record({
      adapter_id: this.id,
      endpoint: "business_discovery",
      candidate_id: input.candidate_id,
      pipeline_run_id: input.context.pipeline_run_id,
      job_id: input.context.job_id,
      status: "partial",
      error_code: "NOT_IN_SCOPE",
      error_message: "Instagram enrichment is out of RADAR-LIVE-01.",
      metadata: { mode: "live", skipped: true },
    });

    return {
      candidate_id: input.candidate_id,
      platform: "instagram",
      fetch_completeness: "partial",
      raw_snapshots: [],
      profile_semantic_hash: null,
      capability_state: "source_unavailable",
      capability_reason: "Instagram enrichment is out of RADAR-LIVE-01.",
    };
  }
}
