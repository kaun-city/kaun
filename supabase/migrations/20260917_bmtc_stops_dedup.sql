-- One row per physical BMTC stop, and ward_infra_stats without multiplied bus figures.
--
-- Why
-- ---
-- public.bmtc_stops was a one-off load of the opencity.in package
-- c4d9efee-e13b-4fe9-b5db-ce034a153e55 ("BMTC Bus Stops and Routes Map by
-- Ward"). Its 28 per-constituency CSVs list one row per (polling booth, nearby
-- stop) pair, so a stop near N booths was loaded N times. On top of that the
-- Mahalakshmi Layout file was loaded twice, 900 Jayanagar rows were loaded
-- twice, and the first 300 rows of the all-stops CSV were loaded with their
-- file title as the constituency. Checked with anon reads on 2026-09-16:
-- 42,529 rows for 2,972 physical stops (city_id, stop_name, lat, lng). Inside a
-- physical stop, stop_name, trips and routes never differ; only boothcode and
-- the constituency label do.
--
-- ward_infra_stats joined ward_boundaries to traffic_signals AND bmtc_stops in
-- one FROM. count(DISTINCT bs.id) therefore counted duplicate rows (37,818
-- "stops") and sum(bs.trips) multiplied each stop's trips by its duplicates and
-- by the ward's signal count (207,824,182 daily trips against a true 858,416).
--
-- What
-- ----
-- 1. public.bmtc_stop_booths keeps every distinct (stop, booth) pair before any
--    row is deleted, so no booth association is lost.
-- 2. The row with the lowest id survives for each physical stop. Its boothcode
--    becomes NULL (booths live in bmtc_stop_booths) and its constituency is
--    kept only when every linked booth is in the same one; otherwise NULL.
-- 3. A unique index on the physical key keeps duplicates out.
-- 4. ward_infra_stats aggregates signals and stops in independent subqueries.
-- 5. public.refresh_ward_infra_stats() lets the service role refresh it.
-- 6. Assertions raise, and so roll back the whole file, if the result is wrong.
--
-- Transactions and replay
-- -----------------------
-- The Supabase CLI applies a migration file as one implicit transaction, so a
-- failed assertion undoes every statement. There is deliberately no
-- BEGIN/COMMIT: scripts/bmtc/dedup-bmtc-stops.mjs --rehearse wraps this file in
-- a transaction it always rolls back, and scripts/local-db/seed-local.mjs
-- replays it inside the seed-load transaction (see docs/bmtc-stops.md). The
-- constituency temp table is ON COMMIT DROP and the checks that read it run
-- before any change, so running the file statement-by-statement in autocommit
-- fails before it touches anything instead of half-applying.
--
-- Every step is a no-op on rows that are already one per stop.

-- Checks ----------------------------------------------------------------------

-- Constituency names as opencity titles its CSVs, which is also how the legacy
-- rows spell them. A booth code's digits 3-5 are its constituency: that holds
-- for every production row that carries an ac_number.
CREATE TEMP TABLE bmtc_dedup_ac_names (ac_number, name) ON COMMIT DROP AS
VALUES
  (150, 'Yelahanka'),
  (151, 'Krishnarajapuram'),
  (152, 'Byatarayanapura'),
  (153, 'Yeshwantpur'),
  (154, 'Rajarajeshwarinagar'),
  (155, 'Dasarahalli'),
  (156, 'Mahalakshmi Layout'),
  (157, 'Malleshwaram'),
  (158, 'Hebbal'),
  (159, 'Pulakeshinagar'),
  (160, 'Sarvagnanagar'),
  (161, 'C.V. Raaman Nagar'),
  (162, 'Shivajinagar'),
  (163, 'Shanti Nagar'),
  (164, 'Gandhi Nagar'),
  (165, 'Rajaji Nagar'),
  (166, 'Govindaraj Nagar'),
  (167, 'Vijay Nagar'),
  (168, 'Chamrajpet'),
  (169, 'Chikpet'),
  (170, 'Basavanagudi'),
  (171, 'Padmanabhanagar'),
  (172, 'BTM Layout'),
  (173, 'Jayanagar'),
  (174, 'Mahadevapura'),
  (175, 'Bommanahalli'),
  (176, 'Bangalore South'),
  (177, 'Anekal');

-- Refuse to collapse anything this migration would have to guess about.
DO $bmtc_precheck$
DECLARE
  problem text;
