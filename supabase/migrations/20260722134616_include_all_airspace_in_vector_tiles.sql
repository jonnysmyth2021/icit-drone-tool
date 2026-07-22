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
  ), canonical as (
    select id, name, category, sub_category, legal_status, risk_level,
      display_priority, colour, icon, geometry, 'permanent'::text as record_type
    from public.airspace_restrictions
    where (effective_from is null or effective_from <= now())
      and (effective_until is null or effective_until > now())
      and (categories is null or category = any(categories) or sub_category = any(categories))
    union all
    select id, name, category, sub_category, legal_status, risk_level,
      display_priority, colour, icon, geometry, 'temporary'::text
    from public.temporary_restrictions
    where effective_from <= now() and effective_until > now()
      and (categories is null or category = any(categories) or sub_category = any(categories))
    union all
    select id, name, category, sub_category, legal_status, risk_level,
      display_priority, colour, icon, geometry, 'infrastructure'::text
    from public.critical_infrastructure
    where (effective_from is null or effective_from <= now())
      and (effective_until is null or effective_until > now())
      and (categories is null or category = any(categories) or sub_category = any(categories))
  ), projected as (
    select c.*, extensions.ST_Transform(c.geometry, 3857) as projected_geometry
    from canonical c, bounds b
    where extensions.ST_Transform(c.geometry, 3857) operator(extensions.&&) b.geometry
  ), features as (
    select id::text, name, category, sub_category, legal_status, risk_level,
      display_priority, colour, icon, record_type,
      extensions.ST_AsMVTGeom(
        case
          when tile_z < 7 then extensions.ST_SimplifyPreserveTopology(projected_geometry, 500)
          when tile_z < 10 then extensions.ST_SimplifyPreserveTopology(projected_geometry, 100)
          else projected_geometry
        end,
        b.geometry, 4096, 64, true
      ) as geometry
    from projected, bounds b
  )
  select coalesce(extensions.ST_AsMVT(features, 'airspace', 4096, 'geometry'), ''::bytea)
  from features;
$$;

revoke execute on function public.airspace_vector_tile(integer, integer, integer, text[]) from public, anon;
grant execute on function public.airspace_vector_tile(integer, integer, integer, text[]) to authenticated;
