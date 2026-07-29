-- Enterprise multi-tenancy and database-enforced RBAC.
-- Existing users and reports are preserved inside the default ICIT organisation.

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  country text not null default 'GB',
  status text not null default 'active' check (status in ('active', 'suspended')),
  licence_type text not null default 'enterprise',
  expires_at timestamptz,
  storage_limit_gb numeric(10,2) not null default 10 check (storage_limit_gb > 0),
  report_retention_days integer not null default 2555 check (report_retention_days > 0),
  brand_colour text not null default '#f97316',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('reporter', 'reviewer', 'super_admin')),
  description text not null,
  system_role boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

insert into public.organisations (name, slug, country, licence_type)
values ('ICIT Drone', 'icit-drone', 'GB', 'enterprise')
on conflict (slug) do nothing;

insert into public.roles (name, description) values
  ('reporter', 'Field personnel who submit and manage their own reports.'),
  ('reviewer', 'Organisation analysts who review all reports within their organisation.'),
  ('super_admin', 'ICIT platform administrators with cross-organisation access.')
on conflict (name) do update set description = excluded.description;

insert into public.permissions (key, description) values
  ('reports.create', 'Create reports and upload evidence'),
  ('reports.read_own', 'Read reports created by the current user'),
  ('reports.read_org', 'Read all reports in the current organisation'),
  ('reports.review', 'Review and classify organisation reports'),
  ('reports.delete', 'Delete organisation reports'),
  ('reports.export', 'Export organisation reports'),
  ('analytics.read', 'Access organisation dashboards and analytics'),
  ('users.read_org', 'View users in the current organisation'),
  ('organisations.manage', 'Create, update, suspend and delete organisations'),
  ('users.manage_all', 'Invite, update, disable and delete users across organisations'),
  ('roles.manage', 'Configure role permission assignments'),
  ('audit.read_all', 'Read platform audit logs'),
  ('settings.manage', 'Configure platform and organisation settings'),
  ('platform.read', 'Read platform-wide usage and operational metrics')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name = 'reporter' and p.key in ('reports.create', 'reports.read_own'))
  or
  (r.name = 'reviewer' and p.key in (
    'reports.create', 'reports.read_own', 'reports.read_org', 'reports.review',
    'reports.delete', 'reports.export', 'analytics.read', 'users.read_org'
  ))
  or r.name = 'super_admin'
on conflict do nothing;

-- Promote user_profiles into the canonical profiles model. Some legacy ICIT
-- databases already contain an older profiles table, so merge rather than
-- destroying either source.
do $$
begin
  if to_regclass('public.profiles') is null then
    alter table public.user_profiles rename to profiles;
  else
    alter table public.profiles
      add column if not exists user_id uuid references auth.users(id) on delete cascade,
      add column if not exists first_name text,
      add column if not exists last_name text,
      add column if not exists updated_at timestamptz not null default now();

    update public.profiles p
    set user_id = u.id
    from auth.users u
    where p.user_id is null and lower(p.email) = lower(u.email);

    insert into public.profiles (
      id, user_id, email, first_name, last_name, role, created_at, updated_at
    )
    select
      coalesce(legacy.user_id, auth_user.id),
      coalesce(legacy.user_id, auth_user.id),
      legacy.email,
      legacy.first_name,
      legacy.last_name,
      legacy.role,
      legacy.created_at,
      now()
    from public.user_profiles legacy
    left join auth.users auth_user
      on auth_user.id = legacy.user_id
      or (legacy.user_id is null and lower(auth_user.email) = lower(legacy.email))
    where coalesce(legacy.user_id, auth_user.id) is not null
      and not exists (
        select 1 from public.profiles current_profile
        where current_profile.user_id = coalesce(legacy.user_id, auth_user.id)
           or lower(current_profile.email) = lower(legacy.email)
      )
    ;

    alter table public.user_profiles rename to legacy_user_profiles;
  end if;
end
$$;

alter table public.profiles
  drop constraint if exists user_profiles_role_check,
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add column if not exists organisation_id uuid references public.organisations(id) on delete restrict,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists active boolean not null default true,
  add column if not exists last_login timestamptz;

update public.profiles
set
  organisation_id = (select id from public.organisations where slug = 'icit-drone'),
  role = case when role in ('reviewer', 'admin') then 'reviewer' else 'reporter' end
