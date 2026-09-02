-- Go21 Coach Daily Plan (additive). Safe for enrollments without a plan.
-- Coach-prescribed routine is authoritative; AI must not silently rewrite it.
-- Separate from go21_daily_targets_json (nutrition/recovery set-points).

alter table public.coaching_enrollments
  add column if not exists go21_coach_plan_json jsonb;

comment on column public.coaching_enrollments.go21_coach_plan_json is
  'Baki Go 21 coach-prescribed daily plan: {version,current,history}. Generic items (period/name/amount/instruction/recurrence). Not product-specific.';

-- Per-day inferred execution (completions / intentional deviations). Never rewrites coach plan.
alter table public.coaching_daily_logs
  add column if not exists go21_plan_day_json jsonb;

comment on column public.coaching_daily_logs.go21_plan_day_json is
  'Go21 inferred plan execution for this log_date: completions, intentional skips, notes. Evidence-based; never fake certainty.';
