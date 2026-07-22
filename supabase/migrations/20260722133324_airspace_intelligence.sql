create extension if not exists postgis with schema extensions;

create table public.restriction_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  authority text not null,
  country text not null,
  source_url text not null,
  licence text,
  source_version text not null,
  effective_from timestamptz,
  effective_until timestamptz,
  imported_at timestamptz not null default now(),
  checksum text,
  status text not null default 'active' check (status in ('active', 'superseded', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, country, source_version)
);

create table public.airspace_restrictions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.restriction_sources(id) on delete restrict,
  source_identifier text not null,
  name text not null,
  category text not null,
  sub_category text not null,
  authority text not null,
  country text not null,
  legal_status text not null,
  source_version text not null,
  effective_from timestamptz,
  effective_until timestamptz,
  schedule jsonb,
  vertical_limits jsonb,
  contact_details jsonb,
  risk_level text not null check (risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  display_priority integer not null default 50 check (display_priority between 0 and 100),
  colour text not null,
  icon text not null,
  notes text,
  geometry extensions.geometry(MultiPolygon, 4326) not null,
  properties jsonb not null default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  unique (source_id, source_identifier)
);

create table public.temporary_restrictions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.restriction_sources(id) on delete restrict,
  source_identifier text not null,
  name text not null,
  category text not null default 'temporary_aviation',
  sub_category text not null,
  authority text not null,
  country text not null,
  legal_status text not null,
  source_version text not null,
  effective_from timestamptz not null,
  effective_until timestamptz not null,
  schedule jsonb,
  vertical_limits jsonb,
  contact_details jsonb,
  risk_level text not null check (risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  display_priority integer not null default 90 check (display_priority between 0 and 100),
  colour text not null,
  icon text not null,
  notes text,
  geometry extensions.geometry(MultiPolygon, 4326) not null,
  properties jsonb not null default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  unique (source_id, source_identifier),
  check (effective_until > effective_from)
);

