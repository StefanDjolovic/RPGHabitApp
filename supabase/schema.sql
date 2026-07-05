create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  schema_version integer not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_backups enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can read their backup" on public.app_backups;
create policy "Users can read their backup"
on public.app_backups for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their backup" on public.app_backups;
create policy "Users can create their backup"
on public.app_backups for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their backup" on public.app_backups;
create policy "Users can update their backup"
on public.app_backups for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Run this manually after registering and verifying your dedicated admin account.
-- Replace the email before executing it in the Supabase SQL Editor.
-- update public.profiles
-- set role = 'admin', updated_at = now()
-- where id = (select id from auth.users where email = 'admin@example.com');
