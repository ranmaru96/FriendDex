-- 公開カードの写真。SQL Editor で Run する。
-- 失敗時アプリは文字項目だけ同期する。

alter table public.identity_profiles
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-photos',
  'identity-photos',
  false,
  2097152,
  array['image/jpeg', 'image/jpg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "identity_photos_insert_own" on storage.objects;
drop policy if exists "identity_photos_update_own" on storage.objects;
drop policy if exists "identity_photos_delete_own" on storage.objects;
drop policy if exists "identity_photos_select_own_or_granted" on storage.objects;

create policy "identity_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'identity-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "identity_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'identity-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'identity-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "identity_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'identity-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "identity_photos_select_own_or_granted"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'identity-photos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1
        from public.identity_profile_grants g
        join public.identity_profiles p on p.id = g.owner_id
        where g.owner_id::text = split_part(name, '/', 1)
          and g.viewer_id = auth.uid()
          and p.deleted_at is null
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(to_jsonb(p.public_fields), '[]'::jsonb)) as field
            where field = 'photo'
          )
      )
    )
  );
