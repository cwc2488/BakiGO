-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

-- QUIZ-AI-21 P1: Anonymous analysis sessions (+ quiz growth_share attribution bridge).
-- Service-role only. Opaque public token stored as SHA-256 hash. No PII.

-- Bridge: allow quiz responses to retain validated growth_shares.id (Referral /r authority).
alter table public.quiz_responses
  add column if not exists growth_share_id uuid references public.growth_shares (id) on delete set null;

create index if not exists quiz_responses_growth_share_idx
  on public.quiz_responses (growth_share_id)
  where growth_share_id is not null;

create table if not exists public.analysis_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  quiz_result_id uuid not null references public.quiz_results (id) on delete restrict,
  -- Attribution (server-validated only; never trust client ownership claims)
  source_type text not null
    check (source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate')),
  growth_share_id uuid references public.growth_shares (id) on delete set null,
  quiz_share_code text,
  referrer_member_id uuid references public.members (id) on delete set null,
  -- Future Radar source architecture (nullable; no product unlock)
  radar_candidate_id uuid,
  radar_source_meta jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'expired', 'abandoned')),
  analysis_state text not null default 'shell'
    check (analysis_state in ('shell', 'in_progress', 'report_ready', 'report_failed')),
  -- Eventual report linkage (table not created in P1)
  report_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  constraint analysis_sessions_expiry_after_create check (expires_at > created_at),
  constraint analysis_sessions_referral_share_consistency check (
    (source_type = 'referral_share' and growth_share_id is not null)
    or (source_type <> 'referral_share')
  ),
  constraint analysis_sessions_no_pii_placeholder check (true)
);

create index if not exists analysis_sessions_token_hash_idx
  on public.analysis_sessions (token_hash);

create index if not exists analysis_sessions_quiz_result_idx
  on public.analysis_sessions (quiz_result_id, created_at desc);

create index if not exists analysis_sessions_expires_at_idx
  on public.analysis_sessions (expires_at);

create index if not exists analysis_sessions_growth_share_idx
  on public.analysis_sessions (growth_share_id)
  where growth_share_id is not null;

comment on table public.analysis_sessions is
  'QUIZ-AI-21 P1 anonymous analysis sessions. Opaque token (hash only). No PII. 30-day expires_at.';

comment on column public.analysis_sessions.token_hash is
  'SHA-256 hex of opaque public token. Plaintext never stored.';

comment on column public.analysis_sessions.radar_candidate_id is
  'Future Radar candidate id (nullable). No FK / no product unlock in P1.';

alter table public.analysis_sessions enable row level security;
-- No policies: anon/authenticated denied. Server uses service role.

-- Deny-by-default: ensure no accidental grants
revoke all on table public.analysis_sessions from anon, authenticated;
grant all on table public.analysis_sessions to service_role;
