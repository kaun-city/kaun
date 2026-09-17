# Local Supabase database

Kaun can run against a private local duplicate of its hosted Supabase database.
This is the preferred place to apply and test migrations before production.
The local stack preserves PostgreSQL, PostGIS, PostgREST, RPC functions, grants,
and row-level security; a plain PostgreSQL container is not an equivalent test.

## One-time bootstrap

Prerequisites: Node 20.11+ (scripts use `import.meta.dirname`), Docker Desktop, and a hosted Supabase PostgreSQL
connection string. Start Docker Desktop, then from the repository root:

```powershell
$env:KAUN_REMOTE_DB_URL = '<percent-encoded Supabase connection string>'
npm run db:sync
npm run db:start
```

`db:sync` creates the missing full-schema baseline and a data seed. The schema
baseline is safe to review and commit. The data seed is stored at
`supabase/.local/seed.sql`, is git-ignored, and excludes user questions,
precise civic-report locations, community facts and their votes, research
submissions (with review notes and submitter IP hashes), the research cache
and analytics. Tables whose rows are inserted by migrations (`civic_projects`,
`civic_project_areas`) are also excluded, so the seed never duplicates them.
The connection password is passed to the Supabase CLI through `PGPASSWORD`,
not on the command line.

Some migrations rewrite production rows instead of only changing schema. Until
production runs one of these, a newly synced seed still has the old rows. They
are listed in `seedReplayedMigrations` in `scripts/local-db/shared.mjs`. The
seed load relaxes what each one adds (or puts back a table it replaces with a
view), loads the seed, and replays the migration in the same transaction. A local reset then ends in the migrated shape whether
the seed was synced before or after production ran the migration. So far the
only such migration is `20260917_bmtc_stops_dedup.sql`; see
[bmtc-stops.md](bmtc-stops.md).

`db:start` starts the local Supabase services and writes local API credentials
to `apps/web/.env.local`. Restart `npm run dev` after switching the database.
Before `db:start`, `db:reset` or `db:use-hosted` changes that file, the previous
copy is saved to `supabase/.local/env-backups/` (git-ignored, owner-only: mode
0600 on macOS/Linux, an ACL granting only your account on Windows) and the path
is printed. If the copy cannot be restricted, it is deleted and the switch
stops. Supabase Studio is available at <http://127.0.0.1:54323>.

`[db.network_restrictions]` in `supabase/config.toml` applies only to hosted
projects and stays disabled; it does not limit who can reach the local
containers' published ports, so run the local stack on a trusted network.

## Why the baseline is dated 20260505

`20260505_remote_schema.sql` is a September 2026 dump of the live public
schema, placed immediately after PostGIS so it is the earliest migration that
already contains everything live. Later-dated migrations whose effect is
already in the dump must replay as no-ops: `20260506` is kept as an empty
placeholder (its primary-key swap never matched production), and `20260910`
recreates a `pin_lookup` byte-identical to the dump. Keeping the version files
rather than deleting them keeps local and production migration history
aligned, and `tests/local-db.test.mjs` fails if a replay would diverge.

## Daily workflow

```powershell
npm run db:doctor  # check Docker, CLI, schema and seed
npm run db:start   # start/resume the local stack
npm run db:reset   # rebuild from baseline + migrations + local seed
npm run db:status  # show local URLs and credentials
npm run db:stop    # stop containers; local data is retained
npm run db:use-hosted # remove local DB credentials from the web app
```

To refresh public civic data from hosted Supabase without changing the schema:

```powershell
$env:KAUN_REMOTE_DB_URL = '<connection string>'
npm run db:sync
npm run db:reset
```

The committed baseline is intentionally not overwritten during routine syncs.
Use `node scripts/local-db/sync-remote.mjs --refresh-schema` only when deliberately
rebasing the full schema, review the resulting diff, and never use
`supabase db reset --linked` against production.

## Production rollout (PR #129)

**Status (16 Sep 2026): done.** `20260915`, `20260916` and `20260917` were
applied to production through the Supabase SQL editor, each file wrapped in
one `BEGIN … COMMIT` transaction, and verified with read-only checks. The
matching data backfills from [data-quality-2026-09.md](data-quality-2026-09.md)
were applied the same day and re-ran with 0 pending changes.

Production still has no Supabase CLI migration history, so `supabase db push`
would try to run every file, including the full schema dump. Before any future
push, record every already-live version first. Keep the password out of the
command line:

```bash
export PGPASSWORD='<database password>'
url='<Session pooler URI without the password>'
npx supabase migration list --db-url "$url"      # read-only: expect no remote versions
npx supabase migration repair --status applied 20260504 20260505 20260506 20260910 20260915 20260916 20260917 --db-url "$url"
npx supabase db push --dry-run --db-url "$url"   # must list only versions added after 20260917
unset PGPASSWORD
```

`20260918_cron_runs.sql` (the scheduled-job heartbeat) is pasted into the SQL
editor separately. Once it is live, add `20260918` to the repair list above and
expect the dry run to list only versions after it.

`repair` only records versions that are already live; it runs none of their
SQL. On Windows PowerShell use `$env:PGPASSWORD = '…'` and
`Remove-Item Env:PGPASSWORD`.

## Switching back to hosted Supabase

Run `npm run db:use-hosted` and restart Next.js. Kaun's existing hosted public
defaults will be used.

The workflow follows Supabase's documented local-development model: schema in
migrations, development data in seed files, and a local Docker-backed stack.
