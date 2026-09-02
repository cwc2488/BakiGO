-- Go21 Premium Coaching Brain — durable longitudinal understanding (additive).
-- Survives across conversations; steers future coaching judgment.
-- Authoritative store: coaching_enrollments.go21_understanding_json.

alter table public.coaching_enrollments
  add column if not exists go21_understanding_json jsonb;

comment on column public.coaching_enrollments.go21_understanding_json is
  'Baki Go 21 durable personal understanding: preferences, patterns, triggers, strategies, experiments with evidence/confidence. Revisable; never invent from insufficient evidence.';
