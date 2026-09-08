-- LOSE2KG-01: Independent「再瘦2公斤」admin activity system.
-- Additive only. Service-role access; API enforces Super Admin.
-- Does not modify existing tables, RPCs, triggers, or RLS of other features.

-- ---------------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',
  start_date date,
  measurement_date_1 date not null,
  measurement_date_2 date not null,
  measurement_date_3 date not null,
  measurement_date_4 date not null,
  public_token_hash text,
  public_token_hint text,
  public_enabled boolean not null default false,
  created_by_member_id uuid references public.members (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lose2kg_periods_name_len check (char_length(name) between 1 and 80),
  constraint lose2kg_periods_status_check check (status in ('draft', 'active', 'completed')),
  constraint lose2kg_periods_dates_order check (
    measurement_date_1 <= measurement_date_2
    and measurement_date_2 <= measurement_date_3
    and measurement_date_3 <= measurement_date_4
  )
);

create unique index if not exists lose2kg_periods_public_token_hash_uidx
  on public.lose2kg_periods (public_token_hash)
  where public_token_hash is not null;

create index if not exists lose2kg_periods_status_created_idx
  on public.lose2kg_periods (status, created_at desc);

comment on table public.lose2kg_periods is
  'LOSE2KG-01 activity periods. Public access via hashed token when public_enabled.';

