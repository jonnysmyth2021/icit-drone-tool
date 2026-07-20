alter table public.reports
  add column if not exists reporter_id uuid default auth.uid() references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_reports_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_reports_updated_at();

create index if not exists reports_reporter_id_created_at_idx
  on public.reports (reporter_id, created_at desc);

drop policy if exists "Observers can insert their own reports" on public.reports;
drop policy if exists "Observers can read their own reports" on public.reports;
drop policy if exists "Reviewers can update report decisions" on public.reports;

create policy "Authenticated observers can submit reports"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and reporter = (select auth.jwt() ->> 'email')
    and status = 'submitted'
    and reviewer_note is null
  );

create policy "Observers can read their own reports"
  on public.reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );

create policy "Reviewers can update report decisions"
  on public.reports for update to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );

revoke all on table public.reports from anon;
grant select, insert, update on table public.reports to authenticated;

comment on column public.reports.evidence is
  'Evidence metadata and compressed previews captured by the reporting flow.';
comment on column public.reports.location is
  'Point-in-time observer location, accuracy, bearing, and device heading.';
comment on column public.reports.intelligence is
  'Immutable point-in-time intelligence assessment, including matched aircraft and astronomy sources.';
