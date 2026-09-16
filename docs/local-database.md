# Local Supabase database

Kaun can run against a private local duplicate of its hosted Supabase database.
This is the preferred place to apply and test migrations before production.
The local stack preserves PostgreSQL, PostGIS, PostgREST, RPC functions, grants,
and row-level security; a plain PostgreSQL container is not an equivalent test.

## One-time bootstrap

Prerequisites: Node 20+, Docker Desktop, and a hosted Supabase PostgreSQL
connection string. Start Docker Desktop, then from the repository root:

```powershell
$env:KAUN_REMOTE_DB_URL = '<percent-encoded Supabase connection string>'
npm run db:sync
npm run db:start
```

`db:sync` creates the missing full-schema baseline and a data seed. The schema
baseline is safe to review and commit. The data seed is stored at
`supabase/.local/seed.sql`, is git-ignored, and excludes user questions,
precise civic-report locations, community submissions, research submissions,
analytics and rate-limit records.

`db:start` starts the local Supabase services and writes local API credentials
to `apps/web/.env.local`. Restart `npm run dev` after switching the database.
Supabase Studio is available at <http://127.0.0.1:54323>.

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

## Switching back to hosted Supabase

Run `npm run db:use-hosted` and restart Next.js. Kaun's existing hosted public
defaults will be used.

The workflow follows Supabase's documented local-development model: schema in
migrations, development data in seed files, and a local Docker-backed stack.
