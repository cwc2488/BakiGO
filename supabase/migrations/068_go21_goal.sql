-- Go21 21-Day Goal (additive). Safe for enrollments without a goal.
-- Authoritative current goal lives on coaching_enrollments.go21_goal_json.
-- enrollment.goal text remains a short display/sync label for existing profileMemory.

alter table public.coaching_enrollments
  add column if not exists go21_goal_json jsonb;

comment on column public.coaching_enrollments.go21_goal_json is
  'Baki Go 21 durable goal record: {version,current,original,history}. Observation of coaching direction — not clinical intake.';
