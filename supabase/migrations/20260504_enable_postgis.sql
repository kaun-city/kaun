-- The hosted Kaun database stores ward and boundary polygons with PostGIS.
-- `supabase db dump --schema public` references these public types but does
-- not emit CREATE EXTENSION, so a fresh local database must enable PostGIS
-- before the schema baseline is applied.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
