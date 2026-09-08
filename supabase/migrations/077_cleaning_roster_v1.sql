-- CLEANING-ROSTER-01: Admin-only cleaning duty roster (areas, members, weighted draw).
-- Additive only. Service-role access; API enforces Super Admin.

-- ---------------------------------------------------------------------------
-- Areas
-- ---------------------------------------------------------------------------
create table if not exists public.cleaning_roster_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaning_roster_areas_name_len check (char_length(name) between 1 and 60),
  constraint cleaning_roster_areas_status_check check (status in ('active', 'deleted'))
);

create index if not exists cleaning_roster_areas_status_sort_idx
  on public.cleaning_roster_areas (status, sort_order, created_at);

comment on table public.cleaning_roster_areas is
  'CLEANING-ROSTER-01 cleaning areas. Soft-delete via status=deleted; history keeps name snapshots.';

-- ---------------------------------------------------------------------------
-- Members (participants — not app members table)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaning_roster_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  current_weight numeric(10, 2) not null default 1.0,
  total_assignments integer not null default 0,
  consecutive_rest_rounds integer not null default 0,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaning_roster_members_name_len check (char_length(name) between 1 and 60),
  constraint cleaning_roster_members_status_check check (status in ('active', 'deleted')),
  constraint cleaning_roster_members_weight_pos check (current_weight > 0),
  constraint cleaning_roster_members_assignments_nonneg check (total_assignments >= 0),
  constraint cleaning_roster_members_rest_nonneg check (consecutive_rest_rounds >= 0)
);

create index if not exists cleaning_roster_members_status_sort_idx
  on public.cleaning_roster_members (status, sort_order, created_at);

comment on table public.cleaning_roster_members is
  'CLEANING-ROSTER-01 roster participants with fairness weights. Renames do not reset history weights.';

-- ---------------------------------------------------------------------------
-- Rounds (confirmed draws only)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaning_roster_rounds (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  confirmed_by_member_id uuid references public.members (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint cleaning_roster_rounds_idempotency_len check (char_length(idempotency_key) between 8 and 80)
);

create unique index if not exists cleaning_roster_rounds_idempotency_uidx
  on public.cleaning_roster_rounds (idempotency_key);

create index if not exists cleaning_roster_rounds_confirmed_idx
  on public.cleaning_roster_rounds (confirmed_at desc);

comment on table public.cleaning_roster_rounds is
  'CLEANING-ROSTER-01 confirmed draw rounds. Preview/redraw never writes here. idempotency_key blocks double confirm.';

-- ---------------------------------------------------------------------------
-- Assignments (snapshots for history)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaning_roster_assignments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.cleaning_roster_rounds (id) on delete cascade,
  area_id uuid references public.cleaning_roster_areas (id) on delete set null,
  member_id uuid references public.cleaning_roster_members (id) on delete set null,
  area_name_snapshot text,
  member_name_snapshot text not null,
  role text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint cleaning_roster_assignments_role_check check (role in ('assigned', 'rest')),
  constraint cleaning_roster_assignments_assigned_shape check (
    (role = 'rest' and area_name_snapshot is null)
    or (role = 'assigned' and area_name_snapshot is not null and char_length(area_name_snapshot) between 1 and 60)
  ),
  constraint cleaning_roster_assignments_member_name_len check (
    char_length(member_name_snapshot) between 1 and 60
  )
);

create index if not exists cleaning_roster_assignments_round_idx
  on public.cleaning_roster_assignments (round_id, role, sort_order);

comment on table public.cleaning_roster_assignments is
  'CLEANING-ROSTER-01 per-round assignments + resters with name snapshots for durable history.';

-- ---------------------------------------------------------------------------
-- Meta (fairness reset timestamp)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaning_roster_meta (
  id text primary key default 'default',
  fairness_reset_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint cleaning_roster_meta_singleton check (id = 'default')
);

insert into public.cleaning_roster_meta (id)
values ('default')
on conflict (id) do nothing;

comment on table public.cleaning_roster_meta is
  'CLEANING-ROSTER-01 singleton meta (fairness reset timestamp). History rounds are retained.';

