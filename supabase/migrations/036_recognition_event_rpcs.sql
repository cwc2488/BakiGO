-- Recognition Center Foundation RPCs
-- Phase 3 fix: make event creation and award reordering atomic.
--
-- Additive only. No destructive changes.
--
-- SECURITY BOUNDARY:
-- These functions are SECURITY DEFINER and MUST NOT be directly executable by
-- ordinary browser-authenticated Supabase users. The intended path is:
--
-- browser
--   -> authenticated Next.js API
--   -> assertRecognitionAdmin(memberId)
--   -> service-role Supabase client
--   -> RPC
--
-- Therefore EXECUTE is revoked from PUBLIC / anon / authenticated and granted
-- only to service_role.

-- ---------------------------------------------------------------------------
-- create_recognition_event_with_awards
-- Creates recognition_events row and its recognition_event_awards rows in ONE
-- transaction. Supports optional copied_from_event_id to clone enable/order
-- configuration from an existing event.
-- ---------------------------------------------------------------------------

create or replace function public.create_recognition_event_with_awards(
  p_name text,
  p_year integer,
  p_month integer,
  p_collect_starts_at timestamptz,
  p_collect_ends_at timestamptz,
  p_copied_from_event_id uuid,
  p_created_by_member_id uuid
)
returns public.recognition_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.recognition_events;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required';
  end if;

  if p_year < 2000 or p_year > 2100 then
    raise exception 'year must be between 2000 and 2100';
  end if;

  if p_month < 1 or p_month > 12 then
    raise exception 'month must be between 1 and 12';
  end if;

  if p_collect_starts_at is not null
     and p_collect_ends_at is not null
     and p_collect_ends_at < p_collect_starts_at then
    raise exception 'collect_ends_at cannot be before collect_starts_at';
  end if;

  insert into public.recognition_events (
    name,
    year,
    month,
    collect_starts_at,
    collect_ends_at,
    status,
    copied_from_event_id,
    created_by_member_id
  )
  values (
    btrim(p_name),
    p_year,
    p_month,
    p_collect_starts_at,
    p_collect_ends_at,
    'draft',
    p_copied_from_event_id,
    p_created_by_member_id
  )
  returning * into v_event;

  if p_copied_from_event_id is null then
    insert into public.recognition_event_awards (
      event_id,
      award_definition_id,
      sort_order,
      is_enabled
    )
    select
      v_event.id,
      d.id,
      d.sort_order,
      true
    from public.recognition_award_definitions d
    where d.is_active = true
    order by d.sort_order asc;
  else
    insert into public.recognition_event_awards (
      event_id,
      award_definition_id,
      sort_order,
      is_enabled
    )
    select
      v_event.id,
      d.id,
      coalesce(sea.sort_order, d.sort_order),
      coalesce(sea.is_enabled, true)
    from public.recognition_award_definitions d
    left join public.recognition_event_awards sea
      on sea.award_definition_id = d.id
     and sea.event_id = p_copied_from_event_id
    where d.is_active = true
    order by coalesce(sea.sort_order, d.sort_order) asc, d.sort_order asc;
  end if;

  return v_event;
end;
$$;

revoke all on function public.create_recognition_event_with_awards(
  text, integer, integer, timestamptz, timestamptz, uuid, uuid
) from public;
revoke all on function public.create_recognition_event_with_awards(
  text, integer, integer, timestamptz, timestamptz, uuid, uuid
) from anon;
revoke all on function public.create_recognition_event_with_awards(
  text, integer, integer, timestamptz, timestamptz, uuid, uuid
) from authenticated;

grant execute on function public.create_recognition_event_with_awards(
  text, integer, integer, timestamptz, timestamptz, uuid, uuid
) to service_role;

comment on function public.create_recognition_event_with_awards(
  text, integer, integer, timestamptz, timestamptz, uuid, uuid
) is
  'Atomically create a Recognition Event and populate event awards from the active catalog or copied event config.';

-- ---------------------------------------------------------------------------
-- reorder_recognition_event_awards
-- Reorders the COMPLETE set of award ids for one event atomically.
-- Validates:
-- - no duplicate ids
-- - supplied ids exactly match current event set
-- - all ids belong to the target event
-- ---------------------------------------------------------------------------

create or replace function public.reorder_recognition_event_awards(
  p_event_id uuid,
  p_award_ids uuid[]
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
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;

  if p_award_ids is null or array_length(p_award_ids, 1) is null then
    raise exception 'ordered award ids are required';
  end if;

  select count(*) into v_total
  from public.recognition_event_awards
  where event_id = p_event_id;

  if v_total = 0 then
    raise exception 'event has no awards or does not exist';
  end if;

  if array_length(p_award_ids, 1) <> v_total then
    raise exception 'ordered award ids must include the complete current event-award set';
  end if;

  select count(distinct x.award_id) into v_unique_count
  from unnest(p_award_ids) as x(award_id);

  if v_unique_count <> array_length(p_award_ids, 1) then
    raise exception 'ordered award ids contain duplicates';
  end if;

  select count(*) into v_matching_count
  from public.recognition_event_awards
  where event_id = p_event_id
    and id = any(p_award_ids);

  if v_matching_count <> v_total then
    raise exception 'ordered award ids must all belong to the target event';
  end if;

  for v_idx in 1 .. array_length(p_award_ids, 1) loop
    update public.recognition_event_awards
    set sort_order = v_idx,
        updated_at = now()
    where event_id = p_event_id
      and id = p_award_ids[v_idx];
  end loop;
end;
$$;

revoke all on function public.reorder_recognition_event_awards(uuid, uuid[]) from public;
revoke all on function public.reorder_recognition_event_awards(uuid, uuid[]) from anon;
revoke all on function public.reorder_recognition_event_awards(uuid, uuid[]) from authenticated;
grant execute on function public.reorder_recognition_event_awards(uuid, uuid[]) to service_role;

comment on function public.reorder_recognition_event_awards(uuid, uuid[]) is
  'Atomically reorder the complete set of recognition_event_awards for one event. Rejects duplicates, omissions, and foreign ids.';
