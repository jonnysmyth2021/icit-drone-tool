revoke execute on function public.query_airspace_bbox(double precision, double precision, double precision, double precision, timestamptz, text[]) from public, anon;
revoke execute on function public.query_airspace_point(double precision, double precision, double precision, timestamptz) from public, anon;
revoke execute on function public.airspace_vector_tile(integer, integer, integer, text[]) from public, anon;

grant execute on function public.query_airspace_bbox(double precision, double precision, double precision, double precision, timestamptz, text[]) to authenticated;
grant execute on function public.query_airspace_point(double precision, double precision, double precision, timestamptz) to authenticated;
grant execute on function public.airspace_vector_tile(integer, integer, integer, text[]) to authenticated;
