-- Allow members to update sponsor (change upline) and refresh org relationships

create policy "members_update_authenticated"
  on public.members for update
  to authenticated
  using (true)
  with check (true);

create policy "organization_relationships_delete_authenticated"
  on public.organization_relationships for delete
  to authenticated
  using (true);
