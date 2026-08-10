-- Quiz icebreaker V1: fat-loss personality quiz for prospect engagement.

create table if not exists public.quiz_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  version text not null default '1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quiz_definitions (id) on delete cascade,
  order_index integer not null,
  question_text text not null,
  question_type text not null check (question_type in ('single', 'multi')),
  options_json jsonb not null default '[]'::jsonb,
  scoring_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (quiz_id, order_index)
);

create table if not exists public.quiz_share_links (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quiz_definitions (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_code text not null unique,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists quiz_share_links_owner_idx
  on public.quiz_share_links (owner_member_id, quiz_id);

create table if not exists public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quiz_definitions (id) on delete cascade,
  respondent_name text not null,
  respondent_contact text,
  referrer_member_id uuid references public.members (id) on delete set null,
  share_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  answers_json jsonb not null default '{}'::jsonb
);

create index if not exists quiz_responses_referrer_idx
  on public.quiz_responses (referrer_member_id, completed_at desc nulls last);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null unique references public.quiz_responses (id) on delete cascade,
  primary_type text not null check (primary_type in ('A', 'B', 'C', 'D', 'E', 'F')),
  secondary_type text not null check (secondary_type in ('A', 'B', 'C', 'D', 'E', 'F')),
  personality_scores_json jsonb not null,
  urgency text not null check (urgency in ('low', 'medium', 'high', 'very_high')),
  readiness text not null check (readiness in ('low', 'medium', 'high', 'very_high')),
  action_history_json jsonb not null default '[]'::jsonb,
  primary_goal text not null,
  interaction_priority text not null check (interaction_priority in ('low', 'medium', 'high', 'very_high')),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_ai_followups (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.quiz_results (id) on delete cascade,
  generated_message text not null,
  model text not null default 'rule_v1',
  created_at timestamptz not null default now()
);

create index if not exists quiz_ai_followups_result_idx
  on public.quiz_ai_followups (result_id, created_at desc);

alter table public.quiz_definitions enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_share_links enable row level security;
alter table public.quiz_responses enable row level security;
alter table public.quiz_results enable row level security;
alter table public.quiz_ai_followups enable row level security;

comment on table public.quiz_definitions is 'Psych quiz definitions for icebreaker / prospect engagement.';
comment on table public.quiz_results is 'Scored quiz outcome; interaction_priority is engagement signal, not purchase probability.';

insert into public.quiz_definitions (slug, title, description, status, version)
values (
  'fat-loss',
  '你是哪一種瘦不下來的人？',
  '12 題，找出真正讓你卡住的原因',
  'active',
  '1.0'
)
on conflict (slug) do nothing;
