-- 045: Recognition Center self-service validation + Exception Center
-- Additive / backward-compatible / idempotent.
-- Does not DROP organization columns, Award Definitions, or existing evidence.
-- Does not touch members / customers / coaching / quiz / radar / leaderboard.

-- ---------------------------------------------------------------------------
-- recognition_submissions: public resume/edit token
-- ---------------------------------------------------------------------------

alter table public.recognition_submissions
  add column if not exists public_edit_token text,
  add column if not exists public_edit_token_hash text;

create unique index if not exists recognition_submissions_public_edit_token_hash_unique
  on public.recognition_submissions (public_edit_token_hash)
  where public_edit_token_hash is not null;

comment on column public.recognition_submissions.public_edit_token is
  'Raw high-entropy token so the submitter can resume/edit before the collection deadline. Service-role only.';

comment on column public.recognition_submissions.public_edit_token_hash is
  'SHA-256 hex of the public edit token for lookup.';

-- ---------------------------------------------------------------------------
-- recognition_submission_entries: validation / crop / override / exclude
-- ---------------------------------------------------------------------------

alter table public.recognition_submission_entries
  add column if not exists validation_status text not null default 'BLOCKED',
  add column if not exists validation_issues jsonb not null default '[]'::jsonb,
  add column if not exists submitter_confirmed_warnings text[] not null default '{}'::text[],
  add column if not exists current_photo_storage_path text,
  add column if not exists current_photo_mime_type text,
  add column if not exists current_photo_size_bytes integer,
  add column if not exists confirmed_crop jsonb,
  add column if not exists confirmed_crop_aspect text,
  add column if not exists crop_confirmed_at timestamptz,
  add column if not exists original_width integer,
  add column if not exists original_height integer,
  add column if not exists admin_override_json jsonb,
  add column if not exists excluded_at timestamptz,
  add column if not exists excluded_by_member_id uuid,
  add column if not exists excluded_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recognition_submission_entries_validation_status_check'
  ) then
    alter table public.recognition_submission_entries
      add constraint recognition_submission_entries_validation_status_check
      check (validation_status in ('PASS', 'WARNING', 'BLOCKED', 'ADMIN_OVERRIDE', 'EXCLUDED'));
  end if;
end $$;

create index if not exists recognition_submission_entries_event_validation_idx
  on public.recognition_submission_entries (event_id, validation_status);

comment on column public.recognition_submission_entries.validation_status is
  'Self-service validation state: PASS | WARNING | BLOCKED | ADMIN_OVERRIDE | EXCLUDED.';

comment on column public.recognition_submission_entries.current_photo_storage_path is
  'PPT-authoritative photo object path after replace/recrop. Falls back to original_photo_storage_path.';

comment on column public.recognition_submission_entries.confirmed_crop is
  'Submitter-confirmed 3:4 normalized crop {x,y,width,height} on the current photo.';

comment on column public.recognition_submission_entries.admin_override_json is
  'Audit for Super Admin override: originalStatus, originalIssues, overriddenBy, overriddenAt, reason.';

-- ---------------------------------------------------------------------------
-- Public submission RPC: organization is legacy / optional
-- CREATE OR REPLACE keeps the same signature. Empty org is stored as ''.
-- ---------------------------------------------------------------------------

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

  -- Organization is a legacy field. Do not require it.
  -- Keep the column for backward compatibility; store empty string when omitted.

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'entries are required';
  end if;

  v_now := now();

  select *
  into v_event
  from public.recognition_events
  where id = p_event_id;

  if not found then
    raise exception 'recognition event not found';
  end if;

  if v_event.status is distinct from 'collecting' then
    raise exception 'recognition public collection is not collecting';
  end if;

  if v_event.collect_starts_at is not null
     and v_now < v_event.collect_starts_at then
    raise exception 'recognition public collection has not started';
  end if;

  if v_event.collect_ends_at is not null
     and v_now > v_event.collect_ends_at then
    raise exception 'recognition public collection has ended';
  end if;

  v_entry_count := jsonb_array_length(p_entries);

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
    coalesce(nullif(btrim(coalesce(p_submitter_organization, '')), ''), ''),
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
  'Atomically creates a raw Recognition Center submission. submitter_organization is optional (legacy, default empty). Rechecks collecting window and enabled awards before insert. Execute only via service_role.';

-- ---------------------------------------------------------------------------
-- Event delete: also remove current confirmed photo objects (prefix cleanup
-- already covers recognition/<submissionId>/%; keep explicit current path too).
-- ---------------------------------------------------------------------------

create or replace function public.delete_recognition_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_exists boolean;
  v_removed_files integer := 0;
  v_prefix_files integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;

  select exists(
    select 1 from public.recognition_events where id = p_event_id
  ) into v_exists;

  if not v_exists then
    raise exception 'recognition event not found';
  end if;

  perform 1 from public.recognition_events where id = p_event_id for update;

  delete from storage.objects o
  using public.recognition_submission_entries e
  where o.bucket_id = 'recognition-photos'
    and e.event_id = p_event_id
    and e.original_photo_storage_path is not null
    and btrim(e.original_photo_storage_path) <> ''
    and o.name = e.original_photo_storage_path;
  get diagnostics v_removed_files = row_count;

  delete from storage.objects o
  using public.recognition_submission_entries e
  where o.bucket_id = 'recognition-photos'
    and e.event_id = p_event_id
    and e.current_photo_storage_path is not null
    and btrim(e.current_photo_storage_path) <> ''
    and o.name = e.current_photo_storage_path;

  delete from storage.objects o
  using public.recognition_submissions s
  where o.bucket_id = 'recognition-photos'
    and s.event_id = p_event_id
    and o.name like ('recognition/' || s.id::text || '/%');
  get diagnostics v_prefix_files = row_count;

  delete from public.recognition_events
  where id = p_event_id;

  return jsonb_build_object(
    'ok', true,
    'eventId', p_event_id,
    'removedPhotoObjects', v_removed_files + v_prefix_files
  );
end;
$$;

revoke all on function public.delete_recognition_event(uuid) from public;
revoke all on function public.delete_recognition_event(uuid) from anon;
revoke all on function public.delete_recognition_event(uuid) from authenticated;
grant execute on function public.delete_recognition_event(uuid) to service_role;
