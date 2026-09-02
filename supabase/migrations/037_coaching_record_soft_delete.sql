-- Coaching record soft-delete (daily logs + matching AI outputs).
-- Idempotent. No DELETE policies added — coach delete goes through service-role API
-- after owner authorization. Anonymous has no table access.

alter table public.coaching_daily_logs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.members (id) on delete set null;

alter table public.coaching_ai_outputs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.members (id) on delete set null;

-- Allow a fresh log on the same date after soft-delete (old row remains for audit).
alter table public.coaching_daily_logs
  drop constraint if exists coaching_daily_logs_enrollment_date_unique;

create unique index if not exists coaching_daily_logs_enrollment_date_active_uidx
  on public.coaching_daily_logs (enrollment_id, log_date)
  where deleted_at is null;

create index if not exists coaching_daily_logs_enrollment_active_date_idx
  on public.coaching_daily_logs (enrollment_id, log_date desc)
  where deleted_at is null;

create index if not exists coaching_ai_outputs_enrollment_active_date_idx
  on public.coaching_ai_outputs (enrollment_id, log_date desc)
  where deleted_at is null;

comment on column public.coaching_daily_logs.deleted_at is
  'Soft-delete timestamp. Default customer/coach queries must exclude non-null rows.';
comment on column public.coaching_daily_logs.deleted_by is
  'Member id of the coach who deleted this daily log. Server-authorized only.';
comment on column public.coaching_ai_outputs.deleted_at is
  'Soft-delete timestamp aligned with the matching daily log. Excluded from AI context.';
comment on column public.coaching_ai_outputs.deleted_by is
  'Member id of the coach who deleted the matching daily log.';