where organisation_id is null or role in ('user', 'admin');

-- The known ICIT platform owner is promoted without elevating every existing reviewer.
update public.profiles
set role = 'super_admin'
where lower(email) = 'jonny@icittest.com';

update public.profiles p
set role = 'super_admin'
from auth.users u
where p.user_id = u.id
  and u.raw_app_meta_data ->> 'role' = 'super_admin';

alter table public.profiles
  alter column organisation_id set not null,
  alter column role set default 'reporter',
  add constraint profiles_role_check check (role in ('reporter', 'reviewer', 'super_admin'));

create index if not exists profiles_organisation_role_idx
  on public.profiles (organisation_id, role);
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

create table public.organisation_settings (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  ai_enabled boolean not null default true,
  analytics_enabled boolean not null default true,
  review_required boolean not null default true,
  allow_exports boolean not null default true,
  branding jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.organisation_settings (organisation_id)
select id from public.organisations
on conflict (organisation_id) do nothing;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organisation_id uuid references public.organisations(id) on delete set null,
  performed_by uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_organisation_idx on public.audit_logs (organisation_id, created_at desc);

create table public.platform_settings (
  id boolean primary key default true check (id),
  default_report_retention_days integer not null default 2555,
  default_storage_gb numeric(10,2) not null default 10,
  feature_flags jsonb not null default '{}'::jsonb,
  global_ai_enabled boolean not null default true,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

-- Tenant ownership for current report-domain tables.
alter table public.reports
  add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;
update public.reports r
set organisation_id = coalesce(
  (select p.organisation_id from public.profiles p where p.user_id = coalesce(r.reporter_id, r.user_id)),
  (select id from public.organisations where slug = 'icit-drone')
)
where organisation_id is null;
alter table public.reports alter column organisation_id set not null;
create index if not exists reports_organisation_created_idx
  on public.reports (organisation_id, created_at desc);

do $$
begin
  if to_regclass('public.report_media') is not null then
    alter table public.report_media
      add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;
    update public.report_media m
    set organisation_id = r.organisation_id
    from public.reports r
    where r.id = m.report_id and m.organisation_id is null;
    alter table public.report_media alter column organisation_id set not null;
    create index if not exists report_media_organisation_idx
      on public.report_media (organisation_id, report_id);
  end if;

  if to_regclass('public.report_enrichment') is not null then
    alter table public.report_enrichment
      add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;
    update public.report_enrichment e
    set organisation_id = r.organisation_id
    from public.reports r
    where r.id = e.report_id and e.organisation_id is null;
    alter table public.report_enrichment alter column organisation_id set not null;
    create index if not exists report_enrichment_organisation_idx
      on public.report_enrichment (organisation_id, report_id);
  end if;

  if to_regclass('public.risk_assessments') is not null then
    alter table public.risk_assessments
      add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;
    update public.risk_assessments a
    set organisation_id = coalesce(
      (select r.organisation_id from public.reports r where r.id = a.report_id),
      (select p.organisation_id from public.profiles p where p.user_id = a.user_id),
      (select id from public.organisations where slug = 'icit-drone')
    )
    where organisation_id is null;
    alter table public.risk_assessments alter column organisation_id set not null;
    create index if not exists risk_assessments_organisation_idx
      on public.risk_assessments (organisation_id, assessed_at desc);
  end if;
end
$$;

-- Private helpers prevent policy recursion and are not exposed through the Data API.
create or replace function private.current_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pr.organisation_id
  from public.profiles pr
  join public.organisations o on o.id = pr.organisation_id
  where pr.user_id = (select auth.uid())
    and pr.active
    and (o.status = 'active' or pr.role = 'super_admin')
$$;

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.role
  from public.profiles pr
  join public.organisations o on o.id = pr.organisation_id
  where pr.user_id = (select auth.uid())
    and pr.active
    and (o.status = 'active' or pr.role = 'super_admin')
$$;

create or replace function private.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.organisations o on o.id = pr.organisation_id
    join public.roles r on r.name = pr.role
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where pr.user_id = (select auth.uid())
      and pr.active
      and (o.status = 'active' or pr.role = 'super_admin')
      and p.key = permission_key
  )
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_organisation_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.has_permission(text) to authenticated;

-- Keep new signups and invitations aligned with the canonical profile model.
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
    select id into target_org from public.organisations where slug = 'icit-drone';
  end if;
  target_role := case
    when new.raw_app_meta_data ->> 'role' in ('reporter', 'reviewer', 'super_admin')
      then new.raw_app_meta_data ->> 'role'
    else 'reporter'
  end;

  insert into public.profiles (
    user_id, email, organisation_id, first_name, last_name, role
  ) values (
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

-- Replace global policies with tenant-aware policies.
alter table public.organisations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organisation_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.reports enable row level security;

-- This migration is the authoritative policy boundary for tenant-owned tables.
-- Remove legacy global policies even when they were created outside migration history.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'reports', 'report_media', 'report_enrichment', 'risk_assessments')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;

  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname ilike '%report%media%'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  user_id = (select auth.uid())
  or (
    organisation_id = (select private.current_organisation_id())
    and (select private.has_permission('users.read_org'))
  )
  or (select private.current_role()) = 'super_admin'
);
create policy profiles_super_admin_update on public.profiles for update to authenticated
  using ((select private.current_role()) = 'super_admin')
  with check ((select private.current_role()) = 'super_admin');

