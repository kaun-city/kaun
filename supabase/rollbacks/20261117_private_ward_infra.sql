-- Rehearsal rollback for the reviewed baseline only. Run as one transaction
-- after checking hosted definitions, grants, comments and dependencies.
SET LOCAL lock_timeout = '5s';
DROP VIEW public.ward_bus_stops;
DROP VIEW public.ward_infra_stats;
ALTER MATERIALIZED VIEW kaun_private.ward_infra_stats SET SCHEMA public;
REVOKE ALL ON public.ward_infra_stats FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON public.ward_infra_stats TO anon, authenticated, service_role;
CREATE VIEW public.ward_bus_stops WITH (security_invoker = true) AS
SELECT ward_no, bus_stop_count::integer AS stop_count, daily_trips AS total_trips
FROM public.ward_infra_stats WHERE bus_stop_count > 0;
ALTER VIEW public.ward_bus_stops OWNER TO postgres;
REVOKE ALL ON public.ward_bus_stops FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ward_bus_stops TO anon, authenticated, service_role;
COMMENT ON VIEW public.ward_bus_stops IS
  'Physical BMTC stops and their summed daily trips for each DataMeet-243 ward with at least one stop: ward_infra_stats.bus_stop_count and daily_trips. Refresh with public.refresh_ward_infra_stats().';
CREATE OR REPLACE FUNCTION public.refresh_ward_infra_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $refresh$
BEGIN
  REFRESH MATERIALIZED VIEW public.ward_infra_stats;
END
$refresh$;
REVOKE ALL ON FUNCTION public.refresh_ward_infra_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_ward_infra_stats() TO service_role;
DROP SCHEMA kaun_private;
NOTIFY pgrst, 'reload schema';
