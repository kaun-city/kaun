


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."ac_sakala_performance"("ac_name" "text") RETURNS TABLE("assembly_name" "text", "year" integer, "department_code" "text", "receipts" integer, "intime_pct" double precision, "delayed_pct" double precision, "pending" integer, "rank_intime" integer, "rank_receipts_per_lakh" integer, "rank_overall" integer)
    LANGUAGE "sql" STABLE
    AS $$ SELECT assembly_name, year, department_code, receipts, intime_pct, delayed_pct, pending, rank_intime, rank_receipts_per_lakh, rank_overall FROM sakala_performance WHERE city_id = 'bengaluru' AND assembly_name ILIKE ac_name ORDER BY year DESC, month DESC NULLS LAST; $$;


ALTER FUNCTION "public"."ac_sakala_performance"("ac_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."budget_summary"("p_financial_year" "text" DEFAULT '2025-26'::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$ DECLARE v_total NUMERIC; v_depts JSON; v_year TEXT; BEGIN SELECT DISTINCT financial_year INTO v_year FROM city_budget WHERE financial_year = p_financial_year LIMIT 1; IF v_year IS NULL THEN SELECT financial_year INTO v_year FROM city_budget ORDER BY financial_year DESC LIMIT 1; END IF; SELECT COALESCE(SUM(amount_lakh::NUMERIC), 0) INTO v_total FROM city_budget WHERE financial_year = v_year AND payment_receipt = 'Payments'; SELECT json_agg(row_to_json(d)) INTO v_depts FROM (SELECT department, COALESCE(work_description, department) AS description, SUM(amount_lakh::NUMERIC) AS amount_lakh, ROUND(SUM(amount_lakh::NUMERIC) / 100, 2) AS amount_cr, CASE WHEN v_total > 0 THEN ROUND(SUM(amount_lakh::NUMERIC) * 100 / v_total, 1) ELSE 0 END AS pct FROM city_budget WHERE financial_year = v_year AND payment_receipt = 'Payments' GROUP BY department, work_description ORDER BY SUM(amount_lakh::NUMERIC) DESC LIMIT 10) d; RETURN json_build_object('financial_year', v_year, 'budget_type', 'estimate', 'total_expenditure_lakh', v_total, 'departments', v_depts); END; $$;


ALTER FUNCTION "public"."budget_summary"("p_financial_year" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gba_pin_lookup"("lat" double precision, "lng" double precision) RETURNS TABLE("gba_corporation" "text", "gba_corporation_id" smallint, "gba_ward_no" smallint, "gba_ward_name" "text", "gba_ward_name_kn" "text", "gba_ac" "text", "gba_ac_no" smallint, "gba_zone" "text", "gba_zone_name" "text", "gba_population" integer, "bbmp_ward_no" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    g.corporation, g.corporation_id, g.ward_no, g.ward_name, g.ward_name_kn,
    g.ac, g.ac_no, g.zone, g.zone_name, g.population,
    w.ward_no::integer AS bbmp_ward_no
  FROM public.gba_wards g
  LEFT JOIN public.wards w
    ON ST_Contains(w.geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  WHERE ST_Contains(g.boundary, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  LIMIT 1;
$$;


ALTER FUNCTION "public"."gba_pin_lookup"("lat" double precision, "lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_fact_counter"("p_fact_id" integer, "p_column" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF p_column = 'corroboration_count' THEN
    UPDATE community_facts SET corroboration_count = corroboration_count + 1 WHERE id = p_fact_id;
  ELSIF p_column = 'dispute_count' THEN
    UPDATE community_facts SET dispute_count = dispute_count + 1 WHERE id = p_fact_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."increment_fact_counter"("p_fact_id" integer, "p_column" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_local_offices"("p_lat" double precision, "p_lng" double precision) RETURNS TABLE("boundary_type" "text", "name" "text", "phone" "text", "email" "text")
    LANGUAGE "sql" STABLE
    AS $_$
  SELECT b.boundary_type, b.name,
    CASE
      WHEN b.boundary_type = 'police_city' THEN
        (SELECT ps.phone FROM police_stations ps
         WHERE ps.station_type = 'city'
         AND LOWER(ps.station_name) LIKE LOWER('%' || REGEXP_REPLACE(b.name, '\s*(PS|Police Station)\s*$', '', 'i') || '%')
         LIMIT 1)
      WHEN b.boundary_type = 'police_traffic' THEN
        (SELECT ps.phone FROM police_stations ps
         WHERE ps.station_type = 'traffic'
         AND LOWER(ps.station_name) LIKE LOWER('%' || REGEXP_REPLACE(b.name, '\s*(PS|Traffic Police)\s*$', '', 'i') || '%')
         LIMIT 1)
      ELSE NULL
    END AS phone,
    CASE
      WHEN b.boundary_type = 'police_city' THEN
        (SELECT ps.email FROM police_stations ps
         WHERE ps.station_type = 'city'
         AND LOWER(ps.station_name) LIKE LOWER('%' || REGEXP_REPLACE(b.name, '\s*(PS|Police Station)\s*$', '', 'i') || '%')
         LIMIT 1)
      ELSE NULL
    END AS email
  FROM boundary_lookup b
  WHERE ST_Contains(b.geometry, ST_SetSRID(ST_Point(p_lng, p_lat), 4326))
  ORDER BY b.boundary_type;
$_$;


ALTER FUNCTION "public"."lookup_local_offices"("p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pin_lookup"("lat" double precision, "lng" double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."pin_lookup"("lat" double precision, "lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."police_station_phone"("p_name" "text", "p_type" "text" DEFAULT 'city'::"text") RETURNS TABLE("station_name" "text", "phone" "text", "email" "text")
    LANGUAGE "sql" STABLE
    AS $_$
  SELECT station_name, phone, email
  FROM police_stations
  WHERE station_type = p_type
    AND LOWER(station_name) LIKE LOWER('%' || REGEXP_REPLACE(p_name, '\s*(PS|Police Station)\s*$', '', 'i') || '%')
  LIMIT 1;
$_$;


ALTER FUNCTION "public"."police_station_phone"("p_name" "text", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."property_tax_by_ac"("p_assembly_constituency" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'assembly_constituency', p_assembly_constituency,
        'years', COALESCE(jsonb_agg(yr.obj), '[]'::jsonb)
    ) INTO result
    FROM (
        SELECT jsonb_build_object(
            'financial_year', pt.financial_year,
            'total_collection_lakh', ROUND(SUM(pt.total_collection_lakh)::numeric, 2),
            'total_applications', SUM(pt.num_applications),
            'ward_count', COUNT(DISTINCT pt.ward_no_old)
        ) as obj
        FROM property_tax pt
        JOIN ward_stats ws ON pt.ward_no_old = ws.ward_no_old
        WHERE ws.assembly_constituency = p_assembly_constituency
        GROUP BY pt.financial_year
        ORDER BY pt.financial_year DESC
    ) yr;

    RETURN COALESCE(result, jsonb_build_object('assembly_constituency', p_assembly_constituency, 'years', '[]'::jsonb));
END;
$$;


ALTER FUNCTION "public"."property_tax_by_ac"("p_assembly_constituency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recent_activity"("p_limit" integer DEFAULT 20) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(item) INTO result
    FROM (
        SELECT jsonb_build_object(
            'type', 'fact',
            'ward_no', cf.ward_no,
            'ward_name', w.ward_name,
            'category', cf.category,
            'subject', cf.subject,
            'field', cf.field,
            'value', cf.value,
            'corroborations', cf.corroboration_count,
            'created_at', cf.created_at,
            'trust_level', CASE
                WHEN cf.source_type = 'official' THEN 'official'
                WHEN cf.source_type = 'rti' THEN 'rti'
                WHEN cf.dispute_count > cf.corroboration_count AND cf.dispute_count >= 3 THEN 'disputed'
                WHEN cf.corroboration_count >= 5 THEN 'community_verified'
                ELSE 'unverified'
            END
        ) as item
        FROM community_facts cf
        LEFT JOIN wards w ON cf.ward_no = w.ward_no AND cf.city_id = w.city_id
        WHERE cf.is_active = true
        ORDER BY cf.created_at DESC
        LIMIT p_limit
    ) sub;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."recent_activity"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."top_pin_drop_wards"("p_days" integer DEFAULT 7) RETURNS TABLE("ward_name" "text", "count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT ward_name, COUNT(*) as count
  FROM analytics_events
  WHERE event = 'pin_drop'
    AND ward_name IS NOT NULL
    AND created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY ward_name
  ORDER BY count DESC
  LIMIT 10;
$$;


ALTER FUNCTION "public"."top_pin_drop_wards"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ward_profile"("p_ward_no" integer, "p_city_id" "text" DEFAULT 'bengaluru'::"text", "p_assembly_constituency" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
  reps jsonb;
  officers_json jsonb;
  tenders_json jsonb;
  community_json jsonb;
  tender_total numeric;
  tender_cnt integer;
  ls_constituency text;
  governance_alert_json jsonb;
BEGIN
  SELECT lok_sabha_constituency INTO ls_constituency
  FROM ac_to_ls WHERE assembly_constituency = p_assembly_constituency;

  -- Elected reps: MLA+MP by AC for Bengaluru; also fetch CORPORATOR by ward_no pattern for all cities
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'role', role, 'name', name, 'party', party,
      'constituency', constituency, 'elected_since', elected_since,
      'profile_url', profile_url, 'notes', notes,
      'criminal_cases', criminal_cases,
      'age', age,
      'profession', profession,
      'education', education,
      'data_source', data_source
    ) ORDER BY role, constituency
  ), '[]'::jsonb) INTO reps
  FROM elected_reps
  WHERE city_id = p_city_id
    AND (
      (role = 'MLA' AND constituency = p_assembly_constituency)
      OR (role = 'MP' AND constituency = ls_constituency)
      OR (role = 'CORPORATOR' AND constituency LIKE ('Ward ' || p_ward_no || ' %'))
    );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'role', role, 'name', name, 'department', department,
      'phone', phone, 'email', email, 'source', source
    )
  ), '[]'::jsonb) INTO officers_json
  FROM officers
  WHERE city_id = p_city_id AND ward_no = p_ward_no;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'kppp_id', kppp_id, 'title', title, 'department', department,
      'contractor_name', contractor_name, 'contractor_blacklisted', contractor_blacklisted,
      'value_lakh', value_lakh, 'status', status,
      'issued_date', issued_date, 'deadline', deadline, 'source_url', source_url
    ) ORDER BY issued_date DESC
  ), '[]'::jsonb) INTO tenders_json
  FROM tenders
  WHERE city_id = p_city_id AND (ward_no = p_ward_no OR ward_no IS NULL);

  SELECT COUNT(*), COALESCE(SUM(value_lakh), 0)
  INTO tender_cnt, tender_total
  FROM tenders
  WHERE city_id = p_city_id AND (ward_no = p_ward_no OR ward_no IS NULL);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'category', category, 'subject', subject, 'field', field,
      'value', value, 'source_type', source_type, 'source_url', source_url,
      'source_note', source_note, 'corroboration_count', corroboration_count,
      'dispute_count', dispute_count,
      'trust_level', CASE
        WHEN source_type = 'official' THEN 'official'
        WHEN source_type = 'rti' THEN 'rti'
        WHEN dispute_count > corroboration_count AND dispute_count >= 3 THEN 'disputed'
        WHEN corroboration_count >= 5 THEN 'community_verified'
        ELSE 'unverified'
      END,
      'created_at', created_at
    ) ORDER BY corroboration_count DESC
  ), '[]'::jsonb) INTO community_json
  FROM community_facts
  WHERE city_id = p_city_id AND ward_no = p_ward_no AND is_active = true;

  -- City-aware governance alert
  IF p_city_id = 'hyderabad' THEN
    governance_alert_json := jsonb_build_object(
      'title', 'GHMC under administrator rule',
      'body', 'Elected corporators'' term ended in Feb 2023. GHMC has been under a state-appointed administrator since then. The 2020 election results are shown as historical reference.',
      'level', 'warning'
    );
  ELSE
    governance_alert_json := jsonb_build_object(
      'title', 'No elected corporator',
      'body', 'BBMP was dissolved in 2020. The Greater Bengaluru Authority (GBA) is administered by a state-appointed administrator. No ward-level elections have been held since.',
      'level', 'warning'
    );
  END IF;

  result := jsonb_build_object(
    'ward_no', p_ward_no,
    'city_id', p_city_id,
    'assembly_constituency', p_assembly_constituency,
    'elected_reps', reps,
    'officers', officers_json,
    'tenders', tenders_json,
    'tender_count', tender_cnt,
    'tender_total_lakh', tender_total,
    'community_facts', community_json,
    'governance_alert', governance_alert_json
  );

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."ward_profile"("p_ward_no" integer, "p_city_id" "text", "p_assembly_constituency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ward_stats_by_ac"("p_assembly_constituency" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'assembly_constituency', p_assembly_constituency,
        'total_population', SUM(population_2011),
        'total_area_sqkm', ROUND(SUM(area_sqkm)::numeric, 2),
        'total_households', SUM(households_2011),
        'total_road_length_km', ROUND(SUM(road_length_km)::numeric, 2),
        'total_lakes', SUM(lakes_count),
        'total_parks', SUM(parks_count),
        'total_playgrounds', SUM(playgrounds_count),
        'total_govt_schools', SUM(govt_schools_count),
        'total_police_stations', SUM(police_stations_count),
        'total_fire_stations', SUM(fire_stations_count),
        'total_bus_stops', SUM(bus_stops_count),
        'total_bus_routes', SUM(COALESCE(bus_routes_count, 0)),
        'total_streetlights', SUM(streetlights_count),
        'avg_population_density', ROUND(AVG(population_density_2011)::numeric, 0),
        'ward_count', COUNT(*),
        'trees', SUM(trees),
        'namma_clinics', SUM(namma_clinics),
        'dwcc_count', SUM(dwcc_count),
        'data_year', 2011,
        'source', 'Census 2011 + BBMP / KGIS via opencity.in'
    ) INTO result
    FROM ward_stats
    WHERE assembly_constituency = p_assembly_constituency;

    RETURN COALESCE(result, '{}'::jsonb);
END;
$$;


ALTER FUNCTION "public"."ward_stats_by_ac"("p_assembly_constituency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ward_tenders"("ward_number" integer) RETURNS TABLE("id" integer, "kppp_id" "text", "title" "text", "department" "text", "value_lakh" double precision, "status" "text", "issued_date" "date", "deadline" "date", "source_url" "text")
    LANGUAGE "sql" STABLE
    AS $$ SELECT id, kppp_id, title, department, value_lakh, status, issued_date, deadline, source_url FROM tenders WHERE city_id = 'bengaluru' AND ward_no = ward_number ORDER BY issued_date DESC NULLS LAST; $$;


ALTER FUNCTION "public"."ward_tenders"("ward_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ward_unknowns"("p_ward_no" integer, "p_city_id" "text" DEFAULT 'bengaluru'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'ward_no', p_ward_no,
        'total_questions', (SELECT COUNT(*) FROM fact_templates),
        'answered', (
            SELECT COUNT(DISTINCT (ft.category, ft.subject, ft.field))
            FROM fact_templates ft
            JOIN community_facts cf ON cf.category = ft.category
              AND cf.subject = ft.subject AND cf.field = ft.field
            WHERE cf.ward_no = p_ward_no AND cf.city_id = p_city_id AND cf.is_active = true
        ),
        'unanswered', (
            SELECT jsonb_agg(jsonb_build_object(
                'category', ft.category,
                'subject', ft.subject,
                'field', ft.field,
                'prompt', ft.prompt,
                'icon', ft.icon,
                'priority', ft.priority
            ) ORDER BY ft.priority)
            FROM fact_templates ft
            WHERE NOT EXISTS (
                SELECT 1 FROM community_facts cf
                WHERE cf.category = ft.category
                  AND cf.subject = ft.subject
                  AND cf.field = ft.field
                  AND cf.ward_no = p_ward_no
                  AND cf.city_id = p_city_id
                  AND cf.is_active = true
            )
        )
    ) INTO result;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."ward_unknowns"("p_ward_no" integer, "p_city_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ac_to_ls" (
    "assembly_constituency" character varying(128) NOT NULL,
    "lok_sabha_constituency" character varying(128) NOT NULL
);


ALTER TABLE "public"."ac_to_ls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_events" (
    "id" bigint NOT NULL,
    "event" "text" NOT NULL,
    "ward_no" integer,
    "ward_name" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."analytics_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."analytics_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."analytics_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."analytics_events_id_seq" OWNED BY "public"."analytics_events"."id";



CREATE TABLE IF NOT EXISTS "public"."ask_kaun_logs" (
    "id" bigint NOT NULL,
    "ward_no" integer,
    "ward_name" "text",
    "question" "text" NOT NULL,
    "answer" "text",
    "asked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ask_kaun_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ask_kaun_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ask_kaun_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ask_kaun_logs_id_seq" OWNED BY "public"."ask_kaun_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."bbmp_work_orders" (
    "id" integer NOT NULL,
    "city_id" character varying(50) DEFAULT 'bengaluru'::character varying,
    "work_order_id" character varying(50),
    "ward_no" integer,
    "description" "text",
    "contractor" character varying(200),
    "sanctioned_amount" double precision,
    "net_paid" double precision,
    "deduction" double precision,
    "fy" character varying(10),
    "data_source" character varying(100) DEFAULT 'data.opencity.in'::character varying,
    "contractor_raw" "text",
    "contractor_name" "text",
    "contractor_phone" "text",
    "contractor_code" "text",
    "division" "text",
    "budget_head" "text",
    "start_date" "date",
    "end_date" "date",
    "order_ref" "text",
    "sbr_ref" "text",
    "bill_ref" "text",
    "payment_status" "text",
    "ifms_wbid" bigint,
    "source_ward_name" "text",
    "bbmp_ward_no" integer,
    "ward_class" "text"
);


ALTER TABLE "public"."bbmp_work_orders" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bbmp_work_orders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bbmp_work_orders_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bbmp_work_orders_id_seq" OWNED BY "public"."bbmp_work_orders"."id";



CREATE TABLE IF NOT EXISTS "public"."bmtc_stops" (
    "id" integer NOT NULL,
    "stop_name" "text" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "trips" integer,
    "boothcode" "text",
    "routes" "text",
    "assembly_constituency" "text",
    "ac_number" integer,
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL
);


ALTER TABLE "public"."bmtc_stops" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bmtc_stops_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bmtc_stops_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bmtc_stops_id_seq" OWNED BY "public"."bmtc_stops"."id";



CREATE TABLE IF NOT EXISTS "public"."boundary_lookup" (
    "id" integer NOT NULL,
    "boundary_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "geometry" "public"."geometry"(Geometry,4326) NOT NULL
);


ALTER TABLE "public"."boundary_lookup" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."boundary_lookup_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."boundary_lookup_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."boundary_lookup_id_seq" OWNED BY "public"."boundary_lookup"."id";



CREATE TABLE IF NOT EXISTS "public"."city_budget" (
    "id" integer NOT NULL,
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL,
    "financial_year" "text" NOT NULL,
    "payment_receipt" "text",
    "department" "text",
    "head" "text",
    "sub_head" "text",
    "work_description" "text",
    "amount_lakh" numeric(14,2),
    "budget_type" "text",
    "source" "text" DEFAULT 'opencity.in/BBMP Budget'::"text"
);


ALTER TABLE "public"."city_budget" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."city_budget_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."city_budget_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."city_budget_id_seq" OWNED BY "public"."city_budget"."id";



CREATE TABLE IF NOT EXISTS "public"."city_pulse_facts" (
    "id" integer NOT NULL,
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL,
    "category" "text" NOT NULL,
    "severity" "text" DEFAULT 'yellow'::"text" NOT NULL,
    "headline" "text" NOT NULL,
    "detail" "text",
    "source_name" "text",
    "source_url" "text",
    "published_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "is_active" boolean DEFAULT true,
    "is_editorial" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "dedup_key" "text"
);


ALTER TABLE "public"."city_pulse_facts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."city_pulse_facts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."city_pulse_facts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."city_pulse_facts_id_seq" OWNED BY "public"."city_pulse_facts"."id";



CREATE TABLE IF NOT EXISTS "public"."civic_signals" (
    "id" bigint NOT NULL,
    "source" "text" NOT NULL,
    "source_id" "text",
    "url" "text",
    "author" "text",
    "title" "text",
    "body" "text",
    "ward_no" integer,
    "ward_name" "text",
    "issue_type" "text",
    "upvotes" integer DEFAULT 0,
    "signal_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."civic_signals" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."civic_signals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."civic_signals_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."civic_signals_id_seq" OWNED BY "public"."civic_signals"."id";



CREATE TABLE IF NOT EXISTS "public"."community_facts" (
    "id" integer NOT NULL,
    "city_id" character varying(64) NOT NULL,
    "ward_no" integer,
    "category" character varying(64) NOT NULL,
    "subject" character varying(128) NOT NULL,
    "field" character varying(64) NOT NULL,
    "value" "text" NOT NULL,
    "source_type" character varying(32) DEFAULT 'community'::character varying NOT NULL,
    "source_url" character varying(512),
    "source_note" "text",
    "corroboration_count" integer DEFAULT 0 NOT NULL,
    "dispute_count" integer DEFAULT 0 NOT NULL,
    "contributor_token" character varying(128),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "last_corroborated_at" timestamp without time zone
);


ALTER TABLE "public"."community_facts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."community_facts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."community_facts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."community_facts_id_seq" OWNED BY "public"."community_facts"."id";



CREATE TABLE IF NOT EXISTS "public"."contractor_profiles" (
    "id" integer NOT NULL,
    "entity_id" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[],
    "phone" "text",
    "total_contracts" integer DEFAULT 0,
    "total_value_lakh" numeric DEFAULT 0,
    "total_paid_lakh" numeric DEFAULT 0,
    "total_deduction_lakh" numeric DEFAULT 0,
    "avg_deduction_pct" numeric DEFAULT 0,
    "ward_count" integer DEFAULT 0,
    "wards" integer[] DEFAULT '{}'::integer[],
    "first_seen" "text",
    "last_seen" "text",
    "is_govt_entity" boolean DEFAULT false,
    "blacklist_flags" "text"[] DEFAULT '{}'::"text"[],
    "city_id" "text" DEFAULT 'bengaluru'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contractor_profiles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contractor_profiles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contractor_profiles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contractor_profiles_id_seq" OWNED BY "public"."contractor_profiles"."id";



CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" integer NOT NULL,
    "city_id" character varying(64) NOT NULL,
    "short" character varying(32) NOT NULL,
    "name" character varying(256) NOT NULL,
    "alt_names" character varying(256),
    "category" character varying(64),
    "description" "text",
    "website" character varying(512),
    "complaint_url" character varying(512),
    "helpline" character varying(64),
    "toll_free" character varying(32),
    "email" character varying(256),
    "handles" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."departments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."departments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."departments_id_seq" OWNED BY "public"."departments"."id";



CREATE TABLE IF NOT EXISTS "public"."elected_reps" (
    "id" integer NOT NULL,
    "city_id" character varying(64) NOT NULL,
    "role" character varying(32) NOT NULL,
    "constituency" character varying(128) NOT NULL,
    "name" character varying(256) NOT NULL,
    "party" character varying(64),
    "elected_since" character varying(32),
    "profile_url" character varying(512),
    "notes" "text",
    "data_source" character varying(256),
    "criminal_cases" integer,
    "total_assets_cr" numeric(10,2),
    "liabilities_cr" numeric(10,2),
    "age" integer,
    "education" "text",
    "profession" "text",
    "prev_assets_2018_cr" numeric(10,2),
    "myneta_id" "text",
    "phone" "text",
    "email" "text"
);


ALTER TABLE "public"."elected_reps" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."elected_reps_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."elected_reps_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."elected_reps_id_seq" OWNED BY "public"."elected_reps"."id";



CREATE TABLE IF NOT EXISTS "public"."fact_templates" (
    "id" integer NOT NULL,
    "category" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "field" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "icon" "text" DEFAULT '?'::"text",
    "priority" integer DEFAULT 5
);


ALTER TABLE "public"."fact_templates" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fact_templates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fact_templates_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fact_templates_id_seq" OWNED BY "public"."fact_templates"."id";



CREATE TABLE IF NOT EXISTS "public"."fact_votes" (
    "id" integer NOT NULL,
    "fact_id" integer NOT NULL,
    "vote_type" character varying(16) NOT NULL,
    "voter_token" character varying(128) NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."fact_votes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fact_votes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fact_votes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fact_votes_id_seq" OWNED BY "public"."fact_votes"."id";



CREATE TABLE IF NOT EXISTS "public"."gba_contacts" (
    "id" integer NOT NULL,
    "corporation" "text" NOT NULL,
    "role" "text" NOT NULL,
    "name" "text",
    "phone" "text",
    "email" "text",
    "control_room" "text",
    "office_address" "text",
    "as_on_date" "text" DEFAULT '2025-12-08'::"text"
);


ALTER TABLE "public"."gba_contacts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."gba_contacts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."gba_contacts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."gba_contacts_id_seq" OWNED BY "public"."gba_contacts"."id";



CREATE TABLE IF NOT EXISTS "public"."gba_wards" (
    "gba_corporation_id" integer NOT NULL,
    "gba_ward_no" integer NOT NULL,
    "gba_ward_name" "text" NOT NULL,
    "gba_ward_name_kn" "text",
    "gba_corporation" "text" NOT NULL,
    "gba_ac" "text",
    "gba_ac_no" integer,
    "gba_zone" "text",
    "gba_zone_name" "text",
    "gba_population" integer,
    "gba_division" "text",
    "gba_subdivision" "text",
    "source_url" "text" NOT NULL,
    "source_updated" "text" NOT NULL,
    "geom" "public"."geometry"(MultiPolygon,4326) NOT NULL
);


ALTER TABLE "public"."gba_wards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gba_wards_legacy_20260910" (
    "corporation_id" smallint NOT NULL,
    "ward_no" smallint NOT NULL,
    "corporation" "text" NOT NULL,
    "ward_name" "text" NOT NULL,
    "ward_name_kn" "text",
    "kml_id" "text",
    "ac" "text",
    "ac_no" smallint,
    "zone" "text",
    "zone_name" "text",
    "population" integer,
    "pop_male" integer,
    "pop_female" integer,
    "pop_sc" integer,
    "pop_st" integer,
    "boundary" "public"."geometry"(Geometry,4326),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "geom" "public"."geometry"(MultiPolygon,4326)
);


ALTER TABLE "public"."gba_wards_legacy_20260910" OWNER TO "postgres";


COMMENT ON TABLE "public"."gba_wards_legacy_20260910" IS 'GBA ward boundaries (369 wards across 5 corporations, Dec 2025). Source: data.opencity.in';



CREATE TABLE IF NOT EXISTS "public"."in_central_project_snapshots" (
    "project_code" "text" NOT NULL,
    "report_month" "date" NOT NULL,
    "sl_no" integer,
    "approval_month" "date",
    "start_month" "date",
    "original_doc_month" "date",
    "revised_doc_month" "date",
    "original_cost_cr" numeric(14,2),
    "revised_cost_cr" numeric(14,2),
    "cumulative_expenditure_cr" numeric(14,2),
    "physical_progress_pct" numeric(5,2),
    "cost_overrun_cr" numeric(14,2) GENERATED ALWAYS AS (("revised_cost_cr" - "original_cost_cr")) STORED,
    "schedule_slip_months" integer,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_page" integer,
    "source_pdf_url" "text",
    "parser_version" "text" NOT NULL,
    "ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "in_central_project_snapshots_costs_nonneg" CHECK (((("original_cost_cr" IS NULL) OR ("original_cost_cr" >= (0)::numeric)) AND (("revised_cost_cr" IS NULL) OR ("revised_cost_cr" >= (0)::numeric)))),
    CONSTRAINT "in_central_project_snapshots_month_is_first" CHECK ((EXTRACT(day FROM "report_month") = (1)::numeric)),
    CONSTRAINT "in_central_project_snapshots_progress_range" CHECK ((("physical_progress_pct" IS NULL) OR (("physical_progress_pct" >= (0)::numeric) AND ("physical_progress_pct" <= (100)::numeric))))
);


ALTER TABLE "public"."in_central_project_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."in_central_projects" (
    "project_code" "text" NOT NULL,
    "legacy_ocms_code" "text",
    "pmgid" "text",
    "project_name" "text" NOT NULL,
    "ministry" "text",
    "sector" "text",
    "agency" "text",
    "state_raw" "text",
    "st_code" integer,
    "is_multi_state" boolean DEFAULT false NOT NULL,
    "first_seen_month" "date" NOT NULL,
    "last_seen_month" "date" NOT NULL,
    "is_ongoing" boolean DEFAULT true NOT NULL,
    "data_source" "text" DEFAULT 'MoSPI Flash Report Table 6 (PAIMANA)'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "in_central_projects_months_ordered" CHECK (("last_seen_month" >= "first_seen_month"))
);


ALTER TABLE "public"."in_central_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."in_constituencies" (
    "pc_code" "text" NOT NULL,
    "st_code" integer NOT NULL,
    "pc_no" integer NOT NULL,
    "state_name" "text" NOT NULL,
    "pc_name" "text" NOT NULL,
    "pc_name_norm" "text" NOT NULL,
    "pc_name_hi" "text",
    "reserved_for" "text",
    "reserved_source" "text",
    "wikidata_qid" "text",
    "pc_id_datameet" integer,
    "geom_source" "text",
    "data_source" "text" DEFAULT 'datameet + shijithpk 2024 supplement'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geom" "public"."geometry"(MultiPolygon,4326),
    CONSTRAINT "in_constituencies_name_norm_present" CHECK (("pc_name_norm" <> ''::"text")),
    CONSTRAINT "in_constituencies_pc_code_derived" CHECK (("pc_code" = ((("st_code")::"text" || '-'::"text") || ("pc_no")::"text"))),
    CONSTRAINT "in_constituencies_pc_no_positive" CHECK ((("pc_no" > 0) AND ("st_code" > 0))),
    CONSTRAINT "in_constituencies_reserved_chk" CHECK ((("reserved_for" IS NULL) OR ("reserved_for" = ANY (ARRAY['SC'::"text", 'ST'::"text"])))),
    CONSTRAINT "in_constituencies_reserved_has_source" CHECK ((("reserved_for" IS NULL) OR ("reserved_source" IS NOT NULL)))
);


ALTER TABLE "public"."in_constituencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."in_mp_activity" (
    "id" bigint NOT NULL,
    "mp_id" bigint NOT NULL,
    "mpsno" integer NOT NULL,
    "house" "text" NOT NULL,
    "term_label" "text" NOT NULL,
    "period_kind" "text" NOT NULL,
    "session_no" integer NOT NULL,
    "session_label" "text",
    "session_start" "date",
    "session_end" "date",
    "sittings_held" integer,
    "signed_days" integer,
    "attendance_pct" numeric(5,2),
    "questions_asked" integer,
    "debates" integer,
    "private_member_bills" integer,
    "committees" integer,
    "metrics_excluded" boolean DEFAULT false NOT NULL,
    "metrics_excluded_reason" "text",
    "data_source" "text" NOT NULL,
    "ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "in_mp_activity_attendance_range" CHECK ((("attendance_pct" IS NULL) OR (("attendance_pct" >= (0)::numeric) AND ("attendance_pct" <= (100)::numeric)))),
    CONSTRAINT "in_mp_activity_excluded_has_reason" CHECK (((NOT "metrics_excluded") OR ("metrics_excluded_reason" IS NOT NULL))),
    CONSTRAINT "in_mp_activity_excluded_is_null_not_zero" CHECK (((NOT "metrics_excluded") OR (("signed_days" IS NULL) AND ("attendance_pct" IS NULL) AND ("questions_asked" IS NULL) AND ("private_member_bills" IS NULL)))),
    CONSTRAINT "in_mp_activity_house_chk" CHECK (("house" = ANY (ARRAY['LS'::"text", 'RS'::"text"]))),
    CONSTRAINT "in_mp_activity_period_kind_chk" CHECK (("period_kind" = ANY (ARRAY['session'::"text", 'term'::"text"]))),
    CONSTRAINT "in_mp_activity_session_no_positive" CHECK ((("period_kind" <> 'session'::"text") OR ("session_no" > 0))),
    CONSTRAINT "in_mp_activity_term_session_no" CHECK ((("period_kind" <> 'term'::"text") OR ("session_no" = 0)))
);


ALTER TABLE "public"."in_mp_activity" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."in_mp_activity_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."in_mp_activity_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."in_mp_activity_id_seq" OWNED BY "public"."in_mp_activity"."id";



CREATE TABLE IF NOT EXISTS "public"."in_mp_affidavits" (
    "id" bigint NOT NULL,
    "myneta_candidate_id" integer NOT NULL,
    "election" "text" NOT NULL,
    "profile_url" "text",
    "myneta_constituency_id" integer,
    "constituency_label" "text",
    "state_label" "text",
    "pc_code" "text",
    "mp_id" bigint,
    "is_winner" boolean DEFAULT false NOT NULL,
    "candidate_name" "text" NOT NULL,
    "party_abbr" "text",
    "party_full" "text",
    "age" integer,
    "self_profession" "text",
    "spouse_profession" "text",
    "education_category" "text",
    "education_detail" "text",
    "criminal_cases" integer,
    "criminal_cases_detail" "jsonb",
    "total_assets_inr" bigint,
    "liabilities_inr" bigint,
    "declared_assets_history" "jsonb",
    "parse_status" "text" DEFAULT 'ok'::"text" NOT NULL,
    "match_method" "text",
    "needs_review" boolean DEFAULT true NOT NULL,
    "data_source" "text" DEFAULT 'ECI affidavits via myneta.info (ADR)'::"text" NOT NULL,
    "scraped_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "in_mp_affidavits_amounts_nonneg" CHECK (((("total_assets_inr" IS NULL) OR ("total_assets_inr" >= 0)) AND (("liabilities_inr" IS NULL) OR ("liabilities_inr" >= 0)))),
    CONSTRAINT "in_mp_affidavits_cases_explicit" CHECK ((("parse_status" <> 'ok'::"text") OR ("criminal_cases" IS NOT NULL))),
    CONSTRAINT "in_mp_affidavits_cases_nonneg" CHECK ((("criminal_cases" IS NULL) OR ("criminal_cases" >= 0))),
    CONSTRAINT "in_mp_affidavits_match_method_chk" CHECK ((("match_method" IS NULL) OR ("match_method" = ANY (ARRAY['alias_table'::"text", 'one_winner_per_pc'::"text", 'manual_reviewed'::"text"])))),
    CONSTRAINT "in_mp_affidavits_matched_rows_have_method" CHECK ((("pc_code" IS NULL) OR ("match_method" IS NOT NULL))),
    CONSTRAINT "in_mp_affidavits_matched_rows_reviewed" CHECK (("needs_review" OR ("pc_code" IS NOT NULL))),
    CONSTRAINT "in_mp_affidavits_parse_status_chk" CHECK (("parse_status" = ANY (ARRAY['ok'::"text", 'partial'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."in_mp_affidavits" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."in_mp_affidavits_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."in_mp_affidavits_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."in_mp_affidavits_id_seq" OWNED BY "public"."in_mp_affidavits"."id";



CREATE TABLE IF NOT EXISTS "public"."in_mplads_summary" (
    "id" bigint NOT NULL,
    "mp_id" bigint,
    "mpsno" integer,
    "pc_code" "text",
    "house" "text" NOT NULL,
    "term_label" "text" NOT NULL,
    "source" "text" NOT NULL,
    "source_mp_key" "text" NOT NULL,
    "source_constituency_key" "text",
    "mp_name_source" "text",
    "allocated_inr" numeric(18,2),
    "expenditure_inr" numeric(18,2),
    "unspent_inr" numeric(18,2),
    "utilization_pct" numeric(6,2),
    "works_recommended" integer,
    "works_sanctioned" integer,
    "works_completed" integer,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_source" "text" NOT NULL,
    CONSTRAINT "in_mplads_summary_amounts_nonneg" CHECK (((("allocated_inr" IS NULL) OR ("allocated_inr" >= (0)::numeric)) AND (("expenditure_inr" IS NULL) OR ("expenditure_inr" >= (0)::numeric)))),
    CONSTRAINT "in_mplads_summary_house_chk" CHECK (("house" = ANY (ARRAY['LS'::"text", 'RS'::"text"]))),
    CONSTRAINT "in_mplads_summary_pc_only_for_ls" CHECK ((("house" = 'LS'::"text") OR ("pc_code" IS NULL))),
    CONSTRAINT "in_mplads_summary_source_chk" CHECK (("source" = ANY (ARRAY['esakshi'::"text", 'empoweredindian'::"text"])))
);


ALTER TABLE "public"."in_mplads_summary" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."in_mplads_summary_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."in_mplads_summary_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."in_mplads_summary_id_seq" OWNED BY "public"."in_mplads_summary"."id";



CREATE TABLE IF NOT EXISTS "public"."in_mps" (
    "id" bigint NOT NULL,
    "mpsno" integer NOT NULL,
    "house" "text" NOT NULL,
    "term_label" "text" NOT NULL,
    "lok_sabha_no" integer,
    "pc_code" "text",
    "pc_match_method" "text",
    "state_name" "text",
    "constituency_label" "text",
    "name" "text" NOT NULL,
    "name_norm" "text",
    "party_abbr" "text",
    "party_full" "text",
    "gender" "text",
    "dob" "date",
    "age" integer,
    "no_of_terms" integer,
    "qualification" "text",
    "profession" "text",
    "status" "text" NOT NULL,
    "term_start" "date",
    "term_end" "date",
    "is_minister" boolean DEFAULT false NOT NULL,
    "minister_note" "text",
    "profile_url" "text",
    "image_url" "text",
    "data_source" "text" DEFAULT 'sansad.in api_ls/api_rs'::"text" NOT NULL,
    "source_updated_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "in_mps_house_chk" CHECK (("house" = ANY (ARRAY['LS'::"text", 'RS'::"text"]))),
    CONSTRAINT "in_mps_matched_rows_have_method" CHECK ((("pc_code" IS NULL) OR ("pc_match_method" IS NOT NULL))),
    CONSTRAINT "in_mps_pc_match_method_chk" CHECK ((("pc_match_method" IS NULL) OR ("pc_match_method" = ANY (ARRAY['exact_normalized'::"text", 'alias_table'::"text", 'manual_reviewed'::"text"])))),
    CONSTRAINT "in_mps_pc_only_for_ls" CHECK ((("house" = 'LS'::"text") OR ("pc_code" IS NULL))),
    CONSTRAINT "in_mps_status_chk" CHECK (("status" = ANY (ARRAY['Sitting'::"text", 'Died'::"text", 'Resigned'::"text", 'Disqualified'::"text", 'Term Ended'::"text"])))
);


ALTER TABLE "public"."in_mps" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."in_mps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."in_mps_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."in_mps_id_seq" OWNED BY "public"."in_mps"."id";



CREATE TABLE IF NOT EXISTS "public"."in_pc_source_aliases" (
    "id" bigint NOT NULL,
    "source" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    "source_label" "text",
    "st_code" integer,
    "pc_code" "text" NOT NULL,
    "method" "text" NOT NULL,
    "note" "text",
    "reviewed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "in_pc_source_aliases_manual_is_attributed" CHECK ((("method" <> 'manual_reviewed'::"text") OR ("reviewed_by" IS NOT NULL))),
    CONSTRAINT "in_pc_source_aliases_method_chk" CHECK (("method" = ANY (ARRAY['official_lookup'::"text", 'exact_normalized'::"text", 'manual_reviewed'::"text"])))
);


ALTER TABLE "public"."in_pc_source_aliases" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."in_pc_source_aliases_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."in_pc_source_aliases_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."in_pc_source_aliases_id_seq" OWNED BY "public"."in_pc_source_aliases"."id";



CREATE TABLE IF NOT EXISTS "public"."mla_lad_funds" (
    "id" integer NOT NULL,
    "assembly_constituency" "text" NOT NULL,
    "financial_year" "text" NOT NULL,
    "total_lakh" numeric(10,2),
    "project_count" integer,
    "term" "text" DEFAULT '2013-2018'::"text",
    "data_source" "text" DEFAULT 'opencity.in'::"text"
);


ALTER TABLE "public"."mla_lad_funds" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."mla_lad_funds_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."mla_lad_funds_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."mla_lad_funds_id_seq" OWNED BY "public"."mla_lad_funds"."id";



CREATE TABLE IF NOT EXISTS "public"."officers" (
    "id" integer NOT NULL,
    "city_id" character varying(64) NOT NULL,
    "ward_no" integer,
    "role" character varying(128) NOT NULL,
    "name" character varying(256),
    "department" character varying(128),
    "phone" character varying(64),
    "email" character varying(256),
    "source" character varying(64),
    "last_verified" "date"
);


ALTER TABLE "public"."officers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."officers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."officers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."officers_id_seq" OWNED BY "public"."officers"."id";



CREATE TABLE IF NOT EXISTS "public"."police_stations" (
    "id" integer NOT NULL,
    "division" "text",
    "subdivision" "text",
    "station_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "station_type" "text" DEFAULT 'city'::"text"
);


ALTER TABLE "public"."police_stations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."police_stations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."police_stations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."police_stations_id_seq" OWNED BY "public"."police_stations"."id";



CREATE TABLE IF NOT EXISTS "public"."property_tax" (
    "id" integer NOT NULL,
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL,
    "financial_year" "text" NOT NULL,
    "zone" "text",
    "ward_name" "text",
    "ward_no_old" integer,
    "num_applications" integer,
    "total_collection_lakh" numeric(12,2),
    "source" "text" DEFAULT 'opencity.in/BBMP'::"text"
);


ALTER TABLE "public"."property_tax" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."property_tax_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."property_tax_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."property_tax_id_seq" OWNED BY "public"."property_tax"."id";



CREATE TABLE IF NOT EXISTS "public"."rep_report_cards" (
    "id" integer NOT NULL,
    "role" "text" NOT NULL,
    "constituency" "text" NOT NULL,
    "attendance_pct" numeric(5,1),
    "questions_asked" integer,
    "debates" integer,
    "bills_introduced" integer,
    "committees" integer,
    "lad_utilization_pct" numeric(6,2),
    "net_worth_growth_pct" numeric(8,1),
    "criminal_cases" integer,
    "term" "text",
    "data_source" "text" DEFAULT 'CIVIC Bengaluru via opencity.in'::"text"
);


ALTER TABLE "public"."rep_report_cards" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rep_report_cards_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rep_report_cards_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rep_report_cards_id_seq" OWNED BY "public"."rep_report_cards"."id";



CREATE TABLE IF NOT EXISTS "public"."sakala_performance" (
    "id" integer NOT NULL,
    "city_id" character varying(50) DEFAULT 'bengaluru'::character varying,
    "assembly_name" character varying(100) NOT NULL,
    "year" integer NOT NULL,
    "month" integer,
    "department_code" character varying(10) DEFAULT 'ALL'::character varying,
    "receipts" integer,
    "disposals" integer,
    "intime_count" integer,
    "intime_pct" double precision,
    "delayed_count" integer,
    "delayed_pct" double precision,
    "pending" integer,
    "rank_intime" integer,
    "rank_receipts_per_lakh" integer,
    "rank_overall" integer,
    "data_source" character varying(50) DEFAULT 'sakala.kar.nic.in'::character varying,
    "scraped_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sakala_performance" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sakala_performance_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sakala_performance_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sakala_performance_id_seq" OWNED BY "public"."sakala_performance"."id";



CREATE TABLE IF NOT EXISTS "public"."tenders" (
    "id" integer NOT NULL,
    "city_id" character varying(64) NOT NULL,
    "ward_no" integer,
    "kppp_id" character varying(128),
    "title" "text" NOT NULL,
    "department" character varying(128),
    "contractor_name" character varying(256),
    "contractor_blacklisted" boolean DEFAULT false,
    "value_lakh" double precision,
    "status" character varying(32),
    "issued_date" "date",
    "deadline" "date",
    "source_url" character varying(512),
    "agency" "text"
);


ALTER TABLE "public"."tenders" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tenders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tenders_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tenders_id_seq" OWNED BY "public"."tenders"."id";



CREATE TABLE IF NOT EXISTS "public"."traffic_signals" (
    "id" bigint NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "name" "text",
    "has_countdown" boolean GENERATED ALWAYS AS ((("tags" ->> 'traffic_signals:countdown'::"text") = 'yes'::"text")) STORED,
    "has_camera" boolean GENERATED ALWAYS AS ((("tags" ? 'camera:type'::"text") OR ("tags" ? 'surveillance'::"text"))) STORED,
    "crossing" "text" GENERATED ALWAYS AS (("tags" ->> 'crossing'::"text")) STORED,
    "tags" "jsonb",
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL
);


ALTER TABLE "public"."traffic_signals" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_in_central_project_changes" AS
 SELECT "project_code",
    "report_month",
    "lag"("report_month") OVER "w" AS "prev_report_month",
    "revised_cost_cr",
    "lag"("revised_cost_cr") OVER "w" AS "prev_revised_cost_cr",
    "revised_doc_month",
    "lag"("revised_doc_month") OVER "w" AS "prev_revised_doc_month",
    "cumulative_expenditure_cr",
    "lag"("cumulative_expenditure_cr") OVER "w" AS "prev_cumulative_expenditure_cr",
    "physical_progress_pct",
    "lag"("physical_progress_pct") OVER "w" AS "prev_physical_progress_pct",
    "cost_overrun_cr",
    "lag"("cost_overrun_cr") OVER "w" AS "prev_cost_overrun_cr",
    "schedule_slip_months",
    "lag"("schedule_slip_months") OVER "w" AS "prev_schedule_slip_months",
    (("lag"("revised_cost_cr") OVER "w" IS NOT NULL) AND ("revised_cost_cr" IS DISTINCT FROM "lag"("revised_cost_cr") OVER "w")) AS "cost_revised",
    (("lag"("revised_doc_month") OVER "w" IS NOT NULL) AND ("revised_doc_month" IS DISTINCT FROM "lag"("revised_doc_month") OVER "w")) AS "schedule_changed"
   FROM "public"."in_central_project_snapshots" "s"
  WINDOW "w" AS (PARTITION BY "project_code" ORDER BY "report_month");


ALTER VIEW "public"."v_in_central_project_changes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_in_central_project_staleness" AS
 WITH "monthly" AS (
         SELECT "s"."project_code",
            "s"."report_month",
            (((("s"."revised_cost_cr" IS DISTINCT FROM "lag"("s"."revised_cost_cr") OVER "w") OR ("s"."revised_doc_month" IS DISTINCT FROM "lag"("s"."revised_doc_month") OVER "w")) OR ("s"."cumulative_expenditure_cr" IS DISTINCT FROM "lag"("s"."cumulative_expenditure_cr") OVER "w")) OR ("s"."physical_progress_pct" IS DISTINCT FROM "lag"("s"."physical_progress_pct") OVER "w")) AS "changed"
           FROM "public"."in_central_project_snapshots" "s"
          WINDOW "w" AS (PARTITION BY "s"."project_code" ORDER BY "s"."report_month")
        ), "bounds" AS (
         SELECT "max"("in_central_project_snapshots"."report_month") AS "latest_report_month"
           FROM "public"."in_central_project_snapshots"
        ), "agg" AS (
         SELECT "m"."project_code",
            "min"("m"."report_month") AS "first_report_month",
            "max"("m"."report_month") AS "last_report_month",
            ("count"(*))::integer AS "snapshot_count",
            "max"("m"."report_month") FILTER (WHERE "m"."changed") AS "changed_month"
           FROM "monthly" "m"
          GROUP BY "m"."project_code"
        ), "resolved" AS (
         SELECT "a"."project_code",
            "a"."first_report_month",
            "a"."last_report_month",
            "a"."snapshot_count",
            COALESCE("a"."changed_month", "a"."first_report_month") AS "last_change_month"
           FROM "agg" "a"
        )
 SELECT "r"."project_code",
    "r"."last_change_month",
    ((("date_part"('year'::"text", "age"(("r"."last_report_month")::timestamp with time zone, ("r"."last_change_month")::timestamp with time zone)) * (12)::double precision) + "date_part"('month'::"text", "age"(("r"."last_report_month")::timestamp with time zone, ("r"."last_change_month")::timestamp with time zone))))::integer AS "months_unchanged",
    "r"."last_report_month",
    "r"."first_report_month",
    "r"."snapshot_count",
    ("r"."last_report_month" = "b"."latest_report_month") AS "is_in_latest_report",
    "latest"."physical_progress_pct" AS "latest_physical_progress_pct",
    "latest"."cost_overrun_cr" AS "latest_cost_overrun_cr"
   FROM (("resolved" "r"
     CROSS JOIN "bounds" "b")
     LEFT JOIN LATERAL ( SELECT "s"."physical_progress_pct",
            "s"."cost_overrun_cr"
           FROM "public"."in_central_project_snapshots" "s"
          WHERE ("s"."project_code" = "r"."project_code")
          ORDER BY "s"."report_month" DESC
         LIMIT 1) "latest" ON (true));


ALTER VIEW "public"."v_in_central_project_staleness" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_crosswalk" (
    "bbmp225_no" integer NOT NULL,
    "datameet243_no" integer NOT NULL,
    "share" numeric NOT NULL,
    "is_primary" boolean NOT NULL
);


ALTER TABLE "public"."ward_crosswalk" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_work_orders_243" AS
 SELECT "wo"."id",
    "wo"."city_id",
    "wo"."work_order_id",
    "wo"."ward_no",
    "wo"."description",
    "wo"."contractor",
    "wo"."sanctioned_amount",
    "wo"."net_paid",
    "wo"."deduction",
    "wo"."fy",
    "wo"."data_source",
    "wo"."contractor_raw",
    "wo"."contractor_name",
    "wo"."contractor_phone",
    "wo"."contractor_code",
    "wo"."division",
    "wo"."budget_head",
    "wo"."start_date",
    "wo"."end_date",
    "wo"."order_ref",
    "wo"."sbr_ref",
    "wo"."bill_ref",
    "wo"."payment_status",
    "wo"."ifms_wbid",
    "wo"."source_ward_name",
    "wo"."bbmp_ward_no",
    "wo"."ward_class",
    "x"."datameet243_no",
    "x"."share" AS "overlap_share",
    "x"."is_primary"
   FROM ("public"."bbmp_work_orders" "wo"
     JOIN "public"."ward_crosswalk" "x" ON (("x"."bbmp225_no" = "wo"."ward_no")))
  WHERE ("wo"."ward_class" = 'ward'::"text");


ALTER VIEW "public"."v_work_orders_243" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_air_quality" (
    "ward_no" integer NOT NULL,
    "station_name" "text",
    "avg_pm25" numeric(6,2),
    "avg_pm10" numeric(6,2),
    "data_year" "text"
);


ALTER TABLE "public"."ward_air_quality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_amenities" (
    "ward_no" integer NOT NULL,
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL,
    "hospitals" integer DEFAULT 0,
    "clinics" integer DEFAULT 0,
    "pharmacies" integer DEFAULT 0,
    "atms" integer DEFAULT 0,
    "banks" integer DEFAULT 0,
    "public_toilets" integer DEFAULT 0,
    "ev_charging" integer DEFAULT 0,
    "petrol_pumps" integer DEFAULT 0,
    "post_offices" integer DEFAULT 0,
    "libraries" integer DEFAULT 0,
    "community_halls" integer DEFAULT 0,
    "places_of_worship" integer DEFAULT 0,
    "restaurants" integer DEFAULT 0,
    "cafes" integer DEFAULT 0,
    "metro_stations" integer DEFAULT 0,
    "data_source" "text" DEFAULT 'openstreetmap'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ward_amenities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_boundaries" (
    "ward_no" integer NOT NULL,
    "ward_name" "text",
    "geom" "public"."geometry"(MultiPolygon,4326)
);


ALTER TABLE "public"."ward_boundaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_bus_stops" (
    "ward_no" integer NOT NULL,
    "stop_count" integer,
    "total_trips" bigint
);


ALTER TABLE "public"."ward_bus_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_committee_meetings" (
    "id" integer NOT NULL,
    "ward_no" integer,
    "ward_name" "text" NOT NULL,
    "assembly_constituency" "text",
    "meetings_count" integer,
    "period" "text" DEFAULT '2020-2022'::"text",
    "data_source" "text" DEFAULT 'opencity.in'::"text"
);


ALTER TABLE "public"."ward_committee_meetings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_committee_meetings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_committee_meetings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_committee_meetings_id_seq" OWNED BY "public"."ward_committee_meetings"."id";



CREATE TABLE IF NOT EXISTS "public"."ward_grievances" (
    "id" integer NOT NULL,
    "city_id" character varying(50) DEFAULT 'bengaluru'::character varying,
    "ward_name" character varying(100) NOT NULL,
    "year" integer NOT NULL,
    "category" character varying(100),
    "total_complaints" integer NOT NULL,
    "closed" integer DEFAULT 0,
    "in_progress" integer DEFAULT 0,
    "registered" integer DEFAULT 0,
    "reopened" integer DEFAULT 0,
    "data_source" character varying(100) DEFAULT 'data.opencity.in'::character varying
);


ALTER TABLE "public"."ward_grievances" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_grievances_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_grievances_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_grievances_id_seq" OWNED BY "public"."ward_grievances"."id";



CREATE MATERIALIZED VIEW "public"."ward_infra_stats" AS
 SELECT "wb"."ward_no",
    "wb"."ward_name",
    "count"(DISTINCT "ts"."id") AS "signal_count",
    "count"(DISTINCT "bs"."id") AS "bus_stop_count",
    COALESCE("sum"("bs"."trips"), (0)::bigint) AS "daily_trips"
   FROM (("public"."ward_boundaries" "wb"
     LEFT JOIN "public"."traffic_signals" "ts" ON ("public"."st_within"("public"."st_setsrid"("public"."st_point"("ts"."lng", "ts"."lat"), 4326), "wb"."geom")))
     LEFT JOIN "public"."bmtc_stops" "bs" ON ("public"."st_within"("public"."st_setsrid"("public"."st_point"("bs"."lng", "bs"."lat"), 4326), "wb"."geom")))
  GROUP BY "wb"."ward_no", "wb"."ward_name"
  ORDER BY "wb"."ward_no"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."ward_infra_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_potholes" (
    "id" integer NOT NULL,
    "ward_no" integer,
    "ward_name" "text" NOT NULL,
    "assembly_constituency" "text",
    "complaints" integer,
    "data_year" "text" DEFAULT '2022'::"text"
);


ALTER TABLE "public"."ward_potholes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_potholes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_potholes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_potholes_id_seq" OWNED BY "public"."ward_potholes"."id";



CREATE TABLE IF NOT EXISTS "public"."ward_reports" (
    "id" bigint NOT NULL,
    "ward_no" integer,
    "ward_name" "text",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "issue_type" "text" NOT NULL,
    "description" "text",
    "photo_url" "text",
    "ai_label" "text",
    "ai_person" "text",
    "ai_party" "text",
    "ai_confidence" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source" "text" DEFAULT 'web'::"text" NOT NULL,
    "upvotes" integer DEFAULT 0 NOT NULL,
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moderated_at" timestamp with time zone,
    "location_text" "text",
    CONSTRAINT "ward_reports_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['hoarding'::"text", 'pothole'::"text", 'flooding'::"text", 'construction'::"text", 'encroachment'::"text", 'garbage'::"text", 'signal'::"text", 'other'::"text"]))),
    CONSTRAINT "ward_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."ward_reports" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_reports_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_reports_id_seq" OWNED BY "public"."ward_reports"."id";



CREATE TABLE IF NOT EXISTS "public"."ward_road_crashes" (
    "ward_no" integer NOT NULL,
    "crashes_2024" integer,
    "fatal_2024" integer,
    "crashes_2025" integer,
    "fatal_2025" integer
);


ALTER TABLE "public"."ward_road_crashes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_spend_category" (
    "id" integer NOT NULL,
    "ward_no" integer,
    "ward_name" "text" NOT NULL,
    "buildings_facilities" bigint DEFAULT 0,
    "drainage" bigint DEFAULT 0,
    "others" bigint DEFAULT 0,
    "roads_and_drains" bigint DEFAULT 0,
    "roads_and_infrastructure" bigint DEFAULT 0,
    "streetlighting" bigint DEFAULT 0,
    "surveillance" bigint DEFAULT 0,
    "waste_management" bigint DEFAULT 0,
    "water_and_sanitation" bigint DEFAULT 0,
    "grand_total" bigint DEFAULT 0,
    "period" "text" DEFAULT '2018-2023'::"text"
);


ALTER TABLE "public"."ward_spend_category" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_spend_category_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_spend_category_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_spend_category_id_seq" OWNED BY "public"."ward_spend_category"."id";



CREATE TABLE IF NOT EXISTS "public"."ward_stats" (
    "id" integer NOT NULL,
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL,
    "ward_no_old" integer,
    "ward_name" "text",
    "zone" "text",
    "assembly_constituency" "text",
    "mp_constituency" "text",
    "population_2011" integer,
    "area_sqkm" numeric(10,2),
    "households_2011" integer,
    "road_length_km" numeric(10,2),
    "lakes_count" integer DEFAULT 0,
    "lake_area_sqm" numeric(12,2),
    "parks_count" integer DEFAULT 0,
    "park_area_sqm" numeric(12,2),
    "playgrounds_count" integer DEFAULT 0,
    "playground_area_sqm" numeric(12,2),
    "govt_schools_count" integer DEFAULT 0,
    "police_stations_count" integer DEFAULT 0,
    "fire_stations_count" integer DEFAULT 0,
    "bus_stops_count" integer DEFAULT 0,
    "bus_routes_count" integer DEFAULT 0,
    "streetlights_count" integer DEFAULT 0,
    "population_density_2011" numeric(10,2),
    "decadal_pop_growth_pct" numeric(6,2),
    "lake_names" "text",
    "source" "text" DEFAULT 'opencity.in/BBMP'::"text",
    "data_year" integer DEFAULT 2011,
    "streetlights" integer,
    "trees" integer,
    "namma_clinics" integer,
    "dwcc_count" integer
);


ALTER TABLE "public"."ward_stats" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_stats_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_stats_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_stats_id_seq" OWNED BY "public"."ward_stats"."id";



CREATE TABLE IF NOT EXISTS "public"."ward_stories" (
    "ward_no" integer NOT NULL,
    "ward_name" "text",
    "story" "text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_hash" "text"
);


ALTER TABLE "public"."ward_stories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ward_trade_licenses" (
    "id" integer NOT NULL,
    "city_id" character varying(50) DEFAULT 'bengaluru'::character varying,
    "ward_name" character varying(100),
    "assembly_constituency" character varying(100),
    "year" integer,
    "total_licenses" integer DEFAULT 0,
    "new_licenses" integer DEFAULT 0,
    "renewals" integer DEFAULT 0,
    "total_revenue" numeric(12,2) DEFAULT 0,
    "top_trade_type" character varying(200),
    "data_source" character varying(100) DEFAULT 'data.opencity.in'::character varying
);


ALTER TABLE "public"."ward_trade_licenses" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_trade_licenses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_trade_licenses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_trade_licenses_id_seq" OWNED BY "public"."ward_trade_licenses"."id";



CREATE TABLE IF NOT EXISTS "public"."ward_water_quality" (
    "id" integer NOT NULL,
    "ward_no" integer NOT NULL,
    "city_id" "text" DEFAULT 'bengaluru'::"text" NOT NULL,
    "water_body_name" "text" NOT NULL,
    "water_body_type" "text" DEFAULT 'lake'::"text",
    "ph" numeric(4,2),
    "bod" numeric(6,2),
    "do_level" numeric(4,2),
    "coliform" integer,
    "quality_class" "text",
    "data_year" "text" DEFAULT '2023-24'::"text",
    "data_source" "text" DEFAULT 'KSPCB'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ward_water_quality" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ward_water_quality_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ward_water_quality_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ward_water_quality_id_seq" OWNED BY "public"."ward_water_quality"."id";



CREATE TABLE IF NOT EXISTS "public"."wards" (
    "id" integer NOT NULL,
    "city_id" character varying(64) NOT NULL,
    "ward_no" integer NOT NULL,
    "ward_name" character varying(256),
    "zone" character varying(128),
    "assembly_constituency" character varying(128),
    "geom" "public"."geometry"(MultiPolygon,4326)
);


ALTER TABLE "public"."wards" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."wards_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wards_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."wards_id_seq" OWNED BY "public"."wards"."id";



ALTER TABLE ONLY "public"."analytics_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."analytics_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ask_kaun_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ask_kaun_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bbmp_work_orders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bbmp_work_orders_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bmtc_stops" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bmtc_stops_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."boundary_lookup" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."boundary_lookup_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."city_budget" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."city_budget_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."city_pulse_facts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."city_pulse_facts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."civic_signals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."civic_signals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."community_facts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."community_facts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contractor_profiles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contractor_profiles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."departments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."departments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."elected_reps" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."elected_reps_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fact_templates" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fact_templates_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fact_votes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fact_votes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."gba_contacts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."gba_contacts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."in_mp_activity" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."in_mp_activity_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."in_mp_affidavits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."in_mp_affidavits_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."in_mplads_summary" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."in_mplads_summary_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."in_mps" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."in_mps_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."in_pc_source_aliases" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."in_pc_source_aliases_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."mla_lad_funds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."mla_lad_funds_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."officers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."officers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."police_stations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."police_stations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."property_tax" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."property_tax_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rep_report_cards" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rep_report_cards_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sakala_performance" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sakala_performance_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tenders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tenders_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_committee_meetings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_committee_meetings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_grievances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_grievances_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_potholes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_potholes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_reports_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_spend_category" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_spend_category_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_stats" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_stats_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_trade_licenses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_trade_licenses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ward_water_quality" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ward_water_quality_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."wards" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wards_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ac_to_ls"
    ADD CONSTRAINT "ac_to_ls_pkey" PRIMARY KEY ("assembly_constituency");



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ask_kaun_logs"
    ADD CONSTRAINT "ask_kaun_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bbmp_work_orders"
    ADD CONSTRAINT "bbmp_work_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bbmp_work_orders"
    ADD CONSTRAINT "bbmp_work_orders_work_order_id_fy_key" UNIQUE ("work_order_id", "fy");



ALTER TABLE ONLY "public"."bbmp_work_orders"
    ADD CONSTRAINT "bbmp_work_orders_work_order_id_ward_no_key" UNIQUE ("work_order_id", "ward_no");



ALTER TABLE ONLY "public"."bmtc_stops"
    ADD CONSTRAINT "bmtc_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boundary_lookup"
    ADD CONSTRAINT "boundary_lookup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."city_budget"
    ADD CONSTRAINT "city_budget_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."city_pulse_facts"
    ADD CONSTRAINT "city_pulse_facts_dedup_key_city_id_key" UNIQUE ("dedup_key", "city_id");



ALTER TABLE ONLY "public"."city_pulse_facts"
    ADD CONSTRAINT "city_pulse_facts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."civic_signals"
    ADD CONSTRAINT "civic_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."civic_signals"
    ADD CONSTRAINT "civic_signals_source_source_id_key" UNIQUE ("source", "source_id");



ALTER TABLE ONLY "public"."community_facts"
    ADD CONSTRAINT "community_facts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contractor_profiles"
    ADD CONSTRAINT "contractor_profiles_entity_id_key" UNIQUE ("entity_id");



ALTER TABLE ONLY "public"."contractor_profiles"
    ADD CONSTRAINT "contractor_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_city_id_short_key" UNIQUE ("city_id", "short");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."elected_reps"
    ADD CONSTRAINT "elected_reps_city_id_role_constituency_key" UNIQUE ("city_id", "role", "constituency");



ALTER TABLE ONLY "public"."elected_reps"
    ADD CONSTRAINT "elected_reps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fact_templates"
    ADD CONSTRAINT "fact_templates_category_subject_field_key" UNIQUE ("category", "subject", "field");



ALTER TABLE ONLY "public"."fact_templates"
    ADD CONSTRAINT "fact_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fact_votes"
    ADD CONSTRAINT "fact_votes_fact_id_voter_token_key" UNIQUE ("fact_id", "voter_token");



ALTER TABLE ONLY "public"."fact_votes"
    ADD CONSTRAINT "fact_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gba_contacts"
    ADD CONSTRAINT "gba_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gba_wards_legacy_20260910"
    ADD CONSTRAINT "gba_wards_pkey" PRIMARY KEY ("corporation_id", "ward_no");



ALTER TABLE ONLY "public"."gba_wards"
    ADD CONSTRAINT "gba_wards_pkey1" PRIMARY KEY ("gba_corporation_id", "gba_ward_no");



ALTER TABLE ONLY "public"."in_central_project_snapshots"
    ADD CONSTRAINT "in_central_project_snapshots_pkey" PRIMARY KEY ("project_code", "report_month");



ALTER TABLE ONLY "public"."in_central_projects"
    ADD CONSTRAINT "in_central_projects_pkey" PRIMARY KEY ("project_code");



ALTER TABLE ONLY "public"."in_constituencies"
    ADD CONSTRAINT "in_constituencies_pkey" PRIMARY KEY ("pc_code");



ALTER TABLE ONLY "public"."in_constituencies"
    ADD CONSTRAINT "in_constituencies_st_pc_key" UNIQUE ("st_code", "pc_no");



ALTER TABLE ONLY "public"."in_mp_activity"
    ADD CONSTRAINT "in_mp_activity_key" UNIQUE ("mp_id", "period_kind", "session_no");



ALTER TABLE ONLY "public"."in_mp_activity"
    ADD CONSTRAINT "in_mp_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."in_mp_affidavits"
    ADD CONSTRAINT "in_mp_affidavits_key" UNIQUE ("myneta_candidate_id", "election");



ALTER TABLE ONLY "public"."in_mp_affidavits"
    ADD CONSTRAINT "in_mp_affidavits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."in_mplads_summary"
    ADD CONSTRAINT "in_mplads_summary_key" UNIQUE ("source", "house", "term_label", "source_mp_key");



ALTER TABLE ONLY "public"."in_mplads_summary"
    ADD CONSTRAINT "in_mplads_summary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."in_mps"
    ADD CONSTRAINT "in_mps_natural_key" UNIQUE ("mpsno", "house", "term_label");



ALTER TABLE ONLY "public"."in_mps"
    ADD CONSTRAINT "in_mps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."in_pc_source_aliases"
    ADD CONSTRAINT "in_pc_source_aliases_key" UNIQUE ("source", "source_key");



ALTER TABLE ONLY "public"."in_pc_source_aliases"
    ADD CONSTRAINT "in_pc_source_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mla_lad_funds"
    ADD CONSTRAINT "mla_lad_funds_assembly_constituency_financial_year_term_key" UNIQUE ("assembly_constituency", "financial_year", "term");



ALTER TABLE ONLY "public"."mla_lad_funds"
    ADD CONSTRAINT "mla_lad_funds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."officers"
    ADD CONSTRAINT "officers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."police_stations"
    ADD CONSTRAINT "police_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_tax"
    ADD CONSTRAINT "property_tax_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rep_report_cards"
    ADD CONSTRAINT "rep_report_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rep_report_cards"
    ADD CONSTRAINT "rep_report_cards_role_constituency_term_key" UNIQUE ("role", "constituency", "term");



ALTER TABLE ONLY "public"."sakala_performance"
    ADD CONSTRAINT "sakala_performance_assembly_name_year_month_department_code_key" UNIQUE ("assembly_name", "year", "month", "department_code");



ALTER TABLE ONLY "public"."sakala_performance"
    ADD CONSTRAINT "sakala_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenders"
    ADD CONSTRAINT "tenders_kppp_id_key" UNIQUE ("kppp_id");



ALTER TABLE ONLY "public"."tenders"
    ADD CONSTRAINT "tenders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."traffic_signals"
    ADD CONSTRAINT "traffic_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_air_quality"
    ADD CONSTRAINT "ward_air_quality_pkey" PRIMARY KEY ("ward_no");



ALTER TABLE ONLY "public"."ward_amenities"
    ADD CONSTRAINT "ward_amenities_pkey" PRIMARY KEY ("ward_no", "city_id");



ALTER TABLE ONLY "public"."ward_boundaries"
    ADD CONSTRAINT "ward_boundaries_pkey" PRIMARY KEY ("ward_no");



ALTER TABLE ONLY "public"."ward_bus_stops"
    ADD CONSTRAINT "ward_bus_stops_pkey" PRIMARY KEY ("ward_no");



ALTER TABLE ONLY "public"."ward_committee_meetings"
    ADD CONSTRAINT "ward_committee_meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_committee_meetings"
    ADD CONSTRAINT "ward_committee_meetings_ward_no_period_key" UNIQUE ("ward_no", "period");



ALTER TABLE ONLY "public"."ward_crosswalk"
    ADD CONSTRAINT "ward_crosswalk_pkey" PRIMARY KEY ("bbmp225_no", "datameet243_no");



ALTER TABLE ONLY "public"."ward_grievances"
    ADD CONSTRAINT "ward_grievances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_grievances"
    ADD CONSTRAINT "ward_grievances_ward_name_year_category_key" UNIQUE ("ward_name", "year", "category");



ALTER TABLE ONLY "public"."ward_potholes"
    ADD CONSTRAINT "ward_potholes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_potholes"
    ADD CONSTRAINT "ward_potholes_ward_no_key" UNIQUE ("ward_no");



ALTER TABLE ONLY "public"."ward_reports"
    ADD CONSTRAINT "ward_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_road_crashes"
    ADD CONSTRAINT "ward_road_crashes_pkey" PRIMARY KEY ("ward_no");



ALTER TABLE ONLY "public"."ward_spend_category"
    ADD CONSTRAINT "ward_spend_category_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_spend_category"
    ADD CONSTRAINT "ward_spend_category_ward_no_key" UNIQUE ("ward_no");



ALTER TABLE ONLY "public"."ward_stats"
    ADD CONSTRAINT "ward_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_stories"
    ADD CONSTRAINT "ward_stories_pkey" PRIMARY KEY ("ward_no");



ALTER TABLE ONLY "public"."ward_trade_licenses"
    ADD CONSTRAINT "ward_trade_licenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_trade_licenses"
    ADD CONSTRAINT "ward_trade_licenses_ward_name_year_key" UNIQUE ("ward_name", "year");



ALTER TABLE ONLY "public"."ward_water_quality"
    ADD CONSTRAINT "ward_water_quality_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ward_water_quality"
    ADD CONSTRAINT "ward_water_quality_ward_no_water_body_name_data_year_key" UNIQUE ("ward_no", "water_body_name", "data_year");



ALTER TABLE ONLY "public"."wards"
    ADD CONSTRAINT "wards_city_id_ward_no_key" UNIQUE ("city_id", "ward_no");



ALTER TABLE ONLY "public"."wards"
    ADD CONSTRAINT "wards_pkey" PRIMARY KEY ("id");



CREATE INDEX "bmtc_stops_ac" ON "public"."bmtc_stops" USING "btree" ("ac_number");



CREATE INDEX "bmtc_stops_city" ON "public"."bmtc_stops" USING "btree" ("city_id");



CREATE INDEX "boundary_lookup_geom_idx" ON "public"."boundary_lookup" USING "gist" ("geometry");



CREATE INDEX "boundary_lookup_type_idx" ON "public"."boundary_lookup" USING "btree" ("boundary_type");



CREATE INDEX "civic_signals_signal_at_idx" ON "public"."civic_signals" USING "btree" ("signal_at" DESC);



CREATE INDEX "civic_signals_ward_no_idx" ON "public"."civic_signals" USING "btree" ("ward_no");



CREATE INDEX "gba_wards_ac_no_idx" ON "public"."gba_wards_legacy_20260910" USING "btree" ("ac_no");



CREATE INDEX "gba_wards_boundary_idx" ON "public"."gba_wards_legacy_20260910" USING "gist" ("boundary");



CREATE INDEX "gba_wards_corporation_idx" ON "public"."gba_wards_legacy_20260910" USING "btree" ("corporation");



CREATE INDEX "gba_wards_geom_idx" ON "public"."gba_wards_legacy_20260910" USING "gist" ("geom");



CREATE INDEX "idx_analytics_event_created" ON "public"."analytics_events" USING "btree" ("event", "created_at" DESC);



CREATE INDEX "idx_ask_kaun_logs_asked_at" ON "public"."ask_kaun_logs" USING "btree" ("asked_at" DESC);



CREATE INDEX "idx_ask_kaun_logs_ward_no" ON "public"."ask_kaun_logs" USING "btree" ("ward_no");



CREATE INDEX "idx_ward_boundaries_geom" ON "public"."ward_boundaries" USING "gist" ("geom");



CREATE UNIQUE INDEX "idx_ward_infra_stats_ward_no" ON "public"."ward_infra_stats" USING "btree" ("ward_no");



CREATE INDEX "idx_ward_trade_licenses_ac" ON "public"."ward_trade_licenses" USING "btree" ("assembly_constituency");



CREATE INDEX "idx_ward_trade_licenses_ward" ON "public"."ward_trade_licenses" USING "btree" ("ward_name");



CREATE INDEX "in_central_project_snapshots_month_idx" ON "public"."in_central_project_snapshots" USING "btree" ("report_month");



CREATE INDEX "in_central_projects_ocms_idx" ON "public"."in_central_projects" USING "btree" ("legacy_ocms_code") WHERE ("legacy_ocms_code" IS NOT NULL);



CREATE INDEX "in_central_projects_state_idx" ON "public"."in_central_projects" USING "btree" ("st_code");



CREATE INDEX "in_constituencies_geom_gix" ON "public"."in_constituencies" USING "gist" ("geom");



CREATE INDEX "in_constituencies_name_norm_idx" ON "public"."in_constituencies" USING "btree" ("st_code", "pc_name_norm");



CREATE INDEX "in_constituencies_state_idx" ON "public"."in_constituencies" USING "btree" ("st_code");



CREATE INDEX "in_mp_activity_mp_idx" ON "public"."in_mp_activity" USING "btree" ("mp_id");



CREATE UNIQUE INDEX "in_mp_affidavits_one_winner_per_pc" ON "public"."in_mp_affidavits" USING "btree" ("election", "pc_code") WHERE ("is_winner" AND ("pc_code" IS NOT NULL));



CREATE INDEX "in_mp_affidavits_pc_idx" ON "public"."in_mp_affidavits" USING "btree" ("pc_code");



CREATE INDEX "in_mp_affidavits_review_idx" ON "public"."in_mp_affidavits" USING "btree" ("needs_review") WHERE "needs_review";



CREATE INDEX "in_mplads_summary_mp_idx" ON "public"."in_mplads_summary" USING "btree" ("mp_id");



CREATE INDEX "in_mplads_summary_pc_idx" ON "public"."in_mplads_summary" USING "btree" ("pc_code");



CREATE INDEX "in_mps_mpsno_idx" ON "public"."in_mps" USING "btree" ("mpsno");



CREATE UNIQUE INDEX "in_mps_one_sitting_per_pc" ON "public"."in_mps" USING "btree" ("pc_code") WHERE (("house" = 'LS'::"text") AND ("status" = 'Sitting'::"text") AND ("pc_code" IS NOT NULL));



CREATE INDEX "in_mps_pc_idx" ON "public"."in_mps" USING "btree" ("pc_code");



CREATE INDEX "in_pc_source_aliases_pc_idx" ON "public"."in_pc_source_aliases" USING "btree" ("pc_code");



CREATE INDEX "ix_community_facts_ward_category" ON "public"."community_facts" USING "btree" ("city_id", "ward_no", "category");



CREATE INDEX "ix_wards_geom" ON "public"."wards" USING "gist" ("geom");



CREATE INDEX "traffic_signals_city" ON "public"."traffic_signals" USING "btree" ("city_id");



CREATE INDEX "traffic_signals_location" ON "public"."traffic_signals" USING "gist" ("public"."st_setsrid"("public"."st_makepoint"("lng", "lat"), 4326));



CREATE INDEX "ward_reports_reported_at_idx" ON "public"."ward_reports" USING "btree" ("reported_at" DESC);



CREATE INDEX "ward_reports_status_idx" ON "public"."ward_reports" USING "btree" ("status");



CREATE INDEX "ward_reports_ward_no_idx" ON "public"."ward_reports" USING "btree" ("ward_no");



ALTER TABLE ONLY "public"."fact_votes"
    ADD CONSTRAINT "fact_votes_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "public"."community_facts"("id");



ALTER TABLE ONLY "public"."in_central_project_snapshots"
    ADD CONSTRAINT "in_central_project_snapshots_project_code_fkey" FOREIGN KEY ("project_code") REFERENCES "public"."in_central_projects"("project_code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."in_mp_activity"
    ADD CONSTRAINT "in_mp_activity_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "public"."in_mps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."in_mp_affidavits"
    ADD CONSTRAINT "in_mp_affidavits_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "public"."in_mps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."in_mp_affidavits"
    ADD CONSTRAINT "in_mp_affidavits_pc_code_fkey" FOREIGN KEY ("pc_code") REFERENCES "public"."in_constituencies"("pc_code") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."in_mplads_summary"
    ADD CONSTRAINT "in_mplads_summary_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "public"."in_mps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."in_mplads_summary"
    ADD CONSTRAINT "in_mplads_summary_pc_code_fkey" FOREIGN KEY ("pc_code") REFERENCES "public"."in_constituencies"("pc_code") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."in_mps"
    ADD CONSTRAINT "in_mps_pc_code_fkey" FOREIGN KEY ("pc_code") REFERENCES "public"."in_constituencies"("pc_code") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."in_pc_source_aliases"
    ADD CONSTRAINT "in_pc_source_aliases_pc_code_fkey" FOREIGN KEY ("pc_code") REFERENCES "public"."in_constituencies"("pc_code") ON UPDATE CASCADE;



CREATE POLICY "Allow anon inserts" ON "public"."analytics_events" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon reads" ON "public"."city_pulse_facts" FOR SELECT TO "anon" USING (("is_active" = true));



CREATE POLICY "Allow service reads" ON "public"."analytics_events" FOR SELECT TO "service_role" USING (true);



ALTER TABLE "public"."ac_to_ls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_insert_reports" ON "public"."ward_reports" FOR INSERT TO "anon" WITH CHECK (("status" = 'pending'::"text"));



ALTER TABLE "public"."ask_kaun_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bbmp_work_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bmtc_stops" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boundary_lookup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."city_budget" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."city_pulse_facts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."civic_signals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_facts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contractor_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."elected_reps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gba_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gba_wards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gba_wards_legacy_20260910" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gba_wards_public_read" ON "public"."gba_wards" FOR SELECT USING (true);



CREATE POLICY "gba_wards_public_read" ON "public"."gba_wards_legacy_20260910" FOR SELECT USING (true);



ALTER TABLE "public"."in_central_project_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_central_project_snapshots_anon_read" ON "public"."in_central_project_snapshots" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."in_central_projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_central_projects_anon_read" ON "public"."in_central_projects" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."in_constituencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_constituencies_anon_read" ON "public"."in_constituencies" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."in_mp_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_mp_activity_anon_read" ON "public"."in_mp_activity" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."in_mp_affidavits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_mp_affidavits_anon_read_matched" ON "public"."in_mp_affidavits" FOR SELECT TO "authenticated", "anon" USING ((("needs_review" = false) AND ("parse_status" = 'ok'::"text")));



ALTER TABLE "public"."in_mplads_summary" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_mplads_summary_anon_read" ON "public"."in_mplads_summary" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."in_mps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_mps_anon_read" ON "public"."in_mps" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."in_pc_source_aliases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "in_pc_source_aliases_anon_read" ON "public"."in_pc_source_aliases" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "insert_facts" ON "public"."community_facts" FOR INSERT TO "anon" WITH CHECK ((( SELECT "count"(*) AS "count"
   FROM "public"."community_facts" "community_facts_1"
  WHERE (("community_facts_1"."ward_no" = "community_facts_1"."ward_no") AND ("community_facts_1"."created_at" > ("now"() - '01:00:00'::interval)))) < 10));



CREATE POLICY "insert_votes" ON "public"."fact_votes" FOR INSERT TO "anon" WITH CHECK ((( SELECT "count"(*) AS "count"
   FROM "public"."fact_votes" "fact_votes_1"
  WHERE ((("fact_votes_1"."voter_token")::"text" = ("fact_votes_1"."voter_token")::"text") AND ("fact_votes_1"."created_at" > ("now"() - '01:00:00'::interval)))) < 20));



ALTER TABLE "public"."mla_lad_funds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."officers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."police_stations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."property_tax" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read" ON "public"."ac_to_ls" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."bbmp_work_orders" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."bmtc_stops" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."boundary_lookup" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."civic_signals" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."gba_contacts" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."mla_lad_funds" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."officers" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."police_stations" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."rep_report_cards" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."sakala_performance" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."traffic_signals" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."ward_boundaries" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."ward_committee_meetings" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."ward_grievances" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."ward_potholes" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."ward_spend_category" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."ward_trade_licenses" FOR SELECT USING (true);



CREATE POLICY "public_read" ON "public"."contractor_profiles" FOR SELECT USING (true);



CREATE POLICY "public_read" ON "public"."gba_wards_legacy_20260910" FOR SELECT USING (true);



CREATE POLICY "public_read" ON "public"."ward_air_quality" FOR SELECT USING (true);



CREATE POLICY "public_read" ON "public"."ward_amenities" FOR SELECT USING (true);



CREATE POLICY "public_read" ON "public"."ward_bus_stops" FOR SELECT USING (true);



CREATE POLICY "public_read" ON "public"."ward_road_crashes" FOR SELECT USING (true);



CREATE POLICY "public_read" ON "public"."ward_water_quality" FOR SELECT USING (true);



CREATE POLICY "read_budget" ON "public"."city_budget" FOR SELECT USING (true);



CREATE POLICY "read_depts" ON "public"."departments" FOR SELECT USING (true);



CREATE POLICY "read_facts" ON "public"."community_facts" FOR SELECT USING (true);



CREATE POLICY "read_ptax" ON "public"."property_tax" FOR SELECT USING (true);



CREATE POLICY "read_reps" ON "public"."elected_reps" FOR SELECT USING (true);



CREATE POLICY "read_templates" ON "public"."fact_templates" FOR SELECT USING (true);



CREATE POLICY "read_tenders" ON "public"."tenders" FOR SELECT USING (true);



CREATE POLICY "read_votes" ON "public"."fact_votes" FOR SELECT USING (true);



CREATE POLICY "read_ward_stats" ON "public"."ward_stats" FOR SELECT USING (true);



CREATE POLICY "read_wards" ON "public"."wards" FOR SELECT USING (true);



ALTER TABLE "public"."rep_report_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sakala_performance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_insert_pulse" ON "public"."city_pulse_facts" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "service_insert_signals" ON "public"."civic_signals" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "service_update_pulse" ON "public"."city_pulse_facts" FOR UPDATE TO "service_role" USING (true);



ALTER TABLE "public"."tenders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."traffic_signals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_air_quality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_amenities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_boundaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_bus_stops" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_committee_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_crosswalk" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ward_crosswalk_anon_read" ON "public"."ward_crosswalk" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."ward_grievances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_potholes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ward_reports_anon_read_approved" ON "public"."ward_reports" FOR SELECT TO "authenticated", "anon" USING (("status" = 'approved'::"text"));



ALTER TABLE "public"."ward_road_crashes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_spend_category" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_stories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_trade_licenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ward_water_quality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wards" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."ac_sakala_performance"("ac_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ac_sakala_performance"("ac_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ac_sakala_performance"("ac_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."budget_summary"("p_financial_year" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."budget_summary"("p_financial_year" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."budget_summary"("p_financial_year" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gba_pin_lookup"("lat" double precision, "lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."gba_pin_lookup"("lat" double precision, "lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gba_pin_lookup"("lat" double precision, "lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_fact_counter"("p_fact_id" integer, "p_column" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_fact_counter"("p_fact_id" integer, "p_column" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_fact_counter"("p_fact_id" integer, "p_column" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lookup_local_offices"("p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_local_offices"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_local_offices"("p_lat" double precision, "p_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."pin_lookup"("lat" double precision, "lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pin_lookup"("lat" double precision, "lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pin_lookup"("lat" double precision, "lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."police_station_phone"("p_name" "text", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."police_station_phone"("p_name" "text", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."police_station_phone"("p_name" "text", "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."property_tax_by_ac"("p_assembly_constituency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."property_tax_by_ac"("p_assembly_constituency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."property_tax_by_ac"("p_assembly_constituency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recent_activity"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recent_activity"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recent_activity"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."top_pin_drop_wards"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."top_pin_drop_wards"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."top_pin_drop_wards"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."ward_profile"("p_ward_no" integer, "p_city_id" "text", "p_assembly_constituency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ward_profile"("p_ward_no" integer, "p_city_id" "text", "p_assembly_constituency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ward_profile"("p_ward_no" integer, "p_city_id" "text", "p_assembly_constituency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ward_stats_by_ac"("p_assembly_constituency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ward_stats_by_ac"("p_assembly_constituency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ward_stats_by_ac"("p_assembly_constituency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ward_tenders"("ward_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."ward_tenders"("ward_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ward_tenders"("ward_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."ward_unknowns"("p_ward_no" integer, "p_city_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ward_unknowns"("p_ward_no" integer, "p_city_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ward_unknowns"("p_ward_no" integer, "p_city_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."ac_to_ls" TO "anon";
GRANT ALL ON TABLE "public"."ac_to_ls" TO "authenticated";
GRANT ALL ON TABLE "public"."ac_to_ls" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_events" TO "anon";
GRANT ALL ON TABLE "public"."analytics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."analytics_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."analytics_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."analytics_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ask_kaun_logs" TO "anon";
GRANT ALL ON TABLE "public"."ask_kaun_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ask_kaun_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ask_kaun_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ask_kaun_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ask_kaun_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bbmp_work_orders" TO "anon";
GRANT ALL ON TABLE "public"."bbmp_work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."bbmp_work_orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bbmp_work_orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bbmp_work_orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bbmp_work_orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bmtc_stops" TO "anon";
GRANT ALL ON TABLE "public"."bmtc_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."bmtc_stops" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bmtc_stops_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bmtc_stops_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bmtc_stops_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."boundary_lookup" TO "anon";
GRANT ALL ON TABLE "public"."boundary_lookup" TO "authenticated";
GRANT ALL ON TABLE "public"."boundary_lookup" TO "service_role";



GRANT ALL ON SEQUENCE "public"."boundary_lookup_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."boundary_lookup_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."boundary_lookup_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."city_budget" TO "anon";
GRANT ALL ON TABLE "public"."city_budget" TO "authenticated";
GRANT ALL ON TABLE "public"."city_budget" TO "service_role";



GRANT ALL ON SEQUENCE "public"."city_budget_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."city_budget_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."city_budget_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."city_pulse_facts" TO "anon";
GRANT ALL ON TABLE "public"."city_pulse_facts" TO "authenticated";
GRANT ALL ON TABLE "public"."city_pulse_facts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."city_pulse_facts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."city_pulse_facts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."city_pulse_facts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."civic_signals" TO "anon";
GRANT ALL ON TABLE "public"."civic_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."civic_signals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."civic_signals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."civic_signals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."civic_signals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."community_facts" TO "anon";
GRANT ALL ON TABLE "public"."community_facts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_facts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."community_facts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."community_facts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."community_facts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contractor_profiles" TO "anon";
GRANT ALL ON TABLE "public"."contractor_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."contractor_profiles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contractor_profiles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contractor_profiles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contractor_profiles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."departments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."departments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."departments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."elected_reps" TO "anon";
GRANT ALL ON TABLE "public"."elected_reps" TO "authenticated";
GRANT ALL ON TABLE "public"."elected_reps" TO "service_role";



GRANT ALL ON SEQUENCE "public"."elected_reps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."elected_reps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."elected_reps_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fact_templates" TO "anon";
GRANT ALL ON TABLE "public"."fact_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_templates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fact_templates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fact_templates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fact_templates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fact_votes" TO "anon";
GRANT ALL ON TABLE "public"."fact_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_votes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fact_votes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fact_votes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fact_votes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gba_contacts" TO "anon";
GRANT ALL ON TABLE "public"."gba_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."gba_contacts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gba_contacts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gba_contacts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gba_contacts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gba_wards" TO "anon";
GRANT ALL ON TABLE "public"."gba_wards" TO "authenticated";
GRANT ALL ON TABLE "public"."gba_wards" TO "service_role";



GRANT ALL ON TABLE "public"."gba_wards_legacy_20260910" TO "anon";
GRANT ALL ON TABLE "public"."gba_wards_legacy_20260910" TO "authenticated";
GRANT ALL ON TABLE "public"."gba_wards_legacy_20260910" TO "service_role";



GRANT ALL ON TABLE "public"."in_central_project_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."in_central_project_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."in_central_project_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."in_central_projects" TO "anon";
GRANT ALL ON TABLE "public"."in_central_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."in_central_projects" TO "service_role";



GRANT ALL ON TABLE "public"."in_constituencies" TO "anon";
GRANT ALL ON TABLE "public"."in_constituencies" TO "authenticated";
GRANT ALL ON TABLE "public"."in_constituencies" TO "service_role";



GRANT ALL ON TABLE "public"."in_mp_activity" TO "anon";
GRANT ALL ON TABLE "public"."in_mp_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."in_mp_activity" TO "service_role";



GRANT ALL ON SEQUENCE "public"."in_mp_activity_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."in_mp_activity_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."in_mp_activity_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."in_mp_affidavits" TO "anon";
GRANT ALL ON TABLE "public"."in_mp_affidavits" TO "authenticated";
GRANT ALL ON TABLE "public"."in_mp_affidavits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."in_mp_affidavits_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."in_mp_affidavits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."in_mp_affidavits_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."in_mplads_summary" TO "anon";
GRANT ALL ON TABLE "public"."in_mplads_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."in_mplads_summary" TO "service_role";



GRANT ALL ON SEQUENCE "public"."in_mplads_summary_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."in_mplads_summary_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."in_mplads_summary_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."in_mps" TO "anon";
GRANT ALL ON TABLE "public"."in_mps" TO "authenticated";
GRANT ALL ON TABLE "public"."in_mps" TO "service_role";



GRANT ALL ON SEQUENCE "public"."in_mps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."in_mps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."in_mps_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."in_pc_source_aliases" TO "anon";
GRANT ALL ON TABLE "public"."in_pc_source_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."in_pc_source_aliases" TO "service_role";



GRANT ALL ON SEQUENCE "public"."in_pc_source_aliases_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."in_pc_source_aliases_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."in_pc_source_aliases_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."mla_lad_funds" TO "anon";
GRANT ALL ON TABLE "public"."mla_lad_funds" TO "authenticated";
GRANT ALL ON TABLE "public"."mla_lad_funds" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mla_lad_funds_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mla_lad_funds_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mla_lad_funds_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."officers" TO "anon";
GRANT ALL ON TABLE "public"."officers" TO "authenticated";
GRANT ALL ON TABLE "public"."officers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."officers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."officers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."officers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."police_stations" TO "anon";
GRANT ALL ON TABLE "public"."police_stations" TO "authenticated";
GRANT ALL ON TABLE "public"."police_stations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."police_stations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."police_stations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."police_stations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."property_tax" TO "anon";
GRANT ALL ON TABLE "public"."property_tax" TO "authenticated";
GRANT ALL ON TABLE "public"."property_tax" TO "service_role";



GRANT ALL ON SEQUENCE "public"."property_tax_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."property_tax_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."property_tax_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rep_report_cards" TO "anon";
GRANT ALL ON TABLE "public"."rep_report_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."rep_report_cards" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rep_report_cards_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rep_report_cards_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rep_report_cards_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sakala_performance" TO "anon";
GRANT ALL ON TABLE "public"."sakala_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."sakala_performance" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sakala_performance_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sakala_performance_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sakala_performance_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tenders" TO "anon";
GRANT ALL ON TABLE "public"."tenders" TO "authenticated";
GRANT ALL ON TABLE "public"."tenders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tenders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tenders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tenders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."traffic_signals" TO "anon";
GRANT ALL ON TABLE "public"."traffic_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."traffic_signals" TO "service_role";



GRANT ALL ON TABLE "public"."v_in_central_project_changes" TO "anon";
GRANT ALL ON TABLE "public"."v_in_central_project_changes" TO "authenticated";
GRANT ALL ON TABLE "public"."v_in_central_project_changes" TO "service_role";



GRANT ALL ON TABLE "public"."v_in_central_project_staleness" TO "anon";
GRANT ALL ON TABLE "public"."v_in_central_project_staleness" TO "authenticated";
GRANT ALL ON TABLE "public"."v_in_central_project_staleness" TO "service_role";



GRANT ALL ON TABLE "public"."ward_crosswalk" TO "anon";
GRANT ALL ON TABLE "public"."ward_crosswalk" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_crosswalk" TO "service_role";



GRANT ALL ON TABLE "public"."v_work_orders_243" TO "anon";
GRANT ALL ON TABLE "public"."v_work_orders_243" TO "authenticated";
GRANT ALL ON TABLE "public"."v_work_orders_243" TO "service_role";



GRANT ALL ON TABLE "public"."ward_air_quality" TO "anon";
GRANT ALL ON TABLE "public"."ward_air_quality" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_air_quality" TO "service_role";



GRANT ALL ON TABLE "public"."ward_amenities" TO "anon";
GRANT ALL ON TABLE "public"."ward_amenities" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_amenities" TO "service_role";



GRANT ALL ON TABLE "public"."ward_boundaries" TO "anon";
GRANT ALL ON TABLE "public"."ward_boundaries" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_boundaries" TO "service_role";



GRANT ALL ON TABLE "public"."ward_bus_stops" TO "anon";
GRANT ALL ON TABLE "public"."ward_bus_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_bus_stops" TO "service_role";



GRANT ALL ON TABLE "public"."ward_committee_meetings" TO "anon";
GRANT ALL ON TABLE "public"."ward_committee_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_committee_meetings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_committee_meetings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_committee_meetings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_committee_meetings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ward_grievances" TO "anon";
GRANT ALL ON TABLE "public"."ward_grievances" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_grievances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_grievances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_grievances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_grievances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ward_infra_stats" TO "anon";
GRANT ALL ON TABLE "public"."ward_infra_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_infra_stats" TO "service_role";



GRANT ALL ON TABLE "public"."ward_potholes" TO "anon";
GRANT ALL ON TABLE "public"."ward_potholes" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_potholes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_potholes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_potholes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_potholes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ward_reports" TO "anon";
GRANT ALL ON TABLE "public"."ward_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ward_road_crashes" TO "anon";
GRANT ALL ON TABLE "public"."ward_road_crashes" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_road_crashes" TO "service_role";



GRANT ALL ON TABLE "public"."ward_spend_category" TO "anon";
GRANT ALL ON TABLE "public"."ward_spend_category" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_spend_category" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_spend_category_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_spend_category_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_spend_category_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ward_stats" TO "anon";
GRANT ALL ON TABLE "public"."ward_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_stats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_stats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ward_stories" TO "anon";
GRANT ALL ON TABLE "public"."ward_stories" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_stories" TO "service_role";



GRANT ALL ON TABLE "public"."ward_trade_licenses" TO "anon";
GRANT ALL ON TABLE "public"."ward_trade_licenses" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_trade_licenses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_trade_licenses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_trade_licenses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_trade_licenses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ward_water_quality" TO "anon";
GRANT ALL ON TABLE "public"."ward_water_quality" TO "authenticated";
GRANT ALL ON TABLE "public"."ward_water_quality" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ward_water_quality_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ward_water_quality_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ward_water_quality_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wards" TO "anon";
GRANT ALL ON TABLE "public"."wards" TO "authenticated";
GRANT ALL ON TABLE "public"."wards" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wards_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wards_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wards_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
