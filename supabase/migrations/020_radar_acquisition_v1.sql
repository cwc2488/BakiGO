-- AI Radar acquisition v1 — org keyword planning, member intake, capability states

ALTER TABLE public.candidate_pool
  ADD COLUMN IF NOT EXISTS normalized_username TEXT,
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT NOT NULL DEFAULT 'system_discovery'
    CHECK (acquisition_source IN ('system_discovery', 'member_provided'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_pool_platform_username
  ON public.candidate_pool (primary_platform, normalized_username)
  WHERE normalized_username IS NOT NULL;

COMMENT ON COLUMN public.candidate_pool.acquisition_source IS
  'system_discovery = Layer A automated Threads radar; member_provided = Layer B intake.';

ALTER TABLE public.candidate_discoveries
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'keyword_search'
    CHECK (discovery_source IN ('keyword_search', 'member_provided', 'interaction'));

ALTER TABLE public.candidate_discoveries
  ADD COLUMN IF NOT EXISTS org_keyword_phrase TEXT;

COMMENT ON COLUMN public.candidate_discoveries.org_keyword_phrase IS
  'Normalized org keyword phrase when discovery_source = keyword_search.';

ALTER TABLE public.candidate_refresh_state
  ADD COLUMN IF NOT EXISTS enrichment_capability_state TEXT
    CHECK (
      enrichment_capability_state IS NULL
      OR enrichment_capability_state IN (
        'available',
        'permission_required',
        'below_threads_profile_threshold',
        'unsupported_account_type',
        'rate_limited',
        'source_unavailable',
        'partial'
      )
    );

COMMENT ON COLUMN public.candidate_refresh_state.enrichment_capability_state IS
  'Meta official API reachability — not a scoring negative.';

CREATE TABLE IF NOT EXISTS public.candidate_member_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('threads', 'instagram')),
  normalized_username TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  identity_resolution_result TEXT NOT NULL
    CHECK (identity_resolution_result IN ('created_new', 'reused_existing')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, candidate_id, submitted_at)
);

CREATE INDEX IF NOT EXISTS idx_candidate_member_submissions_member
  ON public.candidate_member_submissions (member_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_member_submissions_candidate
  ON public.candidate_member_submissions (candidate_id, submitted_at DESC);

COMMENT ON TABLE public.candidate_member_submissions IS
  'Layer B member candidate intake — preserves submitter attribution.';

UPDATE public.radar_pipeline_config
SET daily_caps = daily_caps || jsonb_build_object(
  'keyword_search_daily_budget', 50,
  'profile_discovery_daily_budget', 100,
  'new_candidate_enrichment_budget', 30,
  'refresh_enrichment_budget', 70,
  'reserve_capacity_pct', 10
)
WHERE id = 'radar_daily_pipeline_v1';
