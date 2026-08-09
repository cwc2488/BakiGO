-- AI Radar P3–P6 — pipeline lifecycle, raw snapshots, discovery attribution, audit

ALTER TABLE public.radar_pipeline_runs
  DROP CONSTRAINT IF EXISTS radar_pipeline_runs_status_check;

ALTER TABLE public.radar_pipeline_runs
  ADD CONSTRAINT radar_pipeline_runs_status_check
  CHECK (status IN ('pending', 'running', 'success', 'partial_success', 'failed'));

COMMENT ON COLUMN public.radar_pipeline_runs.status IS
  'pending → running (orchestrator) → success|partial_success|failed (finalizer). Enqueue completion is NOT terminal.';

CREATE TABLE IF NOT EXISTS public.candidate_content_snapshots_raw (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('threads', 'instagram')),
  external_content_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  fetch_completeness TEXT NOT NULL CHECK (fetch_completeness IN ('full', 'partial')),
  payload JSONB NOT NULL,
  pipeline_run_id UUID REFERENCES public.radar_pipeline_runs (id) ON DELETE SET NULL,
  enrich_job_id UUID REFERENCES public.radar_jobs (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, platform, external_content_id, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_candidate_content_snapshots_raw_candidate
  ON public.candidate_content_snapshots_raw (candidate_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS public.candidate_discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  keyword_id UUID,
  keyword_phrase TEXT NOT NULL,
  discovery_intent TEXT NOT NULL DEFAULT 'general',
  signal_type TEXT NOT NULL DEFAULT 'keyword',
  pipeline_run_id UUID REFERENCES public.radar_pipeline_runs (id) ON DELETE SET NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, candidate_id, keyword_phrase, discovered_at)
);

CREATE INDEX IF NOT EXISTS idx_candidate_discoveries_member
  ON public.candidate_discoveries (member_id, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_discoveries_candidate
  ON public.candidate_discoveries (candidate_id, discovered_at DESC);

COMMENT ON TABLE public.candidate_discoveries IS
  'Member-scoped discovery attribution — keyword is NEVER a scoring signal.';

CREATE TABLE IF NOT EXISTS public.source_fetch_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  candidate_id TEXT,
  member_id UUID,
  pipeline_run_id UUID REFERENCES public.radar_pipeline_runs (id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.radar_jobs (id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'partial')),
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_fetch_audit_log_fetched
  ON public.source_fetch_audit_log (fetched_at DESC);

CREATE TABLE IF NOT EXISTS public.radar_member_score_progress (
  pipeline_run_id UUID NOT NULL REFERENCES public.radar_pipeline_runs (id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  expected_score_jobs INTEGER NOT NULL DEFAULT 0,
  terminal_score_jobs INTEGER NOT NULL DEFAULT 0,
  rank_enqueued BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline_run_id, member_id)
);

COMMENT ON TABLE public.radar_member_score_progress IS
  'Tracks per-member score completion for rank job chaining.';
