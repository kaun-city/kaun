# Kaun for India — schema design

Status: **proposed, not applied.** Migration is dry-run by default and has
never been run against production.
Date: 2026-07-25 · Branch: `feat/india-schema`

Companion files:
`scripts/migrate-india-schema.mjs` ·
`.github/workflows/migrate-india-schema.yml` ·
`scripts/india/` (pipeline skeletons) ·
`scripts/india/lib/pc-code.mjs` (+ `tests/india-pc-code.test.mjs`)

Grounded in the P0 recon: `india-recon/{geo-roster,mplads,mospi-projects,mp-records}`.

---

## 1. Shape

Eight new tables, one view, all prefixed `in_`. Nothing existing is touched.

```
in_constituencies (543 seats) ──┬── in_pc_source_aliases   (every source's own id → pc_code)
        pc_code                 ├── in_mps                 (roster, mpsno)
                                │      ├── in_mp_affidavits  (MyNeta)
                                │      ├── in_mp_activity    (attendance/questions/debates)
                                │      └── in_mplads_summary (MPLADS ₹)
                                └── in_central_projects    (MoSPI Table 6 identity)
                                          └── in_central_project_snapshots  (per report month)
                                                    └── v_in_central_project_changes
```

### Why not extend `elected_reps` / `rep_report_cards`

Those are keyed on `(role, constituency)` — free text, no numeric id, no term.
That is workable for 28 Bengaluru MLAs and falls over at national scale: 543
seats whose names are spelled differently by every source, bypolls that put two
MPs on one seat within a term, and a historical record that must survive 2029.
The India layer gets its own tables with real keys. The Bengaluru schema keeps
working exactly as it does today.

---

## 2. Keys and joins

| Entity | Key | Why |
|---|---|---|
| Constituency | `pc_code` = `<st_code>-<pc_no>` unpadded, e.g. `29-25` (matches `data/pc-crosswalk/`; Ladakh = st_code 38; sort on the integer pair, never the string) | see below |
| MP | `mpsno` (sansad.in), scoped by `(house, term_label)` | the only strong numeric MP id in the whole recon; identical to Zenodo's `mpCode` |
| Affidavit | `(myneta_candidate_id, election)` | MyNeta ids are per-affidavit, not per-person |
| Central project | `project_code` | ~99% stable month over month |
| Snapshot | `(project_code, report_month)` | one immutable row per report |

### `pc_code`, not `pc_no`

**`pc_no` is not nationally unique.** It restarts at 1 in every state and UT.
Verified against DataMeet's 543-feature file: `pc_no = 1` appears 36 times;
`(st_code, pc_no)` is unique 543/543. A table keyed on `pc_no` silently merges
36 different seats — Kangra, Bangalore Rural and Thiruvananthapuram become one
row. So the canonical key is `pc_code`, e.g. `29-25` for Bangalore Central,
derived by `pcCode()` in `scripts/india/lib/pc-code.mjs` and **CHECK-enforced**
in the table so a hand-typed code cannot drift from its components.

