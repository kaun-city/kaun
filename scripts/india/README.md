# scripts/india — national layer pipelines

Adapters for the "Kaun for India" tables (`in_*`). Schema and rationale:
[docs/design-india-schema.md](../../docs/design-india-schema.md).

**Everything here is a SKELETON.** Each script has its structure, its real
endpoints, its known traps and its `TODO:` markers, but no working extract yet.
They all default to dry-run and refuse `--apply` until implemented, so nothing
in this directory can write to Supabase by accident.

| Script | Table(s) | Source | Cadence |
|---|---|---|---|
| `seed-constituencies.mjs` | `in_constituencies` | DataMeet + shijithpk 2024 + Delimitation Order 2008 | once per delimitation |
| `sansad-roster.mjs` | `in_mps`, `in_pc_source_aliases` | sansad.in `api_ls` / `api_rs` | weekly |
| `myneta-affidavits.mjs` | `in_mp_affidavits` | myneta.info candidate pages | once per election + bypolls |
| `mp-activity.mjs` | `in_mp_activity` | Zenodo backfill + sansad.in live + PRS CSV | monthly, and after each session |
| `esakshi-mplads.mjs` | `in_mplads_summary` | eSAKSHI (+ Empowered Indian) | weekly |
| `mospi/load_flash_report.py` | `in_central_projects(+_snapshots)` | MoSPI PAIMANA flash report PDFs | monthly |

## The rule every one of these must follow

No loader may resolve a constituency by name similarity. Resolution goes
through `lib/pc-code.mjs` (`resolvePc`): the alias table first, then an exact
match on the normalized name within a state. Anything unresolved is reported
for a human to add to `in_pc_source_aliases` — never guessed. Same discipline
as the ward crosswalk's "deterministic overlap, no name matching".

## Order of operations

`seed-constituencies.mjs` must run first — every other table has an FK to
`in_constituencies.pc_code`. `sansad-roster.mjs` must run before
`mp-activity.mjs` and `esakshi-mplads.mjs`, which need `in_mps.id`.
