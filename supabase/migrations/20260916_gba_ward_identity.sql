-- Preserve current GBA composite ward identity on new civic records.
ALTER TABLE public.ward_reports
  ADD COLUMN IF NOT EXISTS boundary_system text,
  ADD COLUMN IF NOT EXISTS gba_corporation_id integer,
  ADD COLUMN IF NOT EXISTS gba_ward_no integer,
  ADD COLUMN IF NOT EXISTS historical_wards jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS ward_reports_gba_identity_idx
  ON public.ward_reports (gba_corporation_id, gba_ward_no)
  WHERE boundary_system = 'gba-369-2025';

ALTER TABLE public.community_facts
  ADD COLUMN IF NOT EXISTS boundary_system text,
  ADD COLUMN IF NOT EXISTS gba_corporation_id integer,
  ADD COLUMN IF NOT EXISTS gba_ward_no integer,
  ADD COLUMN IF NOT EXISTS historical_wards jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS community_facts_gba_identity_idx
  ON public.community_facts (gba_corporation_id, gba_ward_no)
  WHERE boundary_system = 'gba-369-2025';
