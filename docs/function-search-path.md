# Function search path migration

`20261116_function_search_path.sql` pins the 14 mutable application functions
in the committed baseline. It changes only their function-local configuration;
no bodies, grants, owners or data are changed. Most use unqualified public
relations; `gba_pin_lookup`, `lookup_local_offices` and `pin_lookup` also use
PostGIS functions or types in public. `pg_catalog` precedes public, and
`pg_temp` is last to prevent temporary relations shadowing public tables.
Already-pinned `rls_auto_enable`, `refresh_ward_infra_stats` and
`contractor_tender_wins` are outside this migration, as are extension-owned
functions. The hosted advisor and current hosted definitions were not available
for this review: the committed baseline is not proof of the live warning set.

## Before any production application

Use a read-only connection. Reconcile the hosted advisor's mutable-search-path
warnings and every listed signature and `pg_get_functiondef` with the reviewed
baseline and later migrations, especially `20260910` and `20260919`. Stop if a
body, overload, dependency or existing function configuration differs; evaluate
that function individually. Check that PostGIS is still in public:

```sql
SELECT e.extname, n.nspname FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'postgis';
SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
  ('ac_sakala_performance','budget_summary','gba_pin_lookup','increment_fact_counter',
   'lookup_local_offices','pin_lookup','police_station_phone','property_tax_by_ac',
   'recent_activity','top_pin_drop_wards','ward_profile','ward_stats_by_ac',
   'ward_tenders','ward_unknowns') ORDER BY 1;
SELECT n.nspname, COALESCE(r.rolname, 'PUBLIC') AS grantee, a.privilege_type
FROM pg_namespace n
CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public' AND a.privilege_type = 'CREATE';
SELECT rolname, has_schema_privilege(oid, 'public', 'CREATE') AS can_create
FROM pg_roles WHERE rolname IN ('anon', 'authenticated');
```

`public` must not be writable by PUBLIC, anon, authenticated, or any other
untrusted role, including via role membership. Check effective privileges for
other untrusted roles as well. If PostGIS has moved or public is writable by an
untrusted role, stop and revise the approach; fixing the path alone would not
be safe. Check extension-owned and additional live functions separately; do not
blindly alter all advisor results. The migration fails if an expected signature
is missing; apply it atomically through the approved deployment process only
once prerequisites and local checks pass. Do not use `supabase db push` on the
hosted project without reconciling its migration history (see local-database.md).

## Verify on a disposable local Supabase duplicate

Capture outputs and errors before and after for representative populated and
empty ward/profile, budget, activity, tax, police, tenders and spatial lookups,
including a point outside coverage. Exercise `increment_fact_counter` with both
valid columns and an invalid column against disposable fixture rows. Compare
results, grants, owner, security mode and bodies. Test as the applicable API
roles and try a temporary table named like an underlying public table; it must
not replace the public relation. Confirm all 14 `proconfig` entries contain the
fixed path, and inspect the security advisor for remaining warnings. Spatial
lookups need real PostGIS and representative geometry. After a separately
authorized production rollout, repeat read-only metadata/advisor and safe RPC
checks; do not mutate production data for verification. Rollback, if needed,
uses `ALTER FUNCTION <signature> RESET search_path` for each affected function;
first save the original `proconfig`, since RESET only restores an originally
unset path.

## Local investigation (16 Nov 2026)

A disposable PostgreSQL 18/PostGIS instance loaded the committed baseline and
latest versions of the two redefined functions. The migration set all 14 paths.
Empty-data results for the other 13 functions matched before and after, and a
shadow `city_budget` temporary table did not prevent `budget_summary` from
reading the public table. These are limited component checks, not populated,
role-based, PostgREST or hosted verification. The baseline `gba_pin_lookup`
failed both before and after: it refers to `gba_wards.corporation`, which the
committed table does not have. This migration does not repair that pre-existing
mismatch. Compare the hosted definition and schema and establish the intended
behavior before deciding whether to apply its ALTER; do not infer that the
spatial lookup works from the path change.
