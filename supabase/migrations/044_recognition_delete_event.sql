-- 044: delete one Recognition Event with dependent rows + private photos.
-- Additive. Does not touch members / customers / coaching / quiz / radar / leaderboard.
-- Child tables cascade via existing FKs. Storage objects are not FK-linked and must be
-- removed in this function before the parent row is deleted.

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
