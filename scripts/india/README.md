# scripts/india — national layer pipelines

Adapters for the "Kaun for India" tables (`in_*`). Schema and rationale:
[docs/design-india-schema.md](../../docs/design-india-schema.md).

Every loader is **dry-run by default**. Run one with no flags and it extracts,
transforms, prints a summary and writes a JSON report to `.artifacts/india/` —
and writes nothing to any database. `--apply` is the only way to write, and it
refuses to run without credentials in the environment.

| Script | Table(s) | Source | Cadence |
|---|---|---|---|
| `seed-constituencies.mjs` | `in_constituencies` | `data/pc-crosswalk/` + DataMeet + shijithpk 2024 | once per delimitation |
| `sansad-roster.mjs` | `in_mps` | sansad.in `api_ls` / `api_rs` + PRS MP Track | weekly |
| `mp-activity.mjs` | `in_mp_activity` | sansad.in live + Zenodo backfill + PRS CSV | weekly (with the roster) |
| `myneta-affidavits.mjs` | `in_mp_affidavits` | myneta.info candidate pages | manual dispatch only |
| `esakshi-mplads.mjs` | `in_mplads_summary` | eSAKSHI (+ Empowered Indian) | monthly |
| `load-central-projects.mjs` | `in_central_projects(+_snapshots)` | MoSPI PAIMANA flash report PDFs | monthly |
| `mospi/parse_flash_report.py` | — (parse step only) | MoSPI Table 6 PDF → JSON | called by the loader |
| `load-aliases.mjs` | `in_pc_source_aliases` | `data/india/pc-source-aliases.csv` (human-reviewed) | when a decision is committed |
| `load-affidavit-review.mjs` | `in_mp_affidavits` (review flag only) | `data/india/affidavit-review.csv` (human-reviewed) | when a decision is committed |
| `merge-ocms-identities.mjs` | `in_central_projects(+_snapshots)` (deletes) | `data/india/ocms-identity-merges.csv` (human-reviewed) | one-off; re-runnable, no-op once merged |

## The rule every one of these must follow

No loader may resolve a constituency by name similarity. Resolution goes
through `lib/pc-code.mjs` (`resolvePc`) and `lib/pc-reference.mjs`
(`PcReference.resolve`): the alias table first, then an exact match on the
normalized name within a state. Anything unresolved is written to a review file
as a proposed `in_pc_source_aliases` row — never guessed. Same discipline as the
ward crosswalk's "deterministic overlap, no name matching".

**States follow the same rule through `classifyState` in `lib/pc-reference.mjs`**
— the committed `data/india/state-aliases.csv` first, then MoSPI's multi-state
wording, then an exact match on `stateKey()`. Normalising a state name folds
case, punctuation, `&`/`and` and *word breaks* (`MAHARASHT RA` is a printed line
wrap, not a spelling), and nothing else. A changed, missing or extra letter is
never tolerated: `CHHATISGARH` needs an alias row with a written reason, and
gets one. `classifyState` also says *why* a state is NULL —
`no_state_printed` / `not_a_state` / `multi_state` / `no_exact_state_match` —
because "the source printed none" and "we could not read it" are different
admissions and only the second is a bug.

Each run's review files land next to the report:

```
.artifacts/india/<loader>.dry-run.json              what it would write
.artifacts/india/<loader>.summary.json              counters + warnings
.artifacts/india/<loader>.review-<name>.{json,csv}  rows a human must decide on
```

The CSV columns for an alias candidate are deliberately blank where a decision
belongs (`pc_code`, `method`, `reviewed_by`).

## The review loop

A review file is not a dead end. The decision a human writes into it is
committed under `data/india/` and carried back into the database by exactly one
loader, which validates and never decides:

| Committed decision file | Loader | What it unblocks |
|---|---|---|
| `data/india/pc-source-aliases.csv` | `load-aliases.mjs` | a source's constituency id → `pc_code` |
| `data/india/state-aliases.csv` | read directly by `lib/pc-reference.mjs` | a source's state label → `st_code`, or an explicit "not a state" |
| `data/india/affidavit-review.csv` | `load-affidavit-review.mjs` | `in_mp_affidavits.needs_review`, which RLS uses to keep an uncorroborated affidavit private |
| `data/india/ocms-identity-merges.csv` | `merge-ocms-identities.mjs` | collapsing the duplicate `ocms:` project identities a truncated read minted |

All of them refuse to write a row whose `reviewed_by` is blank. Those files are
committed unsigned on purpose — filling `reviewed_by` in is the sign-off.
`merge-ocms-identities.mjs` is the only one that DELETES, so it also re-verifies
every pair against the live table and refuses the whole run on any disagreement.

## Order of operations

`seed-constituencies.mjs` must run first — every other table has an FK to
`in_constituencies.pc_code`. `sansad-roster.mjs` must run before
`mp-activity.mjs`, `esakshi-mplads.mjs` and `myneta-affidavits.mjs`, which need
`in_mps.id`. `seed-constituencies.mjs` reads the committed `data/pc-crosswalk/`
artifact and degrades gracefully (loud warning, no write) if it is absent.

## lib/

| Module | What it owns |
|---|---|
| `pc-code.mjs` | the canonical `pc_code` key and conservative name normalization |
| `pc-reference.mjs` | the 543-seat reference (database, else the crosswalk artifact), state-name folding, and the one sanctioned `resolve()` |
| `sink.mjs` | the write path: dry-run / local-Postgres / Supabase, idempotent upserts, duplicate collapsing, review files |
| `http.mjs` | polite fetch — Kaun UA, per-host delay, bounded retries, on-disk cache |
| `xlsx.mjs` | a dependency-free .xlsx reader for the Zenodo bulk export |
| `cli.mjs` | flag parsing and the `--apply` gate |

## Running one locally

```bash
# dry run, no credentials needed — resolves against data/pc-crosswalk/
node scripts/india/sansad-roster.mjs

# integration test against a throwaway local Postgres (never a remote host)
KAUN_LOCAL_PG="postgres://you@127.0.0.1:5432/kaun_india_test" \
  node scripts/india/sansad-roster.mjs --apply
```

`KAUN_LOCAL_PG` refuses any host that is not localhost. It exists so the
loaders can be proven end to end before the schema is applied anywhere real.

The MoSPI loader additionally needs Python:

```bash
pip install -r scripts/india/mospi/requirements.txt
node scripts/india/load-central-projects.mjs --latest
```

Responses and downloaded PDFs are cached under `.cache/india/` (git-ignored), so
re-running a dry-run costs the upstream source nothing.
