-- 個別の貸し借り控え。SQL Editor で Run する。
-- グループ精算は対象外。清算表示は端末で組み立てる。
-- DROP POLICY は再実行用。

create table if not exists public.owned_money_loan_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_session_id text not null,
  title text not null default '',
  local_created_at text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version integer not null default 1,
  unique (owner_id, local_session_id)
);

create index if not exists owned_money_loan_sessions_owner_id_idx
  on public.owned_money_loan_sessions (owner_id);

create table if not exists public.owned_money_loans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_loan_id text not null,
  local_session_id text not null default '',
  local_group_id text not null default '',
  counterparty_kind text not null default 'friend',
  counterparty_value text not null default '',
  amount integer not null default 0,
  direction text not null default 'lent',
  memo text not null default '',
  is_repaid boolean not null default false,
  local_created_at text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version integer not null default 1,
  unique (owner_id, local_loan_id)
);

create index if not exists owned_money_loans_owner_id_idx
  on public.owned_money_loans (owner_id);

create index if not exists owned_money_loans_session_idx
  on public.owned_money_loans (owner_id, local_session_id);

alter table public.owned_money_loan_sessions enable row level security;
alter table public.owned_money_loans enable row level security;

drop policy if exists "owned_money_loan_sessions_select_own" on public.owned_money_loan_sessions;
drop policy if exists "owned_money_loan_sessions_insert_own" on public.owned_money_loan_sessions;
drop policy if exists "owned_money_loan_sessions_update_own" on public.owned_money_loan_sessions;
drop policy if exists "owned_money_loans_select_own" on public.owned_money_loans;
drop policy if exists "owned_money_loans_insert_own" on public.owned_money_loans;
drop policy if exists "owned_money_loans_update_own" on public.owned_money_loans;

create policy "owned_money_loan_sessions_select_own"
  on public.owned_money_loan_sessions for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_money_loan_sessions_insert_own"
  on public.owned_money_loan_sessions for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_money_loan_sessions_update_own"
  on public.owned_money_loan_sessions for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owned_money_loans_select_own"
  on public.owned_money_loans for select to authenticated
  using (owner_id = auth.uid());

create policy "owned_money_loans_insert_own"
  on public.owned_money_loans for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owned_money_loans_update_own"
  on public.owned_money_loans for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update on table public.owned_money_loan_sessions to authenticated;
grant select, insert, update on table public.owned_money_loans to authenticated;

notify pgrst, 'reload schema';
