create extension if not exists pgcrypto;

create table if not exists public.user_sync_configs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gitee_repo text not null,
  gitee_owner text not null,
  gitee_repo_name text not null,
  gitee_branch text not null default 'master',
  password_hash text not null,
  password_expiry timestamptz not null,
  kdf_params jsonb not null,
  encrypted_token text,
  token_cipher_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.td_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists td_user_sync_configs_set_updated_at on public.user_sync_configs;
create trigger td_user_sync_configs_set_updated_at
before update on public.user_sync_configs
for each row
execute procedure public.td_set_updated_at();

alter table public.user_sync_configs enable row level security;

drop policy if exists "td_select_own_config" on public.user_sync_configs;
create policy "td_select_own_config"
on public.user_sync_configs
for select
using (auth.uid() = user_id);

drop policy if exists "td_insert_own_config" on public.user_sync_configs;
create policy "td_insert_own_config"
on public.user_sync_configs
for insert
with check (auth.uid() = user_id);

drop policy if exists "td_update_own_config" on public.user_sync_configs;
create policy "td_update_own_config"
on public.user_sync_configs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
