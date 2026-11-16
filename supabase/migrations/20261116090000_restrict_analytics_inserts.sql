-- Tracking writes are performed by /api/track using the service role.
DROP POLICY IF EXISTS "Allow anon inserts" ON public.analytics_events;
REVOKE INSERT ON public.analytics_events FROM PUBLIC, anon, authenticated;
