-- コネクト相手に見せるエピソード。本人控え owned_episodes とは別。
-- 非公開は行を置かない。写真は shared-episode-photos だけ相手が読める。
-- SQL Editor で最後まで Run する。DROP は再実行用。
-- 本人の読み書きは owner_id = auth.uid()。visibility_mode はテーブル CHECK で制限する。

create table if not exists public.shared_episodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_episode_id text not null,
  title text not null default '',
  date text not null default '',
  time text,
  description text not null default '',
  visibility_mode text not null,
  tag text,
  participant_tags jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, local_episode_id),
  constraint shared_episodes_visibility_check check (visibility_mode in ('public', 'limited'))
);

create index if not exists shared_episodes_owner_id_idx
  on public.shared_episodes (owner_id);

create table if not exists public.shared_episode_audience (
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_episode_id text not null,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  primary key (owner_id, local_episode_id, viewer_id),
  constraint shared_episode_audience_episode_fk
    foreign key (owner_id, local_episode_id)
    references public.shared_episodes (owner_id, local_episode_id)
    on delete cascade
);

create index if not exists shared_episode_audience_viewer_idx
  on public.shared_episode_audience (viewer_id);

create table if not exists public.shared_episode_photos (
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_episode_id text not null,
  local_photo_id integer not null,
  photo_path text not null,
  sort_order integer not null default 0,
  primary key (owner_id, local_episode_id, local_photo_id),
  constraint shared_episode_photos_episode_fk
    foreign key (owner_id, local_episode_id)
    references public.shared_episodes (owner_id, local_episode_id)
    on delete cascade
);

alter table public.shared_episodes enable row level security;
alter table public.shared_episode_audience enable row level security;
alter table public.shared_episode_photos enable row level security;

drop policy if exists "shared_episodes_select_own" on public.shared_episodes;
drop policy if exists "shared_episodes_select_viewable" on public.shared_episodes;
drop policy if exists "shared_episodes_insert_own" on public.shared_episodes;
drop policy if exists "shared_episodes_update_own" on public.shared_episodes;
drop policy if exists "shared_episodes_delete_own" on public.shared_episodes;
drop policy if exists "shared_episode_audience_select_viewable" on public.shared_episode_audience;
drop policy if exists "shared_episode_audience_insert_own" on public.shared_episode_audience;
drop policy if exists "shared_episode_audience_delete_own" on public.shared_episode_audience;
drop policy if exists "shared_episode_photos_select_own" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_select_viewable" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_insert_own" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_update_own" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_delete_own" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_storage_insert_own" on storage.objects;
drop policy if exists "shared_episode_photos_storage_update_own" on storage.objects;
drop policy if exists "shared_episode_photos_storage_delete_own" on storage.objects;
drop policy if exists "shared_episode_photos_storage_select_viewable" on storage.objects;

drop function if exists public.can_view_shared_episode(uuid, text);
create or replace function public.can_view_shared_episode(p_owner uuid, p_local_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_episodes e
    where e.owner_id = p_owner
      and e.local_episode_id = p_local_id
      and (
        e.owner_id = auth.uid()
        or (
          exists (
            select 1
            from public.connections c
            where c.status = 'accepted'
              and c.user_a = least(e.owner_id, auth.uid())
              and c.user_b = greatest(e.owner_id, auth.uid())
          )
          and (
            e.visibility_mode = 'public'
            or exists (
              select 1
              from public.shared_episode_audience a
              where a.owner_id = e.owner_id
                and a.local_episode_id = e.local_episode_id
                and a.viewer_id = auth.uid()
            )
          )
        )
      )
  );
$$;

revoke all on function public.can_view_shared_episode(uuid, text) from public;
grant execute on function public.can_view_shared_episode(uuid, text) to authenticated;

drop policy if exists "shared_episodes_select_own" on public.shared_episodes;
drop policy if exists "shared_episodes_select_viewable" on public.shared_episodes;
drop policy if exists "shared_episodes_insert_own" on public.shared_episodes;
drop policy if exists "shared_episodes_update_own" on public.shared_episodes;
drop policy if exists "shared_episodes_delete_own" on public.shared_episodes;

create policy "shared_episodes_select_own"
  on public.shared_episodes for select to authenticated
  using (owner_id = auth.uid());

create policy "shared_episodes_select_viewable"
  on public.shared_episodes for select to authenticated
  using (public.can_view_shared_episode(owner_id, local_episode_id));

create policy "shared_episodes_insert_own"
  on public.shared_episodes for insert to authenticated
  with check (owner_id = auth.uid());

create policy "shared_episodes_update_own"
  on public.shared_episodes for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "shared_episodes_delete_own"
  on public.shared_episodes for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "shared_episode_audience_select_viewable" on public.shared_episode_audience;
drop policy if exists "shared_episode_audience_insert_own" on public.shared_episode_audience;
drop policy if exists "shared_episode_audience_delete_own" on public.shared_episode_audience;

create policy "shared_episode_audience_select_viewable"
  on public.shared_episode_audience for select to authenticated
  using (owner_id = auth.uid() or viewer_id = auth.uid());

create policy "shared_episode_audience_insert_own"
  on public.shared_episode_audience for insert to authenticated
  with check (
    owner_id = auth.uid()
    and viewer_id <> auth.uid()
    and exists (
      select 1
      from public.connections c
      where c.status = 'accepted'
        and c.user_a = least(owner_id, viewer_id)
        and c.user_b = greatest(owner_id, viewer_id)
    )
  );

create policy "shared_episode_audience_delete_own"
  on public.shared_episode_audience for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "shared_episode_photos_select_own" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_select_viewable" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_insert_own" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_update_own" on public.shared_episode_photos;
drop policy if exists "shared_episode_photos_delete_own" on public.shared_episode_photos;

create policy "shared_episode_photos_select_own"
  on public.shared_episode_photos for select to authenticated
  using (owner_id = auth.uid());

create policy "shared_episode_photos_select_viewable"
  on public.shared_episode_photos for select to authenticated
  using (public.can_view_shared_episode(owner_id, local_episode_id));

create policy "shared_episode_photos_insert_own"
  on public.shared_episode_photos for insert to authenticated
  with check (owner_id = auth.uid());

create policy "shared_episode_photos_update_own"
  on public.shared_episode_photos for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "shared_episode_photos_delete_own"
  on public.shared_episode_photos for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on table public.shared_episodes to authenticated;
grant select, insert, delete on table public.shared_episode_audience to authenticated;
grant select, insert, update, delete on table public.shared_episode_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-episode-photos',
  'shared-episode-photos',
  false,
  2097152,
  array['image/jpeg', 'image/jpg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shared_episode_photos_storage_insert_own" on storage.objects;
drop policy if exists "shared_episode_photos_storage_update_own" on storage.objects;
drop policy if exists "shared_episode_photos_storage_delete_own" on storage.objects;
drop policy if exists "shared_episode_photos_storage_select_viewable" on storage.objects;

create policy "shared_episode_photos_storage_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shared-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "shared_episode_photos_storage_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'shared-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'shared-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "shared_episode_photos_storage_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'shared-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "shared_episode_photos_storage_select_viewable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'shared-episode-photos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or (
        split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
        and public.can_view_shared_episode(
          split_part(name, '/', 1)::uuid,
          split_part(name, '/', 2)
        )
      )
    )
  );

notify pgrst, 'reload schema';
