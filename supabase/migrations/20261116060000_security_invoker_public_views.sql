-- Respect the caller's table permissions and RLS for public data views.
-- Rollback: ALTER VIEW ... SET (security_invoker = false) for each view.
ALTER VIEW public.v_work_orders_243 SET (security_invoker = true);
ALTER VIEW public.v_in_central_project_changes SET (security_invoker = true);
ALTER VIEW public.v_in_central_project_staleness SET (security_invoker = true);

-- Spatial reference definitions remain readable by PostGIS users, but are not
-- writable by public API roles. PostGIS owns this extension-managed table.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.spatial_ref_sys FROM PUBLIC, anon, authenticated;
