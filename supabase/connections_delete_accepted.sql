-- コネクト解除（accepted の削除）を許可する。既に connections.sql を Run 済みのとき用。
-- SQL Editor で Run する。

drop policy if exists "connections_delete_pending" on public.connections;
drop policy if exists "connections_delete_party" on public.connections;

create policy "connections_delete_party"
  on public.connections for delete to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

notify pgrst, 'reload schema';
