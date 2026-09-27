-- 本人カードに端末の friendId を残す。復元で「自分」の番号を揃えるため。
-- SQL Editor で Run する。

alter table public.identity_profiles
  add column if not exists local_friend_id text;

notify pgrst, 'reload schema';
