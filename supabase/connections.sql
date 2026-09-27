-- 友達確定（フォロー許可で双方向）。SQL Editor で Run する。
-- 貸し借り共有の条件変更はまだしない。
-- DROP POLICY は再実行用。

create table if not exists public.connections (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  requester_display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint connections_user_order check (user_a < user_b),
  constraint connections_requested_by_party check (requested_by = user_a or requested_by = user_b),
  constraint connections_status_check check (status in ('pending', 'accepted'))
);

create index if not exists connections_requested_by_idx
  on public.connections (requested_by);

alter table public.connections enable row level security;

drop policy if exists "connections_select_party" on public.connections;
drop policy if exists "connections_insert_request" on public.connections;
drop policy if exists "connections_update_accept" on public.connections;
drop policy if exists "connections_delete_pending" on public.connections;
drop policy if exists "connections_delete_party" on public.connections;

create policy "connections_select_party"
  on public.connections for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "connections_insert_request"
  on public.connections for insert to authenticated
  with check (
    auth.uid() = requested_by
    and status = 'pending'
    and user_a < user_b
    and (auth.uid() = user_a or auth.uid() = user_b)
  );

create policy "connections_update_accept"
  on public.connections for update to authenticated
  using (
    requested_by <> auth.uid()
    and (auth.uid() = user_a or auth.uid() = user_b)
  )
  with check (
    status = 'accepted'
    and requested_by <> auth.uid()
    and (auth.uid() = user_a or auth.uid() = user_b)
  );

create policy "connections_delete_party"
  on public.connections for delete to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

grant select, insert, update, delete on table public.connections to authenticated;

notify pgrst, 'reload schema';
