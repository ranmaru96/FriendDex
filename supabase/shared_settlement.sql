-- グループ精算の共有。SQL Editor で Run する。
-- メンバーは全員閲覧・支出登録可。済の制限はアプリ側。
-- 部屋とメンバーの RLS が互いを見ると無限ループになるので、判定は SECURITY DEFINER 関数に置く。
-- DROP POLICY は再実行用。

create table if not exists public.shared_settlement_rooms (
  id uuid primary key,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_settlement_members (
  room_id uuid not null references public.shared_settlement_rooms (id) on delete cascade,
  member_id text not null,
  user_id uuid references auth.users (id) on delete cascade,
  display_name text not null default '',
  primary key (room_id, member_id)
);

create index if not exists shared_settlement_members_user_idx
  on public.shared_settlement_members (user_id);

create table if not exists public.shared_settlement_expenses (
  id uuid primary key,
  room_id uuid not null references public.shared_settlement_rooms (id) on delete cascade,
  payer_member_id text not null,
  title text not null default '',
  amount integer not null default 0,
  split_member_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shared_settlement_expenses_room_idx
  on public.shared_settlement_expenses (room_id);

create table if not exists public.shared_settlement_completions (
  room_id uuid not null references public.shared_settlement_rooms (id) on delete cascade,
  transfer_key text not null,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (room_id, transfer_key)
);

alter table public.shared_settlement_rooms enable row level security;
alter table public.shared_settlement_members enable row level security;
alter table public.shared_settlement_expenses enable row level security;
alter table public.shared_settlement_completions enable row level security;

create or replace function public.is_shared_settlement_creator(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_settlement_rooms r
    where r.id = p_room_id
      and r.created_by = auth.uid()
  );
$$;

create or replace function public.is_shared_settlement_party(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.shared_settlement_rooms r
      where r.id = p_room_id
        and r.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.shared_settlement_members m
      where m.room_id = p_room_id
        and m.user_id = auth.uid()
    );
$$;

revoke all on function public.is_shared_settlement_creator(uuid) from public;
revoke all on function public.is_shared_settlement_party(uuid) from public;
grant execute on function public.is_shared_settlement_creator(uuid) to authenticated;
grant execute on function public.is_shared_settlement_party(uuid) to authenticated;

drop policy if exists "shared_settlement_rooms_select_member" on public.shared_settlement_rooms;
drop policy if exists "shared_settlement_rooms_insert_own" on public.shared_settlement_rooms;
drop policy if exists "shared_settlement_rooms_update_member" on public.shared_settlement_rooms;
drop policy if exists "shared_settlement_members_select_member" on public.shared_settlement_members;
drop policy if exists "shared_settlement_members_insert_own" on public.shared_settlement_members;
drop policy if exists "shared_settlement_members_delete_own" on public.shared_settlement_members;
drop policy if exists "shared_settlement_expenses_select_member" on public.shared_settlement_expenses;
drop policy if exists "shared_settlement_expenses_insert_member" on public.shared_settlement_expenses;
drop policy if exists "shared_settlement_expenses_update_member" on public.shared_settlement_expenses;
drop policy if exists "shared_settlement_completions_select_member" on public.shared_settlement_completions;
drop policy if exists "shared_settlement_completions_insert_member" on public.shared_settlement_completions;
drop policy if exists "shared_settlement_completions_update_member" on public.shared_settlement_completions;
drop policy if exists "shared_settlement_completions_delete_member" on public.shared_settlement_completions;

create policy "shared_settlement_rooms_select_member"
  on public.shared_settlement_rooms for select to authenticated
  using (public.is_shared_settlement_party(id));

create policy "shared_settlement_rooms_insert_own"
  on public.shared_settlement_rooms for insert to authenticated
  with check (created_by = auth.uid());

create policy "shared_settlement_rooms_update_member"
  on public.shared_settlement_rooms for update to authenticated
  using (public.is_shared_settlement_party(id))
  with check (public.is_shared_settlement_party(id));

create policy "shared_settlement_members_select_member"
  on public.shared_settlement_members for select to authenticated
  using (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_members_insert_own"
  on public.shared_settlement_members for insert to authenticated
  with check (public.is_shared_settlement_creator(room_id));

create policy "shared_settlement_members_delete_own"
  on public.shared_settlement_members for delete to authenticated
  using (public.is_shared_settlement_creator(room_id));

create policy "shared_settlement_expenses_select_member"
  on public.shared_settlement_expenses for select to authenticated
  using (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_expenses_insert_member"
  on public.shared_settlement_expenses for insert to authenticated
  with check (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_expenses_update_member"
  on public.shared_settlement_expenses for update to authenticated
  using (public.is_shared_settlement_party(room_id))
  with check (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_completions_select_member"
  on public.shared_settlement_completions for select to authenticated
  using (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_completions_insert_member"
  on public.shared_settlement_completions for insert to authenticated
  with check (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_completions_update_member"
  on public.shared_settlement_completions for update to authenticated
  using (public.is_shared_settlement_party(room_id))
  with check (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_completions_delete_member"
  on public.shared_settlement_completions for delete to authenticated
  using (public.is_shared_settlement_party(room_id));

grant select, insert, update on table public.shared_settlement_rooms to authenticated;
grant select, insert, delete on table public.shared_settlement_members to authenticated;
grant select, insert, update on table public.shared_settlement_expenses to authenticated;
grant select, insert, update, delete on table public.shared_settlement_completions to authenticated;

notify pgrst, 'reload schema';
