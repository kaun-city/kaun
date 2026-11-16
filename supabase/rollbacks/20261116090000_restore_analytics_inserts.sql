-- Compatibility rollback: restores the previous anonymous insert policy.
BEGIN;
GRANT INSERT ON public.analytics_events TO anon, authenticated;
DROP POLICY IF EXISTS "Allow anon inserts" ON public.analytics_events;
CREATE POLICY "Allow anon inserts" ON public.analytics_events FOR INSERT TO anon WITH CHECK (true);
COMMIT;