-- ---------------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_participants (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  name text not null,
  public_display_name text not null,
  status text not null default 'active',
  note text,
  sort_order integer not null default 0,
  weight_ticket_balance integer not null default 0,
  activity_ticket_balance integer not null default 0,
  current_weight_change_pct numeric(12, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lose2kg_participants_name_len check (char_length(name) between 1 and 60),
  constraint lose2kg_participants_public_name_len check (char_length(public_display_name) between 1 and 60),
  constraint lose2kg_participants_status_check check (status in ('active', 'withdrawn', 'disqualified')),
  constraint lose2kg_participants_weight_tickets_nonneg check (weight_ticket_balance >= 0),
  constraint lose2kg_participants_activity_tickets_nonneg check (activity_ticket_balance >= 0)
);

create index if not exists lose2kg_participants_period_sort_idx
  on public.lose2kg_participants (period_id, sort_order, created_at);

create index if not exists lose2kg_participants_period_status_idx
  on public.lose2kg_participants (period_id, status);

comment on table public.lose2kg_participants is
  'LOSE2KG-01 period participants. Cached ticket balances must match ledger aggregates.';

-- ---------------------------------------------------------------------------
-- Measurements (4 slots per participant)
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_measurements (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  participant_id uuid not null references public.lose2kg_participants (id) on delete cascade,
  slot integer not null,
  weight_kg numeric(8, 3),
  measured_at timestamptz,
  weight_change_pct numeric(12, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lose2kg_measurements_slot_check check (slot in (1, 2, 3, 4)),
  constraint lose2kg_measurements_weight_pos check (weight_kg is null or weight_kg > 0)
);

create unique index if not exists lose2kg_measurements_participant_slot_uidx
  on public.lose2kg_measurements (participant_id, slot);

create index if not exists lose2kg_measurements_period_idx
  on public.lose2kg_measurements (period_id, participant_id);

comment on table public.lose2kg_measurements is
  'LOSE2KG-01 measurement slots 1..4. Slot 1 is baseline (no tickets).';

-- ---------------------------------------------------------------------------
-- Weight milestone ledger (unique award invariant)
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_weight_milestones (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  participant_id uuid not null references public.lose2kg_participants (id) on delete cascade,
  milestone_percent integer not null,
  ticket_state text not null default 'active',
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint lose2kg_weight_milestones_percent_pos check (milestone_percent >= 1),
  constraint lose2kg_weight_milestones_state_check check (ticket_state in ('active', 'revoked'))
);

create unique index if not exists lose2kg_weight_milestones_unique_uidx
  on public.lose2kg_weight_milestones (participant_id, period_id, milestone_percent);

create index if not exists lose2kg_weight_milestones_participant_idx
  on public.lose2kg_weight_milestones (participant_id, ticket_state);

comment on table public.lose2kg_weight_milestones is
  'LOSE2KG-01 ever-awarded weight milestones. Unique per participant/period/percent.';

-- ---------------------------------------------------------------------------
-- Ticket event ledger
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_ticket_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  participant_id uuid not null references public.lose2kg_participants (id) on delete cascade,
  event_type text not null,
  delta integer not null,
  reason text,
  related_measurement_id uuid references public.lose2kg_measurements (id) on delete set null,
  related_milestone integer,
  created_by_member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lose2kg_ticket_events_type_check check (
    event_type in (
      'weight_milestone_awarded',
      'weight_ticket_revoked',
      'manual_add',
      'manual_remove',
      'correction'
    )
  ),
  constraint lose2kg_ticket_events_delta_nonzero check (delta <> 0)
);

create index if not exists lose2kg_ticket_events_participant_idx
  on public.lose2kg_ticket_events (participant_id, created_at desc);

create index if not exists lose2kg_ticket_events_period_idx
  on public.lose2kg_ticket_events (period_id, created_at desc);

comment on table public.lose2kg_ticket_events is
  'LOSE2KG-01 immutable ticket ledger. Balances are cached but rebuildable from this table.';

-- ---------------------------------------------------------------------------
-- Measurement audit (edits)
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_measurement_audits (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  participant_id uuid not null references public.lose2kg_participants (id) on delete cascade,
  measurement_id uuid not null references public.lose2kg_measurements (id) on delete cascade,
  slot integer not null,
  old_weight_kg numeric(8, 3),
  new_weight_kg numeric(8, 3),
  reason text,
  edited_by_member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lose2kg_measurement_audits_measurement_idx
  on public.lose2kg_measurement_audits (measurement_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Prizes
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_prizes (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  name text not null,
  winner_count integer not null default 1,
  sort_order integer not null default 0,
  status text not null default 'pending',
  allow_duplicate_winners boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lose2kg_prizes_name_len check (char_length(name) between 1 and 60),
  constraint lose2kg_prizes_winner_count_pos check (winner_count >= 1),
  constraint lose2kg_prizes_status_check check (status in ('pending', 'drawn', 'void'))
);

create index if not exists lose2kg_prizes_period_sort_idx
  on public.lose2kg_prizes (period_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- Formal draws (ticket-weighted)
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_draws (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  prize_id uuid not null references public.lose2kg_prizes (id) on delete cascade,
  status text not null default 'completed',
  winner_participant_id uuid references public.lose2kg_participants (id) on delete set null,
  winner_name_snapshot text,
  winner_ticket_count integer,
  total_pool_ticket_count integer,
  random_metadata jsonb,
  drawn_by_member_id uuid references public.members (id) on delete set null,
  drawn_at timestamptz,
  voided_by_member_id uuid references public.members (id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint lose2kg_draws_status_check check (status in ('completed', 'void')),
  constraint lose2kg_draws_idempotency_len check (char_length(idempotency_key) between 8 and 80)
);

create unique index if not exists lose2kg_draws_idempotency_uidx
  on public.lose2kg_draws (idempotency_key);

-- At most one active completed draw per prize (voided rows may coexist for history).
create unique index if not exists lose2kg_draws_active_prize_uidx
  on public.lose2kg_draws (prize_id)
  where status = 'completed';

create index if not exists lose2kg_draws_period_idx
  on public.lose2kg_draws (period_id, drawn_at desc);

comment on table public.lose2kg_draws is
  'LOSE2KG-01 formal weighted draws. Unique completed draw per prize; void keeps history.';

create table if not exists public.lose2kg_draw_winners (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.lose2kg_draws (id) on delete cascade,
  participant_id uuid references public.lose2kg_participants (id) on delete set null,
  participant_name_snapshot text not null,
  ticket_count integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint lose2kg_draw_winners_name_len check (char_length(participant_name_snapshot) between 1 and 60)
);

create index if not exists lose2kg_draw_winners_draw_idx
  on public.lose2kg_draw_winners (draw_id, sort_order);

-- ---------------------------------------------------------------------------
-- Temporary equal-probability draw sessions
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_temp_draw_sessions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  status text not null default 'pending',
  public_token_hash text not null,
  public_token_hint text,
  winner_participant_id uuid references public.lose2kg_participants (id) on delete set null,
  winner_name_snapshot text,
  entry_count integer,
  random_metadata jsonb,
  created_by_member_id uuid references public.members (id) on delete set null,
  drawn_at timestamptz,
  voided_by_member_id uuid references public.members (id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lose2kg_temp_draw_sessions_status_check check (status in ('pending', 'completed', 'void'))
);

create unique index if not exists lose2kg_temp_draw_sessions_token_uidx
  on public.lose2kg_temp_draw_sessions (public_token_hash);

create index if not exists lose2kg_temp_draw_sessions_period_idx
  on public.lose2kg_temp_draw_sessions (period_id, created_at desc);

create table if not exists public.lose2kg_temp_draw_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lose2kg_temp_draw_sessions (id) on delete cascade,
  participant_id uuid not null references public.lose2kg_participants (id) on delete cascade,
  participant_name_snapshot text not null,
  present boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lose2kg_temp_draw_entries_name_len check (char_length(participant_name_snapshot) between 1 and 60)
);

create unique index if not exists lose2kg_temp_draw_entries_session_participant_uidx
  on public.lose2kg_temp_draw_entries (session_id, participant_id);

create index if not exists lose2kg_temp_draw_entries_session_present_idx
  on public.lose2kg_temp_draw_entries (session_id, present);

-- ---------------------------------------------------------------------------
-- Atomic formal draw confirm (race-safe)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_lose2kg_formal_draw(
  p_idempotency_key text,
  p_period_id uuid,
  p_prize_id uuid,
  p_winners jsonb,
  p_total_pool_ticket_count integer,
  p_random_metadata jsonb,
  p_drawn_by_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.lose2kg_draws%rowtype;
  v_prize public.lose2kg_prizes%rowtype;
  v_draw_id uuid;
  v_item jsonb;
  v_sort integer := 0;
  v_first_winner_id uuid;
  v_first_winner_name text;
  v_first_winner_tickets integer;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;

  if p_winners is null or jsonb_typeof(p_winners) <> 'array' or jsonb_array_length(p_winners) < 1 then
    raise exception 'invalid_winners' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.lose2kg_draws
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'draw_id', v_existing.id,
      'duplicate', true,
      'winner_participant_id', v_existing.winner_participant_id,
      'winner_name_snapshot', v_existing.winner_name_snapshot,
      'status', v_existing.status
    );
  end if;

  select * into v_prize
  from public.lose2kg_prizes
  where id = p_prize_id
    and period_id = p_period_id
  for update;

  if not found then
    raise exception 'prize_not_found' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.lose2kg_draws
    where prize_id = p_prize_id
      and status = 'completed'
  ) then
    select * into v_existing
    from public.lose2kg_draws
    where prize_id = p_prize_id
      and status = 'completed'
    limit 1;
    return jsonb_build_object(
      'draw_id', v_existing.id,
      'duplicate', true,
      'winner_participant_id', v_existing.winner_participant_id,
      'winner_name_snapshot', v_existing.winner_name_snapshot,
      'status', v_existing.status
    );
  end if;

  v_first_winner_id := nullif(p_winners->0->>'participant_id', '')::uuid;
  v_first_winner_name := p_winners->0->>'name';
  v_first_winner_tickets := coalesce((p_winners->0->>'ticket_count')::integer, 0);

  insert into public.lose2kg_draws (
    period_id,
    prize_id,
    status,
    winner_participant_id,
    winner_name_snapshot,
    winner_ticket_count,
    total_pool_ticket_count,
    random_metadata,
    drawn_by_member_id,
    drawn_at,
    idempotency_key
  ) values (
    p_period_id,
    p_prize_id,
    'completed',
    v_first_winner_id,
    v_first_winner_name,
    v_first_winner_tickets,
    p_total_pool_ticket_count,
    p_random_metadata,
    p_drawn_by_member_id,
    now(),
    p_idempotency_key
  )
  returning id into v_draw_id;

  for v_item in select * from jsonb_array_elements(p_winners)
  loop
    v_sort := v_sort + 1;
    insert into public.lose2kg_draw_winners (
      draw_id, participant_id, participant_name_snapshot, ticket_count, sort_order
    ) values (
      v_draw_id,
      nullif(v_item->>'participant_id', '')::uuid,
      v_item->>'name',
      coalesce((v_item->>'ticket_count')::integer, 0),
      v_sort
    );
  end loop;

  update public.lose2kg_prizes
  set status = 'drawn', updated_at = now()
  where id = p_prize_id;

  return jsonb_build_object(
    'draw_id', v_draw_id,
    'duplicate', false,
    'winner_participant_id', v_first_winner_id,
    'winner_name_snapshot', v_first_winner_name,
    'status', 'completed'
  );
exception
  when unique_violation then
    select * into v_existing
    from public.lose2kg_draws
    where idempotency_key = p_idempotency_key
       or (prize_id = p_prize_id and status = 'completed')
    order by created_at asc
    limit 1;
    return jsonb_build_object(
      'draw_id', v_existing.id,
      'duplicate', true,
      'winner_participant_id', v_existing.winner_participant_id,
      'winner_name_snapshot', v_existing.winner_name_snapshot,
      'status', v_existing.status
    );
end;
$$;

revoke all on function public.confirm_lose2kg_formal_draw(text, uuid, uuid, jsonb, integer, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_lose2kg_formal_draw(text, uuid, uuid, jsonb, integer, jsonb, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Atomic temp draw execute (public-callable via service role only)
-- ---------------------------------------------------------------------------
create or replace function public.execute_lose2kg_temp_draw(
  p_session_id uuid,
  p_winner_participant_id uuid,
  p_winner_name_snapshot text,
  p_entry_count integer,
  p_random_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lose2kg_temp_draw_sessions%rowtype;
begin
  select * into v_session
  from public.lose2kg_temp_draw_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_session.status = 'completed' then
    return jsonb_build_object(
      'session_id', v_session.id,
      'duplicate', true,
      'status', v_session.status,
      'winner_participant_id', v_session.winner_participant_id,
      'winner_name_snapshot', v_session.winner_name_snapshot
    );
  end if;

  if v_session.status <> 'pending' then
    raise exception 'session_not_pending' using errcode = 'P0001';
  end if;

  update public.lose2kg_temp_draw_sessions
  set
    status = 'completed',
    winner_participant_id = p_winner_participant_id,
    winner_name_snapshot = p_winner_name_snapshot,
    entry_count = p_entry_count,
    random_metadata = p_random_metadata,
    drawn_at = now(),
    updated_at = now()
  where id = p_session_id
    and status = 'pending'
  returning * into v_session;

  if not found then
    select * into v_session from public.lose2kg_temp_draw_sessions where id = p_session_id;
    return jsonb_build_object(
      'session_id', v_session.id,
      'duplicate', true,
      'status', v_session.status,
      'winner_participant_id', v_session.winner_participant_id,
      'winner_name_snapshot', v_session.winner_name_snapshot
    );
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'duplicate', false,
    'status', 'completed',
    'winner_participant_id', v_session.winner_participant_id,
    'winner_name_snapshot', v_session.winner_name_snapshot
  );
end;
$$;

revoke all on function public.execute_lose2kg_temp_draw(uuid, uuid, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.execute_lose2kg_temp_draw(uuid, uuid, text, integer, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- RLS: service-role only (API enforces Super Admin / public token checks)
-- ---------------------------------------------------------------------------
alter table public.lose2kg_periods enable row level security;
alter table public.lose2kg_participants enable row level security;
alter table public.lose2kg_measurements enable row level security;
alter table public.lose2kg_weight_milestones enable row level security;
alter table public.lose2kg_ticket_events enable row level security;
alter table public.lose2kg_measurement_audits enable row level security;
alter table public.lose2kg_prizes enable row level security;
alter table public.lose2kg_draws enable row level security;
alter table public.lose2kg_draw_winners enable row level security;
alter table public.lose2kg_temp_draw_sessions enable row level security;
alter table public.lose2kg_temp_draw_entries enable row level security;

revoke all on table public.lose2kg_periods from anon, authenticated;
revoke all on table public.lose2kg_participants from anon, authenticated;
revoke all on table public.lose2kg_measurements from anon, authenticated;
revoke all on table public.lose2kg_weight_milestones from anon, authenticated;
revoke all on table public.lose2kg_ticket_events from anon, authenticated;
revoke all on table public.lose2kg_measurement_audits from anon, authenticated;
revoke all on table public.lose2kg_prizes from anon, authenticated;
revoke all on table public.lose2kg_draws from anon, authenticated;
revoke all on table public.lose2kg_draw_winners from anon, authenticated;
revoke all on table public.lose2kg_temp_draw_sessions from anon, authenticated;
revoke all on table public.lose2kg_temp_draw_entries from anon, authenticated;

grant all on table public.lose2kg_periods to service_role;
grant all on table public.lose2kg_participants to service_role;
grant all on table public.lose2kg_measurements to service_role;
grant all on table public.lose2kg_weight_milestones to service_role;
grant all on table public.lose2kg_ticket_events to service_role;
grant all on table public.lose2kg_measurement_audits to service_role;
grant all on table public.lose2kg_prizes to service_role;
grant all on table public.lose2kg_draws to service_role;
grant all on table public.lose2kg_draw_winners to service_role;
grant all on table public.lose2kg_temp_draw_sessions to service_role;
grant all on table public.lose2kg_temp_draw_entries to service_role;
