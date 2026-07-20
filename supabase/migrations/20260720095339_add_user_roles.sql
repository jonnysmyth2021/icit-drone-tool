create schema if not exists private;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'reviewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create unique index if not exists user_profiles_user_id_idx
  on public.user_profiles (user_id);

alter table public.user_profiles enable row level security;

create or replace function private.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, email, role)
  values (
    new.id,
    coalesce(new.email, new.id::text),
    case
      when new.raw_app_meta_data ->> 'role' in ('reviewer', 'admin') then 'reviewer'
      else 'user'
    end
  )
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists create_user_profile_on_signup on auth.users;
create trigger create_user_profile_on_signup
  after insert or update of email on auth.users
  for each row execute function private.create_user_profile();

insert into public.user_profiles (user_id, email, role)
select
  id,
  coalesce(email, id::text),
  case
    when raw_app_meta_data ->> 'role' in ('reviewer', 'admin') then 'reviewer'
    else 'user'
  end
from auth.users
on conflict (user_id) do update set email = excluded.email;

create index if not exists user_profiles_role_idx
  on public.user_profiles (role) where role = 'reviewer';

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
  on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.user_profiles from anon;
revoke insert, update, delete on table public.user_profiles from authenticated;
grant select on table public.user_profiles to authenticated;

comment on column public.user_profiles.role is
  'Application authorization tag. Allowed values are user and reviewer.';
