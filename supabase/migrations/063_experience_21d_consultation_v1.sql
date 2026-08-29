-- 21D Experience Landing + Consultation Application V1
-- Additive only. Extends experience_21d_interests for consultation preference.
-- Does not drop columns, rewrite rows, or change ownership/attribution rules.

alter table public.experience_21d_interests
  add column if not exists consultation_preference text;

alter table public.experience_21d_interests
  add column if not exists landing_page_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'experience_21d_interests_consultation_preference_check'
  ) then
    alter table public.experience_21d_interests
      add constraint experience_21d_interests_consultation_preference_check
      check (
        consultation_preference is null
        or consultation_preference in ('text', 'phone', 'in_person')
      );
  end if;
end $$;

comment on column public.experience_21d_interests.consultation_preference is
  'Consumer consultation method from Experience LP: text | phone | in_person. Null = legacy interest without method.';
comment on column public.experience_21d_interests.landing_page_version is
  'Experience landing page version that submitted the consultation application.';

create index if not exists experience_21d_interests_consultation_pref_idx
  on public.experience_21d_interests (consultation_preference, created_at desc)
  where consultation_preference is not null;

-- Extend funnel event vocabulary (idempotent drop/add of check constraint).
alter table public.experience_21d_funnel_events
  drop constraint if exists experience_21d_funnel_events_event_check;

alter table public.experience_21d_funnel_events
  add constraint experience_21d_funnel_events_event_check
  check (event in (
    'report_viewed',
    '21d_offer_viewed',
    '21d_interest_clicked',
    '21d_interest_created',
    '21d_contact_captured',
    '21d_partner_viewed',
    '21d_contacted',
    '21d_landing_viewed',
    '21d_consultation_method_selected',
    '21d_consultation_started',
    '21d_consultation_submitted'
  ));
