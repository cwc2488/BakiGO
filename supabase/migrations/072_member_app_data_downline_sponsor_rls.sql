-- Align member_app_data downline SELECT with Organization tree hierarchy,
-- scoped to the explicit authorized downline business-view keys only.
--
-- Org tree walks organization_relationships ∪ members.sponsor_member_number
-- (see build-cloud-organization-tree.ts). Production previously had OWN-only
-- member_app_data SELECT, so uplines could not read downline Retail House /
-- Product VP sources even when the partner appeared in Organization.
--
-- SECURITY: downline SELECT is NOT a blanket read of all downline app-data.
-- Only the keys required by authorized Partner Detail / Organization views:
--   - baki-go:baki-events
--   - baki-go:retail-transactions
--   - baki-go:retail-pipeline-leads
-- Calendar, settings, and any future unknown data_key remain OWN-only.
-- Own full access continues via member_app_data_select_own (unchanged).
--
-- Recursive CTE shape: ONE recursive reference to `downline`, with relationship
-- and sponsor edges combined inside a LATERAL subquery. (A second UNION branch
-- that also joins `downline` is rejected by PostgreSQL as 42P19.)
--
-- Also backfill missing relationship rows from sponsor_member_number so both
-- UI and RLS share one durable edge source (idempotent; Production expect ~0).

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

-- 2) Recreate downline SELECT: hierarchy + explicit data_key allowlist
drop policy if exists "member_app_data_select_downline" on public.member_app_data;

create policy "member_app_data_select_downline"
  on public.member_app_data for select
  to authenticated
  using (
    data_key in (
      'baki-go:baki-events',
      'baki-go:retail-transactions',
      'baki-go:retail-pipeline-leads'
    )
    and member_id in (
      with recursive downline(id, member_number) as (
        -- Non-recursive seed: authenticated viewer
        select m.id, m.member_number
        from public.members m
        where lower(m.email) = lower(auth.jwt() ->> 'email')

        union

        -- Single recursive reference to downline; edges via LATERAL UNION
        select child.id, child.member_number
        from downline parent
        join lateral (
          select rel.child_member_number
          from public.organization_relationships rel
          where rel.parent_member_number = parent.member_number

          union

          select sponsored.member_number
          from public.members sponsored
          where sponsored.sponsor_member_number = parent.member_number
        ) edge on true
        join public.members child
          on child.member_number = edge.child_member_number
      )
      select id from downline
    )
  );
