create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  user_id uuid references auth.users (id) on delete set null,
  reporter_id uuid references auth.users (id) on delete set null,
  session_id text,
  remote_id jsonb,
  type text,
  color text,
  count integer,
  height text,
  has_lights boolean,
  lights_visible boolean,
  light_colors jsonb not null default '[]'::jsonb,
  latitude double precision,
  longitude double precision,
  location jsonb,
  context jsonb,
  observation jsonb,
  capture_metadata jsonb,
  map_context jsonb,
  aircraft jsonb,
  cross_ref_result jsonb,
  intelligence_summary jsonb,
  risk_score double precision,
  risk_level text,
  risk jsonb,
  status text not null default 'submitted',
  enriched_at timestamptz,
  reviewed_at timestamptz,
  reviewer_notes text,
  reviewer_action text,
  draft_expires_at timestamptz
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);

alter table public.reports enable row level security;

drop policy if exists "Users can submit reports" on public.reports;
create policy "Users can submit reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists "Users can read their own reports" on public.reports;
create policy "Users can read their own reports"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

revoke all on table public.reports from anon;
grant select, insert on table public.reports to authenticated;