create table public.critical_infrastructure (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.restriction_sources(id) on delete restrict,
  source_identifier text not null,
  name text not null,
  category text not null default 'critical_infrastructure',
  sub_category text not null,
  authority text not null,
  country text not null,
  legal_status text not null default 'advisory',
  source_version text not null,
  effective_from timestamptz,
  effective_until timestamptz,
  schedule jsonb,
  vertical_limits jsonb,
  contact_details jsonb,
  risk_level text not null check (risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  display_priority integer not null default 60 check (display_priority between 0 and 100),
  colour text not null,
  icon text not null,
  notes text,
  geometry extensions.geometry(MultiPolygon, 4326) not null,
  properties jsonb not null default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  unique (source_id, source_identifier)
);

create table public.restriction_events (
  id bigint generated always as identity primary key,
  source_id uuid references public.restriction_sources(id) on delete set null,
  restriction_id uuid,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb
);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  report_id text references public.reports(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  altitude_metres double precision,
  assessed_at timestamptz not null default now(),
  assessed_for timestamptz not null,
  risk_level text not null check (risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  risk_score integer not null check (risk_score between 0 and 100),
  restriction_ids uuid[] not null default '{}',
  result jsonb not null,
  engine_version text not null
);

create index restriction_sources_country_provider_idx on public.restriction_sources(country, provider);
create index restriction_sources_effective_idx on public.restriction_sources(effective_from, effective_until);
create index airspace_restrictions_geometry_idx on public.airspace_restrictions using gist(geometry);
create index airspace_restrictions_category_idx on public.airspace_restrictions(category, sub_category);
create index airspace_restrictions_source_idx on public.airspace_restrictions(source_id);
create index airspace_restrictions_effective_idx on public.airspace_restrictions(effective_from, effective_until);
create index temporary_restrictions_geometry_idx on public.temporary_restrictions using gist(geometry);
create index temporary_restrictions_category_idx on public.temporary_restrictions(category, sub_category);
create index temporary_restrictions_source_idx on public.temporary_restrictions(source_id);
create index temporary_restrictions_effective_idx on public.temporary_restrictions(effective_from, effective_until);
create index critical_infrastructure_geometry_idx on public.critical_infrastructure using gist(geometry);
create index critical_infrastructure_category_idx on public.critical_infrastructure(category, sub_category);
create index critical_infrastructure_source_idx on public.critical_infrastructure(source_id);
create index critical_infrastructure_effective_idx on public.critical_infrastructure(effective_from, effective_until);
create index restriction_events_restriction_idx on public.restriction_events(restriction_id, occurred_at desc);
create index restriction_events_source_idx on public.restriction_events(source_id, occurred_at desc);
create index risk_assessments_report_idx on public.risk_assessments(report_id, assessed_at desc);
create index risk_assessments_user_idx on public.risk_assessments(user_id, assessed_at desc);
create index risk_assessments_assessed_for_idx on public.risk_assessments(assessed_for);

alter table public.restriction_sources enable row level security;
alter table public.airspace_restrictions enable row level security;
alter table public.temporary_restrictions enable row level security;
alter table public.critical_infrastructure enable row level security;
alter table public.restriction_events enable row level security;
alter table public.risk_assessments enable row level security;

create policy "Authenticated users can read restriction sources"
  on public.restriction_sources for select to authenticated using (true);
create policy "Authenticated users can read airspace restrictions"
  on public.airspace_restrictions for select to authenticated using (true);
create policy "Authenticated users can read temporary restrictions"
  on public.temporary_restrictions for select to authenticated using (true);
create policy "Authenticated users can read critical infrastructure"
  on public.critical_infrastructure for select to authenticated using (true);
create policy "Reviewers can read restriction events"
  on public.restriction_events for select to authenticated using (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );
create policy "Users can create their own risk assessments"
  on public.risk_assessments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can read relevant risk assessments"
  on public.risk_assessments for select to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );

revoke all on public.restriction_sources, public.airspace_restrictions,
  public.temporary_restrictions, public.critical_infrastructure,
  public.restriction_events, public.risk_assessments from anon;
grant select on public.restriction_sources, public.airspace_restrictions,
  public.temporary_restrictions, public.critical_infrastructure to authenticated;
grant select on public.restriction_events to authenticated;
grant select, insert on public.risk_assessments to authenticated;

create or replace function public.query_airspace_bbox(
  min_lon double precision,
  min_lat double precision,
  max_lon double precision,
  max_lat double precision,
  at_time timestamptz default now(),
  categories text[] default null
) returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with bounds as (
    select extensions.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326) as geometry
  ), canonical as (
    select r.id, r.source_identifier, r.name, r.category, r.sub_category, r.authority, r.country,
      r.legal_status, r.source_version, r.effective_from, r.effective_until, r.schedule,
      r.vertical_limits, r.contact_details, r.risk_level, r.display_priority, r.colour, r.icon,
      r.notes, r.geometry, r.properties, r.last_updated, 'permanent'::text as record_type
    from public.airspace_restrictions r, bounds b
    where r.geometry operator(extensions.&&) b.geometry
      and extensions.ST_Intersects(r.geometry, b.geometry)
      and (r.effective_from is null or r.effective_from <= at_time)
      and (r.effective_until is null or r.effective_until > at_time)
      and (categories is null or r.category = any(categories) or r.sub_category = any(categories))
    union all
    select r.id, r.source_identifier, r.name, r.category, r.sub_category, r.authority, r.country,
      r.legal_status, r.source_version, r.effective_from, r.effective_until, r.schedule,
      r.vertical_limits, r.contact_details, r.risk_level, r.display_priority, r.colour, r.icon,
      r.notes, r.geometry, r.properties, r.last_updated, 'temporary'::text
    from public.temporary_restrictions r, bounds b
    where r.geometry operator(extensions.&&) b.geometry
      and extensions.ST_Intersects(r.geometry, b.geometry)
      and r.effective_from <= at_time and r.effective_until > at_time
      and (categories is null or r.category = any(categories) or r.sub_category = any(categories))
    union all
    select r.id, r.source_identifier, r.name, r.category, r.sub_category, r.authority, r.country,
      r.legal_status, r.source_version, r.effective_from, r.effective_until, r.schedule,
      r.vertical_limits, r.contact_details, r.risk_level, r.display_priority, r.colour, r.icon,
      r.notes, r.geometry, r.properties, r.last_updated, 'infrastructure'::text
    from public.critical_infrastructure r, bounds b
    where r.geometry operator(extensions.&&) b.geometry
      and extensions.ST_Intersects(r.geometry, b.geometry)
      and (r.effective_from is null or r.effective_from <= at_time)
      and (r.effective_until is null or r.effective_until > at_time)
      and (categories is null or r.category = any(categories) or r.sub_category = any(categories))
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'id', id,
      'geometry', extensions.ST_AsGeoJSON(geometry, 6)::jsonb,
      'properties', jsonb_build_object(
        'id', id, 'referenceNumber', source_identifier, 'name', name,
        'category', category, 'subCategory', sub_category, 'authority', authority,
        'country', country, 'legalStatus', legal_status, 'sourceVersion', source_version,
        'effectiveFrom', effective_from, 'effectiveUntil', effective_until,
        'schedule', schedule, 'verticalLimits', vertical_limits,
        'contactDetails', contact_details, 'riskLevel', risk_level,
        'displayPriority', display_priority, 'colour', colour, 'icon', icon,
        'notes', notes, 'properties', properties, 'lastUpdated', last_updated,
        'recordType', record_type
      )
    ) order by display_priority), '[]'::jsonb)
  ) from canonical;
