-- Recognition Center Phase 6: presentation photo review + crop metadata.
-- Additive only. Original evidence is never mutated or overwritten.
-- Crop is separate derived metadata bound to a preferred source entry.
-- No PPTX generation. No derived cropped bitmap. No face recognition.
--
-- SECURITY BOUNDARY:
-- Photo-review metadata is internal. RLS is enabled with zero anon /
-- authenticated table policies. SECURITY DEFINER RPCs are executable only
-- by service_role via:
--   browser -> authenticated Next.js API -> assertRecognitionAdmin
--   -> service_role -> RPC

-- ---------------------------------------------------------------------------
-- recognition_candidate_photo_reviews
-- One active presentation-photo review row per candidate.
-- Original photos stay on recognition_submission_entries / private storage.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_candidate_photo_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique
    references public.recognition_candidates (id) on delete cascade,
  source_entry_id uuid
    references public.recognition_submission_entries (id) on delete set null,
  original_width integer,
  original_height integer,
  crop_x numeric,
  crop_y numeric,
  crop_width numeric,
  crop_height numeric,
  crop_aspect_ratio text not null default '3:4',
  flags text[] not null default '{}',
  is_blocked boolean not null default false,
  blocked_reason text,
  crop_finalized_at timestamptz,
  crop_finalized_by_member_id uuid
    references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recognition_candidate_photo_reviews_crop_all_or_none check (
    (
      crop_x is null
      and crop_y is null
      and crop_width is null
      and crop_height is null
    )
    or (
      crop_x is not null
      and crop_y is not null
      and crop_width is not null
      and crop_height is not null
    )
  ),
  constraint recognition_candidate_photo_reviews_crop_bounds check (
    crop_x is null
    or (
      crop_x >= 0
      and crop_y >= 0
      and crop_width > 0
      and crop_height > 0
      and crop_x + crop_width <= 1
      and crop_y + crop_height <= 1
    )
  ),
  constraint recognition_candidate_photo_reviews_dimensions_positive check (
    (original_width is null or original_width > 0)
    and (original_height is null or original_height > 0)
  ),
  constraint recognition_candidate_photo_reviews_flags_known check (
    flags <@ array[
      'group_photo',
      'person_too_small',
      'text_heavy',
      'low_resolution',
      'blurry_or_unclear',
      'poor_composition',
      'wrong_orientation',
      'suspected_wrong_photo',
      'other'
    ]::text[]
  )
);

create index if not exists recognition_candidate_photo_reviews_source_entry_idx
  on public.recognition_candidate_photo_reviews (source_entry_id);

comment on table public.recognition_candidate_photo_reviews is
  'Recognition Center presentation-photo review. Original evidence stays immutable; this row stores derived crop metadata, review flags, and blocked state only.';

comment on column public.recognition_candidate_photo_reviews.source_entry_id is
  'Preferred original source the crop is bound to. Changing recognition_candidates.preferred_source_entry_id resets this row.';

comment on column public.recognition_candidate_photo_reviews.crop_x is
  'Normalized crop origin X relative to the original image (0-1). Not a rendered pixel coordinate.';

comment on column public.recognition_candidate_photo_reviews.crop_aspect_ratio is
  'Intended portrait slot ratio for future 4:3 recognition-card rendering. V1 uses 3:4 (width:height). Distinct from the 4:3 PPT slide ratio.';

comment on column public.recognition_candidate_photo_reviews.flags is
  'Manual review flags. Warnings only; they never mutate original evidence and do not auto-select a person in a group photo.';

alter table public.recognition_candidate_photo_reviews enable row level security;
alter table public.recognition_candidate_photo_reviews force row level security;

revoke all on table public.recognition_candidate_photo_reviews from public;
revoke all on table public.recognition_candidate_photo_reviews from anon;
revoke all on table public.recognition_candidate_photo_reviews from authenticated;

