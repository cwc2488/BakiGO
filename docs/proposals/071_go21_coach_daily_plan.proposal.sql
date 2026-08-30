-- Proposal mirror for 071_go21_coach_daily_plan.sql
alter table public.coaching_enrollments
  add column if not exists go21_coach_plan_json jsonb;

alter table public.coaching_daily_logs
  add column if not exists go21_plan_day_json jsonb;
