-- The multi-tenant migration replaced this function but relied on a trigger
-- created by an older migration remaining attached. Recreate both pieces so
-- fresh and partially migrated environments behave identically.
create schema if not exists private;

-- Environments that already had a public.profiles table did not inherit the
-- legacy user_profiles unique index. The trigger's ON CONFLICT target requires
-- user_id to be unique.
create unique index if not exists profiles_user_id_idx
  on public.profiles (user_id);

create or replace function private.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target_role text;
begin
  target_org := nullif(new.raw_app_meta_data ->> 'organisation_id', '')::uuid;
  if target_org is null then
    select id into target_org
    from public.organisations
    where slug = 'icit-drone';
  end if;

  target_role := case
    when new.raw_app_meta_data ->> 'role' in ('reporter', 'reviewer', 'super_admin')
      then new.raw_app_meta_data ->> 'role'
    else 'reporter'
  end;

  insert into public.profiles (
    id,
    user_id,
    email,
    organisation_id,
    first_name,
    last_name,
    role
  ) values (
    new.id,
    new.id,
    coalesce(new.email, new.id::text),
    target_org,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    target_role
  )
  on conflict (user_id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists create_user_profile_on_signup on auth.users;
create trigger create_user_profile_on_signup
  after insert or update of email on auth.users
  for each row execute function private.create_user_profile();
