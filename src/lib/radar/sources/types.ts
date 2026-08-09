import type { Platform } from "../normalization/schema";
import type { MetaCapabilityState } from "../acquisition/capability-states";

export type SourceAdapterId = "threads_meta" | "instagram_official";

export type DiscoveryHit = {
  candidate_id: string;
  display_name: string | null;
  platform: Platform;
  external_user_id: string;
  username: string | null;
  profile_url: string | null;
  normalized_username?: string | null;
};

export type EnrichResult = {
  candidate_id: string;
  platform: Platform;
  fetch_completeness: "full" | "partial";
  raw_snapshots: Array<{
    raw_snapshot_id: string;
    external_content_id: string;
    fetched_at: string;
    adapter_version: string;
    fetch_completeness: "full" | "partial";
    payload: Record<string, unknown>;
  }>;
  profile_semantic_hash: string | null;
  capability_state?: MetaCapabilityState;
  capability_reason?: string | null;
};

export type SourceFetchContext = {
  pipeline_run_id?: string | null;
  job_id?: string | null;
  member_id?: string | null;
};

export interface CandidateSourceAdapter {
  id: SourceAdapterId;
  discoverByKeyword(input: {
    phrase: string;
    member_id: string;
    context: SourceFetchContext;
  }): Promise<DiscoveryHit[]>;
  enrichCandidate(input: {
    candidate_id: string;
    platform: Platform;
    external_user_id?: string | null;
    username?: string | null;
    context: SourceFetchContext;
  }): Promise<EnrichResult>;
}

export type SourceFetchAuditEntry = {
  adapter_id: SourceAdapterId;
  endpoint: string;
  candidate_id?: string | null;
  member_id?: string | null;
  pipeline_run_id?: string | null;
  job_id?: string | null;
  status: "succeeded" | "failed" | "partial";
  error_code?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
};

export type SourceFetchAuditor = {
  record(entry: SourceFetchAuditEntry): Promise<void>;
};
