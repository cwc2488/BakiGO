-- Align member_app_data downline SELECT with Organization tree hierarchy.
--
-- Org tree walks organization_relationships ∪ members.sponsor_member_number
-- (see build-cloud-organization-tree.ts). Prior RLS walked relationships only,
-- so partners visible in Organization (sponsor-only edges) returned empty
-- member_app_data → Partner Detail Product VP rendered as 0.
--
-- Also backfill missing relationship rows from sponsor_member_number so both
-- UI and RLS share one durable edge source.

-- 1) Backfill org edges from sponsor field (idempotent)
insert into public.organization_relationships (parent_member_number, child_member_number)
select m.sponsor_member_number, m.member_number
from public.members m
where m.sponsor_member_number is not null
  and length(trim(m.sponsor_member_number)) > 0
  and m.sponsor_member_number <> m.member_number
  and exists (
    select 1 from public.members parent
    where parent.member_number = m.sponsor_member_number
  )
on conflict (parent_member_number, child_member_number) do nothing;

-- 2) Recreate downline SELECT to include sponsor recursion
drop policy if exists "member_app_data_select_downline" on public.member_app_data;

create policy "member_app_data_select_downline"
  on public.member_app_data for select
  to authenticated
  using (
    member_id in (
      with recursive downline as (
        select m.id, m.member_number
        from public.members m
        where lower(m.email) = lower(auth.jwt() ->> 'email')

        union

        -- Explicit org relationship edges
        select child.id, child.member_number
        from public.organization_relationships rel
        join downline parent on rel.parent_member_number = parent.member_number
        join public.members child on child.member_number = rel.child_member_number

        union

        -- Sponsor field edges (same source Organization tree uses)
        select child.id, child.member_number
        from public.members child
        join downline parent on child.sponsor_member_number = parent.member_number
      )
      select id from downline
    )
  );
