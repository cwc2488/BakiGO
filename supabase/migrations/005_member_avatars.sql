-- Member avatar URL + Supabase Storage bucket

alter table public.members
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-avatars',
  'member-avatars',
  true,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "member_avatars_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'member-avatars');

create policy "member_avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'member-avatars'
    and (storage.foldername(name))[1] in (
      select id::text from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "member_avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'member-avatars'
    and (storage.foldername(name))[1] in (
      select id::text from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    bucket_id = 'member-avatars'
    and (storage.foldername(name))[1] in (
      select id::text from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "member_avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'member-avatars'
    and (storage.foldername(name))[1] in (
      select id::text from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