BEGIN
  -- A physical stop that disagrees with itself would silently lose a value.
  SELECT format('%L at (%s, %s) has %s distinct trips and %s distinct routes values',
                stop_name, lat, lng, trips_values, routes_values)
    INTO problem
  FROM (
    SELECT stop_name, lat, lng,
           count(DISTINCT coalesce(trips::text, '<null>')) AS trips_values,
           count(DISTINCT coalesce(routes, '<null>')) AS routes_values
    FROM public.bmtc_stops
    GROUP BY city_id, stop_name, lat, lng
    HAVING count(*) > 1
  ) stop_groups
  WHERE trips_values > 1 OR routes_values > 1
  LIMIT 1;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'bmtc_stops dedup: %; resolve it before collapsing', problem;
  END IF;

  -- Every label must be the pinned name for its booth's constituency, or one
  -- of the two file titles the one-off load used in place of a constituency.
  -- The Mahalakshmi Layout title must only carry AC 156 booths.
  SELECT format('row %s: boothcode %L, assembly_constituency %L, ac_number %s',
                s.id, s.boothcode, s.assembly_constituency, coalesce(s.ac_number::text, 'NULL'))
    INTO problem
  FROM public.bmtc_stops s
  LEFT JOIN pg_temp.bmtc_dedup_ac_names n
    ON n.ac_number = CASE WHEN s.boothcode ~ '^29[0-9]{6}$' THEN substr(s.boothcode, 3, 3)::integer END
  WHERE s.boothcode IS NOT NULL
    AND (
      n.ac_number IS NULL
      OR (s.ac_number IS NOT NULL
          AND (s.ac_number <> n.ac_number OR s.assembly_constituency IS DISTINCT FROM n.name))
      OR (s.ac_number IS NULL
          AND coalesce(s.assembly_constituency, '') NOT IN (
            'Mahalakshmi Layout - AC - Stops with Number of Trips',
            'BMTC Stops with Location and Routes'))
      OR (s.assembly_constituency = 'Mahalakshmi Layout - AC - Stops with Number of Trips'
          AND n.ac_number <> 156)
    )
  LIMIT 1;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'bmtc_stops dedup: unexpected constituency label, %', problem;
  END IF;
END
$bmtc_precheck$;

-- Booth links ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bmtc_stop_booths (
  stop_id integer NOT NULL REFERENCES public.bmtc_stops (id) ON DELETE CASCADE,
  boothcode text NOT NULL,
  ac_number integer NOT NULL,
  assembly_constituency text NOT NULL,
  PRIMARY KEY (stop_id, boothcode)
);

ALTER TABLE public.bmtc_stop_booths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bmtc_stop_booths_public_read ON public.bmtc_stop_booths;
CREATE POLICY bmtc_stop_booths_public_read ON public.bmtc_stop_booths
  FOR SELECT USING (true);

-- Public read like bmtc_stops; only the service role writes.
REVOKE ALL ON public.bmtc_stop_booths FROM anon, authenticated;
GRANT SELECT ON public.bmtc_stop_booths TO anon, authenticated;
GRANT ALL ON public.bmtc_stop_booths TO service_role;

COMMENT ON TABLE public.bmtc_stop_booths IS
  'Polling booths each BMTC stop is listed against in the opencity.in per-constituency CSVs (package c4d9efee-e13b-4fe9-b5db-ce034a153e55). One row per distinct (stop, booth).';
COMMENT ON COLUMN public.bmtc_stop_booths.boothcode IS
  'Election booth code: 29 (Karnataka), then the 3-digit assembly constituency number, then the 3-digit part number.';
COMMENT ON COLUMN public.bmtc_stop_booths.ac_number IS
  'Assembly constituency of the booth, read from digits 3-5 of boothcode.';

-- Preserve every distinct (physical stop, booth) pair on the row that survives.
INSERT INTO public.bmtc_stop_booths (stop_id, boothcode, ac_number, assembly_constituency)
SELECT DISTINCT ON (s.keep_id, s.boothcode)
       s.keep_id, s.boothcode, n.ac_number, n.name
FROM (
  SELECT min(id) OVER (PARTITION BY city_id, stop_name, lat, lng) AS keep_id, boothcode
  FROM public.bmtc_stops
) s
JOIN pg_temp.bmtc_dedup_ac_names n
  ON n.ac_number = CASE WHEN s.boothcode ~ '^29[0-9]{6}$' THEN substr(s.boothcode, 3, 3)::integer END