create policy organisations_select on public.organisations for select to authenticated using (
  id = (select private.current_organisation_id())
  or (select private.current_role()) = 'super_admin'
);
create policy organisations_manage on public.organisations for all to authenticated
  using ((select private.has_permission('organisations.manage')))
  with check ((select private.has_permission('organisations.manage')));

create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy role_permissions_manage on public.role_permissions for all to authenticated
  using ((select private.has_permission('roles.manage')))
  with check ((select private.has_permission('roles.manage')));

create policy organisation_settings_select on public.organisation_settings for select to authenticated using (
  organisation_id = (select private.current_organisation_id())
  or (select private.current_role()) = 'super_admin'
);
create policy organisation_settings_manage on public.organisation_settings for all to authenticated
  using ((select private.has_permission('settings.manage')))
  with check ((select private.has_permission('settings.manage')));

create policy audit_logs_select on public.audit_logs for select to authenticated using (
  (select private.current_role()) = 'super_admin'
);
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (
  performed_by = (select auth.uid())
  and (
    organisation_id = (select private.current_organisation_id())
    or (select private.current_role()) = 'super_admin'
  )
);
create policy platform_settings_select on public.platform_settings for select to authenticated
  using ((select private.current_role()) = 'super_admin');
create policy platform_settings_update on public.platform_settings for update to authenticated
  using ((select private.has_permission('settings.manage')))
  with check ((select private.has_permission('settings.manage')));

drop policy if exists "Users can submit reports" on public.reports;
drop policy if exists "Authenticated observers can submit reports" on public.reports;
drop policy if exists "Users can read their own reports" on public.reports;
drop policy if exists "Observers can read their own reports" on public.reports;
drop policy if exists "reports_select_authenticated" on public.reports;
drop policy if exists "Reviewers can update report decisions" on public.reports;
drop policy if exists "reports_update_reviewer_or_admin" on public.reports;
drop policy if exists "reports_delete_reviewer" on public.reports;

create policy reports_insert on public.reports for insert to authenticated with check (
  reporter_id = (select auth.uid())
  and organisation_id = (select private.current_organisation_id())
  and (select private.has_permission('reports.create'))
);
create policy reports_select on public.reports for select to authenticated using (
  (reporter_id = (select auth.uid()) and (select private.has_permission('reports.read_own')))
  or (
    organisation_id = (select private.current_organisation_id())
    and (select private.has_permission('reports.read_org'))
  )
  or (select private.current_role()) = 'super_admin'
);
create policy reports_update on public.reports for update to authenticated
  using (
    (organisation_id = (select private.current_organisation_id()) and (select private.has_permission('reports.review')))
    or (select private.current_role()) = 'super_admin'
  )
  with check (
    (organisation_id = (select private.current_organisation_id()) and (select private.has_permission('reports.review')))
    or (select private.current_role()) = 'super_admin'
  );
create policy reports_delete on public.reports for delete to authenticated using (
  (organisation_id = (select private.current_organisation_id()) and (select private.has_permission('reports.delete')))
  or (select private.current_role()) = 'super_admin'
);

