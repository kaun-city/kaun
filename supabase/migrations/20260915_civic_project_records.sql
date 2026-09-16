-- Civic projects are durable, multi-ward objects. Research is first submitted
-- to a review queue; publication appends it to the public record rather than
-- overwriting the project's earlier state.

CREATE TABLE IF NOT EXISTS public.civic_projects (
  slug              text PRIMARY KEY,
  city_id           text NOT NULL,
  title             text NOT NULL,
  project_type      text NOT NULL,
  owner_agency      text NOT NULL,
  status            text NOT NULL CHECK (status IN ('delayed', 'in_progress', 'completed', 'paused')),
  summary           text NOT NULL,
  latest_as_of      date NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.civic_project_areas (
  project_slug       text NOT NULL REFERENCES public.civic_projects (slug) ON DELETE CASCADE,
  boundary_system    text NOT NULL,
  corporation_id     integer,
  ward_no            integer,
  ward_name          text NOT NULL,
  relationship       text NOT NULL DEFAULT 'affected' CHECK (relationship IN ('contains', 'intersects', 'affected')),
  PRIMARY KEY (project_slug, boundary_system, ward_name)
);

CREATE TABLE IF NOT EXISTS public.civic_project_records (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_slug       text NOT NULL REFERENCES public.civic_projects (slug) ON DELETE CASCADE,
  record_key         text NOT NULL,
  happened_on        date,
  kind               text NOT NULL CHECK (kind IN ('start', 'deadline', 'scope', 'cost', 'land', 'court', 'accountability', 'research')),
  headline           text NOT NULL,
  body               text NOT NULL,
  evidence_state     text NOT NULL CHECK (evidence_state IN ('verified', 'reported', 'conflicting', 'unknown')),
  source_urls        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_urls) = 'array'),
  status             text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'withdrawn')),
  published_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_slug, record_key)
);

CREATE TABLE IF NOT EXISTS public.civic_project_research_submissions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_slug       text NOT NULL REFERENCES public.civic_projects (slug) ON DELETE CASCADE,
  question           text NOT NULL CHECK (char_length(question) BETWEEN 8 AND 300),
  question_key       text,
  answer             text NOT NULL CHECK (char_length(answer) BETWEEN 20 AND 5000),
  sources            jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) > 0),
  searched_at        timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  review_note        text,
  reviewed_at        timestamptz,
  submitter_ip_hash  text,
  submitted_at       timestamptz NOT NULL DEFAULT now()
);

-- Safe when this migration is applied after an earlier preview of the schema.
ALTER TABLE public.civic_project_research_submissions
  ADD COLUMN IF NOT EXISTS question_key text;

-- Short-lived, unreviewed search results reduce duplicate web searches. This
-- table has no public read policy; only server-side service-role calls use it.
CREATE TABLE IF NOT EXISTS public.civic_project_research_cache (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_slug       text NOT NULL REFERENCES public.civic_projects (slug) ON DELETE CASCADE,
  question           text NOT NULL CHECK (char_length(question) BETWEEN 8 AND 300),
  question_key       text NOT NULL,
  answer             text NOT NULL CHECK (char_length(answer) BETWEEN 20 AND 5000),
  sources            jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) > 0),
  searched_at        timestamptz NOT NULL,
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_slug, question_key)
);

CREATE INDEX IF NOT EXISTS civic_project_records_project_date_idx
  ON public.civic_project_records (project_slug, happened_on DESC);
CREATE INDEX IF NOT EXISTS civic_project_research_review_idx
  ON public.civic_project_research_submissions (status, submitted_at);
CREATE INDEX IF NOT EXISTS civic_project_research_question_idx
  ON public.civic_project_research_submissions (project_slug, question_key, status);
CREATE INDEX IF NOT EXISTS civic_project_research_cache_expiry_idx
  ON public.civic_project_research_cache (project_slug, expires_at DESC);

ALTER TABLE public.civic_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_project_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_project_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_project_research_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_project_research_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS civic_projects_public_read ON public.civic_projects;
CREATE POLICY civic_projects_public_read ON public.civic_projects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS civic_project_areas_public_read ON public.civic_project_areas;
CREATE POLICY civic_project_areas_public_read ON public.civic_project_areas
  FOR SELECT USING (true);

DROP POLICY IF EXISTS civic_project_records_public_read ON public.civic_project_records;
CREATE POLICY civic_project_records_public_read ON public.civic_project_records
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS civic_project_research_public_read ON public.civic_project_research_submissions;
CREATE POLICY civic_project_research_public_read ON public.civic_project_research_submissions
  FOR SELECT USING (status = 'published');

GRANT SELECT ON public.civic_projects, public.civic_project_areas, public.civic_project_records
  TO anon, authenticated;

-- Research submissions also hold moderation and abuse-prevention fields
-- (review_note, submitter_ip_hash, question_key, searched_at) that must not be
-- publicly readable, even on published rows. Supabase's default privileges
-- grant ALL on new public tables to anon and authenticated, so a column GRANT
-- alone would not narrow access: revoke table privileges (which also revokes
-- any column privileges), then grant only the public record columns. The anon
-- read path in apps/web/lib/civic-projects-server.ts selects, filters and
-- orders on exactly these columns; server routes use the service role.
REVOKE ALL ON public.civic_project_research_submissions FROM anon, authenticated;
GRANT SELECT (id, project_slug, question, answer, sources, status, submitted_at, reviewed_at)
  ON public.civic_project_research_submissions TO anon, authenticated;

-- Unreviewed cached search results are read and written by the service role only.
REVOKE ALL ON public.civic_project_research_cache FROM anon, authenticated;

INSERT INTO public.civic_projects (
  slug, city_id, title, project_type, owner_agency, status, summary, latest_as_of
) VALUES (
  'varthur-gunjur-road',
  'bengaluru',
  'Varthur–Gunjur road corridor',
  'Road widening + elevated corridor',
  'Karnataka Road Development Corporation Limited (KRDCL)',
  'delayed',
  'A widening and elevated-corridor project whose scope, cost and completion date have changed repeatedly.',
  DATE '2026-08-11'
) ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  project_type = EXCLUDED.project_type,
  owner_agency = EXCLUDED.owner_agency,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  latest_as_of = EXCLUDED.latest_as_of,
  updated_at = now();

INSERT INTO public.civic_project_areas (
  project_slug, boundary_system, corporation_id, ward_no, ward_name, relationship
) VALUES
  ('varthur-gunjur-road', 'gba-369-2025', 3, 40, 'Varthur', 'affected'),
  ('varthur-gunjur-road', 'gba-369-2025', 3, 50, 'Gunjur', 'affected')
ON CONFLICT (project_slug, boundary_system, ward_name) DO UPDATE SET
  corporation_id = EXCLUDED.corporation_id,
  ward_no = EXCLUDED.ward_no,
  relationship = EXCLUDED.relationship;
