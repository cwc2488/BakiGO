-- Milestone 5: Cloud Foundation
-- Run in Supabase SQL Editor or via CLI

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  member_number text not null,
  name text not null,
  email text not null,
  role text not null default 'member',
  current_level text not null,
  sponsor_member_number text,
  created_at timestamptz not null default now(),
  constraint members_member_number_unique unique (member_number),
  constraint members_email_unique unique (email)
);

create table if not exists public.organization_relationships (
  id uuid primary key default gen_random_uuid(),
  parent_member_number text not null,
  child_member_number text not null,
  created_at timestamptz not null default now(),
  constraint organization_relationships_parent_child_unique unique (parent_member_number, child_member_number)
);

create index if not exists members_sponsor_member_number_idx
  on public.members (sponsor_member_number);

create index if not exists organization_relationships_parent_idx
  on public.organization_relationships (parent_member_number);

create index if not exists organization_relationships_child_idx
  on public.organization_relationships (child_member_number);

alter table public.members enable row level security;
alter table public.organization_relationships enable row level security;

-- Authenticated users can read the full org (same data on every device)
create policy "members_select_authenticated"
  on public.members for select
  to authenticated
  using (true);

create policy "organization_relationships_select_authenticated"
  on public.organization_relationships for select
  to authenticated
  using (true);

-- New sign-ups insert their own member row (email must match auth user)
create policy "members_insert_authenticated"
  on public.members for insert
  to authenticated
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "organization_relationships_insert_authenticated"
  on public.organization_relationships for insert
  to authenticated
  with check (true);