WHERE s.boothcode IS NOT NULL
ORDER BY s.keep_id, s.boothcode
ON CONFLICT (stop_id, boothcode) DO NOTHING;

-- Surviving rows: booths now live in bmtc_stop_booths, and a constituency is
-- only stated when all of the stop's booths agree on it. Only survivors have
-- links, and only rows not yet collapsed still carry a boothcode.
UPDATE public.bmtc_stops s
SET boothcode = NULL,
    ac_number = links.ac_number,
    assembly_constituency = links.assembly_constituency
FROM (
  SELECT stop_id,
         CASE WHEN count(DISTINCT ac_number) = 1 THEN min(ac_number) END AS ac_number,
         CASE WHEN count(DISTINCT ac_number) = 1 THEN min(assembly_constituency) END AS assembly_constituency
  FROM public.bmtc_stop_booths
  GROUP BY stop_id
) links
WHERE s.id = links.stop_id
  AND s.boothcode IS NOT NULL;

-- Delete the duplicate rows. The count feeds the final assertions.
WITH removed AS (
  DELETE FROM public.bmtc_stops s
  USING (
    SELECT id, min(id) OVER (PARTITION BY city_id, stop_name, lat, lng) AS keep_id
    FROM public.bmtc_stops
  ) d
  WHERE s.id = d.id
    AND d.id <> d.keep_id
  RETURNING s.id
)
SELECT set_config('kaun.bmtc_stops_dedup_removed', count(*)::text, true)
FROM removed;

CREATE UNIQUE INDEX IF NOT EXISTS bmtc_stops_physical_key
  ON public.bmtc_stops (city_id, stop_name, lat, lng);

COMMENT ON TABLE public.bmtc_stops IS
  'One row per physical BMTC stop (city_id, stop_name, lat, lng) from opencity.in package c4d9efee-e13b-4fe9-b5db-ce034a153e55. Nearby polling booths are in bmtc_stop_booths.';
COMMENT ON COLUMN public.bmtc_stops.boothcode IS
  'Always NULL since migration 20260917: a stop is listed against many booths, which are in bmtc_stop_booths. Kept so the public API shape does not change.';
COMMENT ON COLUMN public.bmtc_stops.assembly_constituency IS
  'Constituency shared by every booth in bmtc_stop_booths for this stop; NULL when those booths span more than one constituency. Not a point-in-constituency lookup.';
COMMENT ON COLUMN public.bmtc_stops.ac_number IS
  'Number of assembly_constituency; NULL under the same rule.';
COMMENT ON COLUMN public.bmtc_stops.trips IS
  'Daily trips through the stop as published; NULL where the source leaves it blank.';

-- ward_infra_stats ------------------------------------------------------------

-- Nothing else in the public schema depends on this view (checked against the
-- 20260505 baseline); DROP without CASCADE fails loudly if that changes.
DROP MATERIALIZED VIEW IF EXISTS public.ward_infra_stats;

-- Signals and stops are counted in separate per-ward subqueries, so neither
-- multiplies the other. Stop rows are physical stops (unique index above);
-- stops with NULL trips count as stops and add nothing to daily_trips, which
-- is how ward_bus_stops was built. Column names and types are unchanged.
CREATE MATERIALIZED VIEW public.ward_infra_stats AS
SELECT wb.ward_no,
       wb.ward_name,
       signals.signal_count,
       stops.bus_stop_count,
       stops.daily_trips
FROM public.ward_boundaries wb
CROSS JOIN LATERAL (
  SELECT count(*) AS signal_count
  FROM public.traffic_signals ts
  WHERE public.st_within(public.st_setsrid(public.st_makepoint(ts.lng, ts.lat), 4326), wb.geom)
) signals
CROSS JOIN LATERAL (
  SELECT count(*) AS bus_stop_count,
         coalesce(sum(bs.trips), 0)::bigint AS daily_trips
  FROM public.bmtc_stops bs
  WHERE public.st_within(public.st_setsrid(public.st_makepoint(bs.lng, bs.lat), 4326), wb.geom)
) stops
ORDER BY wb.ward_no
WITH NO DATA;

ALTER MATERIALIZED VIEW public.ward_infra_stats OWNER TO postgres;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ward_infra_stats_ward_no
  ON public.ward_infra_stats (ward_no);

-- The grants the 20260505 baseline gave the view.
GRANT ALL ON TABLE public.ward_infra_stats TO anon;
GRANT ALL ON TABLE public.ward_infra_stats TO authenticated;
GRANT ALL ON TABLE public.ward_infra_stats TO service_role;

