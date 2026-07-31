-- Supabase Auth may persist custom metadata after the initial auth.users
-- insert. Synchronise the canonical profile when either trusted app metadata
-- or display-name metadata changes, not only when the email changes.
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
    organisation_id = excluded.organisation_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists create_user_profile_on_signup on auth.users;
create trigger create_user_profile_on_signup
  after insert or update of email, raw_app_meta_data, raw_user_meta_data on auth.users
  for each row execute function private.create_user_profile();
