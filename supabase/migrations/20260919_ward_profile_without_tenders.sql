-- ward_profile stops shipping every city tender; tenders get the one index the
-- ward card's small query needs.
--
-- Why
-- ---
-- ward_profile aggregated every tender WHERE ward_no = p_ward_no OR ward_no IS
-- NULL. Almost no KPPP tender carries a ward, so every ward open returned all
-- 13,203 of them: 6.6 MB of JSON (about 1 MB gzipped), 0.9 s warm and 3.3 s
-- cold, measured 2026-09-17. The card lists only the three latest tenders of
-- the reader's GBA corporation. It now asks for exactly those
-- (apps/web/lib/api.ts fetchCorporationTenders), and reads the corporation's
-- total from PostgREST's exact count.
--
-- What
-- ----
-- 1. ward_profile is the definition in 20260505_remote_schema.sql, unchanged
--    except that tenders, tender_count and tender_total_lakh are gone. The live
--    function's output was checked against that definition on 2026-09-17
--    (same keys, same rep, tender and alert shapes). The app no longer reads
--    those three keys, so it works before and after this runs.
-- 2. tenders(city_id, department, issued_date DESC NULLS LAST) serves the
--    card's filter, order and count. Without it the query scans the table
--    twice (rows and count): 0.22-0.35 s warm.
--
-- CREATE OR REPLACE keeps the function's owner and grants.

CREATE INDEX IF NOT EXISTS tenders_city_department_issued_idx
  ON public.tenders (city_id, department, issued_date DESC NULLS LAST);

CREATE OR REPLACE FUNCTION "public"."ward_profile"("p_ward_no" integer, "p_city_id" "text" DEFAULT 'bengaluru'::"text", "p_assembly_constituency" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
  reps jsonb;
  officers_json jsonb;
  community_json jsonb;
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
    'community_facts', community_json,
    'governance_alert', governance_alert_json
  );

  RETURN result;
END;
$$;
