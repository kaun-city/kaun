-- Tenders won by Kaun's contractors, matched by company name to the awarded
-- suppliers in blr-tenders-bids (Vonter, Open Database License 1.0).
--
-- Why
-- ---
-- The ward card lists contractors from BBMP work orders (contractor_profiles).
-- procurement_tender_winners (20260921) lists who won 49,710 tenders since
-- 2009. Neither has a registration number, so the only link is the name.
--
-- What
-- ----
-- contractor_supplier_matches   one row per contractor and awarded supplier
--                               name, replaced by
--                               scripts/adapters/blr-tenders-bids.mjs on every
--                               run. The rules live in
--                               scripts/lib/tender-supplier-matches.mjs: company
--                               names only, never personal names, and only a
--                               name that identifies one firm. On 2026-09-17 they
--                               matched 182 of 1,305 contractors to 4,706 tenders.
-- contractor_tender_wins(ids)   per contractor entity_id: how many tenders were
--                               won under the matched names, the eProc award
--                               total, the years, and the five latest.
--
-- The function takes entity_ids because that is what the ward record already
-- holds. It goes in a POST body, never a URL.

CREATE TABLE IF NOT EXISTS public.contractor_supplier_matches (
  contractor_profile_id  integer NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  supplier_key           text NOT NULL,
  matched_name           text NOT NULL,
  match_kind             text NOT NULL CHECK (match_kind IN ('exact', 'truncated')),
  PRIMARY KEY (contractor_profile_id, supplier_key)
);

CREATE INDEX IF NOT EXISTS contractor_supplier_matches_supplier_key_idx
  ON public.contractor_supplier_matches (supplier_key);

COMMENT ON TABLE public.contractor_supplier_matches IS
  'Contractors matched by company name to awarded suppliers in blr-tenders-bids (Vonter, Open Database License 1.0). matched_name is the contractor name that matched; match_kind is truncated when that name was cut at 20 characters and matched the only firm name beginning with it. Rules: scripts/lib/tender-supplier-matches.mjs.';

ALTER TABLE public.contractor_supplier_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractor_supplier_matches_public_read ON public.contractor_supplier_matches;
CREATE POLICY contractor_supplier_matches_public_read ON public.contractor_supplier_matches
  FOR SELECT USING (true);

REVOKE ALL ON public.contractor_supplier_matches FROM anon, authenticated;
GRANT SELECT ON public.contractor_supplier_matches TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.contractor_tender_wins(p_entity_ids text[])
RETURNS TABLE (
  entity_id         text,
  wins              integer,
  with_amount       integer,
  award_amount_inr  numeric,
  first_year        integer,
  last_year         integer,
  matched_names     text[],
  published_as      text[],
  latest            jsonb
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH won AS (
    -- One row per contractor and tender, however many of its names won it.
    SELECT DISTINCT ON (p.entity_id, t.source, t.tender_number)
      p.entity_id, m.matched_name, w.supplier_name,
      t.source, t.tender_number, t.title, t.department, t.published_at, t.award_amount_inr
    FROM public.contractor_profiles p
    JOIN public.contractor_supplier_matches m ON m.contractor_profile_id = p.id
    JOIN public.procurement_tender_winners w ON w.supplier_key = m.supplier_key
    JOIN public.procurement_tenders t ON t.source = w.source AND t.tender_number = w.tender_number
    WHERE p.entity_id = ANY (p_entity_ids)
    ORDER BY p.entity_id, t.source, t.tender_number, m.match_kind, w.position
  )
  SELECT
    won.entity_id,
    count(*)::integer,
    count(won.award_amount_inr)::integer,
    sum(won.award_amount_inr),
    min(extract(year FROM won.published_at AT TIME ZONE 'Asia/Kolkata'))::integer,
    max(extract(year FROM won.published_at AT TIME ZONE 'Asia/Kolkata'))::integer,
    array_agg(DISTINCT won.matched_name ORDER BY won.matched_name),
    (array_agg(DISTINCT won.supplier_name ORDER BY won.supplier_name))[1:3],
    (
      SELECT jsonb_agg(jsonb_build_object(
        'source', l.source,
        'tender_number', l.tender_number,
        'title', l.title,
        'department', l.department,
        'published_at', l.published_at,
        'award_amount_inr', l.award_amount_inr
      ) ORDER BY l.published_at DESC NULLS LAST, l.tender_number)
      FROM (
        SELECT * FROM won AS recent
        WHERE recent.entity_id = won.entity_id
        ORDER BY recent.published_at DESC NULLS LAST, recent.tender_number
        LIMIT 5
      ) AS l
    )
  FROM won
  GROUP BY won.entity_id;
$$;

REVOKE ALL ON FUNCTION public.contractor_tender_wins(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_tender_wins(text[]) TO anon, authenticated, service_role;
