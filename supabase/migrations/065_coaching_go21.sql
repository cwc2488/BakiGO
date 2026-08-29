-- Baki Go 21: reminders + customer start marker (additive).
-- Idempotent. Service-role writes; owner SELECT for coach visibility.

create table if not exists public.coaching_ai_reminders (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  cycle_id uuid references public.coaching_ai_cycles (id) on delete set null,
  kind text not null
    check (kind in (
      'daily_light',
      'open_loop',
      'measurement_day7',
      'measurement_day14',
      'measurement_day21',
      'experiment',
      'reengagement'
    )),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'delivered', 'cancelled', 'suppressed')),
  due_at timestamptz not null,
  quiet_hours_respected boolean not null default true,
  context_json jsonb not null default '{}'::jsonb,
  message_preview text check (message_preview is null or char_length(message_preview) <= 400),
  delivered_at timestamptz,
  cancelled_at timestamptz,
  related_open_loop_id uuid references public.coaching_ai_open_loops (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_ai_reminders_due_idx
  on public.coaching_ai_reminders (status, due_at)
  where status = 'scheduled';

create index if not exists coaching_ai_reminders_enrollment_idx
  on public.coaching_ai_reminders (enrollment_id, due_at desc);

create index if not exists coaching_ai_reminders_owner_idx
  on public.coaching_ai_reminders (owner_member_id, updated_at desc);

-- Prevent duplicate active reminders of same kind for same due calendar day (Taipei).
create unique index if not exists coaching_ai_reminders_one_kind_per_day_uidx
  on public.coaching_ai_reminders (
    enrollment_id,
    kind,
    ((due_at at time zone 'Asia/Taipei')::date)
  )
  where status in ('scheduled', 'delivered');

alter table public.coaching_ai_reminders enable row level security;

create policy "coaching_ai_reminders_select_own"
  on public.coaching_ai_reminders for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

comment on table public.coaching_ai_reminders is
  'Baki Go 21 reminder intents. Delivery channel separate (in-app first). Deterministic scheduling preferred.';

-- Optional go21 start flag on enrollment (idempotent start).
alter table public.coaching_enrollments
  add column if not exists go21_started_at timestamptz;

comment on column public.coaching_enrollments.go21_started_at is
  'When customer tapped Start on Baki Go 21 chat experience. Null until customer starts.';
