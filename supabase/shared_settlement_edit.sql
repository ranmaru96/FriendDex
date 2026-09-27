-- 既存の shared_settlement.sql を適用済みのとき、SQL Editor でこれだけ Run する。
-- 参加者ならメンバー変更と支出削除ができる。作った人限定をやめる。

drop policy if exists "shared_settlement_members_insert_own" on public.shared_settlement_members;
drop policy if exists "shared_settlement_members_delete_own" on public.shared_settlement_members;
drop policy if exists "shared_settlement_expenses_delete_member" on public.shared_settlement_expenses;

create policy "shared_settlement_members_insert_own"
  on public.shared_settlement_members for insert to authenticated
  with check (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_members_delete_own"
  on public.shared_settlement_members for delete to authenticated
  using (public.is_shared_settlement_party(room_id));

create policy "shared_settlement_expenses_delete_member"
  on public.shared_settlement_expenses for delete to authenticated
  using (public.is_shared_settlement_party(room_id));

grant delete on table public.shared_settlement_expenses to authenticated;

notify pgrst, 'reload schema';
