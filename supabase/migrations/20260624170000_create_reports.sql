create table if not exists public.reports (
  id text primary key,
  reference text not null unique,
  created_at timestamptz not null default now(),
  reporter text not null,
  drone_type text not null,
  lights_visible text not null,
  light_colors jsonb not null default '[]'::jsonb,
  altitude text not null,
  evidence jsonb not null default '[]'::jsonb,
  location jsonb,
  intelligence jsonb,
  status text not null default 'submitted',
  reviewer_note text,
  constraint reports_drone_type_check check (drone_type in ('Multi-Rotor', 'Fixed Wing', 'Unknown')),
  constraint reports_lights_visible_check check (lights_visible in ('Yes', 'No', 'Unknown')),
  constraint reports_altitude_check check (
    altitude in (
      'Below Treeline',
      'Treeline Height',
      'Above Treeline',
      'Above Buildings',
      'High Altitude',
      'Unknown'
    )
  ),
  constraint reports_status_check check (status in ('submitted', 'reviewing', 'confirmed', 'rejected'))
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_status_idx on public.reports (status);

alter table public.reports enable row level security;

create policy "Observers can insert their own reports"
  on public.reports
  for insert
  to authenticated
  with check (reporter = auth.jwt() ->> 'email');

create policy "Observers can read their own reports"
  on public.reports
  for select
  to authenticated
  using (
    reporter = auth.jwt() ->> 'email'
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'reviewer')
  );

create policy "Reviewers can update report decisions"
  on public.reports
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'reviewer'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'reviewer'));
