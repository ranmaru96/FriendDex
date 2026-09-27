-- 本人写真は Storage に残す。grant 相手が落とせるのは公開オンのときだけ。
-- SQL Editor で Run する。DROP POLICY は作り直し用。

drop policy if exists "identity_photos_select_own_or_granted" on storage.objects;

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
