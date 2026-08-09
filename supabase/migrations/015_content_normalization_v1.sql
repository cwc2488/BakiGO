-- Content Normalization Layer v1 scaffold
-- Policy: content_normalization_v1
-- Normalized content retention is configurable and independent of 90-day analysis window.

CREATE TABLE IF NOT EXISTS candidate_normalization_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  normalization_run_id TEXT NOT NULL UNIQUE,
  normalization_policy_version TEXT NOT NULL DEFAULT 'content_normalization_v1',
  normalized_at TIMESTAMPTZ NOT NULL,
  data_completeness TEXT NOT NULL CHECK (data_completeness IN ('full', 'partial')),
  analysis_window_days INTEGER NOT NULL DEFAULT 90,
  window_start_at TIMESTAMPTZ NOT NULL,
  window_end_at TIMESTAMPTZ NOT NULL,
  analyzable_item_count INTEGER NOT NULL DEFAULT 0,
  last_meaningful_activity_at TIMESTAMPTZ,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidate_content_normalized (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_content_id TEXT NOT NULL UNIQUE,
  candidate_id TEXT NOT NULL,
  normalization_run_id TEXT NOT NULL REFERENCES candidate_normalization_runs(normalization_run_id),
  platform TEXT NOT NULL CHECK (platform IN ('threads', 'instagram')),
  external_content_id TEXT NOT NULL,
  raw_snapshot_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  content_type TEXT NOT NULL,
  content_relationship TEXT NOT NULL,
  text TEXT,
  candidate_commentary_text TEXT,
  quoted_content JSONB,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  permalink TEXT,
  is_candidate_originated BOOLEAN NOT NULL,
  has_meaningful_expression BOOLEAN NOT NULL,
  is_analyzable BOOLEAN NOT NULL,
  content_dedup_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  duplicate_of TEXT,
  dedup_class TEXT,
  exclusion_reason TEXT,
  normalization_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, platform, external_content_id, normalization_run_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_content_normalized_candidate
  ON candidate_content_normalized (candidate_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_content_normalized_run
  ON candidate_content_normalized (normalization_run_id);

CREATE INDEX IF NOT EXISTS idx_candidate_normalization_runs_candidate
  ON candidate_normalization_runs (candidate_id, normalized_at DESC);

COMMENT ON TABLE candidate_content_normalized IS
  'Deterministic normalized public content — 90-day eligibility applied at query time, not stored as intrinsic exclusion.';

COMMENT ON COLUMN candidate_content_normalized.exclusion_reason IS
  'Intrinsic content exclusion only — does NOT include outside_analysis_window.';
