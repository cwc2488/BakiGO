-- RADAR-SECURITY-01 — close the Radar data boundary.
--
-- Migrations 014–020 created 26 Radar tables and 3 Radar functions without RLS
-- and without touching Supabase's default grants, so the browser anon key could
-- read every table (including raw scraped Threads content) and write the three
-- member-scoped tables.
--
-- Every Radar table is reached only through service-role server routes
-- (src/app/api/radar/**); no browser code queries them. anon/authenticated
-- therefore need no table privileges at all. Member ownership stays enforced in
-- the API layer: member_id comes from the bearer token, and an action is refused
-- unless the candidate is on that member's own Top20 snapshot.
--
-- Additive and idempotent. No table, column, index, constraint, or row changes;
-- privileges only. Same lockdown pattern as 035 / 036 / 038 / 040 / 042 / 044.

DO $$
DECLARE
  t TEXT;
  radar_tables TEXT[] := ARRAY[
    -- 014 scoring
    'radar_scoring_policy_versions',
    'radar_candidate_score_snapshots',
    -- 015 normalization
    'candidate_normalization_runs',
    'candidate_content_normalized',
    -- 016 pool / pipeline / Top20
    'candidate_pool',
    'member_candidate_state',
    'candidate_refresh_state',
    'candidate_refresh_queue',
    'candidate_analysis_runs',
    'candidate_baseline_score_snapshots',
    'radar_pipeline_runs',
    'radar_jobs',
    'radar_pipeline_job_runs',
    'member_daily_top20',
    'member_recommendation_occurrences',
    'radar_pipeline_config',
    -- 018 orchestrator support
    'radar_system_keywords',
    'radar_member_keywords',
    'radar_member_keyword_disabled',
    'member_development_areas',
    'candidate_discovery_signals',
    -- 019 raw evidence / discovery / audit
    'candidate_content_snapshots_raw',
    'candidate_discoveries',
    'source_fetch_audit_log',
    'radar_member_score_progress',
    -- 020 acquisition
    'candidate_member_submissions'
  ];
BEGIN
  FOREACH t IN ARRAY radar_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    ELSE
      RAISE NOTICE 'RADAR-SECURITY-01: table public.% not found, skipped', t;
    END IF;
  END LOOP;
END
$$;

-- Radar functions are pipeline-only and are not SECURITY DEFINER, but Postgres
-- grants EXECUTE to PUBLIC by default, which let anon claim and reclaim pipeline
-- jobs. Restrict them to the service role that actually runs the pipeline.
--
-- Resolved through pg_proc so the real signature is always used: a hardcoded
-- signature that no longer matches would abort the whole migration.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'claim_radar_jobs',
        'reclaim_abandoned_radar_jobs',
        'list_adaptive_refresh_candidates'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END
$$;
