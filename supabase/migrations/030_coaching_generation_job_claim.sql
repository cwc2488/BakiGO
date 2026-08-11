-- AI Coaching Phase 2c: atomic claim + stale recovery for coaching_generation_jobs.

CREATE OR REPLACE FUNCTION public.reclaim_stale_coaching_generation_jobs(
  p_stale_after_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  reclaimed_count INTEGER;
BEGIN
  UPDATE public.coaching_generation_jobs
  SET
    status = 'queued',
    locked_at = NULL,
    locked_by = NULL,
    available_at = now(),
    last_error = COALESCE(last_error, 'stale_processing_reclaimed'),
    updated_at = now()
  WHERE status = 'processing'
    AND locked_at IS NOT NULL
    AND locked_at < now() - make_interval(mins => p_stale_after_minutes);

  GET DIAGNOSTICS reclaimed_count = ROW_COUNT;
  RETURN reclaimed_count;
END;
$$;

COMMENT ON FUNCTION public.reclaim_stale_coaching_generation_jobs IS
  'Recover abandoned coaching generation jobs stuck in processing.';

CREATE OR REPLACE FUNCTION public.claim_coaching_generation_jobs(
  p_limit INTEGER DEFAULT 10,
  p_locked_by TEXT DEFAULT 'worker'
)
RETURNS SETOF public.coaching_generation_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.coaching_generation_jobs j
    WHERE j.status = 'queued'
      AND j.available_at <= now()
    ORDER BY j.available_at ASC, j.created_at ASC
    LIMIT LEAST(p_limit, 25)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.coaching_generation_jobs j
  SET
    status = 'processing',
    attempt_count = j.attempt_count + 1,
    locked_at = now(),
    locked_by = p_locked_by,
    updated_at = now()
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;

COMMENT ON FUNCTION public.claim_coaching_generation_jobs IS
  'Atomically claim queued coaching generation jobs for the service-role worker.';
