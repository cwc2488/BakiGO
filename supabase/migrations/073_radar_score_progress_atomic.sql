-- Atomic score-progress counters — avoids lost updates when many score jobs enqueue concurrently.

CREATE OR REPLACE FUNCTION public.radar_add_expected_score_job(
  p_pipeline_run_id UUID,
  p_member_id UUID
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.radar_member_score_progress (
    pipeline_run_id,
    member_id,
    expected_score_jobs,
    terminal_score_jobs,
    rank_enqueued
  )
  VALUES (p_pipeline_run_id, p_member_id, 1, 0, false)
  ON CONFLICT (pipeline_run_id, member_id)
  DO UPDATE SET
    expected_score_jobs = radar_member_score_progress.expected_score_jobs + 1,
    updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.radar_increment_terminal_score_job(
  p_pipeline_run_id UUID,
  p_member_id UUID
)
RETURNS TABLE (
  expected_score_jobs INTEGER,
  terminal_score_jobs INTEGER,
  rank_enqueued BOOLEAN
)
LANGUAGE sql
AS $$
  INSERT INTO public.radar_member_score_progress (
    pipeline_run_id,
    member_id,
    expected_score_jobs,
    terminal_score_jobs,
    rank_enqueued
  )
  VALUES (p_pipeline_run_id, p_member_id, 0, 1, false)
  ON CONFLICT (pipeline_run_id, member_id)
  DO UPDATE SET
    terminal_score_jobs = radar_member_score_progress.terminal_score_jobs + 1,
    updated_at = now()
  RETURNING
    radar_member_score_progress.expected_score_jobs,
    radar_member_score_progress.terminal_score_jobs,
    radar_member_score_progress.rank_enqueued;
$$;

COMMENT ON FUNCTION public.radar_add_expected_score_job IS
  'Increment expected score jobs atomically when a new score job is enqueued.';

COMMENT ON FUNCTION public.radar_increment_terminal_score_job IS
  'Increment terminal score jobs atomically when a score job reaches a terminal outcome.';
