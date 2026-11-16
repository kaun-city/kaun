-- Run as one transaction. Moving the existing object preserves its data, index,
-- owner and OID. The private schema must not be exposed by PostgREST.
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF to_regnamespace('kaun_private') IS NOT NULL THEN
    RAISE EXCEPTION 'kaun_private already exists; inspect before migration';
  END IF;
  IF (SELECT relkind FROM pg_catalog.pg_class WHERE oid = to_regclass('public.ward_infra_stats')) IS DISTINCT FROM 'm'
     OR (SELECT relkind FROM pg_catalog.pg_class WHERE oid = to_regclass('public.ward_bus_stops')) IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION 'Unexpected ward infra or bus view shape';
  END IF;
  IF (SELECT array_agg(attname::text || ':' || format_type(atttypid, atttypmod) ORDER BY attnum)
      FROM pg_catalog.pg_attribute WHERE attrelid = 'public.ward_infra_stats'::regclass
        AND attnum > 0 AND NOT attisdropped) IS DISTINCT FROM
       ARRAY['ward_no:integer','ward_name:text','signal_count:bigint','bus_stop_count:bigint','daily_trips:bigint'] THEN
    RAISE EXCEPTION 'Unexpected ward infra columns';
  END IF;
  IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='public.ward_infra_stats'::regclass) <> 'postgres'
     OR (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('public.refresh_ward_infra_stats()')) IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'Unexpected owner for infra view or refresh function';
  END IF;
END
$guard$;

CREATE SCHEMA kaun_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA kaun_private FROM PUBLIC;
GRANT USAGE ON SCHEMA kaun_private TO anon, authenticated, service_role;
ALTER MATERIALIZED VIEW public.ward_infra_stats SET SCHEMA kaun_private;
REVOKE ALL ON kaun_private.ward_infra_stats FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON kaun_private.ward_infra_stats TO anon, authenticated, service_role;

CREATE VIEW public.ward_infra_stats WITH (security_invoker = true) AS
SELECT ward_no, ward_name, signal_count, bus_stop_count, daily_trips
FROM kaun_private.ward_infra_stats;
ALTER VIEW public.ward_infra_stats OWNER TO postgres;
REVOKE ALL ON public.ward_infra_stats FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ward_infra_stats TO anon, authenticated, service_role;

-- A schema move keeps the old OID. Rebind this view to the new public wrapper.
CREATE OR REPLACE VIEW public.ward_bus_stops WITH (security_invoker = true) AS
SELECT ward_no, bus_stop_count::integer AS stop_count, daily_trips AS total_trips
FROM public.ward_infra_stats WHERE bus_stop_count > 0;

CREATE OR REPLACE FUNCTION public.refresh_ward_infra_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $refresh$
BEGIN
  REFRESH MATERIALIZED VIEW kaun_private.ward_infra_stats;
END
$refresh$;
REVOKE ALL ON FUNCTION public.refresh_ward_infra_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_ward_infra_stats() TO service_role;
NOTIFY pgrst, 'reload schema';
