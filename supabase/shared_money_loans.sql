-- 個別貸し借りの共有。SQL Editor で Run する。
-- つながっている2人だけが読める。承認フローは無し。
-- DROP POLICY は再実行用。

create table if not exists public.shared_money_loans (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  local_loan_id text not null,
  lender_user_id uuid not null references auth.users (id) on delete cascade,
  borrower_user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null default 0,
  title text not null default '',
  memo text not null default '',
  is_repaid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, local_loan_id)
);

create index if not exists shared_money_loans_lender_idx
  on public.shared_money_loans (lender_user_id);

create index if not exists shared_money_loans_borrower_idx
  on public.shared_money_loans (borrower_user_id);

alter table public.shared_money_loans enable row level security;

drop policy if exists "shared_money_loans_select_party" on public.shared_money_loans;
drop policy if exists "shared_money_loans_insert_party" on public.shared_money_loans;
drop policy if exists "shared_money_loans_update_party" on public.shared_money_loans;
drop policy if exists "shared_money_loans_delete_party" on public.shared_money_loans;

create policy "shared_money_loans_select_party"
  on public.shared_money_loans for select to authenticated
  using (auth.uid() = lender_user_id or auth.uid() = borrower_user_id);

create policy "shared_money_loans_insert_party"
  on public.shared_money_loans for insert to authenticated
  with check (
    auth.uid() = created_by
    and (auth.uid() = lender_user_id or auth.uid() = borrower_user_id)
  );

create policy "shared_money_loans_update_party"
  on public.shared_money_loans for update to authenticated
  using (auth.uid() = lender_user_id or auth.uid() = borrower_user_id)
  with check (auth.uid() = lender_user_id or auth.uid() = borrower_user_id);

create policy "shared_money_loans_delete_party"
  on public.shared_money_loans for delete to authenticated
  using (auth.uid() = lender_user_id or auth.uid() = borrower_user_id);

grant select, insert, update, delete on table public.shared_money_loans to authenticated;

notify pgrst, 'reload schema';
