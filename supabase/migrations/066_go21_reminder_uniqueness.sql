-- Baki Go 21 hardening: reminder uniqueness allows multiple open-loop intents/day.
-- Additive / idempotent. Does not drop data.

-- Replace coarse one-kind-per-day uniqueness (blocked legitimate multiple open loops).
drop index if exists public.coaching_ai_reminders_one_kind_per_day_uidx;

-- Cap duplicate measurement/daily/reengagement kinds per Taipei calendar day.
create unique index if not exists coaching_ai_reminders_one_nonloop_kind_per_day_uidx
  on public.coaching_ai_reminders (
    enrollment_id,
    kind,
    ((due_at at time zone 'Asia/Taipei')::date)
  )
  where status in ('scheduled', 'delivered')
    and kind in (
      'daily_light',
      'measurement_day7',
      'measurement_day14',
      'measurement_day21',
      'reengagement'
    );

-- One active open_loop / experiment reminder per related open loop id.
create unique index if not exists coaching_ai_reminders_open_loop_related_uidx
  on public.coaching_ai_reminders (enrollment_id, related_open_loop_id)
  where status in ('scheduled', 'delivered')
    and kind in ('open_loop', 'experiment')
    and related_open_loop_id is not null;

-- Soft dedupe for open_loop without related id: same preview hash per day.
create unique index if not exists coaching_ai_reminders_open_loop_preview_day_uidx
  on public.coaching_ai_reminders (
    enrollment_id,
    kind,
    md5(coalesce(message_preview, '')),
    ((due_at at time zone 'Asia/Taipei')::date)
  )
  where status in ('scheduled', 'delivered')
    and kind in ('open_loop', 'experiment')
    and related_open_loop_id is null;

comment on index public.coaching_ai_reminders_one_nonloop_kind_per_day_uidx is
  'Go21: at most one measurement/daily/reengagement reminder per kind per Taipei day.';
