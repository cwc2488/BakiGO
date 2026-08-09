-- AI Radar Scoring Engine v1 foundation
-- Stores policy version references and candidate score snapshots for audit/reproducibility.

create table if not exists public.radar_scoring_policy_versions (
  id text primary key,
  scoring_version text not null default 'v1',
  config jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.radar_scoring_policy_versions (id, scoring_version, config)
values (
  'ai_radar_scoring_v1',
  'v1',
  jsonb_build_object(
    'change_window', 40,
    'needs_fit', 25,
    'contactability', 20,
    'core_traits', 5,
    'activity', 5,
    'location', 5,
    'core_trait_max', jsonb_build_object(
      'consistency_resilience', 1.5,
      'responsibility_commitment', 1.3,
      'team_collaboration', 1.2,
      'sharing_influence', 1.0
    )
  )
)
on conflict (id) do nothing;

create table if not exists public.radar_candidate_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid,
  member_id uuid,
  scoring_version text not null default 'v1',
  overall_score numeric not null,
  component_scores jsonb not null,
  core_traits_audit jsonb,
  extraction_snapshot jsonb,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists radar_candidate_score_snapshots_candidate_idx
  on public.radar_candidate_score_snapshots (candidate_id, analyzed_at desc);

create index if not exists radar_candidate_score_snapshots_member_idx
  on public.radar_candidate_score_snapshots (member_id, analyzed_at desc);

comment on table public.radar_scoring_policy_versions is
  'Versioned AI Radar scoring policy metadata — AI_RADAR_SCORING_VERSION v1';

comment on table public.radar_candidate_score_snapshots is
  'Full-precision score snapshots for ranking audit and re-recommendation history';
