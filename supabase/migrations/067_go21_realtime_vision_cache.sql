-- Go21 real-time vision cache on meal photos (additive).
-- Reused by chat-turn vision and later daily jobs to avoid duplicate OpenAI vision calls.

alter table public.coaching_meal_photos
  add column if not exists vision_observation_json jsonb;

alter table public.coaching_meal_photos
  add column if not exists vision_observed_at timestamptz;

alter table public.coaching_meal_photos
  add column if not exists vision_model text;

alter table public.coaching_meal_photos
  add column if not exists vision_source text;

alter table public.coaching_meal_photos
  drop constraint if exists coaching_meal_photos_vision_source_check;

alter table public.coaching_meal_photos
  add constraint coaching_meal_photos_vision_source_check
  check (
    vision_source is null
    or vision_source in ('vision', 'heuristic', 'merged', 'failed')
  );

create index if not exists coaching_meal_photos_storage_path_idx
  on public.coaching_meal_photos (storage_path);

comment on column public.coaching_meal_photos.vision_observation_json is
  'Cached meal vision observation for this storage object. Observation ≠ confirmed fact.';
