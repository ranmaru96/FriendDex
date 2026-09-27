-- エピソード控え。SQL Editor で Run する。
-- 予定との紐づけは local_event_id（owned_events と同じ端末 UUID）。
-- DROP POLICY は再実行用。

create table if not exists public.owned_episodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_episode_id text not null,
  author_friend_id text not null default '',
  title text not null default '',
  date text not null default '',
  time text,
  description text not null default '',
  visibility_mode text not null default 'private',
  participant_entries jsonb not null default '[]'::jsonb,
  visibility_entries jsonb not null default '[]'::jsonb,
  local_event_id text,
  is_auto_generated boolean not null default false,
  pending_review boolean not null default false,
  pending_review_dismissed boolean not null default false,
  tag text,
  location_tag text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version integer not null default 1,
  unique (owner_id, local_episode_id)
);

create index if not exists owned_episodes_owner_id_idx
  on public.owned_episodes (owner_id);

create table if not exists public.owned_episode_photos (
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_episode_id text not null,
  local_photo_id integer not null,
  photo_path text not null,
  sort_order integer not null default 0,
  primary key (owner_id, local_episode_id, local_photo_id)
);

alter table public.owned_episodes enable row level security;
alter table public.owned_episode_photos enable row level security;

drop policy if exists "owned_episodes_select_own" on public.owned_episodes;
drop policy if exists "owned_episodes_insert_own" on public.owned_episodes;
drop policy if exists "owned_episodes_update_own" on public.owned_episodes;
drop policy if exists "owned_episode_photos_select_own" on public.owned_episode_photos;
drop policy if exists "owned_episode_photos_insert_own" on public.owned_episode_photos;
drop policy if exists "owned_episode_photos_update_own" on public.owned_episode_photos;
drop policy if exists "owned_episode_photos_delete_own" on public.owned_episode_photos;

create policy "owned_episodes_select_own"
  on public.owned_episodes for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_episodes_insert_own"
  on public.owned_episodes for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_episodes_update_own"
  on public.owned_episodes for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_episode_photos_select_own"
  on public.owned_episode_photos for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_episode_photos_insert_own"
  on public.owned_episode_photos for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_episode_photos_update_own"
  on public.owned_episode_photos for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_episode_photos_delete_own"
  on public.owned_episode_photos for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update on table public.owned_episodes to authenticated;
grant select, insert, update, delete on table public.owned_episode_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'owned-episode-photos',
  'owned-episode-photos',
  false,
  2097152,
  array['image/jpeg', 'image/jpg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owned_episode_photos_storage_insert_own" on storage.objects;
drop policy if exists "owned_episode_photos_storage_update_own" on storage.objects;
drop policy if exists "owned_episode_photos_storage_delete_own" on storage.objects;
drop policy if exists "owned_episode_photos_storage_select_own" on storage.objects;

create policy "owned_episode_photos_storage_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'owned-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "owned_episode_photos_storage_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'owned-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'owned-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "owned_episode_photos_storage_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'owned-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "owned_episode_photos_storage_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'owned-episode-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );
