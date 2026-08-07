-- Allow uplines to read downline member_app_data (events, pipeline, etc.)

create policy "member_app_data_select_downline"
  on public.member_app_data for select
  to authenticated
  using (
    member_id in (
      with recursive downline as (
        select m.id, m.member_number
        from public.members m
        where lower(m.email) = lower(auth.jwt() ->> 'email')

        union all

        select child.id, child.member_number
        from public.organization_relationships rel
        join downline parent on rel.parent_member_number = parent.member_number
        join public.members child on child.member_number = rel.child_member_number
      )
      select id from downline
    )
  );
