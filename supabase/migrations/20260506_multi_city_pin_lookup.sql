-- ============================================================================
-- Migration: 20260506 — Multi-city pin_lookup
--
-- Make pin_lookup return city_id from the matched ward row so the frontend
-- knows which city's CityConfig to apply. Existing Bengaluru behaviour is
-- preserved — the only change is that the response is correctly attributed
-- when the pin lands in Visakhapatnam (or any future city).
--
-- Run in Supabase SQL Editor → New query → paste → run.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- Step 1: ensure wards has composite PK (city_id, ward_no)
-- Earlier deployments may have a single-column PK on ward_no, which prevented
-- registering a Vizag ward 1 alongside Bengaluru ward 1. Drop the old PK and
-- replace with composite if needed.
DO $$
DECLARE
  pk_name text;
  pk_cols text;
BEGIN
  SELECT con.conname,
         pg_get_constraintdef(con.oid)
    INTO pk_name, pk_cols
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'wards' AND con.contype = 'p';

  IF pk_name IS NULL THEN
    -- No PK at all: add composite
    ALTER TABLE wards ADD CONSTRAINT wards_pkey PRIMARY KEY (city_id, ward_no);
  ELSIF pk_cols NOT LIKE '%city_id%' THEN
    -- PK exists but is single-column on ward_no: replace it
    EXECUTE format('ALTER TABLE wards DROP CONSTRAINT %I', pk_name);
    ALTER TABLE wards ADD CONSTRAINT wards_pkey PRIMARY KEY (city_id, ward_no);
  END IF;
END $$;

-- Step 2: ensure city_id index for fast filtering
CREATE INDEX IF NOT EXISTS wards_city_id_idx ON wards (city_id);

-- Step 3: rewrite pin_lookup to return city_id and only the columns we know
-- exist. GBA-specific fields are returned for Bengaluru rows; for other
-- cities the GBA fields are NULL (the frontend already handles this).
CREATE OR REPLACE FUNCTION pin_lookup(lat DOUBLE PRECISION, lng DOUBLE PRECISION)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  ward_row record;
BEGIN
  -- Find the ward whose geometry contains the point. Return the smallest
  -- matching ward in case of overlapping boundaries (defensive — shouldn't
  -- happen with proper data).
  SELECT
    w.city_id, w.ward_no, w.ward_name, w.zone, w.assembly_constituency
  INTO ward_row
  FROM wards w
  WHERE ST_Contains(w.geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  ORDER BY ST_Area(w.geom) ASC
  LIMIT 1;

  IF ward_row IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Build the base response
  result := jsonb_build_object(
    'found', true,
    'city_id', ward_row.city_id,
    'ward_no', ward_row.ward_no,
    'ward_name', ward_row.ward_name,
    'zone', ward_row.zone,
    'assembly_constituency', ward_row.assembly_constituency
  );

  -- Bengaluru-specific GBA enrichment: if the city is Bengaluru and a
  -- gba_wards table exists, look up the GBA fields. Wrap in BEGIN/EXCEPTION
  -- so missing tables don't break the lookup.
  IF ward_row.city_id = 'bengaluru' THEN
    BEGIN
      result := result || (
        SELECT jsonb_build_object(
          'gba_ward_no', g.gba_ward_no,
          'gba_ward_name', g.gba_ward_name,
          'gba_ward_name_kn', g.gba_ward_name_kn,
          'gba_corporation', g.gba_corporation,
          'gba_corporation_id', g.gba_corporation_id,
          'gba_ac', g.gba_ac,
          'gba_ac_no', g.gba_ac_no,
          'gba_zone', g.gba_zone,
          'gba_zone_name', g.gba_zone_name,
          'gba_population', g.gba_population
        )
        FROM gba_wards g
        WHERE ST_Contains(g.geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
        LIMIT 1
      );
    EXCEPTION WHEN OTHERS THEN
      -- gba_wards table missing or shape changed: skip enrichment
      NULL;
    END;
  END IF;

  RETURN result;
END;
$$;

-- Step 4: keep backwards-compat for any callers expecting individual columns
-- (We don't have any, but Supabase clients sometimes do auto-introspection.)

GRANT EXECUTE ON FUNCTION pin_lookup(DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated, service_role;
