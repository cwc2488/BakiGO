-- Go21 daily coaching targets (additive). Safe for enrollments without targets.
-- Authoritative store: coaching_enrollments.go21_daily_targets_json
-- Operational set-points (water / calories / protein / sleep) — separate from go21_goal_json.

alter table public.coaching_enrollments
  add column if not exists go21_daily_targets_json jsonb;

comment on column public.coaching_enrollments.go21_daily_targets_json is
  'Baki Go 21 durable daily targets: {version,current,history}. waterMl, caloriesKcal, proteinG, sleepHours. Coach-set; revisable without restarting Go21.';

-- Optional per-day nutrition estimate cache (heuristic bands, never false precision).
alter table public.coaching_daily_logs
  add column if not exists nutrition_estimate_json jsonb;

comment on column public.coaching_daily_logs.nutrition_estimate_json is
  'Go21 conservative meal estimate bands for the day: calories/protein ranges + confidence. Not customer-facing precision.';
