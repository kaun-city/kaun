-- Bengaluru tenders and their awarded suppliers, from Vonter's open dataset
-- blr-tenders-bids (ODbL 1.0).
--
-- Why
-- ---
-- Kaun's own KPPP job (scripts/adapters/kppp.mjs -> public.tenders) reads the
-- portal's search results, which carry no winner and no awarded value, and it
-- starts in May 2023. blr-tenders-bids (https://github.com/Vonter/blr-tenders-bids)
-- scrapes KPPP and the older Karnataka eProcurement portal for 18 Bengaluru
-- bodies, detail pages included. Profiled on 2026-09-17 (dataset generated
-- 2026-08-21):
--   eProc 2009-05 .. 2023-04  104,955 tenders, 44,708 with awarded suppliers,
--                             43,637 with an award amount
--   KPPP  2023-05 .. 2026-08   26,596 tenders,  5,002 with awarded suppliers
-- It lists who won, not everyone who bid: its `bidders` field holds bid groups
-- (KPPP packages) or selected award lines (eProc), so it is not loaded.
--
-- What
-- ----
-- procurement_tenders          one row per (source, tender_number), replaced
--                              whole by scripts/adapters/blr-tenders-bids.mjs
--                              whenever the dataset is republished
-- procurement_tender_winners   one row per awarded supplier, rebuilt from
--                              procurement_tenders.awarded_bidders in the same
--                              transaction, with a normalized supplier_key
-- procurement_tenders_staging  the loader's staging rows (service role only)
--
-- This is a separate table from public.tenders on purpose. The ward card counts
-- tenders by department, and the KPPP job's incremental cursor is
-- MAX(issued_date) over the whole table; mixing these rows in would change both.
-- The KPPP rows join to public.tenders on tender_number = tenders.kppp_id (15,214
-- of Kaun's 15,756 tenders matched on 2026-09-17).
--
-- Licence: the dataset is under the Open Database License. Kaun offers these
-- tables, as adapted, under the same licence, and credits the source wherever
-- they are used (wiki/docs/bengaluru/sources/blr-tenders-bids.md).

CREATE TABLE IF NOT EXISTS public.procurement_tenders (
  source                text NOT NULL CHECK (source IN ('kppp', 'eproc')),
  tender_number         text NOT NULL,
  title                 text,
  department            text,
  category              text,
  status                text,
  status_label          text,
  procurement_method    text,
  location              text,
  published_at          timestamptz,
  closes_at             timestamptz,
  awarded_at            timestamptz,
  estimated_value_inr   numeric(16, 2),
  award_amount_inr      numeric(16, 2),
  awarded_bidders       text[] NOT NULL DEFAULT '{}',
  is_retendered         boolean,
  call_number           integer,
  notice_id             bigint,
  tender_id             bigint,
  dataset_generated_at  timestamptz NOT NULL,
  PRIMARY KEY (source, tender_number)
);

CREATE TABLE IF NOT EXISTS public.procurement_tender_winners (
  source         text NOT NULL,
  tender_number  text NOT NULL,
  position       integer NOT NULL,
  supplier_name  text NOT NULL,
  supplier_key   text NOT NULL,
  PRIMARY KEY (source, tender_number, position),
  FOREIGN KEY (source, tender_number)
    REFERENCES public.procurement_tenders (source, tender_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.procurement_tenders_staging (
  row jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS procurement_tenders_department_published_idx
  ON public.procurement_tenders (department, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS procurement_tender_winners_supplier_key_idx
  ON public.procurement_tender_winners (supplier_key);

COMMENT ON TABLE public.procurement_tenders IS
  'Bengaluru tenders from KPPP and Karnataka eProcurement. Source: blr-tenders-bids by Vonter (https://github.com/Vonter/blr-tenders-bids), Open Database License 1.0; offered by Kaun under the same licence.';
COMMENT ON TABLE public.procurement_tender_winners IS
  'Awarded suppliers per tender, one row each. Source: blr-tenders-bids by Vonter, Open Database License 1.0. supplier_key is the name lowercased with everything but letters and digits removed.';
COMMENT ON COLUMN public.procurement_tenders.estimated_value_inr IS
  'Estimated contract value in rupees (the dataset''s estimated_value, else tender_value).';
COMMENT ON COLUMN public.procurement_tenders.award_amount_inr IS
  'Sum of the selected bid amounts in rupees. eProc only; KPPP does not publish it.';
COMMENT ON COLUMN public.procurement_tenders.dataset_generated_at IS
  'When blr-tenders-bids generated the snapshot this row was loaded from.';

ALTER TABLE public.procurement_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_tender_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_tenders_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procurement_tenders_public_read ON public.procurement_tenders;
CREATE POLICY procurement_tenders_public_read ON public.procurement_tenders
  FOR SELECT USING (true);

DROP POLICY IF EXISTS procurement_tender_winners_public_read ON public.procurement_tender_winners;
CREATE POLICY procurement_tender_winners_public_read ON public.procurement_tender_winners
  FOR SELECT USING (true);

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. Readers only read; the loader writes with the service role.
REVOKE ALL ON public.procurement_tenders, public.procurement_tender_winners, public.procurement_tenders_staging
  FROM anon, authenticated;
GRANT SELECT ON public.procurement_tenders, public.procurement_tender_winners
  TO anon, authenticated;