`st_code` is the Census-2011 state code **as extended by DataMeet** — the same
code DataMeet's PC, AC and district layers all carry, so the crosswalk work has
no translation step. Precisely: post-2011 units use DataMeet's published
extensions (Telangana=36, residuary Andhra Pradesh=37 — strict Census-2011 had
only 28=undivided AP) plus our own Ladakh=38 (`LADAKH_ST_CODE` in
`pc-code.mjs`; DataMeet predates the 2019 bifurcation). Do not "renormalise"
these to any other scheme — `data/pc-crosswalk/` (PR #64) is keyed on the same
values.

### Every source has its own constituency numbering — one table absorbs them all

| Source | Its constituency identifier | Example |
|---|---|---|
| sansad.in | name only, no number | `"Bangalore Central"` |
| MyNeta | internal `constituency_id` | `185` (ECI PC is 25) |
| eSAKSHI | internal `ID` | `166` = Bangalore Rural |
| PRS | `pc_name` + `state` text only | `"Bangalore Central"` |
| MoSPI | state name only | `"Andhra Pradesh"` |

`in_pc_source_aliases (source, source_key) → pc_code` handles all five with one
mechanism, rather than three pairwise fuzzy joins. That is also what closes the
32-seat gap the geo-roster recon left open (roster→PC matched 512/544 = 94%;
the residue is real spelling variants — Mahbubnagar/Mahabubnagar,
Firozpur/Ferozepur, Hardwar/Haridwar).

**Resolution order, enforced by `resolvePc()` and by the schema:**
1. alias table
2. exact match on the normalized name *within a state*
3. a human, recorded as `manual_reviewed` with `reviewed_by`

`normalizeConstituencyName()` removes only orthographic noise — case,
whitespace, punctuation, a trailing `(SC)`/`(ST)`. It deliberately does **not**
transliteration-fold, so `Mahbubnagar` and `Mahabubnagar` stay distinct and
become a visible, attributable alias row instead of an invisible guess. Tests
assert exactly that (`tests/india-pc-code.test.mjs`). `method`'s CHECK list has
no fuzzy option at all — a similarity match is not representable in this schema.

This is the ward-crosswalk discipline ported to a domain with no geometry: the
crosswalk used polygon overlap to avoid name matching; here the substitute
structural constraints are "one winner per seat" and "one sitting MP per seat".

---

## 3. Constraints that carry the design

These are not decoration — each one turns a known, documented failure mode into
an INSERT-time error. All were exercised against a throwaway local Postgres
(see §7).

| Constraint | Prevents |
|---|---|
| `in_constituencies_pc_code_derived` | a `pc_code` that disagrees with its `st_code`/`pc_no` |
| `in_constituencies_reserved_has_source` | a reserved-status value with no provenance — every source checked under-reports it |
| `in_mps_one_sitting_per_pc` (partial unique) | two sitting MPs on one seat; bypoll predecessors (`Died`/`Resigned`) and the 3 vacant seats still fit |
| `in_mps_pc_only_for_ls` | a Rajya Sabha member acquiring a constituency |
| `in_mp_affidavits_one_winner_per_pc` (partial unique) | the MyNeta join double-counting a seat |
| `in_mp_affidavits_cases_explicit` | "no Crime-O-Meter widget" being stored as *unknown* instead of **0** |
| `in_mp_affidavits_match_method_chk` | fuzzy name matching, at the type level |
| `in_mp_activity_excluded_is_null_not_zero` | ranking a minister as an absentee |
| `in_central_project_snapshots_month_is_first` | a mid-month report date breaking the time series |

### The minister rule, in detail

Ministers and the Speaker do not sign the attendance register, do not ask
questions and do not introduce private member bills. sansad.in reports
`signedDaysCount: 0`; PRS states it in words in `mp_note`. Two independent
confirmations that this is how Parliament's paper trail works — not a scraping
artifact. A raw "worst attendance" list built on those zeros would be
defamatory nonsense.

So `in_mp_activity` requires `metrics_excluded = true` **and NULL metrics** —
never 0 — and requires a reason string. The database rejects the alternative.

---

## 4. Table notes

**`in_constituencies`** — geometry follows `wards.geom` exactly: a PostGIS
`geometry(MultiPolygon, 4326)` column on the table, so the existing
`ST_Contains` / `pin_lookup` pattern extends to "which PC is this pin in".
The column is added inside a DO block that resolves PostGIS's own schema
(Supabase may host it under `extensions`) and raises a clear error if the
extension is missing. The migration never writes to `spatial_ref_sys`.

**`in_mps`** — surrogate `id` plus `UNIQUE (mpsno, house, term_label)`. The
term scope exists because Kaun is building a historical record: if `mpsno` is
reused when a member is re-elected, `term_label` is what keeps the 18th Lok
Sabha row intact in 2029; if it is not reused, the column costs nothing.
`is_minister` is set here and honoured by `in_mp_activity`.

**`in_mp_affidavits`** — amounts in **whole rupees** (`bigint`, lossless,
matching MyNeta's own precision), not the lossy `_cr` used by `elected_reps`.
The surface layer renders crore. `criminal_cases_detail` and
`declared_assets_history` are `jsonb` because per-case detail (FIR, court,
sections, appeal status) and the "Other Elections" trend are both variable
shape and both worth keeping verbatim.

**`in_mp_activity`** — `period_kind` separates per-session rows (sansad.in,
Zenodo) from PRS's term-cumulative MP Track figures (`session_no = 0`), so both
coexist without either pretending to be the other.

**`in_mplads_summary`** — `source` is part of the natural key, so eSAKSHI
(authoritative, aggregate-only) and Empowered Indian (unofficial, per-work
granularity) rows coexist per MP and every read knows which it is citing.
Amounts are `numeric` because eSAKSHI reports paise.

**`in_central_project_snapshots`** — the reason the overrun tracker is a time
series and not a "latest value" table. `raw jsonb` absorbs schema drift: MoSPI
added PMGID between the March and April 2026 reports, and pre-2021 uses a
different layout entirely. Unrecognised parsed fields land in `raw` rather than
being dropped, so a new MoSPI column never fails an ingest and can be promoted
to a first-class column later — additively, without losing the months in
between. `parser_version` on every row makes a re-parse attributable.

**`v_in_central_project_changes`** — `LAG()` per `project_code` over
`report_month`, exposing `cost_revised` and `schedule_changed`. This is the
Apr→May "450 schedule slips, 11 cost revisions" signal, computed once in the
database instead of in every read path.

---

## 5. RLS

Matches the posture set by the merged surgical-fix migration (#48/#50): RLS
enabled on every table, one explicitly **named** `<table>_anon_read` SELECT
policy, `GRANT SELECT` to `anon` + `authenticated`, and **no anon
INSERT/UPDATE/DELETE anywhere** — writes are service-role ETL only.

One table is row-restricted rather than blanket-open, exactly like
`ward_reports_anon_read_approved`:

```sql
CREATE POLICY in_mp_affidavits_anon_read_matched
  ON public.in_mp_affidavits FOR SELECT TO anon, authenticated
  USING (needs_review = false AND parse_status = 'ok');
```

An affidavit row becomes publicly readable only once its MyNeta↔PC join has
been resolved and its source page parsed cleanly. Unreviewed criminal-case rows
are never served to the public — the stakes on a wrong join here are a person's
reputation, not a mis-tallied ward.

---

## 6. Refresh cadences

| Pipeline | Source | Cadence | Notes |
|---|---|---|---|
| `seed-constituencies` | DataMeet + shijithpk 2024 + Delimitation Order | once per delimitation | not a cron |
| `sansad-roster` | sansad.in `api_ls`/`api_rs` | weekly | bypolls, deaths, resignations |
| `mp-activity` (backfill) | Zenodo `10.5281/zenodo.18146342` | once, re-check for a later cutoff | CC BY 4.0, to 2025-12-31 |
| `mp-activity` (top-up) | sansad.in + PRS CSV | monthly / after each session | |
| `esakshi-mplads` | eSAKSHI (+ Empowered Indian) | weekly | rate limits unconfirmed |
| `mospi/load_flash_report` | PAIMANA flash report PDFs | monthly, 5th | ~7-8 week publication lag |
| `myneta-affidavits` | myneta.info | on demand | static per election |

All workflows are **dispatch-only** in this PR. The adapters are skeletons that
refuse `--apply`, so nothing can write by accident; the intended cron for each
is written in a comment, to be uncommented when the pipeline is real.

The MoSPI job is the one Python pipeline — Table 6 only exists inside a
~160-page PDF and pdfplumber is what parses it. `deploy-wiki.yml` already
establishes the `setup-python` pattern. The working parser exists in
`india-recon/mospi-projects/parse_flash_report.py` (1,987/1,987, 1,981/1,981,
1,941/1,941 rows across three months, zero missing fields) and should be
**ported, not rewritten** — it encodes two hard-won fixes (forced
line-coordinate table extraction, balanced-paren agency-name scanning).

---

## 7. Verification done

- **Live Supabase schema probed read-only** (PostgREST, `limit=1`, public anon
  key) to match existing conventions: `wards.geom` geometry handling,
  `elected_reps` / `rep_report_cards` column naming, `data_source` /
  `updated_at` / `ingested_at` timestamps, surrogate `id` + natural key.
  No writes, no DDL, no service-role access.
- **DDL executed against a throwaway local Postgres 18.4 cluster** (created and
  destroyed in the scratchpad; production untouched):
  - clean create, then a second run over populated tables — idempotent, no
    truncation, all row counts preserved;
  - the PostGIS guard raises its intended error when the extension is absent,
    and the transaction rolls back cleanly;
  - every constraint in §3 verified to reject the bad case and accept the good
    one — second sitting MP rejected, bypoll predecessor accepted, second
    winner rejected, losing candidate accepted, `parse_status='ok'` with NULL
    cases rejected, explicit 0 accepted, `fuzzy_name` rejected, minister row
    with zeros rejected and with NULLs accepted;
  - `v_in_central_project_changes` reproduces a cost revision and a schedule
    slip correctly on seeded Mar/Apr/May rows.
- **All 16 workflow YAML files parse** (`yaml.safe_load`).
- **`npm test` green**: 69 tests, 10 of them new.

Caveat: the local cluster is PG 18.4 and has no PostGIS, so the geometry column
itself was validated only by its guard, and Supabase's exact PG version was not
confirmed. The DDL uses no post-PG-13 syntax.

---

## 8. Open questions for Bharat

1. **State code standard.** `st_code` is the Census-2011 code (DataMeet's).
   LGD codes are the more "official" modern choice and are what other Indian
   civic datasets increasingly use. Switching later means rewriting every
   `pc_code`. Census-2011 keeps the geo layers aligned with zero translation —
   confirm before seeding?
2. **Crosswalk key contract.** The sibling `feat/india-pc-crosswalk` PR builds
   the PC↔district↔AC artifact. It should key on this `pc_code`. If it has
   already picked a different key, one of the two needs to move — worth
   reconciling before either merges.
3. **`in_mp_affidavits` publication scope.** Currently anon-readable once
   reviewed. Criminal-case detail (FIR numbers, sections, court) is public
   record from ECI affidavits and MyNeta publishes it — but Kaun republishing
   it at national scale is an editorial call, not a technical one. Publish the
   full detail, or the count only with a link out?
4. **Where the source files live.** The ward crosswalk committed its artifact
   to `data/ward-crosswalk/`. The India geo sources are ~12 MB of GeoJSON.
   Commit them under `data/india/`, or fetch at run time and commit only the
   derived 543-row table?
5. **Rajya Sabha scope.** `in_mps` models RS (244 sitting members, same `mpsno`
   space) but the RS activity endpoints were never probed and RS has no
   constituency. Is RS in v1, or LS-only with the RS columns dormant?
6. **Losing candidates.** `in_mp_affidavits` can hold every candidate, not just
   winners — the one-winner index only constrains winners. Worth scraping the
   full field for "who else ran" context, or winners only for v1?
7. **View security.** `v_in_central_project_changes` is created plainly, like
   the existing `v_work_orders_243`. Supabase's linter prefers
   `security_invoker = true` (PG 15+). Add it to both, or leave the existing
   convention alone?

---

## 9. Revert

```sql
DROP VIEW  IF EXISTS public.v_in_central_project_changes;
DROP TABLE IF EXISTS public.in_central_project_snapshots,
                     public.in_central_projects,
                     public.in_mplads_summary,
                     public.in_mp_activity,
                     public.in_mp_affidavits,
                     public.in_mps,
                     public.in_pc_source_aliases,
                     public.in_constituencies CASCADE;
```

Drops only objects this migration created. Nothing pre-existing is affected.
