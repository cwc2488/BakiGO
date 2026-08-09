-- AI Radar Daily Pipeline v1 — P0 foundation
-- Policy: radar_daily_pipeline_v1
--
-- Global vs member state:
--   candidate_pool.lifecycle_state = global only (active, cooling, excluded, stale)
--   member_candidate_state = member × candidate development/eligibility overlay
--
-- Analysis cache fingerprint excludes normalization_run_id (audit linkage only).

CREATE TABLE IF NOT EXISTS public.candidate_pool (
  id TEXT PRIMARY KEY,
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'cooling', 'excluded', 'stale')),
  display_name TEXT,
  primary_platform TEXT CHECK (primary_platform IN ('threads', 'instagram')),
  profile_semantic_hash TEXT,
  merge_status TEXT NOT NULL DEFAULT 'single'
    CHECK (merge_status IN ('single', 'merge_pending_confirmation', 'merged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_pool_lifecycle
  ON public.candidate_pool (lifecycle_state, updated_at DESC);

COMMENT ON TABLE public.candidate_pool IS
  'Global candidate pool — lifecycle_state is global only; member development states live in member_candidate_state.';

CREATE TABLE IF NOT EXISTS public.member_candidate_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  development_state TEXT
    CHECK (
      development_state IS NULL
      OR development_state IN (
        'in_progress',
        'succeeded',
        'failed',
        'already_known',
        'gave_up'
      )
    ),
  excluded_from_recommendations BOOLEAN NOT NULL DEFAULT false,
  exclusion_reason_code TEXT,
  development_started_at TIMESTAMPTZ,
  development_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_member_candidate_state_member
  ON public.member_candidate_state (member_id, development_state);

CREATE INDEX IF NOT EXISTS idx_member_candidate_state_candidate
  ON public.member_candidate_state (candidate_id);

COMMENT ON TABLE public.member_candidate_state IS
  'Member-specific candidate relationship — development/in_progress removes candidate from THIS member Top20 only.';

CREATE TABLE IF NOT EXISTS public.candidate_refresh_state (
  candidate_id TEXT PRIMARY KEY REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  refresh_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (refresh_tier IN ('priority', 'standard', 'cooling')),
  last_source_check_at TIMESTAMPTZ,
  last_enrich_succeeded_at TIMESTAMPTZ,
  last_normalization_succeeded_at TIMESTAMPTZ,
  source_freshness_valid_until TIMESTAMPTZ,
  corpus_fingerprint TEXT,
  profile_semantic_hash TEXT,
  data_completeness TEXT CHECK (data_completeness IN ('full', 'partial')),
  current_analysis_run_id UUID,
  validated_extraction_fingerprint TEXT,
  force_reanalysis BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.candidate_refresh_state.source_freshness_valid_until IS
  'Top20 source-freshness gate — independent from analysis storage TTL.';

COMMENT ON COLUMN public.candidate_refresh_state.validated_extraction_fingerprint IS
  'Semantic input fingerprint — excludes normalization_run_id; used for LLM cache hits.';

CREATE TABLE IF NOT EXISTS public.candidate_refresh_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_date DATE NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  planned_phases TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'completed', 'skipped', 'failed')),
  pipeline_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (queue_date, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_refresh_queue_date_status
  ON public.candidate_refresh_queue (queue_date, status, priority_score DESC);

CREATE TABLE IF NOT EXISTS public.candidate_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'failed', 'superseded')),
  analysis_input_fingerprint TEXT NOT NULL,
  corpus_fingerprint TEXT NOT NULL,
  profile_semantic_hash TEXT,
  normalization_run_id TEXT,
  normalization_policy_version TEXT NOT NULL DEFAULT 'content_normalization_v1',
  extraction_schema_version TEXT NOT NULL DEFAULT 'v1',
  fit_policy_version TEXT NOT NULL DEFAULT 'fit_policy_v1',
  prompt_version TEXT NOT NULL,
  model_id TEXT NOT NULL,
  extraction_json JSONB,
  error_code TEXT,
  error_message TEXT,
  superseded_by UUID REFERENCES public.candidate_analysis_runs (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_analysis_runs_candidate_created
  ON public.candidate_analysis_runs (candidate_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_analysis_runs_cache_hit
  ON public.candidate_analysis_runs (candidate_id, analysis_input_fingerprint)
  WHERE status = 'succeeded';

COMMENT ON COLUMN public.candidate_analysis_runs.normalization_run_id IS
  'Audit linkage only — MUST NOT participate in analysis_input_fingerprint.';

CREATE TABLE IF NOT EXISTS public.candidate_baseline_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  analysis_run_id UUID NOT NULL REFERENCES public.candidate_analysis_runs (id),
  scoring_version TEXT NOT NULL DEFAULT 'v1',
  overall_score NUMERIC NOT NULL,
  component_scores JSONB NOT NULL,
  core_traits_audit JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_baseline_score_candidate
  ON public.candidate_baseline_score_snapshots (candidate_id, created_at DESC);

ALTER TABLE public.radar_candidate_score_snapshots
  ADD COLUMN IF NOT EXISTS analysis_run_id UUID REFERENCES public.candidate_analysis_runs (id),
  ADD COLUMN IF NOT EXISTS baseline_score_snapshot_id UUID REFERENCES public.candidate_baseline_score_snapshots (id),
  ADD COLUMN IF NOT EXISTS candidate_id_text TEXT;

CREATE TABLE IF NOT EXISTS public.radar_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  config_version TEXT NOT NULL DEFAULT 'radar_daily_pipeline_v1',
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_radar_pipeline_runs_date
  ON public.radar_pipeline_runs (run_date DESC, started_at DESC);

CREATE TABLE IF NOT EXISTS public.radar_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID REFERENCES public.radar_pipeline_runs (id) ON DELETE SET NULL,
  job_type TEXT NOT NULL
    CHECK (job_type IN (
      'discover',
      'enrich',
      'normalize',
      'analyze',
      'score',
      'rank',
      'daily_pipeline'
    )),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead_letter')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_radar_jobs_claim
  ON public.radar_jobs (status, available_at, priority DESC, scheduled_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_radar_jobs_pipeline
  ON public.radar_jobs (pipeline_run_id, job_type, status);

CREATE TABLE IF NOT EXISTS public.radar_pipeline_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID REFERENCES public.radar_pipeline_runs (id) ON DELETE SET NULL,
  job_id UUID NOT NULL REFERENCES public.radar_jobs (id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_radar_pipeline_job_runs_job
  ON public.radar_pipeline_job_runs (job_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.member_daily_top20 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  pipeline_run_id UUID REFERENCES public.radar_pipeline_runs (id) ON DELETE SET NULL,
  snapshot_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scoring_version TEXT NOT NULL DEFAULT 'v1',
  extraction_schema_version TEXT NOT NULL DEFAULT 'v1',
  fit_policy_version TEXT NOT NULL DEFAULT 'fit_policy_v1',
  item_count INTEGER NOT NULL CHECK (item_count >= 0 AND item_count <= 20),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (member_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_member_daily_top20_member_date
  ON public.member_daily_top20 (member_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS public.member_recommendation_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  member_daily_top20_id UUID REFERENCES public.member_daily_top20 (id) ON DELETE SET NULL,
  recommended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_date DATE NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 20),
  recommendation_score NUMERIC NOT NULL,
  recommendation_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  scoring_version TEXT NOT NULL DEFAULT 'v1',
  analysis_run_id UUID REFERENCES public.candidate_analysis_runs (id),
  extraction_schema_version TEXT NOT NULL DEFAULT 'v1',
  fit_policy_version TEXT NOT NULL DEFAULT 'fit_policy_v1',
  prompt_version TEXT,
  model_id TEXT,
  previous_recommendation_id UUID REFERENCES public.member_recommendation_occurrences (id),
  re_recommendation_reason TEXT,
  re_recommendation_trigger TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_recommendation_occurrences_member
  ON public.member_recommendation_occurrences (member_id, recommended_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_recommendation_occurrences_candidate
  ON public.member_recommendation_occurrences (member_id, candidate_id, recommended_at DESC);

COMMENT ON TABLE public.member_recommendation_occurrences IS
  'Append-only recommendation audit — never UPDATE prior rows.';

CREATE TABLE IF NOT EXISTS public.radar_pipeline_config (
  id TEXT PRIMARY KEY DEFAULT 'radar_daily_pipeline_v1',
  source_freshness_window_days INTEGER NOT NULL DEFAULT 7,
  analysis_storage_retention_days INTEGER NOT NULL DEFAULT 30,
  daily_caps JSONB NOT NULL DEFAULT '{}'::jsonb,
  worker JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.radar_pipeline_config (id)
VALUES ('radar_daily_pipeline_v1')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_radar_jobs(
  p_limit INTEGER DEFAULT 25,
  p_job_types TEXT[] DEFAULT NULL
)
RETURNS SETOF public.radar_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.radar_jobs j
    WHERE j.status IN ('pending', 'failed')
      AND j.available_at <= now()
      AND j.attempt_count < j.max_attempts
      AND (p_job_types IS NULL OR j.job_type = ANY (p_job_types))
    ORDER BY j.priority DESC, j.scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.radar_jobs j
  SET
    status = 'running',
    attempt_count = j.attempt_count + 1,
    started_at = now(),
    updated_at = now()
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;

COMMENT ON FUNCTION public.claim_radar_jobs IS
  'Atomically claim pending/failed radar jobs for worker processing.';
