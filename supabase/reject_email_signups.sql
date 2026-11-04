-- メールアドレスでの新規登録だけ拒否する。SQL Editor で Run する。
-- 既存ユーザーのメールログイン、Google / Apple の新規登録は通す。
-- 関数を作っただけでは動かない。Run のあと、ダッシュボードでフックを有効にする。
-- Authentication → Hooks → Before User Created → Postgres → public.hook_reject_email_signups

create or replace function public.hook_reject_email_signups(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  provider text;
begin
  provider := event->'user'->'app_metadata'->>'provider';

  if provider = 'email' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'メールアドレスでの新規登録は終了しました。Google または Apple で作成してください。',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.hook_reject_email_signups
  to supabase_auth_admin;

revoke execute
  on function public.hook_reject_email_signups
  from authenticated, anon, public;
