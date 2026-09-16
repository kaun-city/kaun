# BMTC stops

`public.bmtc_stops` holds BMTC bus stops from the opencity.in package
[BMTC Bus Stops and Routes Map by Ward](https://data.opencity.in/dataset/c4d9efee-e13b-4fe9-b5db-ce034a153e55).
Its 28 per-constituency CSVs list one row per (polling booth, nearby stop)
pair, so a stop near several booths appears several times. The original
one-off load kept every pair: 42,529 rows for 2,972 physical stops. Because
`ward_infra_stats` joined signals and stops in one query, it also reported
37,818 stops and 207,824,182 daily trips across wards instead of 1,813 and
858,416.

Migration `20260917_bmtc_stops_dedup.sql` fixes the data:

| Object | After the migration |
| --- | --- |
| `bmtc_stops` | One row per `(city_id, stop_name, lat, lng)`, enforced by the unique index `bmtc_stops_physical_key`. The lowest `id` survives. `boothcode` is always NULL. `assembly_constituency` and `ac_number` are set only when all of the stop's booths are in one constituency (1,969 stops). Otherwise they are NULL (1,003 stops). |
| `bmtc_stop_booths` | New, public-read table. It has one row per distinct `(stop_id, boothcode)` (39,687 rows), with the booth's constituency. |
| `ward_infra_stats` | Signals and stops are counted in separate per-ward subqueries. A stop with NULL trips counts as a stop and adds no trips, which is how `ward_bus_stops` was built. Bus figures now equal `ward_bus_stops` for all 237 wards it lists. |
| `refresh_ward_infra_stats()` | Refreshes the view. Only the service role can run it. |

The migration checks its inputs first. It stops if a stop's rows disagree on
trips or routes, or if a constituency label doesn't match its booth code. After
the rewrite, it stops if any stop is still duplicated or if the view disagrees
with `ward_bus_stops`. Any of these errors rolls back the whole migration.

Two file titles were stored as constituency names:

- `Mahalakshmi Layout - AC - Stops with Number of Trips` (2,948 rows)
- `BMTC Stops with Location and Routes` (300 rows)

The migration reads these rows' constituency from the booth code. A booth code
is `29`, then the 3-digit constituency number, then the part number.

## Rollout

Run these steps in order. The first two never write to production.

1. **Plan**: `node scripts/bmtc/dedup-bmtc-stops.mjs`. This makes read-only
   anon GETs and applies the migration's rules in JavaScript. It prints rows
   before and after, the booth links kept, the constituency changes, each
   ward's figures before and after, and the check against `ward_bus_stops`. It
   exits 1 if the migration would refuse the data or fail its checks.
2. **Rehearse** against production. This needs a Supabase personal access token:

   ```powershell
   $env:SUPABASE_ACCESS_TOKEN = '<personal access token>'
   node scripts/bmtc/dedup-bmtc-stops.mjs --rehearse
   Remove-Item Env:SUPABASE_ACCESS_TOKEN
   ```

   The script sends the migration as `BEGIN; <migration>; <block that always
   raises>`. Nothing can commit. The counts after the migration come back in
   the final error. For a few seconds the run locks `bmtc_stops` and
   `ward_infra_stats`, so reads of the view wait.
3. **Apply** through the documented migration path in
   [local-database.md](local-database.md#production-rollout-pr-129):
   `migration repair` for versions that are already live, then
   `db push --dry-run`, which must list only pending versions ending in
   `20260917`. Then run `db push`. The Supabase CLI runs each migration file
   as one transaction.
4. **Verify**: run the plan again. It should report `already one row per stop`
   and show the live `ward_infra_stats` matching `ward_bus_stops`.

On macOS or Linux, use `export SUPABASE_ACCESS_TOKEN=...` and
`unset SUPABASE_ACCESS_TOKEN` instead of the PowerShell lines.

## Local database and the seed

`npm run db:reset` applies migrations to an empty database, then loads the
production-derived seed. A seed synced before production ran this migration
still holds the 42,529 duplicate rows, which would break the new unique index.

Because of that, the migration is listed in `seedReplayedMigrations` in
`scripts/local-db/shared.mjs`. The seed load does three things in one
transaction:

1. Drops `bmtc_stops_physical_key`.
2. Loads the seed.
3. Runs `RESET ALL` and replays the migration.

With an old seed, the replay collapses the duplicates, checks the result
against `ward_bus_stops`, and recreates the index. That makes a local reset a
full rehearsal against real data. With a seed synced after production migrated,
the replay changes nothing and skips the `ward_bus_stops` check. The replay
also refreshes `ward_infra_stats`, which data-only seeds never populate.
`tests/local-db.test.mjs` checks this ordering. It also checks that a replayed
migration has no transaction control and only drops indexes it recreates.

## Reloading from the source

`scripts/bmtc/ingest-bmtc-stops.mjs` replaces the one-off load.

- **Dry run (default)**: checks the package's 29 CSVs against the pinned list,
  stopping if any file was added, removed, renamed or moved. It then parses
  the files, collapses them to stops and booth links, flags stops whose rows
  disagree, and diffs the result against the current tables using anon reads.
  On 2026-09-16 the source matched production exactly after collapsing: 0
  stops to add, remove or update, and 0 booth links to add or remove.
- **`--apply`**: needs `SUPABASE_SERVICE_ROLE_KEY` and refuses to run until
  this migration is live. It upserts stops on the physical key, adds new booth
  links and deletes stale ones, then calls `refresh_ward_infra_stats()`. If the
  source dropped any stops, add `--prune` to delete them.

`ward_bus_stops` is a static table, and the ingest does not rebuild it. After a
reload that changes stops, `ward_infra_stats` and `ward_bus_stops` will
legitimately differ.
