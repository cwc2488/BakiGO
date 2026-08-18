-- Recognition Center Public Collection
-- Phase 4: public token, raw submissions, raw entries, private original photo storage
--
-- Additive only. No destructive changes.

-- ---------------------------------------------------------------------------
-- recognition_events: public collection token fields
-- ---------------------------------------------------------------------------
--
-- We store BOTH:
-- - public_collection_token        (raw high-entropy token; service-role only)
-- - public_collection_token_hash   (sha256 hex for lookup / future hardening)
--
-- Rationale:
-- Recognition Admin must be able to repeatedly view/copy the current public
-- collection URL without forcing one-time display semantics or adding an
-- encryption subsystem in Phase 4. Access remains safe because:
-- - recognition_events has RLS enabled
-- - there are no broad authenticated policies
-- - admin access flows through Next.js + Recognition Admin check + service_role

alter table public.recognition_events
  add column if not exists public_collection_token text,
  add column if not exists public_collection_token_hash text,
  add column if not exists public_collection_token_rotated_at timestamptz;

create unique index if not exists recognition_events_public_collection_token_unique
  on public.recognition_events (public_collection_token)
  where public_collection_token is not null;

create unique index if not exists recognition_events_public_collection_token_hash_unique
  on public.recognition_events (public_collection_token_hash)
  where public_collection_token_hash is not null;

comment on column public.recognition_events.public_collection_token is
  'Raw high-entropy public collection token. Service-role access only; used so Recognition Admin can repeatedly view/copy the active public URL.';

comment on column public.recognition_events.public_collection_token_hash is
  'SHA-256 hex of the raw public collection token for lookup / future hardening.';

comment on column public.recognition_events.public_collection_token_rotated_at is
  'Timestamp of the most recent public token generation/rotation.';

-- ---------------------------------------------------------------------------
-- recognition_submissions
-- One raw public submission envelope.
-- Immutable evidence; not approval; not candidate; not PPT source.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_submissions (
  id                      uuid        primary key default gen_random_uuid(),
  event_id                uuid        not null references public.recognition_events (id) on delete cascade,
  submitter_name          text        not null,
  submitter_organization  text        not null,
  submitted_at            timestamptz not null default now(),
  source_context_json     jsonb       not null default '{}'::jsonb,
  created_at              timestamptz not null default now()
);

create index if not exists recognition_submissions_event_submitted_idx
  on public.recognition_submissions (event_id, submitted_at desc);

comment on table public.recognition_submissions is
  'Raw public submission envelope for Recognition Center. Immutable evidence only; does not imply approval.';

-- ---------------------------------------------------------------------------
-- recognition_submission_entries
-- One honoree/award entry inside a submission.
-- Raw submitted_name is preserved.
-- normalized_name is for future Phase 5 exact duplicate detection only.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_submission_entries (
  id                          uuid        primary key default gen_random_uuid(),
  submission_id               uuid        not null references public.recognition_submissions (id) on delete cascade,
  event_id                    uuid        not null references public.recognition_events (id) on delete cascade,
  event_award_id              uuid        not null references public.recognition_event_awards (id) on delete cascade,
  submitted_name              text        not null,
  normalized_name             text        not null,
  original_photo_storage_path text,
  original_photo_mime_type    text,
  original_photo_size_bytes   integer     check (original_photo_size_bytes is null or original_photo_size_bytes >= 0),
  created_at                  timestamptz not null default now()
);

create index if not exists recognition_submission_entries_submission_idx
  on public.recognition_submission_entries (submission_id);

create index if not exists recognition_submission_entries_event_idx
  on public.recognition_submission_entries (event_id, event_award_id);

create index if not exists recognition_submission_entries_normalized_name_idx
  on public.recognition_submission_entries (event_id, normalized_name);

comment on table public.recognition_submission_entries is
  'Raw honoree entries inside a Recognition Center public submission. Preserves original submitted_name; no automatic consolidation in Phase 4.';

-- ---------------------------------------------------------------------------
-- Private storage bucket for original recognition photos
-- No storage.objects policies. All upload/read flows are server-mediated.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recognition-photos',
  'recognition-photos',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on bucket recognition-photos is
  'Private bucket for original Recognition Center submission photos. No public or direct client bucket access.';

-- ---------------------------------------------------------------------------
-- RLS
-- Submissions / entries are not directly accessible by anon or authenticated
-- clients. All access is via Next.js server handlers with service_role.
-- ---------------------------------------------------------------------------

alter table public.recognition_submissions enable row level security;
alter table public.recognition_submission_entries enable row level security;

-- ---------------------------------------------------------------------------
-- Atomic RPC: create_public_recognition_submission
-- Inserts submission + all entries in one transaction.
-- Execute allowed only to service_role.
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

  v_entry_count := jsonb_array_length(p_entries);

  select count(*) into v_valid_award_count
  from jsonb_array_elements(p_entries) as e
  join public.recognition_event_awards rea
    on rea.id = (e->>'event_award_id')::uuid
   and rea.event_id = p_event_id;

  if v_valid_award_count <> v_entry_count then
    raise exception 'one or more entries reference an invalid event award';
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
  'Atomically creates a raw Recognition Center submission envelope and all raw entry rows. Execute only via service_role from Next.js server handlers.';