$$;

create or replace function public.query_airspace_point(
  query_lon double precision,
  query_lat double precision,
  radius_metres double precision default 0,
  at_time timestamptz default now()
) returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with point as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(query_lon, query_lat), 4326) as geometry
  ), canonical as (
    select r.id, r.name, r.category, r.sub_category, r.legal_status, r.risk_level,
      r.effective_from, r.effective_until, r.vertical_limits, r.display_priority, r.geometry,
      'permanent'::text as record_type
    from public.airspace_restrictions r, point p
    where (extensions.ST_Intersects(r.geometry, p.geometry)
      or extensions.ST_DWithin(r.geometry::extensions.geography, p.geometry::extensions.geography, radius_metres))
      and (r.effective_from is null or r.effective_from <= at_time)
      and (r.effective_until is null or r.effective_until > at_time)
    union all
    select r.id, r.name, r.category, r.sub_category, r.legal_status, r.risk_level,
      r.effective_from, r.effective_until, r.vertical_limits, r.display_priority, r.geometry, 'temporary'::text
    from public.temporary_restrictions r, point p
    where (extensions.ST_Intersects(r.geometry, p.geometry)
      or extensions.ST_DWithin(r.geometry::extensions.geography, p.geometry::extensions.geography, radius_metres))
      and r.effective_from <= at_time and r.effective_until > at_time
    union all
    select r.id, r.name, r.category, r.sub_category, r.legal_status, r.risk_level,
      r.effective_from, r.effective_until, r.vertical_limits, r.display_priority, r.geometry, 'infrastructure'::text
    from public.critical_infrastructure r, point p
    where (extensions.ST_Intersects(r.geometry, p.geometry)
      or extensions.ST_DWithin(r.geometry::extensions.geography, p.geometry::extensions.geography, radius_metres))
      and (r.effective_from is null or r.effective_from <= at_time)
      and (r.effective_until is null or r.effective_until > at_time)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'category', c.category, 'subCategory', c.sub_category,
    'legalStatus', c.legal_status, 'riskLevel', c.risk_level, 'effectiveFrom', c.effective_from,
    'effectiveUntil', c.effective_until, 'verticalLimits', c.vertical_limits,
    'displayPriority', c.display_priority, 'recordType', c.record_type,
    'inside', extensions.ST_Intersects(c.geometry, p.geometry),
    'distanceMetres', round(extensions.ST_Distance(c.geometry::extensions.geography, p.geometry::extensions.geography)::numeric, 1)
  ) order by c.display_priority desc), '[]'::jsonb)
  from canonical c, point p;
$$;

create or replace function public.airspace_vector_tile(
  tile_z integer,
  tile_x integer,
  tile_y integer,
  categories text[] default null
) returns bytea
language sql stable security invoker
set search_path = ''
as $$
  with bounds as (
    select extensions.ST_TileEnvelope(tile_z, tile_x, tile_y) as geometry
  ), features as (
    select id::text, name, category, sub_category, legal_status, risk_level,
      display_priority, colour, icon,
      extensions.ST_AsMVTGeom(extensions.ST_Transform(r.geometry, 3857), bounds.geometry, 4096, 64, true) as geometry
    from public.airspace_restrictions r, bounds
    where extensions.ST_Transform(r.geometry, 3857) operator(extensions.&&) bounds.geometry
      and (categories is null or category = any(categories) or sub_category = any(categories))
      and (effective_from is null or effective_from <= now())
      and (effective_until is null or effective_until > now())
  )
  select extensions.ST_AsMVT(features, 'airspace', 4096, 'geometry') from features;
$$;

revoke execute on function public.query_airspace_bbox(double precision, double precision, double precision, double precision, timestamptz, text[]) from public, anon;
revoke execute on function public.query_airspace_point(double precision, double precision, double precision, timestamptz) from public, anon;
revoke execute on function public.airspace_vector_tile(integer, integer, integer, text[]) from public, anon;
grant execute on function public.query_airspace_bbox(double precision, double precision, double precision, double precision, timestamptz, text[]) to authenticated;
grant execute on function public.query_airspace_point(double precision, double precision, double precision, timestamptz) to authenticated;
grant execute on function public.airspace_vector_tile(integer, integer, integer, text[]) to authenticated;
