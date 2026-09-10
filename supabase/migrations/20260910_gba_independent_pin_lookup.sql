-- Check the historical city ward map and the current GBA ward map
-- independently. A current GBA ward must not be rejected merely because the
-- point falls outside the former 243-ward BBMP boundary.

CREATE OR REPLACE FUNCTION pin_lookup(lat DOUBLE PRECISION, lng DOUBLE PRECISION)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  ward_row record;
  gba_row record;
  legacy_found boolean := false;
  gba_found boolean := false;
  lookup_point geometry := ST_SetSRID(ST_MakePoint(lng, lat), 4326);
BEGIN
  SELECT
    w.city_id, w.ward_no, w.ward_name, w.zone, w.assembly_constituency
  INTO ward_row
  FROM wards w
  WHERE ST_Covers(w.geom, lookup_point)
  ORDER BY ST_Area(w.geom) ASC
  LIMIT 1;
  legacy_found := FOUND;

  SELECT
    g.gba_ward_no, g.gba_ward_name, g.gba_ward_name_kn,
    g.gba_corporation, g.gba_corporation_id, g.gba_ac, g.gba_ac_no,
    g.gba_zone, g.gba_zone_name, g.gba_population
  INTO gba_row
  FROM gba_wards g
  WHERE ST_Covers(g.geom, lookup_point)
  ORDER BY ST_Area(g.geom) ASC
  LIMIT 1;
  gba_found := FOUND;

  IF NOT legacy_found AND NOT gba_found THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF legacy_found THEN
    result := jsonb_build_object(
      'found', true,
      'city_id', ward_row.city_id,
      'ward_no', ward_row.ward_no,
      'ward_name', ward_row.ward_name,
      'zone', ward_row.zone,
      'assembly_constituency', ward_row.assembly_constituency
    );
  ELSE
    -- Keep the historical identity empty. Callers use this as an honest signal
    -- that legacy ward-keyed datasets cannot be joined at this location.
    result := jsonb_build_object(
      'found', true,
      'city_id', 'bengaluru',
      'ward_no', NULL,
      'ward_name', NULL,
      'zone', NULL,
      'assembly_constituency', NULL
    );
  END IF;

  IF gba_found THEN
    result := result || jsonb_build_object(
      'gba_ward_no', gba_row.gba_ward_no,
      'gba_ward_name', gba_row.gba_ward_name,
      'gba_ward_name_kn', gba_row.gba_ward_name_kn,
      'gba_corporation', gba_row.gba_corporation,
      'gba_corporation_id', gba_row.gba_corporation_id,
      'gba_ac', gba_row.gba_ac,
      'gba_ac_no', gba_row.gba_ac_no,
      'gba_zone', gba_row.gba_zone,
      'gba_zone_name', gba_row.gba_zone_name,
      'gba_population', gba_row.gba_population
    );
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION pin_lookup(DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated, service_role;
