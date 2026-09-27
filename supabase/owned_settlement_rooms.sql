-- グループ精算の控え。SQL Editor で Run する。
-- 個別の貸し借り・デモ招待は対象外。清算表示は端末で組み立てる。
-- DROP POLICY は再実行用。

create table if not exists public.owned_settlement_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_room_id text not null,
  title text not null default '',
  local_created_at text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version integer not null default 1,
  unique (owner_id, local_room_id)
);

create index if not exists owned_settlement_rooms_owner_id_idx
  on public.owned_settlement_rooms (owner_id);

create table if not exists public.owned_settlement_members (
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_room_id text not null,
  local_member_id text not null,
  local_friend_id text not null default '',
  display_name text not null default '',
  ledger_synced boolean not null default false,
  primary key (owner_id, local_room_id, local_member_id)
);

create index if not exists owned_settlement_members_room_idx
  on public.owned_settlement_members (owner_id, local_room_id);

create table if not exists public.owned_settlement_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_expense_id text not null,
  local_room_id text not null,
  local_payer_member_id text not null default '',
  title text not null default '',
  amount integer not null default 0,
  split_member_ids jsonb not null default '[]'::jsonb,
  local_created_at text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version integer not null default 1,
  unique (owner_id, local_expense_id)
);

create index if not exists owned_settlement_expenses_room_idx
  on public.owned_settlement_expenses (owner_id, local_room_id);

create table if not exists public.owned_settlement_transfer_completions (
  owner_id uuid not null references auth.users (id) on delete cascade,
  transfer_key text not null,
  completed_at text not null default '',
  primary key (owner_id, transfer_key)
);

alter table public.owned_settlement_rooms enable row level security;
alter table public.owned_settlement_members enable row level security;
alter table public.owned_settlement_expenses enable row level security;
alter table public.owned_settlement_transfer_completions enable row level security;

drop policy if exists "owned_settlement_rooms_select_own" on public.owned_settlement_rooms;
drop policy if exists "owned_settlement_rooms_insert_own" on public.owned_settlement_rooms;
drop policy if exists "owned_settlement_rooms_update_own" on public.owned_settlement_rooms;
drop policy if exists "owned_settlement_members_select_own" on public.owned_settlement_members;
drop policy if exists "owned_settlement_members_insert_own" on public.owned_settlement_members;
drop policy if exists "owned_settlement_members_update_own" on public.owned_settlement_members;
drop policy if exists "owned_settlement_members_delete_own" on public.owned_settlement_members;
drop policy if exists "owned_settlement_expenses_select_own" on public.owned_settlement_expenses;
drop policy if exists "owned_settlement_expenses_insert_own" on public.owned_settlement_expenses;
drop policy if exists "owned_settlement_expenses_update_own" on public.owned_settlement_expenses;
drop policy if exists "owned_settlement_expenses_delete_own" on public.owned_settlement_expenses;
drop policy if exists "owned_settlement_completions_select_own" on public.owned_settlement_transfer_completions;
drop policy if exists "owned_settlement_completions_insert_own" on public.owned_settlement_transfer_completions;
drop policy if exists "owned_settlement_completions_update_own" on public.owned_settlement_transfer_completions;
drop policy if exists "owned_settlement_completions_delete_own" on public.owned_settlement_transfer_completions;

create policy "owned_settlement_rooms_select_own"
  on public.owned_settlement_rooms for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_settlement_rooms_insert_own"
  on public.owned_settlement_rooms for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_settlement_rooms_update_own"
  on public.owned_settlement_rooms for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_settlement_members_select_own"
  on public.owned_settlement_members for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_settlement_members_insert_own"
  on public.owned_settlement_members for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_settlement_members_update_own"
  on public.owned_settlement_members for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_settlement_members_delete_own"
  on public.owned_settlement_members for delete to authenticated
  using (owner_id = auth.uid());

create policy "owned_settlement_expenses_select_own"
  on public.owned_settlement_expenses for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_settlement_expenses_insert_own"
  on public.owned_settlement_expenses for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_settlement_expenses_update_own"
  on public.owned_settlement_expenses for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_settlement_expenses_delete_own"
  on public.owned_settlement_expenses for delete to authenticated
  using (owner_id = auth.uid());

create policy "owned_settlement_completions_select_own"
  on public.owned_settlement_transfer_completions for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_settlement_completions_insert_own"
  on public.owned_settlement_transfer_completions for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_settlement_completions_update_own"
  on public.owned_settlement_transfer_completions for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_settlement_completions_delete_own"
  on public.owned_settlement_transfer_completions for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update on table public.owned_settlement_rooms to authenticated;
grant select, insert, update, delete on table public.owned_settlement_members to authenticated;
grant select, insert, update, delete on table public.owned_settlement_expenses to authenticated;
grant select, insert, update, delete on table public.owned_settlement_transfer_completions to authenticated;

notify pgrst, 'reload schema';
