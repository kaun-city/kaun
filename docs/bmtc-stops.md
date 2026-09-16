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
| `ward_bus_stops` | Was a static table with no loader. It is now a view over `ward_infra_stats` with the same columns and types (`ward_no integer`, `stop_count integer`, `total_trips bigint`). It has one row per ward with at least one stop (237 wards), as the table did. `anon`, `authenticated` and `service_role` can only read it. The app, `/api/data/wards`, `/api/export` and Ask Kaun read bus figures only from here. |

The migration checks its inputs first. It stops if a stop's rows disagree on
trips or routes, or if a constituency label doesn't match its booth code. After
the rewrite, it stops if any stop is still duplicated or if the view disagrees
with `ward_bus_stops`. Any of these errors rolls back the whole migration.

Only after those checks does `ward_bus_stops` change. The migration renames the
table, creates the view, and compares the two row for row. It drops the table
only if the view serves every row the table did, with the same figures, and no
others. Otherwise it stops, and the whole migration rolls back. The public
figures therefore stay the same when the table is swapped for the view, and a
later reload changes the two together.

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
   the final error. The script copies the published `ward_bus_stops` rows
   first. The counts include `ward_bus_stops_relkind` (`v` once the table is
   a view) and `wards_disagreeing` (rows the view serves differently from
   that copy). For a few seconds the run locks `bmtc_stops`,
   `ward_infra_stats` and `ward_bus_stops`, so reads of them wait.
> **Applied to production on 16 Sep 2026** through the SQL editor in one
> transaction: 39,557 duplicate rows removed (42,529 → 2,972 stops), 39,687
> booth links kept, `ward_bus_stops` is now a view (237 wards, 1,813 stops,
> 858,416 trips, matching `ward_infra_stats`), and the plan re-runs clean.

3. **Apply** through the documented migration path in
   [local-database.md](local-database.md#production-rollout-pr-129):
   `migration repair` for versions that are already live, then
   `db push --dry-run`, which must list only pending versions ending in
   `20260917`. Then run `db push`. The Supabase CLI runs each migration file
   as one transaction.
4. **Verify**: run the plan again. It should report `already one row per stop`
   and show the live `ward_bus_stops` matching `ward_infra_stats`.

On macOS or Linux, use `export SUPABASE_ACCESS_TOKEN=...` and
`unset SUPABASE_ACCESS_TOKEN` instead of the PowerShell lines.

## Local database and the seed

`npm run db:reset` applies migrations to an empty database, then loads the
production-derived seed. A seed synced before production ran this migration
still holds the 42,529 duplicate rows, which would break the new unique index.

Such a seed also holds `ward_bus_stops` rows, and those rows can't be copied
into the view the migration leaves behind. Because of that, the migration is
listed in `seedReplayedMigrations` in `scripts/local-db/shared.mjs`. The seed
load does three things in one transaction:

1. Drops `bmtc_stops_physical_key`. It also drops the `ward_bus_stops` view and
   puts back an empty table with the baseline's columns.
2. Loads the seed.
3. Runs `RESET ALL` and replays the migration.

With an old seed, the replay collapses the duplicates and checks the result
against the seed's `ward_bus_stops` rows. It then recreates the index and swaps
the table for the view, checked row for row. That makes a local reset a full
rehearsal against real data. With a seed synced after production migrated, the
dump has no `ward_bus_stops` rows, because a view has no data. The replay
changes no stops, skips both `ward_bus_stops` checks, and recreates the view.
The replay also refreshes `ward_infra_stats`, which data-only seeds never
populate. `tests/local-db.test.mjs` checks this ordering. It also checks that
a replayed migration has no transaction control. Its `beforeSeed` may only
drop indexes the replay recreates, or put back the table that a view from the
replay replaces.

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

`ward_bus_stops` is a view over `ward_infra_stats`, so that refresh updates
every surface that shows bus figures: the ward sheet, `/api/data/wards`,
`/api/export` and Ask Kaun. No other step is needed.
