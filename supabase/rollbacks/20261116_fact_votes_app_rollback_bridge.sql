-- Compatibility bridge for rolling the web app back, NOT a full schema revert.
-- Run transactionally by a privileged operator after the documented preflight.
-- Never delete vote rows or rewrite existing counters.
BEGIN;
LOCK TABLE public.community_facts, public.fact_votes IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF to_regprocedure('public.cast_fact_vote(integer,text,text)') IS NULL
     OR to_regprocedure('public.increment_fact_counter(integer,text)') IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
           AND ((c.relname = 'community_facts' AND t.tgname IN ('initialize_fact_counts','record_fact_creator_vote'))
             OR (c.relname = 'fact_votes' AND t.tgname = 'count_inserted_fact_vote'))) <> 3
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
                    WHERE schemaname = 'public' AND tablename = 'fact_votes'
                      AND policyname = 'read_votes' AND cmd = 'SELECT' AND qual = 'true'
                      AND ('public' = ANY(roles) OR 'anon' = ANY(roles))) THEN
    RAISE EXCEPTION 'Vote compatibility bridge missing or SELECT policy changed; stop and inspect';
  END IF;
END;
$$;
-- Legacy clients call this after insertion. The trigger already counted it.
CREATE OR REPLACE FUNCTION public.increment_fact_counter(p_fact_id integer, p_column text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN;
END;
$$;
-- Keep the repaired policy instead of restoring the former global cap.
DROP POLICY IF EXISTS insert_votes ON public.fact_votes;
CREATE POLICY insert_votes ON public.fact_votes FOR INSERT TO anon
WITH CHECK ((SELECT count(*) FROM public.fact_votes AS recent_vote
             WHERE recent_vote.voter_token = fact_votes.voter_token
               AND recent_vote.created_at > now() - interval '1 hour') < 20);
COMMIT;