-- ---------------------------------------------------------------------------
-- upsert_recognition_candidate_photo_review
-- Optimistic concurrency: p_source_entry_id must match current preferred source.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_recognition_candidate_photo_review(
  p_candidate_id uuid,
  p_source_entry_id uuid,
  p_crop_x numeric,
  p_crop_y numeric,
  p_crop_width numeric,
  p_crop_height numeric,
  p_crop_aspect_ratio text,
  p_original_width integer,
  p_original_height integer,
  p_flags text[],
  p_is_blocked boolean,
  p_blocked_reason text,
  p_finalize boolean,
  p_admin_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate recognition_candidates%rowtype;
  v_entry recognition_submission_entries%rowtype;
  v_review recognition_candidate_photo_reviews%rowtype;
  v_has_crop boolean;
  v_unknown_flag text;
begin
  if p_candidate_id is null then
    raise exception 'candidate_id is required' using errcode = '22023';
  end if;
  if p_source_entry_id is null then
    raise exception 'source_entry_id is required' using errcode = '22023';
  end if;

  select f.flag
    into v_unknown_flag
  from unnest(coalesce(p_flags, '{}'::text[])) as f(flag)
  where f.flag not in (
    'group_photo',
    'person_too_small',
    'text_heavy',
    'low_resolution',
    'blurry_or_unclear',
    'poor_composition',
    'wrong_orientation',
    'suspected_wrong_photo',
    'other'
  )
  limit 1;

  if v_unknown_flag is not null then
    raise exception 'unknown photo review flag' using errcode = '22023';
  end if;

  v_has_crop := p_crop_x is not null
    or p_crop_y is not null
    or p_crop_width is not null
    or p_crop_height is not null;

  if v_has_crop then
    if p_crop_x is null or p_crop_y is null or p_crop_width is null or p_crop_height is null then
      raise exception 'crop coordinates must be provided together' using errcode = '22023';
    end if;
    if p_crop_x < 0 or p_crop_y < 0 or p_crop_width <= 0 or p_crop_height <= 0 then
      raise exception 'invalid crop coordinates' using errcode = '22023';
    end if;
    if p_crop_x + p_crop_width > 1.0000001 or p_crop_y + p_crop_height > 1.0000001 then
      raise exception 'crop is out of bounds' using errcode = '22023';
    end if;
  elsif p_finalize is true then
    raise exception 'cannot finalize crop without valid coordinates' using errcode = '22023';
  end if;

  select *
    into v_candidate
  from public.recognition_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;

  -- Stale editor guard: crop coordinates are only valid for the current preferred original.
  if v_candidate.preferred_source_entry_id is distinct from p_source_entry_id then
    raise exception 'preferred source changed; crop save rejected'
      using errcode = '40001';
  end if;

  if not exists (
    select 1
    from public.recognition_candidate_sources
    where candidate_id = v_candidate.id
      and submission_entry_id = p_source_entry_id
  ) then
    raise exception 'source entry does not belong to this candidate' using errcode = '22023';
  end if;

  select *
    into v_entry
  from public.recognition_submission_entries
  where id = p_source_entry_id;

  if not found then
    raise exception 'source entry not found' using errcode = 'P0002';
  end if;

  if v_entry.original_photo_storage_path is null then
    raise exception 'preferred source has no original photo' using errcode = '22023';
  end if;

  insert into public.recognition_candidate_photo_reviews (
    candidate_id,
    source_entry_id,
    original_width,
    original_height,
    crop_x,
    crop_y,
    crop_width,
    crop_height,
    crop_aspect_ratio,
    flags,
    is_blocked,
    blocked_reason,
    crop_finalized_at,
    crop_finalized_by_member_id
  )
  values (
    p_candidate_id,
    p_source_entry_id,
    p_original_width,
    p_original_height,
    p_crop_x,
    p_crop_y,
    p_crop_width,
    p_crop_height,
    coalesce(nullif(btrim(p_crop_aspect_ratio), ''), '3:4'),
    coalesce(p_flags, '{}'::text[]),
    coalesce(p_is_blocked, false),
    case
      when coalesce(p_is_blocked, false) then nullif(btrim(p_blocked_reason), '')
      else null
    end,
    case when p_finalize is true then now() else null end,
    case when p_finalize is true then p_admin_member_id else null end
  )
  on conflict (candidate_id) do update
    set source_entry_id = excluded.source_entry_id,
        original_width = coalesce(excluded.original_width, recognition_candidate_photo_reviews.original_width),
        original_height = coalesce(excluded.original_height, recognition_candidate_photo_reviews.original_height),
        crop_x = excluded.crop_x,
        crop_y = excluded.crop_y,
        crop_width = excluded.crop_width,
        crop_height = excluded.crop_height,
        crop_aspect_ratio = excluded.crop_aspect_ratio,
        flags = excluded.flags,
        is_blocked = excluded.is_blocked,
        blocked_reason = excluded.blocked_reason,
        crop_finalized_at = case
          when p_finalize is true then now()
          when excluded.crop_x is null then null
          else recognition_candidate_photo_reviews.crop_finalized_at
        end,
        crop_finalized_by_member_id = case
          when p_finalize is true then p_admin_member_id
          when excluded.crop_x is null then null
          else recognition_candidate_photo_reviews.crop_finalized_by_member_id
        end,
        updated_at = now();

  select *
    into v_review
  from public.recognition_candidate_photo_reviews
  where candidate_id = p_candidate_id;

  return jsonb_build_object(
    'ok', true,
    'review', jsonb_build_object(
      'id', v_review.id,
      'candidateId', v_review.candidate_id,
      'sourceEntryId', v_review.source_entry_id,
      'originalWidth', v_review.original_width,
      'originalHeight', v_review.original_height,
      'cropX', v_review.crop_x,
      'cropY', v_review.crop_y,
      'cropWidth', v_review.crop_width,
      'cropHeight', v_review.crop_height,
      'cropAspectRatio', v_review.crop_aspect_ratio,
      'flags', to_jsonb(v_review.flags),
      'isBlocked', v_review.is_blocked,
      'blockedReason', v_review.blocked_reason,
      'cropFinalizedAt', v_review.crop_finalized_at,
      'cropFinalizedByMemberId', v_review.crop_finalized_by_member_id
    )
  );
end;
$$;

create or replace function public.reset_recognition_candidate_photo_review(
  p_candidate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_candidate_id is null then
    raise exception 'candidate_id is required' using errcode = '22023';
  end if;

  -- Clears derived presentation metadata only. Never touches original photos.
  update public.recognition_candidate_photo_reviews
     set source_entry_id = null,
         original_width = null,
         original_height = null,
         crop_x = null,
         crop_y = null,
         crop_width = null,
         crop_height = null,
         flags = '{}',
         is_blocked = false,
         blocked_reason = null,
         crop_finalized_at = null,
         crop_finalized_by_member_id = null,
         updated_at = now()
   where candidate_id = p_candidate_id;

  return jsonb_build_object('ok', true, 'candidateId', p_candidate_id);
end;
$$;

create or replace function public.recognition_reset_photo_review_on_preferred_source_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.preferred_source_entry_id is distinct from old.preferred_source_entry_id then
    perform public.reset_recognition_candidate_photo_review(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists recognition_candidates_preferred_source_change
  on public.recognition_candidates;

create trigger recognition_candidates_preferred_source_change
after update of preferred_source_entry_id on public.recognition_candidates
for each row
execute function public.recognition_reset_photo_review_on_preferred_source_change();

revoke all on function public.upsert_recognition_candidate_photo_review(
  uuid, uuid, numeric, numeric, numeric, numeric, text, integer, integer, text[], boolean, text, boolean, uuid
) from public;
revoke all on function public.upsert_recognition_candidate_photo_review(
  uuid, uuid, numeric, numeric, numeric, numeric, text, integer, integer, text[], boolean, text, boolean, uuid
) from anon;
revoke all on function public.upsert_recognition_candidate_photo_review(
  uuid, uuid, numeric, numeric, numeric, numeric, text, integer, integer, text[], boolean, text, boolean, uuid
) from authenticated;
revoke all on function public.reset_recognition_candidate_photo_review(uuid) from public;
revoke all on function public.reset_recognition_candidate_photo_review(uuid) from anon;
revoke all on function public.reset_recognition_candidate_photo_review(uuid) from authenticated;
revoke all on function public.recognition_reset_photo_review_on_preferred_source_change() from public;
revoke all on function public.recognition_reset_photo_review_on_preferred_source_change() from anon;
revoke all on function public.recognition_reset_photo_review_on_preferred_source_change() from authenticated;

grant execute on function public.upsert_recognition_candidate_photo_review(
  uuid, uuid, numeric, numeric, numeric, numeric, text, integer, integer, text[], boolean, text, boolean, uuid
) to service_role;
grant execute on function public.reset_recognition_candidate_photo_review(uuid) to service_role;

comment on function public.upsert_recognition_candidate_photo_review(
  uuid, uuid, numeric, numeric, numeric, numeric, text, integer, integer, text[], boolean, text, boolean, uuid
) is
  'Saves presentation crop metadata for the current preferred original. Rejects stale source-entry saves. Execute only via service_role.';

comment on function public.reset_recognition_candidate_photo_review(uuid) is
  'Clears derived presentation crop/flags when preferred original changes. Never mutates original evidence. Execute only via service_role.';