COMMENT ON MATERIALIZED VIEW public.ward_infra_stats IS
  'Per-ward traffic signals, physical BMTC stops and their summed daily trips (DataMeet-243 ward_boundaries). Refresh with public.refresh_ward_infra_stats().';

-- Populated here rather than left WITH NO DATA as in the baseline, so a fresh
-- local replay and production both end with a readable view.
REFRESH MATERIALIZED VIEW public.ward_infra_stats;

-- Loaders that change bmtc_stops or traffic_signals refresh through this; the
-- view is owned by postgres, so the service role cannot refresh it directly.
CREATE OR REPLACE FUNCTION public.refresh_ward_infra_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $refresh$
BEGIN
  REFRESH MATERIALIZED VIEW public.ward_infra_stats;
END
$refresh$;

REVOKE ALL ON FUNCTION public.refresh_ward_infra_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_ward_infra_stats() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_ward_infra_stats() TO service_role;

-- Assertions ----------------------------------------------------------------

DO $bmtc_verify$
DECLARE
  stop_rows bigint;
  physical_stops bigint;
  removed text := current_setting('kaun.bmtc_stops_dedup_removed', true);
  problem text;
BEGIN
  SELECT count(*), count(DISTINCT (city_id, stop_name, lat, lng))
    INTO stop_rows, physical_stops
  FROM public.bmtc_stops;

  IF stop_rows = 0 THEN
    RAISE NOTICE 'bmtc_stops is empty (fresh local replay); nothing to verify';
    RETURN;
  END IF;

  IF stop_rows <> physical_stops THEN
    RAISE EXCEPTION 'bmtc_stops dedup: % rows for % physical stops', stop_rows, physical_stops;
  END IF;

  IF EXISTS (SELECT 1 FROM public.bmtc_stops WHERE boothcode IS NOT NULL) THEN
    RAISE EXCEPTION 'bmtc_stops dedup: boothcode is still set on some rows';
  END IF;

  -- Only a run that actually collapsed rows is checked against ward_bus_stops.
  -- A replay over already-collapsed data (a local seed synced after production
  -- migrated) skips it, so later reloads of bmtc_stops are not tied forever to
  -- that static table. Anything other than an explicit '0' runs the check.
  IF removed = '0' THEN
    RAISE NOTICE 'bmtc_stops was already one row per stop; ward_bus_stops cross-check skipped';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bmtc_stops s
    WHERE NOT EXISTS (SELECT 1 FROM public.bmtc_stop_booths l WHERE l.stop_id = s.id)
  ) THEN
    RAISE EXCEPTION 'bmtc_stops dedup: a stop was left without any booth link';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ward_bus_stops) THEN
    RAISE EXCEPTION 'bmtc_stops dedup: ward_bus_stops is empty, so the collapse cannot be verified';
  END IF;

  SELECT string_agg(
           format('ward %s: view %s stops / %s trips, ward_bus_stops %s / %s',
                  b.ward_no, coalesce(w.bus_stop_count::text, 'missing'), coalesce(w.daily_trips::text, 'missing'),
                  coalesce(b.stop_count::text, 'NULL'), coalesce(b.total_trips::text, 'NULL')),
           '; ' ORDER BY b.ward_no)
    INTO problem
  FROM public.ward_bus_stops b
  LEFT JOIN public.ward_infra_stats w ON w.ward_no = b.ward_no
  WHERE w.ward_no IS NULL
     OR w.bus_stop_count IS DISTINCT FROM b.stop_count::bigint
     OR w.daily_trips IS DISTINCT FROM b.total_trips;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'ward_infra_stats disagrees with ward_bus_stops: %', left(problem, 2000);
  END IF;

  SELECT string_agg(format('ward %s: %s stops / %s trips', w.ward_no, w.bus_stop_count, w.daily_trips),
                    '; ' ORDER BY w.ward_no)
    INTO problem
  FROM public.ward_infra_stats w
  WHERE NOT EXISTS (SELECT 1 FROM public.ward_bus_stops b WHERE b.ward_no = w.ward_no)
    AND (w.bus_stop_count <> 0 OR w.daily_trips <> 0);
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'ward_infra_stats has stops in wards ward_bus_stops has none for: %', left(problem, 2000);
  END IF;
END
$bmtc_verify$;

NOTIFY pgrst, 'reload schema';
