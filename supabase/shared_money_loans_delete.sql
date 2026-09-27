-- 個別貸し借りの共有行を、当事者が消せるようにする。既に shared_money_loans.sql を Run 済みのとき用。
-- SQL Editor で Run する。

drop policy if exists "shared_money_loans_delete_party" on public.shared_money_loans;

create policy "shared_money_loans_delete_party"
  on public.shared_money_loans for delete to authenticated
  using (auth.uid() = lender_user_id or auth.uid() = borrower_user_id);

grant delete on table public.shared_money_loans to authenticated;

notify pgrst, 'reload schema';
