-- Count only successfully inserted unique votes. Legacy clients insert directly
-- and then call increment_fact_counter; the trigger covers those inserts too.
CREATE OR REPLACE FUNCTION public.count_inserted_fact_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.vote_type NOT IN ('corroborate', 'dispute') THEN
    RAISE EXCEPTION 'Invalid vote type' USING ERRCODE = '22023';
  END IF;

  UPDATE public.community_facts
  SET corroboration_count = corroboration_count + CASE
        WHEN NEW.vote_type = 'corroborate' THEN 1 ELSE 0 END,
      dispute_count = dispute_count + CASE WHEN NEW.vote_type = 'dispute' THEN 1 ELSE 0 END
  WHERE id = NEW.fact_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER count_inserted_fact_vote
AFTER INSERT ON public.fact_votes
FOR EACH ROW EXECUTE FUNCTION public.count_inserted_fact_vote();

-- Ignore caller-supplied totals while preserving legacy INSERT payloads and
-- their returned initial count. The matching vote is recorded in the same
-- transaction, so a later vote is never exempted merely because its token
-- matches contributor_token.
CREATE OR REPLACE FUNCTION public.initialize_fact_counts()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.corroboration_count := CASE
    WHEN NEW.contributor_token IS NOT NULL AND length(trim(NEW.contributor_token)) > 0 THEN 1 ELSE 0 END;
  NEW.dispute_count := 0;
  RETURN NEW;
END;
$$;

CREATE TRIGGER initialize_fact_counts
BEFORE INSERT ON public.community_facts
FOR EACH ROW EXECUTE FUNCTION public.initialize_fact_counts();

CREATE OR REPLACE FUNCTION public.record_fact_creator_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.contributor_token IS NOT NULL AND length(trim(NEW.contributor_token)) > 0 THEN
    -- This narrowly scoped insert bypasses the separate votes RLS limit; fact
    -- insertion still obeys its own RLS policy. A failure rolls back the fact.
    INSERT INTO public.fact_votes (fact_id, vote_type, voter_token)
    VALUES (NEW.id, 'corroborate', NEW.contributor_token);
    -- The vote trigger incremented the already initialized creator count.
    UPDATE public.community_facts SET corroboration_count = corroboration_count - 1 WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_fact_creator_vote
AFTER INSERT ON public.community_facts
FOR EACH ROW EXECUTE FUNCTION public.record_fact_creator_vote();

-- Old clients still call this after inserting. Counting again would double count;
-- keeping the signature avoids breaking clients already in the field.
CREATE OR REPLACE FUNCTION public.increment_fact_counter(p_fact_id integer, p_column text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.cast_fact_vote(p_fact_id integer, p_vote_type text, p_voter_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  inserted_id bigint;
  fact public.community_facts%ROWTYPE;
BEGIN
  IF p_vote_type NOT IN ('corroborate', 'dispute') OR p_vote_type IS NULL
     OR p_voter_token IS NULL OR length(trim(p_voter_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid vote' USING ERRCODE = '22023';
  END IF;

  -- RLS checks an attempted insert before ON CONFLICT, so an existing vote
  -- must be detected before trying to insert when the token is at its limit.
  IF NOT EXISTS (SELECT 1 FROM public.fact_votes
                 WHERE fact_id = p_fact_id AND voter_token = p_voter_token) THEN
    BEGIN
      INSERT INTO public.fact_votes (fact_id, vote_type, voter_token)
      VALUES (p_fact_id, p_vote_type, p_voter_token)
      ON CONFLICT (fact_id, voter_token) DO NOTHING
      RETURNING id INTO inserted_id;
    EXCEPTION WHEN insufficient_privilege THEN
      -- A concurrent request may have inserted this vote after the precheck.
      -- Suppress a policy error only if that exact vote is now visible.
      IF NOT EXISTS (SELECT 1 FROM public.fact_votes
                     WHERE fact_id = p_fact_id AND voter_token = p_voter_token) THEN
        RAISE;
      END IF;
    END;
  END IF;

  SELECT * INTO STRICT fact FROM public.community_facts WHERE id = p_fact_id;
  RETURN jsonb_build_object(
    'ok', true, 'already_voted', inserted_id IS NULL,
    'corroboration_count', fact.corroboration_count,
    'dispute_count', fact.dispute_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cast_fact_vote(integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_fact_vote(integer, text, text) TO anon, authenticated, service_role;

-- Qualify the outer row: the previous self-comparison imposed a global cap.
-- SELECT uses the existing read_votes policy, avoiding a recursive insert check.
DROP POLICY IF EXISTS insert_votes ON public.fact_votes;
CREATE POLICY insert_votes ON public.fact_votes FOR INSERT TO anon
WITH CHECK ((
  SELECT count(*) FROM public.fact_votes AS recent_vote
  WHERE recent_vote.voter_token = fact_votes.voter_token
    AND recent_vote.created_at > now() - interval '1 hour'
) < 20);
