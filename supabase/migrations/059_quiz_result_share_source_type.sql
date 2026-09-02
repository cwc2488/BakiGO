-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

-- QUIZ-VIRAL-01 follow-up: 042 created tables/columns, but Postgres stores
-- `source_type in (...)` as `source_type = ANY (ARRAY[...])`, so 042's drop
-- loop did not replace the old CHECK. result_share inserts then fail.
-- Additive only. Does not rewrite 038–042 table shapes.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'analysis_sessions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.analysis_sessions drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.analysis_sessions drop constraint if exists analysis_sessions_source_type_check;

alter table public.analysis_sessions
  add constraint analysis_sessions_source_type_check
  check (source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'experience_21d_interests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'attribution_source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.experience_21d_interests drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.experience_21d_interests drop constraint if exists experience_21d_interests_attribution_source_type_check;

alter table public.experience_21d_interests
  add constraint experience_21d_interests_attribution_source_type_check
  check (attribution_source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));
