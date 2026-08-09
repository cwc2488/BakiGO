-- AI Radar Daily Pipeline P2 — orchestrator idempotency + abandoned job recovery

CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_pipeline_runs_run_date
  ON public.radar_pipeline_runs (run_date);

COMMENT ON INDEX public.idx_radar_pipeline_runs_run_date IS
  'One durable orchestrator envelope per calendar run_date — safe same-day rerun via job idempotency keys.';

CREATE OR REPLACE FUNCTION public.reclaim_abandoned_radar_jobs(
  p_stale_after_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  reclaimed_count INTEGER;
BEGIN
  UPDATE public.radar_jobs
  SET
    status = 'failed',
    error_code = COALESCE(error_code, 'WORKER_ABANDONED'),
    error_message = COALESCE(
      error_message,
      'running job reclaimed after worker timeout'
    ),
    available_at = now(),
    updated_at = now()
  WHERE status = 'running'
    AND started_at IS NOT NULL
    AND started_at < now() - make_interval(mins => p_stale_after_minutes)
    AND attempt_count < max_attempts;

  GET DIAGNOSTICS reclaimed_count = ROW_COUNT;
  RETURN reclaimed_count;
END;
$$;

COMMENT ON FUNCTION public.reclaim_abandoned_radar_jobs IS
  'Recover crashed workers — running jobs older than threshold return to failed for retry.';
