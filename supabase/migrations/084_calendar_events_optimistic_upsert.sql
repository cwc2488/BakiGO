-- DB-level optimistic last-write protection for calendar_events.
-- Any write path (RPC, upsert, update) must obey:
--   INSERT when missing
--   UPDATE only when incoming.updated_at > existing.updated_at AND deleted_at IS NULL
--   IGNORE stale (incoming.updated_at <= existing.updated_at)
--   NEVER overwrite / resurrect soft-deleted rows via normal upsert
--
-- Cutover (human-operated — do NOT apply from agent):
--   1. Apply 082
--   2. Apply 083
--   3. Apply 084
--   4. Verify table / realtime / backfill counts
--   5. Deploy new app
--   6. SELECT * FROM public.reconcile_calendar_events_from_legacy_blobs();
--   7. Cross-device smoke
--   8. Retire legacy blob writers

-- ---------------------------------------------------------------------------
-- Trigger: guard EVERY update (including unconditional client upsert).
-- Returning OLD silently keeps the existing row (ignore stale / deleted).
-- ---------------------------------------------------------------------------
create or replace function public.calendar_events_optimistic_write_guard()
returns trigger
language plpgsql
as $$
begin
  -- Soft-deleted tombstone: never overwrite content or clear deleted_at.
  if old.deleted_at is not null then
    return old;
  end if;

  -- Soft-delete itself is allowed (deleted_at going null → non-null with newer stamp).
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;

  -- Stale write: keep existing row unchanged.
  if new.updated_at <= old.updated_at then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists calendar_events_optimistic_write_guard on public.calendar_events;
create trigger calendar_events_optimistic_write_guard
  before update on public.calendar_events
  for each row
  execute function public.calendar_events_optimistic_write_guard();

-- Preserve deleted_at remains as belt-and-suspenders (082); keep it after the
-- optimistic guard so soft-delete clears never slip through other code paths.
-- Order: optimistic_write_guard runs first (alphabetically earlier name?);
-- PostgreSQL fires BEFORE triggers in name order. Ensure preserve still works:
drop trigger if exists calendar_events_preserve_deleted_at on public.calendar_events;
create trigger calendar_events_preserve_deleted_at
  before update on public.calendar_events
  for each row
  execute function public.calendar_events_preserve_deleted_at();

comment on function public.calendar_events_optimistic_write_guard() is
  'Rejects stale calendar_events updates and blocks overwrites of soft-deleted rows.';

-- ---------------------------------------------------------------------------
-- Canonical RPC: insert / update / ignore with returned status + row.
-- security invoker so RLS of the calling member applies.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_calendar_event_optimistic(
  p_id text,
  p_member_id uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_start_at text,
  p_end_at text,
  p_is_recurring boolean,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing public.calendar_events%rowtype;
  result_row public.calendar_events%rowtype;
begin
  select * into existing
  from public.calendar_events
  where member_id = p_member_id
    and id = p_id
  for update;

  if not found then
    insert into public.calendar_events (
      id, member_id, created_at, updated_at, start_at, end_at, is_recurring, payload, deleted_at
    ) values (
      p_id, p_member_id, p_created_at, p_updated_at, p_start_at, p_end_at, p_is_recurring, p_payload, null
    )
    returning * into result_row;

    return jsonb_build_object(
      'status', 'inserted',
      'row', to_jsonb(result_row)
    );
  end if;

  if existing.deleted_at is not null then
    return jsonb_build_object(
      'status', 'ignored_deleted',
      'row', to_jsonb(existing)
    );
  end if;

  if p_updated_at <= existing.updated_at then
    return jsonb_build_object(
      'status', 'ignored_stale',
      'row', to_jsonb(existing)
    );
  end if;

  update public.calendar_events
  set
    created_at = least(created_at, p_created_at),
    updated_at = p_updated_at,
    start_at = p_start_at,
    end_at = p_end_at,
    is_recurring = p_is_recurring,
    payload = p_payload
  where member_id = p_member_id
    and id = p_id
    and deleted_at is null
    and updated_at < p_updated_at
  returning * into result_row;

  if not found then
    -- Race: another writer won; return current canonical.
    select * into result_row
    from public.calendar_events
    where member_id = p_member_id and id = p_id;

    if result_row.deleted_at is not null then
      return jsonb_build_object('status', 'ignored_deleted', 'row', to_jsonb(result_row));
    end if;
    return jsonb_build_object('status', 'ignored_stale', 'row', to_jsonb(result_row));
  end if;

  return jsonb_build_object(
    'status', 'updated',
    'row', to_jsonb(result_row)
  );
end;
$$;

comment on function public.upsert_calendar_event_optimistic(
  text, uuid, timestamptz, timestamptz, text, text, boolean, jsonb
) is
  'Optimistic calendar upsert: insert / update-if-newer / ignore-stale / ignore-deleted. Returns {status,row}.';

revoke all on function public.upsert_calendar_event_optimistic(
  text, uuid, timestamptz, timestamptz, text, text, boolean, jsonb
) from public;
grant execute on function public.upsert_calendar_event_optimistic(
  text, uuid, timestamptz, timestamptz, text, text, boolean, jsonb
) to authenticated;
grant execute on function public.upsert_calendar_event_optimistic(
  text, uuid, timestamptz, timestamptz, text, text, boolean, jsonb
) to service_role;
