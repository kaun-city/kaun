-- Trigger functions are invoked by PostgreSQL, not as public RPCs. Existing
-- triggers remain enabled; service_role retains its existing grant.
REVOKE EXECUTE ON FUNCTION public.count_inserted_fact_vote() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_fact_creator_vote() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
