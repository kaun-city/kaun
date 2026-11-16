# Private ward infrastructure materialization

The migration moves the existing materialized view and its index, without a
refresh or data rebuild, into `kaun_private`. `public.ward_infra_stats` remains
a view with the same five columns. Both it and `public.ward_bus_stops` run as
security invoker; the API roles therefore need USAGE on `kaun_private` and
SELECT on its materialized view. The schema name means not exposed through the
Data API, not inaccessible to someone with direct database role access. It
must not be added to the PostgREST exposed schemas. Neither public view bypasses
RLS via its owner. This migration does not change source-table RLS.

The browser ward card reads `ward_infra_stats`; Ask Kaun, ward data and CSV
export read its signal count, while bus counts come from `ward_bus_stops`.
The BMTC loader calls `refresh_ward_infra_stats()` as service_role after its
writes. That function now refreshes the moved materialization; anon and
authenticated cannot call it. No other refresh caller was found in the repo;
external SQL jobs and clients must be inventoried separately. Changing source
rows directly still requires an explicit refresh. A schema move preserves OID,
so existing view dependencies follow the materialization; the migration
explicitly rebinds `ward_bus_stops` through the public wrapper.

The old BMTC migration and its rehearsal expect the former public materialized
view and must not be re-run on the new shape. Local seed loading temporarily
restores that shape in its seed transaction, replays the old migration and
reapplies this migration. If any step fails the seed transaction rolls back.

## Before a separately authorized hosted rollout

This repo is not evidence of the hosted schema or exposed-schema settings.
Read the advisor and hosted configuration; ensure `kaun_private` is not exposed
or already in use. Compare hosted `pg_get_viewdef`, column names/types,
materialized view owner and grants, index definitions, dependent views and
functions, refresh-function definition and owner, and any external scheduled
refresh jobs with the repo. Check role memberships and effective privileges;
`anon` and `authenticated` must not have CREATE on the new schema. Review any
extra dependencies or custom grants individually: moving the original object
retains its OID and unmentioned grantees, while the new wrapper receives only
explicit API-role grants. Do not proceed on drift or unreviewed API consumers.
Check PostgREST schema caching and any client reliance on materialized-view
metadata, embedding or direct REFRESH. Run with a single transaction and a
short lock timeout; concurrent readers or refreshes can delay the DDL. The SQL
notifies PostgREST on commit, but verify reload and actual API behavior.

Rehearse on a disposable local Supabase duplicate with representative data and
real PostGIS: compare all rows and types from both public endpoints as anon,
authenticated and service_role; test filters, ordering and single-row reads;
change fixture source rows and invoke the service-role refresh; confirm both
endpoints update, anon refresh is denied, and the private schema has no REST
endpoint. Run the full seed/reset workflow and the advisor. The local PostgREST rehearsal uses a small PostGIS fixture and the official
PostgREST executable supplied through `KAUN_POSTGREST_BIN`. It does not prove
hosted configuration, full Supabase reset/seed, or advisor behavior.

The accompanying rollback SQL was tested locally against the reviewed
baseline. Rollback must be separately reviewed against the actual state. In one
transaction, restore the prior `ward_bus_stops` definition only after moving
its dependency back: drop `ward_bus_stops` and the public wrapper, move the
materialized view to public, recreate `ward_bus_stops` and its prior grants,
restore the prior refresh function and grants, then drop the empty private
schema and notify PostgREST. Capture original definitions, comments, privileges
and other dependencies before rollout; unexpected dependencies can block the
rollback and must not be removed with CASCADE. Verify reads and refresh after
rollback. Do not use Supabase db push against hosted until migration history is
reconciled.
