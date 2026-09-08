-- LOSE2KG-02: V2 staff workstation + live dashboard (additive only).
-- Preserves V1 tables/tokens/RPC/business logic. Does not DROP or rename existing columns.

-- ---------------------------------------------------------------------------
-- Period V2 fields
-- ---------------------------------------------------------------------------
alter table public.lose2kg_periods
  add column if not exists staff_token_hash text,
  add column if not exists staff_token_hint text,
  add column if not exists staff_password_hash text,
  add column if not exists staff_password_updated_at timestamptz,
  add column if not exists staff_sessions_revoked_at timestamptz,
  add column if not exists public_show_weights boolean not null default false,
  add column if not exists live_draw_status text not null default 'idle';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lose2kg_periods_live_draw_status_check'
  ) then
    alter table public.lose2kg_periods
      add constraint lose2kg_periods_live_draw_status_check
      check (live_draw_status in ('idle', 'drawing', 'revealed'));
  end if;
end $$;

-- Staff token unique when present
create unique index if not exists lose2kg_periods_staff_token_hash_uidx
  on public.lose2kg_periods (staff_token_hash)
  where staff_token_hash is not null;

comment on column public.lose2kg_periods.staff_token_hash is
  'LOSE2KG-02 hashed staff workstation URL token. Password still required.';
comment on column public.lose2kg_periods.staff_password_hash is
  'LOSE2KG-02 hashed staff password (never plaintext).';
comment on column public.lose2kg_periods.public_show_weights is
  'LOSE2KG-02 when false, live dashboard only shows name + total tickets.';
comment on column public.lose2kg_periods.live_draw_status is
  'LOSE2KG-02 live dashboard draw broadcast: idle|drawing|revealed.';

-- V1 public_token_hash remains the live/participant dashboard token.
-- No destructive migration of existing period rows.

-- ---------------------------------------------------------------------------
-- Staff sessions (httpOnly cookie holds raw token; DB stores hash)
-- ---------------------------------------------------------------------------
create table if not exists public.lose2kg_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  session_token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint lose2kg_staff_sessions_token_len check (char_length(session_token_hash) between 32 and 128)
);

create unique index if not exists lose2kg_staff_sessions_token_uidx
  on public.lose2kg_staff_sessions (session_token_hash);

create index if not exists lose2kg_staff_sessions_period_idx
  on public.lose2kg_staff_sessions (period_id, expires_at desc);

comment on table public.lose2kg_staff_sessions is
  'LOSE2KG-02 staff workstation sessions. Cookie holds raw token; revoke via revoked_at or period.staff_sessions_revoked_at.';

alter table public.lose2kg_staff_sessions enable row level security;
revoke all on table public.lose2kg_staff_sessions from anon, authenticated;
grant all on table public.lose2kg_staff_sessions to service_role;
