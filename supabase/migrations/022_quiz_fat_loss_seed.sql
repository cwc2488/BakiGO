-- Seed fat-loss quiz definition (server API uses service role; no anon policies needed).

insert into public.quiz_definitions (slug, title, description, status, version)
values (
  'fat-loss',
  '你是哪一種瘦不下來的人？',
  '12 題，找出真正讓你卡住的原因',
  'active',
  '1.0'
)
on conflict (slug) do nothing;
