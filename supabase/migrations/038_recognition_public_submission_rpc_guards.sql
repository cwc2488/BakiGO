-- Recognition Center public submission RPC guards
-- Phase 4 defense-in-depth: recheck collection state and enabled awards
-- at RPC execution time, after server pre-validation / photo upload.
--
-- Additive only. CREATE OR REPLACE of create_public_recognition_submission.
-- Does not move file-signature validation into SQL.
-- Execute remains service_role only.

create or replace function public.create_public_recognition_submission(
  p_submission_id uuid,
  p_event_id uuid,
  p_submitter_name text,
  p_submitter_organization text,
  p_submitted_at timestamptz,
  p_source_context_json jsonb,
  p_entries jsonb
)
returns public.recognition_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.recognition_submissions;
  v_event public.recognition_events;
  v_now timestamptz;
  v_entry_count integer;
  v_valid_award_count integer;
begin
  if p_submission_id is null then
    raise exception 'submission_id is required';
  end if;

  if p_event_id is null then
    raise exception 'event_id is required';
  end if;

  if p_submitter_name is null or btrim(p_submitter_name) = '' then
    raise exception 'submitter_name is required';
  end if;

  if p_submitter_organization is null or btrim(p_submitter_organization) = '' then
    raise exception 'submitter_organization is required';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'entries are required';
  end if;

  -- Authoritative recheck before inserting any submission or entry rows.
  v_now := now();

  select *
  into v_event
  from public.recognition_events
  where id = p_event_id;

  if not found then
    raise exception 'recognition event not found';
  end if;

  -- Collecting-state validation
  if v_event.status is distinct from 'collecting' then
    raise exception 'recognition public collection is not collecting';
  end if;

  -- Collection-window validation (null bounds are unbounded)
  if v_event.collect_starts_at is not null
     and v_now < v_event.collect_starts_at then
    raise exception 'recognition public collection has not started';
  end if;

  if v_event.collect_ends_at is not null
     and v_now > v_event.collect_ends_at then
    raise exception 'recognition public collection has ended';
  end if;

  v_entry_count := jsonb_array_length(p_entries);

  -- Enabled-award validation: award must belong to this event and be enabled
  select count(*) into v_valid_award_count
  from jsonb_array_elements(p_entries) as e
  join public.recognition_event_awards rea
    on rea.id = (e->>'event_award_id')::uuid
   and rea.event_id = p_event_id
   and rea.is_enabled = true;

  if v_valid_award_count <> v_entry_count then
    raise exception 'one or more entries reference an invalid or disabled event award';
  end if;

  insert into public.recognition_submissions (
    id,
    event_id,
    submitter_name,
    submitter_organization,
    submitted_at,
    source_context_json
  )
  values (
    p_submission_id,
    p_event_id,
    btrim(p_submitter_name),
    btrim(p_submitter_organization),
    coalesce(p_submitted_at, now()),
    coalesce(p_source_context_json, '{}'::jsonb)
  )
  returning * into v_submission;

  insert into public.recognition_submission_entries (
    id,
    submission_id,
    event_id,
    event_award_id,
    submitted_name,
    normalized_name,
    original_photo_storage_path,
    original_photo_mime_type,
    original_photo_size_bytes
  )
  select
    (e->>'id')::uuid,
    p_submission_id,
    p_event_id,
    (e->>'event_award_id')::uuid,
    e->>'submitted_name',
    e->>'normalized_name',
    nullif(e->>'original_photo_storage_path', ''),
    nullif(e->>'original_photo_mime_type', ''),
    case
      when e ? 'original_photo_size_bytes' and (e->>'original_photo_size_bytes') <> '' then
        (e->>'original_photo_size_bytes')::integer
      else null
    end
  from jsonb_array_elements(p_entries) as e;

  return v_submission;
end;
$$;

revoke all on function public.create_public_recognition_submission(
  uuid, uuid, text, text, timestamptz, jsonb, jsonb
) from public;
revoke all on function public.create_public_recognition_submission(
  uuid, uuid, text, text, timestamptz, jsonb, jsonb
) from anon;
revoke all on function public.create_public_recognition_submission(
  uuid, uuid, text, text, timestamptz, jsonb, jsonb
) from authenticated;
grant execute on function public.create_public_recognition_submission(
  uuid, uuid, text, text, timestamptz, jsonb, jsonb
) to service_role;

comment on function public.create_public_recognition_submission(
  uuid, uuid, text, text, timestamptz, jsonb, jsonb
) is
  'Atomically creates a raw Recognition Center submission envelope and all raw entry rows. At execution time, before any insert, rechecks that the event exists, status is collecting, current DB time is inside the collection window, and each entry award belongs to the event and is enabled. Execute only via service_role from Next.js server handlers.';
