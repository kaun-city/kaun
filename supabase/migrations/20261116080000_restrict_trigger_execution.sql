-- Trigger functions are invoked by PostgreSQL, not as public RPCs. Existing
-- triggers remain enabled; service_role retains its existing grant.
REVOKE EXECUTE ON FUNCTION public.count_inserted_fact_vote() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_fact_creator_vote() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Public read RPCs can use the caller's table grants and row security.
ALTER FUNCTION public.property_tax_by_ac(text) SECURITY INVOKER;
ALTER FUNCTION public.recent_activity(integer) SECURITY INVOKER;
ALTER FUNCTION public.ward_profile(integer,text,text) SECURITY INVOKER;
ALTER FUNCTION public.ward_unknowns(integer,text) SECURITY INVOKER;