do $$
begin
  if to_regclass('public.risk_assessments') is not null then
    execute 'create policy risk_assessments_insert on public.risk_assessments for insert to authenticated with check (
      user_id = (select auth.uid())
      and organisation_id = (select private.current_organisation_id())
    )';
    execute 'create policy risk_assessments_select on public.risk_assessments for select to authenticated using (
      (user_id = (select auth.uid()) and organisation_id = (select private.current_organisation_id()))
      or (
        organisation_id = (select private.current_organisation_id())
        and (select private.has_permission(''reports.read_org''))
      )
      or (select private.current_role()) = ''super_admin''
    )';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.report_media') is not null then
    execute 'drop policy if exists "report_media_select_authorized" on public.report_media';
    execute 'create policy report_media_select on public.report_media for select to authenticated using (
      exists (
        select 1 from public.reports r
        where r.id = report_media.report_id
          and (
            r.reporter_id = (select auth.uid())
            or (r.organisation_id = (select private.current_organisation_id()) and (select private.has_permission(''reports.read_org'')))
            or (select private.current_role()) = ''super_admin''
          )
      )
    )';
    execute 'create policy report_media_insert on public.report_media for insert to authenticated with check (
      user_id = (select auth.uid())
      and organisation_id = (select private.current_organisation_id())
      and exists (
        select 1 from public.reports r
        where r.id = report_media.report_id and r.reporter_id = (select auth.uid())
      )
    )';
  end if;

  if to_regclass('public.report_enrichment') is not null then
    execute 'drop policy if exists "report_enrichment_select_authorized" on public.report_enrichment';
    execute 'drop policy if exists "report_enrichment_insert_owner_or_reviewer" on public.report_enrichment';
    execute 'drop policy if exists "report_enrichment_update_reviewer_or_admin" on public.report_enrichment';
    execute 'create policy report_enrichment_select on public.report_enrichment for select to authenticated using (
      exists (select 1 from public.reports r where r.id = report_enrichment.report_id)
    )';
    execute 'create policy report_enrichment_insert on public.report_enrichment for insert to authenticated with check (
      organisation_id = (select private.current_organisation_id())
      and exists (
        select 1 from public.reports r
        where r.id = report_enrichment.report_id
          and (r.reporter_id = (select auth.uid()) or (select private.has_permission(''reports.review'')))
      )
    )';
    execute 'create policy report_enrichment_update on public.report_enrichment for update to authenticated
      using (
        (organisation_id = (select private.current_organisation_id()) and (select private.has_permission(''reports.review'')))
        or (select private.current_role()) = ''super_admin''
      )
      with check (
        (organisation_id = (select private.current_organisation_id()) and (select private.has_permission(''reports.review'')))
        or (select private.current_role()) = ''super_admin''
      )';
  end if;
end
$$;

-- Evidence access is derived from the tenant-scoped media row, not a user-controlled path.
drop policy if exists "report_media_bucket_delete" on storage.objects;
create policy report_media_objects_select on storage.objects for select to authenticated using (
  bucket_id = 'report-media'
  and exists (
    select 1 from public.report_media m
    join public.reports r on r.id = m.report_id
    where m.file_path = storage.objects.name
      and (
        r.reporter_id = (select auth.uid())
        or (r.organisation_id = (select private.current_organisation_id()) and (select private.has_permission('reports.read_org')))
        or (select private.current_role()) = 'super_admin'
      )
  )
);
create policy report_media_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'report-media'
  and (storage.foldername(name))[1] = (select private.current_organisation_id())::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy report_media_objects_delete on storage.objects for delete to authenticated using (
  bucket_id = 'report-media'
  and exists (
    select 1 from public.report_media m
    join public.reports r on r.id = m.report_id
    where m.file_path = storage.objects.name
      and (
        (r.organisation_id = (select private.current_organisation_id()) and (select private.has_permission('reports.delete')))
        or (select private.current_role()) = 'super_admin'
      )
  )
);

grant select on public.organisations, public.roles, public.permissions,
  public.role_permissions, public.organisation_settings, public.audit_logs,
  public.platform_settings, public.profiles to authenticated;
grant insert, update, delete on public.organisations, public.role_permissions,
  public.organisation_settings, public.profiles to authenticated;
grant insert on public.audit_logs to authenticated;
grant update on public.platform_settings to authenticated;

comment on table public.organisations is 'Tenant boundary for every customer organisation.';
comment on table public.profiles is 'Database-controlled identity, tenant and RBAC assignment for each Auth user.';
comment on table public.audit_logs is 'Append-only application audit trail; visible only to super administrators.';
