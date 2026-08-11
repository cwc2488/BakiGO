-- AI Coaching V1 Phase 1: enrollments, daily logs, meal entries, meal photos (Storage refs).

-- ---------------------------------------------------------------------------
-- Storage bucket (private — access via service role / signed URLs only)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coaching-meal-photos',
  'coaching-meal-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies — all uploads/reads go through API with service role.

-- ---------------------------------------------------------------------------
-- coaching_enrollments
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_enrollments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  goal text,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  onboarding_completed_at timestamptz,
  plan_snapshot_json jsonb not null default '{}'::jsonb,
  baseline_body_record_id uuid references public.body_composition_records (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaching_enrollments_status_check
    check (status in ('active', 'paused', 'completed'))
);

create unique index if not exists coaching_enrollments_one_active_per_customer_coach_idx
  on public.coaching_enrollments (customer_id, owner_member_id)
  where status = 'active';

create index if not exists coaching_enrollments_owner_status_idx
  on public.coaching_enrollments (owner_member_id, status);

create index if not exists coaching_enrollments_customer_id_idx
  on public.coaching_enrollments (customer_id);

-- ---------------------------------------------------------------------------
-- coaching_daily_logs
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_daily_logs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  log_date date not null,
  water_ml integer,
  exercise_note text,
  bowel_movement_count integer,
  sleep_duration text,
  customer_note text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaching_daily_logs_enrollment_date_unique unique (enrollment_id, log_date)
);

create index if not exists coaching_daily_logs_owner_date_idx
  on public.coaching_daily_logs (owner_member_id, log_date desc);

create index if not exists coaching_daily_logs_enrollment_date_idx
  on public.coaching_daily_logs (enrollment_id, log_date desc);

-- ---------------------------------------------------------------------------
-- coaching_meal_entries
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_meal_entries (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references public.coaching_daily_logs (id) on delete cascade,
  meal_slot text not null,
  text_note text,
  eaten_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaching_meal_entries_slot_check
    check (meal_slot in ('breakfast', 'lunch', 'dinner', 'fourth_meal', 'snacks', 'drinks')),
  constraint coaching_meal_entries_daily_slot_unique unique (daily_log_id, meal_slot)
);

create index if not exists coaching_meal_entries_daily_log_id_idx
  on public.coaching_meal_entries (daily_log_id);

-- ---------------------------------------------------------------------------
-- coaching_meal_photos (Storage path reference only — no base64)
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_meal_photos (
  id uuid primary key default gen_random_uuid(),
  meal_entry_id uuid not null references public.coaching_meal_entries (id) on delete cascade,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists coaching_meal_photos_meal_entry_id_idx
  on public.coaching_meal_photos (meal_entry_id);

-- ---------------------------------------------------------------------------
-- RLS — coach owner-only (same pattern as customers)
-- ---------------------------------------------------------------------------

alter table public.coaching_enrollments enable row level security;
alter table public.coaching_daily_logs enable row level security;
alter table public.coaching_meal_entries enable row level security;
alter table public.coaching_meal_photos enable row level security;

create policy "coaching_enrollments_select_own"
  on public.coaching_enrollments for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_enrollments_insert_own"
  on public.coaching_enrollments for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_enrollments_update_own"
  on public.coaching_enrollments for update
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_daily_logs_select_own"
  on public.coaching_daily_logs for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_meal_entries_select_own"
  on public.coaching_meal_entries for select
  to authenticated
  using (
    daily_log_id in (
      select dl.id from public.coaching_daily_logs dl
      join public.members m on m.id = dl.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_meal_photos_select_own"
  on public.coaching_meal_photos for select
  to authenticated
  using (
    meal_entry_id in (
      select me.id
      from public.coaching_meal_entries me
      join public.coaching_daily_logs dl on dl.id = me.daily_log_id
      join public.members m on m.id = dl.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Customer portal writes go through SECURITY DEFINER RPC + service role API (no anon table access).

-- ---------------------------------------------------------------------------
-- Helper: resolve active enrollment from portal token
-- ---------------------------------------------------------------------------

create or replace function public.resolve_coaching_portal_context(portal_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_customer_id uuid;
  matched_enrollment record;
  matched_display_name text;
begin
  select customer_id into matched_customer_id
  from public.customer_portal_tokens
  where token = portal_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if matched_customer_id is null then
    return null;
  end if;

  select e.* into matched_enrollment
  from public.coaching_enrollments e
  where e.customer_id = matched_customer_id
    and e.status = 'active'
  order by e.started_at desc
  limit 1;

  if matched_enrollment is null then
    return jsonb_build_object(
      'validToken', true,
      'hasActiveEnrollment', false
    );
  end if;

  select c.display_name into matched_display_name
  from public.customers c
  where c.id = matched_customer_id;

  return jsonb_build_object(
    'validToken', true,
    'hasActiveEnrollment', true,
    'customerId', matched_customer_id,
    'displayName', matched_display_name,
    'enrollmentId', matched_enrollment.id,
    'goal', matched_enrollment.goal,
    'startedAt', matched_enrollment.started_at,
    'onboardingCompletedAt', matched_enrollment.onboarding_completed_at,
    'planSnapshot', matched_enrollment.plan_snapshot_json
  );
end;
$$;

grant execute on function public.resolve_coaching_portal_context(text) to anon, authenticated;
