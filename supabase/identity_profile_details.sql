-- 本人カードの残り項目（公開スイッチなし）。SQL Editor で Run する。
-- エピソードは対象外。列追加のみ。

alter table public.identity_profiles
  add column if not exists category text not null default '';

alter table public.identity_profiles
  add column if not exists description text not null default '';

alter table public.identity_profiles
  add column if not exists affiliations jsonb not null default '[]'::jsonb;

alter table public.identity_profiles
  add column if not exists personalities jsonb not null default '[]'::jsonb;

alter table public.identity_profiles
  add column if not exists experiences jsonb not null default '[]'::jsonb;

alter table public.identity_profiles
  add column if not exists traits jsonb not null default '[]'::jsonb;

alter table public.identity_profiles
  add column if not exists notes jsonb not null default '[]'::jsonb;

alter table public.identity_profiles
  add column if not exists likes jsonb not null default '[]'::jsonb;

alter table public.identity_profiles
  add column if not exists dislikes jsonb not null default '[]'::jsonb;

alter table public.identity_profiles
  add column if not exists sayings jsonb not null default '[]'::jsonb;