-- ---------------------------------------------------------------------------
-- Atomic confirm
-- ---------------------------------------------------------------------------
create or replace function public.confirm_cleaning_roster_round(
  p_idempotency_key text,
  p_confirmed_by_member_id uuid,
  p_assignments jsonb,
  p_resting jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_round_id uuid;
  v_item jsonb;
  v_member_id uuid;
  v_sort integer := 0;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;

  select id into v_existing_id
  from public.cleaning_roster_rounds
  where idempotency_key = p_idempotency_key;

  if v_existing_id is not null then
    return jsonb_build_object('round_id', v_existing_id, 'duplicate', true);
  end if;

  insert into public.cleaning_roster_rounds (idempotency_key, confirmed_by_member_id)
  values (p_idempotency_key, p_confirmed_by_member_id)
  returning id into v_round_id;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  loop
    v_sort := v_sort + 1;
    v_member_id := (v_item->>'member_id')::uuid;

    insert into public.cleaning_roster_assignments (
      round_id, area_id, member_id, area_name_snapshot, member_name_snapshot, role, sort_order
    ) values (
      v_round_id,
      nullif(v_item->>'area_id', '')::uuid,
      v_member_id,
      v_item->>'area_name',
      v_item->>'member_name',
      'assigned',
      v_sort
    );

    update public.cleaning_roster_members
    set
      current_weight = 1.0,
      total_assignments = total_assignments + 1,
      consecutive_rest_rounds = 0,
      updated_at = now()
    where id = v_member_id
      and status = 'active';
  end loop;

  v_sort := 0;
  for v_item in
    select * from jsonb_array_elements(coalesce(p_resting, '[]'::jsonb))
  loop
    v_sort := v_sort + 1;
    v_member_id := (v_item->>'member_id')::uuid;

    insert into public.cleaning_roster_assignments (
      round_id, area_id, member_id, area_name_snapshot, member_name_snapshot, role, sort_order
    ) values (
      v_round_id,
      null,
      v_member_id,
      null,
      v_item->>'member_name',
      'rest',
      v_sort
    );

    update public.cleaning_roster_members
    set
      current_weight = current_weight + 0.5,
      consecutive_rest_rounds = consecutive_rest_rounds + 1,
      updated_at = now()
    where id = v_member_id
      and status = 'active';
  end loop;

  return jsonb_build_object('round_id', v_round_id, 'duplicate', false);
exception
  when unique_violation then
    select id into v_existing_id
    from public.cleaning_roster_rounds
    where idempotency_key = p_idempotency_key;
    return jsonb_build_object('round_id', v_existing_id, 'duplicate', true);
end;
$$;

revoke all on function public.confirm_cleaning_roster_round(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_cleaning_roster_round(text, uuid, jsonb, jsonb) to service_role;

comment on function public.confirm_cleaning_roster_round is
  'CLEANING-ROSTER-01 atomically confirm a preview: write round + snapshots + fairness weight updates. Idempotent on key.';

-- ---------------------------------------------------------------------------
-- RLS: service-role only
-- ---------------------------------------------------------------------------
alter table public.cleaning_roster_areas enable row level security;
alter table public.cleaning_roster_members enable row level security;
alter table public.cleaning_roster_rounds enable row level security;
alter table public.cleaning_roster_assignments enable row level security;
alter table public.cleaning_roster_meta enable row level security;

revoke all on table public.cleaning_roster_areas from anon, authenticated;
revoke all on table public.cleaning_roster_members from anon, authenticated;
revoke all on table public.cleaning_roster_rounds from anon, authenticated;
revoke all on table public.cleaning_roster_assignments from anon, authenticated;
revoke all on table public.cleaning_roster_meta from anon, authenticated;

grant all on table public.cleaning_roster_areas to service_role;
grant all on table public.cleaning_roster_members to service_role;
grant all on table public.cleaning_roster_rounds to service_role;
grant all on table public.cleaning_roster_assignments to service_role;
grant all on table public.cleaning_roster_meta to service_role;
