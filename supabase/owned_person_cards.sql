-- 他人の人物カード控え。SQL Editor で Run する。
-- 本人カードは identity_profiles。エピソードは対象外。
-- DROP POLICY は再実行用。新規テーブルの作り直しではない。

create table if not exists public.owned_person_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_friend_id text not null,
  linked_user_id uuid,
  display_name text not null default '',
  family_name text not null default '',
  given_name text not null default '',
  nickname text not null default '',
  birthday text not null default '',
  height integer,
  weight integer,
  origin text not null default '',
  residence text not null default '',
  mbti text not null default '',
  category text not null default '',
  description text not null default '',
  affiliations jsonb not null default '[]'::jsonb,
  personalities jsonb not null default '[]'::jsonb,
  experiences jsonb not null default '[]'::jsonb,
  traits jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  likes jsonb not null default '[]'::jsonb,
  dislikes jsonb not null default '[]'::jsonb,
  sayings jsonb not null default '[]'::jsonb,
  photo_path text,
  import_source text not null default 'manual',
  scanned_at text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version integer not null default 1,
  unique (owner_id, local_friend_id)
);

create index if not exists owned_person_cards_owner_id_idx
  on public.owned_person_cards (owner_id);

alter table public.owned_person_cards enable row level security;

drop policy if exists "owned_person_cards_select_own" on public.owned_person_cards;
drop policy if exists "owned_person_cards_insert_own" on public.owned_person_cards;
drop policy if exists "owned_person_cards_update_own" on public.owned_person_cards;

create policy "owned_person_cards_select_own"
  on public.owned_person_cards
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "owned_person_cards_insert_own"
  on public.owned_person_cards
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "owned_person_cards_update_own"
  on public.owned_person_cards
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update on table public.owned_person_cards to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'owned-person-photos',
  'owned-person-photos',
  false,
  2097152,
  array['image/jpeg', 'image/jpg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owned_person_photos_insert_own" on storage.objects;
drop policy if exists "owned_person_photos_update_own" on storage.objects;
drop policy if exists "owned_person_photos_delete_own" on storage.objects;
drop policy if exists "owned_person_photos_select_own" on storage.objects;

create policy "owned_person_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'owned-person-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "owned_person_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'owned-person-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'owned-person-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "owned_person_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'owned-person-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "owned_person_photos_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'owned-person-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );
