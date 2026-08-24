-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

-- QUIZ-VIRAL-01: consumer RESET result shares + viral evidence.
-- Additive only. Does not rewrite 038–041.
-- Result shares are NOT Partner /q codes. Public path is /s/{code}.

create table if not exists public.quiz_result_shares (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  source_analysis_session_id uuid not null unique
    references public.analysis_sessions (id) on delete restrict,
  source_customer_id uuid references public.customers (id) on delete set null,
  source_owner_member_id uuid references public.members (id) on delete set null,
  animal_type text not null
    check (animal_type in ('A', 'B', 'C', 'D', 'E', 'F')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint quiz_result_shares_code_opaque check (code ~ '^[A-Z0-9]{5,7}$')
);

create index if not exists quiz_result_shares_created_idx
  on public.quiz_result_shares (created_at desc);

comment on table public.quiz_result_shares is
  'QUIZ-VIRAL-01 consumer animal-result share. One opaque /s code per source analysis session. Not a Partner /q link. Not a business-potential score.';

create table if not exists public.quiz_result_share_views (
  id uuid primary key default gen_random_uuid(),
  result_share_id uuid not null
    references public.quiz_result_shares (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists quiz_result_share_views_share_idx
  on public.quiz_result_share_views (result_share_id, created_at desc);

comment on table public.quiz_result_share_views is
  'Human landing views for /s/{code}. Client POST only. Social crawler User-Agents must not insert.';

create table if not exists public.quiz_result_share_events (
  id uuid primary key default gen_random_uuid(),
  result_share_id uuid not null
    references public.quiz_result_shares (id) on delete cascade,
  analysis_session_id uuid
    references public.analysis_sessions (id) on delete cascade,
  event text not null
    check (event in (
      'result_reveal_viewed',
      'result_share_clicked',
      'native_share_completed',
      'result_share_fallback_saved'
    )),
  created_at timestamptz not null default now()
);

create unique index if not exists quiz_result_share_events_reveal_once
  on public.quiz_result_share_events (analysis_session_id, event)
  where event = 'result_reveal_viewed' and analysis_session_id is not null;

create index if not exists quiz_result_share_events_share_idx
  on public.quiz_result_share_events (result_share_id, event, created_at desc);

comment on table public.quiz_result_share_events is
  'Observable share-sheet evidence only. native_share_completed means the OS share sheet resolved — not that Instagram Story posted.';

alter table public.analysis_sessions
  add column if not exists result_share_id uuid
    references public.quiz_result_shares (id) on delete set null;

create index if not exists analysis_sessions_result_share_idx
  on public.analysis_sessions (result_share_id)
  where result_share_id is not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'analysis_sessions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.analysis_sessions drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'analysis_sessions_source_type_check'
  ) then
    alter table public.analysis_sessions
      add constraint analysis_sessions_source_type_check
      check (source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'experience_21d_interests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'attribution_source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.experience_21d_interests drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'experience_21d_interests_attribution_source_type_check'
  ) then
    alter table public.experience_21d_interests
      add constraint experience_21d_interests_attribution_source_type_check
      check (attribution_source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));
  end if;
end $$;

alter table public.quiz_result_shares enable row level security;
alter table public.quiz_result_share_views enable row level security;
alter table public.quiz_result_share_events enable row level security;

revoke all on table public.quiz_result_shares from anon, authenticated;
revoke all on table public.quiz_result_share_views from anon, authenticated;
revoke all on table public.quiz_result_share_events from anon, authenticated;
grant all on table public.quiz_result_shares to service_role;
grant all on table public.quiz_result_share_views to service_role;
grant all on table public.quiz_result_share_events to service_role;
