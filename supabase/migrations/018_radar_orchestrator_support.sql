-- AI Radar Daily Pipeline P2 — orchestrator support tables

CREATE TABLE IF NOT EXISTS public.radar_system_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase TEXT NOT NULL,
  discovery_intent TEXT NOT NULL DEFAULT 'general',
  signal_type TEXT NOT NULL DEFAULT 'keyword',
  discovery_weight INTEGER NOT NULL DEFAULT 1,
  locale TEXT NOT NULL DEFAULT 'zh-TW',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.radar_member_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  discovery_intent TEXT NOT NULL DEFAULT 'general',
  signal_type TEXT NOT NULL DEFAULT 'keyword',
  discovery_weight INTEGER NOT NULL DEFAULT 1,
  locale TEXT NOT NULL DEFAULT 'zh-TW',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_radar_member_keywords_member
  ON public.radar_member_keywords (member_id, is_active);

CREATE TABLE IF NOT EXISTS public.radar_member_keyword_disabled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  system_keyword_id UUID NOT NULL REFERENCES public.radar_system_keywords (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, system_keyword_id)
);

CREATE TABLE IF NOT EXISTS public.member_development_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  area_role TEXT NOT NULL CHECK (area_role IN ('primary', 'secondary')),
  normalized_city TEXT,
  normalized_district TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, area_role, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_member_development_areas_member
  ON public.member_development_areas (member_id, area_role);

COMMENT ON TABLE public.member_development_areas IS
  'Member development geography — used for per-member location scoring; not device GPS.';

CREATE TABLE IF NOT EXISTS public.candidate_discovery_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('new_discovery_hit', 'near_top20_competitive')),
  signal_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_candidate_discovery_signals_candidate
  ON public.candidate_discovery_signals (candidate_id, signal_type, expires_at DESC);

COMMENT ON TABLE public.candidate_discovery_signals IS
  'Bounded refresh signals — avoids full candidate pool scans for adaptive queue planning.';

CREATE OR REPLACE FUNCTION public.list_adaptive_refresh_candidates(
  p_now TIMESTAMPTZ DEFAULT now(),
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  candidate_id TEXT,
  lifecycle_state TEXT,
  refresh_tier TEXT,
  is_new_candidate BOOLEAN,
  source_freshness_expired BOOLEAN,
  is_stale_recovery BOOLEAN,
  near_top20_competitive BOOLEAN,
  new_discovery_hit BOOLEAN,
  force_refresh BOOLEAN,
  last_enriched_at TIMESTAMPTZ,
  cooling_interval_days INTEGER
)
LANGUAGE sql
STABLE
AS $$
  WITH config AS (
    SELECT COALESCE((worker ->> 'cooling_refresh_interval_days')::INTEGER, 14) AS cooling_days
    FROM public.radar_pipeline_config
    WHERE id = 'radar_daily_pipeline_v1'
    LIMIT 1
  ),
  competitive AS (
    SELECT DISTINCT ON (s.candidate_id)
      s.candidate_id
    FROM public.candidate_discovery_signals s
    WHERE s.signal_type = 'near_top20_competitive'
      AND s.expires_at > p_now
    ORDER BY s.candidate_id, s.signal_at DESC
  ),
  discovery_hits AS (
    SELECT DISTINCT ON (s.candidate_id)
      s.candidate_id
    FROM public.candidate_discovery_signals s
    WHERE s.signal_type = 'new_discovery_hit'
      AND s.expires_at > p_now
    ORDER BY s.candidate_id, s.signal_at DESC
  )
  SELECT
    cp.id AS candidate_id,
    cp.lifecycle_state,
    crs.refresh_tier,
    (cp.created_at >= p_now - interval '7 days') AS is_new_candidate,
    (
      crs.source_freshness_valid_until IS NULL
      OR crs.source_freshness_valid_until < p_now
    ) AS source_freshness_expired,
    (cp.lifecycle_state = 'stale') AS is_stale_recovery,
    (comp.candidate_id IS NOT NULL) AS near_top20_competitive,
    (disc.candidate_id IS NOT NULL) AS new_discovery_hit,
    crs.force_reanalysis AS force_refresh,
    crs.last_enrich_succeeded_at AS last_enriched_at,
    cfg.cooling_days AS cooling_interval_days
  FROM public.candidate_refresh_state crs
  INNER JOIN public.candidate_pool cp ON cp.id = crs.candidate_id
  CROSS JOIN config cfg
  LEFT JOIN competitive comp ON comp.candidate_id = cp.id
  LEFT JOIN discovery_hits disc ON disc.candidate_id = cp.id
  WHERE cp.lifecycle_state <> 'excluded'
    AND (
      crs.force_reanalysis
      OR cp.created_at >= p_now - interval '7 days'
      OR crs.source_freshness_valid_until IS NULL
      OR crs.source_freshness_valid_until < p_now
      OR cp.lifecycle_state = 'stale'
      OR comp.candidate_id IS NOT NULL
      OR disc.candidate_id IS NOT NULL
      OR (
        crs.refresh_tier = 'cooling'
        AND crs.last_enrich_succeeded_at IS NOT NULL
        AND crs.last_enrich_succeeded_at < p_now - make_interval(days => cfg.cooling_days)
      )
    )
  ORDER BY
    CASE crs.refresh_tier
      WHEN 'priority' THEN 0
      WHEN 'standard' THEN 1
      ELSE 2
    END,
    crs.updated_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.list_adaptive_refresh_candidates IS
  'Targeted adaptive refresh candidate selection — not a full pool scan.';
