-- カレンダー予定の控え。SQL Editor で Run する。
-- エピソードは対象外。notification_id は端末のみ。Google 連携は上書きしない。
-- DROP POLICY は再実行用。

create table if not exists public.owned_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_event_id text not null,
  title text not null default '',
  start_at text not null,
  end_at text,
  all_day boolean not null default false,
  memo text,
  notify_at text,
  notify_enabled boolean not null default true,
  auto_episode_created boolean not null default false,
  episode_tag text,
  location_tag text,
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version integer not null default 1,
  unique (owner_id, local_event_id)
);

create index if not exists owned_events_owner_id_idx
  on public.owned_events (owner_id);

create table if not exists public.owned_event_participants (
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_event_id text not null,
  local_friend_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, local_event_id, local_friend_id)
);

create index if not exists owned_event_participants_event_idx
  on public.owned_event_participants (owner_id, local_event_id);

alter table public.owned_events enable row level security;
alter table public.owned_event_participants enable row level security;

drop policy if exists "owned_events_select_own" on public.owned_events;
drop policy if exists "owned_events_insert_own" on public.owned_events;
drop policy if exists "owned_events_update_own" on public.owned_events;
drop policy if exists "owned_event_participants_select_own" on public.owned_event_participants;
drop policy if exists "owned_event_participants_insert_own" on public.owned_event_participants;
drop policy if exists "owned_event_participants_update_own" on public.owned_event_participants;
drop policy if exists "owned_event_participants_delete_own" on public.owned_event_participants;

create policy "owned_events_select_own"
  on public.owned_events for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_events_insert_own"
  on public.owned_events for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_events_update_own"
  on public.owned_events for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_event_participants_select_own"
  on public.owned_event_participants for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_event_participants_insert_own"
  on public.owned_event_participants for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_event_participants_update_own"
  on public.owned_event_participants for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_event_participants_delete_own"
  on public.owned_event_participants for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update on table public.owned_events to authenticated;
grant select, insert, update, delete on table public.owned_event_participants to authenticated;
