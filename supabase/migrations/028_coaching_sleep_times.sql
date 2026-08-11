-- AI Coaching: store bedtime / wake time; sleep_duration remains computed on save.

alter table public.coaching_daily_logs
  add column if not exists sleep_bedtime time,
  add column if not exists sleep_wake_time time;

comment on column public.coaching_daily_logs.sleep_bedtime is 'Customer-reported sleep start (local clock time).';
comment on column public.coaching_daily_logs.sleep_wake_time is 'Customer-reported wake time (local clock time).';
comment on column public.coaching_daily_logs.sleep_duration is 'Computed display duration from bedtime/wake (e.g. 7小時30分).';
