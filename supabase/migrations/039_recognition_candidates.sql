-- Recognition Center Candidates / Review / Historical Roster
-- Phase 5: consolidated review layer over immutable raw evidence
--
-- Additive only. Does NOT modify:
--   recognition_submissions, recognition_submission_entries raw fields,
--   career rank, members hierarchy, coaching, quiz, radar, referral.
--
-- SECURITY BOUNDARY:
-- Candidate/review tables are internal. RLS is enabled with zero anon /
-- authenticated table policies. SECURITY DEFINER RPCs are executable only
-- by service_role via:
--   browser -> authenticated Next.js API -> assertRecognitionAdmin
--   -> service_role -> RPC

-- ---------------------------------------------------------------------------
-- recognition_candidates
-- Admin working/result layer. NOT raw evidence.
-- Consolidation key: (event_id, event_award_id, normalized_name)
-- display_name is independently editable and must NOT change the key.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_candidates (
  id                         uuid        primary key default gen_random_uuid(),
  event_id                   uuid        not null references public.recognition_events (id) on delete cascade,
  event_award_id             uuid        not null references public.recognition_event_awards (id) on delete cascade,
  display_name               text        not null,
  normalized_name            text        not null,
  review_status              text        not null default 'pending'
                                         check (review_status in ('pending', 'approved', 'needs_fix', 'rejected')),
  member_id                  uuid        references public.members (id) on delete set null,
  preferred_source_entry_id  uuid,
  sort_order                 integer     not null default 0,
  reviewed_at                timestamptz,
  reviewed_by_member_id      uuid        references public.members (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint recognition_candidates_event_award_name_unique
    unique (event_id, event_award_id, normalized_name)
);

create index if not exists recognition_candidates_event_status_idx
  on public.recognition_candidates (event_id, review_status);

create index if not exists recognition_candidates_event_award_sort_idx
  on public.recognition_candidates (event_id, event_award_id, sort_order);

comment on table public.recognition_candidates is
  'Recognition Center consolidated review objects. Official presentation dataset uses approved rows only. Raw submissions remain immutable evidence.';

comment on column public.recognition_candidates.normalized_name is
  'Immutable exact-match consolidation key from raw entries. Admin display_name edits must not change this key and must not silently merge candidates.';

comment on column public.recognition_candidates.display_name is
  'Canonical/presentation name. Editable by Recognition Admin without mutating raw submitted_name.';

comment on column public.recognition_candidates.preferred_source_entry_id is
  'Selected original photo source for future Phase 6 processing. Must belong to this candidate''s evidence. No crop in Phase 5.';

-- ---------------------------------------------------------------------------
-- recognition_candidate_sources
-- Every candidate retains ALL raw source entries.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_candidate_sources (
  id                   uuid        primary key default gen_random_uuid(),
  candidate_id         uuid        not null references public.recognition_candidates (id) on delete cascade,
  submission_entry_id  uuid        not null references public.recognition_submission_entries (id) on delete cascade,
  created_at           timestamptz not null default now(),
  constraint recognition_candidate_sources_pair_unique
    unique (candidate_id, submission_entry_id),
  constraint recognition_candidate_sources_entry_unique
    unique (submission_entry_id)
);

create index if not exists recognition_candidate_sources_candidate_idx
  on public.recognition_candidate_sources (candidate_id);

comment on table public.recognition_candidate_sources is
  'Traceability join from a Recognition Candidate to every raw submission entry that fed it. Re-running consolidation must not duplicate these links.';

alter table public.recognition_candidates
  drop constraint if exists recognition_candidates_preferred_source_entry_id_fkey;

alter table public.recognition_candidates
  add constraint recognition_candidates_preferred_source_entry_id_fkey
  foreign key (preferred_source_entry_id)
  references public.recognition_submission_entries (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- RLS — internal tables, no public/authenticated policies
-- ---------------------------------------------------------------------------

alter table public.recognition_candidates enable row level security;
alter table public.recognition_candidate_sources enable row level security;

-- ---------------------------------------------------------------------------
-- consolidate_recognition_event_candidates
-- Deterministic, idempotent derivation from raw entries.
-- Does NOT overwrite review_status, display_name, preferred photo, or sort_order
-- of existing candidates.
-- ---------------------------------------------------------------------------

create or replace function public.consolidate_recognition_event_candidates(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_exists boolean;
  v_created_candidates integer := 0;
  v_created_sources integer := 0;
  v_candidate_count integer := 0;
  v_source_count integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;

  select exists(
    select 1 from public.recognition_events where id = p_event_id
  ) into v_event_exists;

  if not v_event_exists then
    raise exception 'recognition event not found';
  end if;

  -- Serialize concurrent consolidations for the same event.
  perform pg_advisory_xact_lock(
    ('x' || substr(md5('recognition_consolidate:' || p_event_id::text), 1, 16))::bit(64)::bigint
  );

  perform 1
  from public.recognition_events
  where id = p_event_id
  for update;

  insert into public.recognition_candidates (
    event_id,
    event_award_id,
    display_name,
    normalized_name,
    review_status,
    sort_order
  )
  select
    grouped.event_id,
    grouped.event_award_id,
    grouped.display_name,
    grouped.normalized_name,
    'pending',
    0
  from (
    select
      e.event_id,
      e.event_award_id,
      e.normalized_name,
      (array_agg(e.submitted_name order by e.created_at, e.id))[1] as display_name
    from public.recognition_submission_entries e
    where e.event_id = p_event_id
    group by e.event_id, e.event_award_id, e.normalized_name
  ) as grouped
  on conflict (event_id, event_award_id, normalized_name) do nothing;

  get diagnostics v_created_candidates = row_count;

  -- Assign sort_order only to newly inserted candidates (sort_order = 0).
  with new_rows as (
    select
      c.id,
      c.event_award_id,
      row_number() over (
        partition by c.event_award_id
        order by c.created_at, c.id
      ) as rn
    from public.recognition_candidates c
    where c.event_id = p_event_id
      and c.sort_order = 0
  ),
  maxes as (
    select
      c.event_award_id,
      coalesce(max(c.sort_order), 0) as max_sort
    from public.recognition_candidates c
    where c.event_id = p_event_id
      and c.sort_order > 0
    group by c.event_award_id
  )
  update public.recognition_candidates c
  set sort_order = coalesce(m.max_sort, 0) + n.rn,
      updated_at = now()
  from new_rows n
  left join maxes m on m.event_award_id = n.event_award_id
  where c.id = n.id;

  insert into public.recognition_candidate_sources (
    candidate_id,
    submission_entry_id
  )
  select
    c.id,
    e.id
  from public.recognition_submission_entries e
  join public.recognition_candidates c
    on c.event_id = e.event_id
   and c.event_award_id = e.event_award_id
   and c.normalized_name = e.normalized_name
  where e.event_id = p_event_id
  on conflict (submission_entry_id) do nothing;

  get diagnostics v_created_sources = row_count;

  -- Auto-pick earliest original photo only when preferred is still null.
  -- Never overwrite an administrator's preferred-photo choice.
  update public.recognition_candidates c
  set preferred_source_entry_id = picked.entry_id,
      updated_at = now()
  from (
    select distinct on (s.candidate_id)
      s.candidate_id,
      e.id as entry_id
    from public.recognition_candidate_sources s
    join public.recognition_submission_entries e
      on e.id = s.submission_entry_id
    join public.recognition_candidates c2
      on c2.id = s.candidate_id
    where c2.event_id = p_event_id
      and e.original_photo_storage_path is not null
      and btrim(e.original_photo_storage_path) <> ''
    order by s.candidate_id, e.created_at, e.id
  ) as picked
  where c.id = picked.candidate_id
    and c.preferred_source_entry_id is null;

  select count(*) into v_candidate_count
  from public.recognition_candidates
  where event_id = p_event_id;

  select count(*) into v_source_count
  from public.recognition_candidate_sources s
  join public.recognition_candidates c on c.id = s.candidate_id
  where c.event_id = p_event_id;

  return jsonb_build_object(
    'eventId', p_event_id,
    'candidateCount', v_candidate_count,
    'sourceLinkCount', v_source_count,
    'createdCandidateCount', v_created_candidates,
    'createdSourceLinkCount', v_created_sources
  );
end;
$$;

revoke all on function public.consolidate_recognition_event_candidates(uuid) from public;
revoke all on function public.consolidate_recognition_event_candidates(uuid) from anon;
revoke all on function public.consolidate_recognition_event_candidates(uuid) from authenticated;
grant execute on function public.consolidate_recognition_event_candidates(uuid) to service_role;

comment on function public.consolidate_recognition_event_candidates(uuid) is
  'Idempotently derive Recognition Candidates from raw submission entries for one event. Preserves review_status/display_name/preferred photo. Execute only via service_role.';

-- ---------------------------------------------------------------------------
-- reorder_recognition_event_candidates
-- Atomic complete-set reorder within one event award.
-- ---------------------------------------------------------------------------

create or replace function public.reorder_recognition_event_candidates(
  p_event_id uuid,
  p_event_award_id uuid,
  p_candidate_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_unique_count integer;
  v_matching_count integer;
  v_idx integer;
  v_award_belongs boolean;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;

  if p_event_award_id is null then
    raise exception 'event_award_id is required';
  end if;

  if p_candidate_ids is null or array_length(p_candidate_ids, 1) is null then
    raise exception 'ordered candidate ids are required';
  end if;

  select exists(
    select 1
    from public.recognition_event_awards
    where id = p_event_award_id
      and event_id = p_event_id
  ) into v_award_belongs;

  if not v_award_belongs then
    raise exception 'event award does not belong to the target event';
  end if;

  select count(*) into v_total
  from public.recognition_candidates
  where event_id = p_event_id
    and event_award_id = p_event_award_id;

  if v_total = 0 then
    raise exception 'award has no candidates';
  end if;

  if array_length(p_candidate_ids, 1) <> v_total then
    raise exception 'ordered candidate ids must include the complete current award candidate set';
  end if;

  select count(distinct x.candidate_id) into v_unique_count
  from unnest(p_candidate_ids) as x(candidate_id);

  if v_unique_count <> array_length(p_candidate_ids, 1) then
    raise exception 'ordered candidate ids contain duplicates';
  end if;

  select count(*) into v_matching_count
  from public.recognition_candidates
  where event_id = p_event_id
    and event_award_id = p_event_award_id
    and id = any(p_candidate_ids);

  if v_matching_count <> v_total then
    raise exception 'ordered candidate ids must all belong to the target event award';
  end if;

  for v_idx in 1 .. array_length(p_candidate_ids, 1) loop
    update public.recognition_candidates
    set sort_order = v_idx,
        updated_at = now()
    where event_id = p_event_id
      and event_award_id = p_event_award_id
      and id = p_candidate_ids[v_idx];
  end loop;
end;
$$;

revoke all on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) from public;
revoke all on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) from anon;
revoke all on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) from authenticated;
grant execute on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) to service_role;

comment on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) is
  'Atomically reorder the complete candidate set for one event award. Execute only via service_role.';
