-- Proposal mirror for 070_go21_daily_targets.sql
alter table public.coaching_enrollments
  add column if not exists go21_daily_targets_json jsonb;

alter table public.coaching_daily_logs
  add column if not exists nutrition_estimate_json jsonb;
