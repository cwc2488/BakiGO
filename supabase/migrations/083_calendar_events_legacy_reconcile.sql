-- Safe cutover reconciliation: merge remaining / newly-written legacy
-- member_app_data calendar blobs into calendar_events without overwriting
-- newer rows or resurrecting soft-deletes.
--
-- Cutover steps (human-operated):
-- 1. Apply migration 082 (table + initial backfill)
-- 2. Deploy new app (event-level writes)
-- 3. SELECT * FROM public.reconcile_calendar_events_from_legacy_blobs();
-- 4. After old PWAs are retired, legacy blob writes are already removed from SYNCABLE

create or replace function public.reconcile_calendar_events_from_legacy_blobs()
returns table (
  source_count bigint,
  inserted_count bigint,
  updated_count bigint,
  skipped_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source bigint := 0;
  v_inserted bigint := 0;
  v_updated bigint := 0;
begin
  select count(*) into v_source
  from public.member_app_data mad
  cross join lateral jsonb_array_elements(mad.payload) as elem
  where mad.data_key = 'baki-go:calendar-events'
    and jsonb_typeof(mad.payload) = 'array'
    and coalesce(elem->>'id', '') <> ''
    and coalesce(elem->>'startAt', '') <> ''
    and coalesce(elem->>'endAt', '') <> '';

  with source_events as (
    select
      mad.member_id as owner_member_id,
      elem as event
    from public.member_app_data mad
    cross join lateral jsonb_array_elements(mad.payload) as elem
    where mad.data_key = 'baki-go:calendar-events'
      and jsonb_typeof(mad.payload) = 'array'
      and coalesce(elem->>'id', '') <> ''
      and coalesce(elem->>'startAt', '') <> ''
      and coalesce(elem->>'endAt', '') <> ''
  ),
  normalized as (
    select
      event->>'id' as id,
      owner_member_id as member_id,
      case
        when coalesce(event->>'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}'
          then (event->>'createdAt')::timestamptz
        else now()
      end as created_at,
      case
        when coalesce(event->>'updatedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
          then (event->>'updatedAt')::timestamptz
        else now()
      end as updated_at,
      event->>'startAt' as start_at,
      event->>'endAt' as end_at,
      (coalesce(event #>> '{recurrence,frequency}', 'none') <> 'none') as is_recurring,
      (event || jsonb_build_object('memberId', owner_member_id::text)) as payload
    from source_events
  )
  insert into public.calendar_events (
    id, member_id, created_at, updated_at, start_at, end_at, is_recurring, payload, deleted_at
  )
  select
    n.id, n.member_id, n.created_at, n.updated_at, n.start_at, n.end_at, n.is_recurring, n.payload, null
  from normalized n
  where not exists (
    select 1 from public.calendar_events ce
    where ce.member_id = n.member_id and ce.id = n.id
  );
  get diagnostics v_inserted = row_count;

  with source_events as (
    select
      mad.member_id as owner_member_id,
      elem as event
    from public.member_app_data mad
    cross join lateral jsonb_array_elements(mad.payload) as elem
    where mad.data_key = 'baki-go:calendar-events'
      and jsonb_typeof(mad.payload) = 'array'
      and coalesce(elem->>'id', '') <> ''
      and coalesce(elem->>'startAt', '') <> ''
      and coalesce(elem->>'endAt', '') <> ''
  ),
  normalized as (
    select
      event->>'id' as id,
      owner_member_id as member_id,
      case
        when coalesce(event->>'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}'
          then (event->>'createdAt')::timestamptz
        else now()
      end as created_at,
      case
        when coalesce(event->>'updatedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
          then (event->>'updatedAt')::timestamptz
        else now()
      end as updated_at,
      event->>'startAt' as start_at,
      event->>'endAt' as end_at,
      (coalesce(event #>> '{recurrence,frequency}', 'none') <> 'none') as is_recurring,
      (event || jsonb_build_object('memberId', owner_member_id::text)) as payload
    from source_events
  )
  update public.calendar_events ce
  set
    created_at = least(ce.created_at, n.created_at),
    updated_at = n.updated_at,
    start_at = n.start_at,
    end_at = n.end_at,
    is_recurring = n.is_recurring,
    payload = n.payload
  from normalized n
  where ce.member_id = n.member_id
    and ce.id = n.id
    and ce.deleted_at is null
    and ce.updated_at < n.updated_at;
  get diagnostics v_updated = row_count;

  source_count := v_source;
  inserted_count := v_inserted;
  updated_count := v_updated;
  skipped_count := greatest(v_source - v_inserted - v_updated, 0);
  return next;
end;
$$;

comment on function public.reconcile_calendar_events_from_legacy_blobs() is
  'Idempotent cutover reconcile: insert missing legacy events; update only when legacy updatedAt is newer; never resurrect soft-deletes.';

revoke all on function public.reconcile_calendar_events_from_legacy_blobs() from public;
grant execute on function public.reconcile_calendar_events_from_legacy_blobs() to service_role;
