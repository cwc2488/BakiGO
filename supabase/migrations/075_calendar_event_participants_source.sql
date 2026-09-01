-- Collision-safe identity for personal vs alliance shared calendar events.
-- Existing 074 rows default to event_source = 'personal' (preserved).

alter table public.calendar_event_participants
  add column if not exists event_source text not null default 'personal';

alter table public.calendar_event_participants
  drop constraint if exists calendar_event_participants_source_check;

alter table public.calendar_event_participants
  add constraint calendar_event_participants_source_check
  check (event_source in ('personal', 'alliance_shared'));

alter table public.calendar_event_participants
  drop constraint if exists calendar_event_participants_unique;

alter table public.calendar_event_participants
  add constraint calendar_event_participants_unique
  unique (owner_member_id, event_source, event_id, customer_id);

drop index if exists calendar_event_participants_owner_event_idx;
create index if not exists calendar_event_participants_owner_event_idx
  on public.calendar_event_participants (owner_member_id, event_source, event_id);

comment on column public.calendar_event_participants.event_source is
  'personal = coach CalendarEvent.id; alliance_shared = canonical shared:calendarId:uid. Never copy shared events into personal calendar.';
