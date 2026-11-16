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
        -- Fact creation already counts its contributor before inserting this row.
        WHEN NEW.vote_type = 'corroborate' AND contributor_token IS DISTINCT FROM NEW.voter_token THEN 1 ELSE 0 END,
      dispute_count = dispute_count + CASE WHEN NEW.vote_type = 'dispute' THEN 1 ELSE 0 END
  WHERE id = NEW.fact_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER count_inserted_fact_vote
AFTER INSERT ON public.fact_votes
FOR EACH ROW EXECUTE FUNCTION public.count_inserted_fact_vote();

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

  INSERT INTO public.fact_votes (fact_id, vote_type, voter_token)
  VALUES (p_fact_id, p_vote_type, p_voter_token)
  ON CONFLICT (fact_id, voter_token) DO NOTHING
  RETURNING id INTO inserted_id;

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
