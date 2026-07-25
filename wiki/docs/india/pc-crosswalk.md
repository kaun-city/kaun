# PC Crosswalk: all 543 Lok Sabha seats ↔ Assembly Constituencies ↔ districts

!!! abstract "What this is"
    The **first open, machine-readable table of which Assembly segments make up
    each Lok Sabha constituency** — all 543 seats, 4,122 AC links, parsed from
    the delimitation order **in force for each state** (the 2008 Order, plus
    Assam's 2023 and J&K's 2022 orders that supersede it), then verified against
    independent geometry. Kaun derives and maintains it.

## Why it matters

"Which MLA seats sit inside this MP's constituency?" is the join that connects
state-level data (MLA assets, LAD funds, ward work) to national-level data (MP
attendance, MPLADS, questions asked). The legal answer is Table B of the 2008
Delimitation Order — a 571-page two-column PDF. There is no open table of it.

What *is* published in open geodata is wrong:

- DataMeet's assembly-constituency shapefile ships a `PC_NO` attribute that puts
  **up to 60 ACs in a single PC**. Unusable — this build never reads it.
- **SC/ST reservation is wrong in every source we checked**, including the
  DataMeet PC file (`pc_category`) and the official Lok Sabha members API
  (`categoryCode`). Both undercount ST seats.

## Sources

| Layer | Source | Licence |
|---|---|---|
| **AC↔PC composition (primary)** | ECI, *Delimitation of Parliamentary and Assembly Constituencies Order, 2008*, Tables A & B — via the [Internet Archive mirror](https://archive.org/details/delimitation-2008) | Government of India publication |
| **Assam — current order** | *Assam Delimitation Order, 2023*, Table B — ECI Notification 282/AS/2023, gazetted 11 Aug 2023 ([CEO Assam](https://ceoassam.nic.in/Final_Order_and_Notification.pdf)) | Government of India publication |
| **J&K — current order** | *J&K Delimitation Order, 2022*, Table B — Notification 282/J&K/2022 (Vol. IV), gazetted 5 May 2022 ([DEO Anantnag](https://cdn.s3waas.gov.in/s330ef30b64204a3088a26bc2e6ecf7602/uploads/2022/05/2022051069.pdf)) | Government of India publication |
| PC polygons + 543-seat spine | [shijithpk/2024_maps_supplement](https://github.com/shijithpk/2024_maps_supplement) | Unlicense |
| PC attributes (Wikidata QID, Hindi name) | [DataMeet maps](https://github.com/datameet/maps) — parliamentary-constituencies | CC0 (simplified build) |
| AC polygons (verification only) | DataMeet maps — assembly-constituencies | CC-BY 2.5 IN |
| District polygons (2011 Census, 641) | DataMeet maps — Districts/Census_2011 | CC-BY 2.5 IN |

## Method, in one paragraph

Text is extracted from the 2008 Order with positions, lines are rebuilt from
y-coordinates, and the two table columns are split on an x threshold inferred
per page. Table B gives each PC its number, name, SC/ST tag and the complete
numbered list of constituent ACs; Table A's `<n> – DISTRICT : X` headings give
AC↔district. Assam and J&K were re-delimited since, so for those 19 seats the
newer gazetted order **replaces** the 2008 composition wholesale — both states
renumbered their Assembly seats, so the vintages are never mixed. Then,
independently, every AC polygon's interior point is tested against the PC
polygons — text says one thing, geometry says another, and the agreement rate
is published either way.

## Result

**543 constituencies · 4,122 AC links · version `2008do+2023as+2022jk-2026.07`**

| Check | Result |
|---|---|
| AC coverage | every AC in exactly one PC — **0 unassigned, 0 double-assigned** |
| Reservation vs the Order's Schedule I | **412 GEN / 84 SC / 47 ST** — exact |
| Spatial agreement | **99.3%** of 3,903 testable AC↔PC links |
| Per-PC tier | 517 verified · 17 mostly-verified · 3 divergent · 1 districts-only (Ladakh) · 5 no-assembly |

The 19 seats governed by a post-2008 order:

| State | Order | PCs | ACs | testable | agree |
|---|---|---|---|---|---|
| Assam | Assam Delimitation Order, 2023 | 14 | 126 | 77 | 93.5% |
| Jammu & Kashmir | J&K Delimitation Order, 2022 | 5 | 90 | 57 | 98.2% |

Reservation derived from the Order **corrects DataMeet on 2 seats**
(Lakshadweep and Dadra & Nagar Haveli, both ST). The 27 spatial disagreements
are published in full — they concentrate in states where DataMeet's own README
says its AC boundaries are pre-2008-delimitation, so in every case examined the
order's text is the fixed point and the polygon set is the stale side.

## Known limitations

- **No district mapping for Assam or J&K.** Only each newer order's Table B was
  transcribed, so those rows rely on the spatial district share vector alone.
  Substituting the 2008 district mapping would be wrong — both states renumbered
  their ACs.
- **J&K sub-AC detail is unavailable.** The sourced gazette copy is a district
  office bundle: Table B is complete, but Table A's ward/tehsil-level extent for
  most of the 90 ACs is missing. This is the remaining gap on J&K.
- **Ladakh stays on the 2008 basis** — it has no Legislative Assembly, so there
  are no ACs to map.
- **Districts are 2011 Census vintage** (641); India now has 780+. The district
  share vector is informational, the orders' own district headings are not.

## Key contract

`pc_no` restarts at 1 in every state, so the canonical key is
`pc_code = <st_code>-<pc_no>` (and `ac_code = <st_code>-<ac_no>`), shared with
the Kaun India schema. `st_code` is the state code the DataMeet geo files carry.

## Download

- [:material-file-delimited: CSV — `india_pc_crosswalk.csv`](pc-crosswalk/india_pc_crosswalk.csv) — 543 rows, one per PC, complete AC list
- [:material-code-json: JSON — `india_pc_crosswalk.json`](pc-crosswalk/india_pc_crosswalk.json) — + structured `acs`, district share vectors, provenance, caveats
- [:material-file-delimited: CSV — `pc_ac_pairs.csv`](pc-crosswalk/pc_ac_pairs.csv) — long format, one row per PC↔AC link (4,122 rows)
- [:material-code-json: JSON — `pc_ac_pairs.json`](pc-crosswalk/pc_ac_pairs.json)
- [:material-file-delimited: CSV — `verification_disagreements.csv`](pc-crosswalk/verification_disagreements.csv) — every spatial mismatch, listed

The AC list is **complete and never truncated**: `ac_list` carries it as a
compact string in the CSV, `acs` as a structured array in the JSON.

## Corrections

This is a **living dataset**. If you can show a mapping is wrong — citing the PC
and AC numbers and a source, ideally a gazette or ECI notification — open an
issue at [github.com/kaun-city/kaun](https://github.com/kaun-city/kaun) with the
label **`pc-crosswalk`**. Accepted corrections bump the `version` and are logged.

## Provenance & licence

Derived by Kaun from a Government of India publication and public open data.
Crosswalk released under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
consistent with the rest of this wiki. Reproducible — see
`scripts/india/build-pc-crosswalk.mjs` and the full
[METHODOLOGY](https://github.com/kaun-city/kaun/blob/master/data/pc-crosswalk/METHODOLOGY.md)
in the repo.
