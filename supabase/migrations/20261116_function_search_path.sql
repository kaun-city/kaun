-- The reviewed application functions use public tables and, for spatial
-- lookups, PostGIS objects in public or extensions. pg_temp must be last so a caller's
-- temporary relations cannot shadow those tables. See docs/function-search-path.md
-- for the required hosted-schema and privilege checks before applying.
-- ALTER preserves function bodies, owners, grants, and other attributes.
ALTER FUNCTION public.ac_sakala_performance(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.budget_summary(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.gba_pin_lookup(double precision, double precision) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.increment_fact_counter(integer, text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.lookup_local_offices(double precision, double precision) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.pin_lookup(double precision, double precision) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.police_station_phone(text, text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.property_tax_by_ac(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.recent_activity(integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.top_pin_drop_wards(integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.ward_profile(integer, text, text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.ward_stats_by_ac(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.ward_tenders(integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.ward_unknowns(integer, text) SET search_path = pg_catalog, public, extensions, pg_temp;
