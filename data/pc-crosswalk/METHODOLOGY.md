# Kaun India PC Crosswalk — Lok Sabha 543 ↔ Assembly Constituencies ↔ Districts

**Version `2008do+2023as+2022jk-2026.07` · generated 2026-07-25 · 543 parliamentary constituencies · 4122 constituent-AC links · 412 GEN / 47 ST / 84 SC**

## Why this exists

The question *"which Assembly segments make up this Lok Sabha seat?"* has a
legal answer — Table B of the Election Commission's delimitation orders, the
**2008 Order** for most of the country, superseded by the **Assam order of 2023**
and the **Jammu & Kashmir order of 2022** — and no open, machine-readable one.
Two of those three are scanned gazettes with no text layer at all. The mapping
that *is* published in open geodata is wrong:
DataMeet's assembly-constituency shapefile carries a `PC_NO` attribute that
assigns up to **60 ACs to a single PC**, and its own README warns the boundaries
for six states are pre-delimitation. Reservation status (SC/ST) is wrong in
every source we checked, including the official Lok Sabha member API.

So Kaun parses the orders themselves, verifies them against independent geometry, and
publishes the result: deterministic, sourced, versioned, correctable — the same
playbook as the [Bengaluru ward crosswalk](../ward-crosswalk/METHODOLOGY.md).

## Sources

| Layer | Source | Licence | Used for |
|---|---|---|---|
| **AC↔PC composition (primary)** | ECI, *Delimitation of Parliamentary and Assembly Constituencies Order, 2008*, Tables A & B — [archive.org/details/delimitation-2008](https://archive.org/details/delimitation-2008) | Government of India publication | The authoritative AC list per PC, PC reservation, AC↔district, for every state except the two below |
| **Assam — current order** | *Assam Delimitation Order, 2023*, Table B — ECI Notification No. 282/AS/2023, Gazette of India Extraordinary Part II s.3(iii), **11 Aug 2023** ([CEO Assam mirror](https://ceoassam.nic.in/Final_Order_and_Notification.pdf)) | Government of India publication | The 14 Assam PCs and their 126 ACs — **supersedes the 2008 Order** |
| **Jammu & Kashmir — current order** | *J&K Delimitation Order, 2022*, Table B — Delimitation Commission Notification No. 282/J&K/2022 (Vol. IV), J&K Gazette Vol. 135 No. 5-2, **5 May 2022** ([DEO Anantnag mirror](https://cdn.s3waas.gov.in/s330ef30b64204a3088a26bc2e6ecf7602/uploads/2022/05/2022051069.pdf)) | Government of India publication | The 5 J&K PCs and their 90 ACs — **supersedes the 2008 Order** |
| PC polygons | [shijithpk/2024_maps_supplement](https://github.com/shijithpk/2024_maps_supplement) `india_ls_seats_543.geojson` | Unlicense | The 543-seat identity spine (ECI state/seat codes) + geometry |
| PC attributes | [DataMeet maps](https://github.com/datameet/maps) `parliamentary-constituencies` | CC0 (simplified attribute build) | Wikidata QID, Hindi name. `pc_category` recorded for comparison only — **not** trusted |
| AC polygons | DataMeet `assembly-constituencies` `India_AC` | CC-BY 2.5 IN | Spatial verification only. Its `PC_NO`/`PC_NAME` columns are **never read** |
| District polygons | DataMeet `Districts/Census_2011` (641 districts) | CC-BY 2.5 IN | Informational `district_shares` vector |

Bulk raw sources are **not committed** (100+ MB of shapefiles plus three
government PDFs). The builder reads a local copy; point it with
`PC_CROSSWALK_SRC`. This follows the ward-crosswalk precedent: `data/` carries
derived artifacts, never bulk upstream geodata.

**One deliberate exception.** The Assam-2023 and J&K-2022 gazettes are *scans
with no embedded text layer* — `pdftotext`/`pdfjs` return nothing — so their
Table B was transcribed by reading the rendered pages. Those two transcriptions
(10 KB) are committed under [`sources/`](sources/README.md), because without
them the builder cannot rebuild the 19 seats they govern. Everything else it
reads is parsed deterministically from a file anyone can re-download.

## Key contract

`pc_no` is **not** nationally unique — it restarts at 1 in every state and UT,
so `pc_no = 1` occurs 36 times across the 543 seats. The canonical key is
therefore

    pc_code = <st_code>-<pc_no>       e.g. 29-24  = Karnataka 24-Bangalore North
    ac_code = <st_code>-<ac_no>       e.g. 29-158 = Karnataka AC 158-Hebbal

shared with the Kaun India schema. `st_code` is the state code **the DataMeet
geo files carry**, read off each seat's matched DataMeet record so both sides of
the join derive the key from the same published value. Three notes on it:

- DataMeet uses `36` for Telangana and `37` for Andhra Pradesh. Neither is a
  strict Census-2011 code — Telangana did not exist in 2011 and 2011's code 28
  was undivided Andhra Pradesh. The published DataMeet value is used as-is
  rather than silently renormalised.
- **Ladakh is absent from DataMeet entirely** (still folded into Jammu &
  Kashmir), so it is assigned `38` here — the first free integer, chosen to
  avoid colliding with any DataMeet code. If the schema settles on a different
  value for Ladakh, change `ST_CODE_FALLBACK` in the builder and re-run.
- Dadra & Nagar Haveli and Daman & Diu merged into one UT in 2020 but keep two
  seats; each seat keeps its own DataMeet state code (26 and 25), so both
  `pc_code`s stay unique.

`pc_code_datameet` carries `<st_code>-<pc_no>` **as DataMeet numbers the seat**,
which differs from the current ECI numbering for Assam (renumbered in 2023) and
for the J&K/Ladakh split. Join on `pc_code` for current identity and on
`pc_code_datameet` when joining to a DataMeet-derived table.

## Method

**1 — Primary, textual (authoritative).** The Order is a 571-page two-column
PDF. Text is extracted with positions (`pdfjs-dist`), lines are rebuilt from
y-coordinates, and the two table columns are separated on an x threshold
**inferred per page** (the column geometry drifts between pages). For each of
the 30 state/UT schedules:

- **Table B** → one record per PC: number, name, `(SC)`/`(ST)` reservation, and
  the complete numbered list of constituent ACs. Separators in the Order are
  wildly inconsistent (`1-Sirpur`, `4. Premnagar`, `1 Gummidipoondi`,
  `2—Mohanpur`, `48~Boko (SC)`, `01. MEKLIGANJ`, and `22Virugambakkam` with no
  separator at all), so entries are split on *separator-followed-by-digit* and
  each token parsed. **Tokens that fail to parse are reported, never dropped.**
- **Table A** → `<n> – DISTRICT : X` headings give AC↔district, composed up to
  PC↔district (`districts_order`).
- PCs whose extent reads "the entire area of the State/UT" (Mizoram, Sikkim,
  Nagaland, Puducherry) are expanded to that state's full Table A AC list.

**2 — Later orders override the 2008 basis.** Two states were re-delimited after
2008, and for them the 2008 composition is **replaced wholesale, never merged**
— both renumbered their Assembly seats from scratch, so mixing the two vintages
would be worse than either alone. The 2008 AC→district index for those states is
dropped with the rows it described.

| State | Order applied | PCs | ACs |
|---|---|---|---|
| Assam | Assam Delimitation Order, 2023 (gazetted 11 Aug 2023) | 14 | 126 |
| Jammu & Kashmir | J&K Delimitation Order, 2022 (gazetted 5 May 2022) | 5 | 90 |

Each transcription is asserted against its own order's recitals *before* it is
allowed to override anything — seat counts, a gap-free non-duplicating AC
sequence, and the reserved-seat tallies the order itself recites. If any check
fails the override is refused, the 2008 basis is retained, and the run says so.

**3 — Normalisation to today's map.** The 2008 Order predates two changes that
move seats between states:

- **Andhra Pradesh Reorganisation Act, 2014.** The 2008 AP schedule numbers
  Telangana first (PCs 1–17, ACs 1–119) then residuary Andhra Pradesh (PCs
  18–42, ACs 120–294); both were renumbered from 1. The builder applies the
  offsets **and asserts them** — it checks that no Telangana-segment PC
  references an AC above 119 and no AP-segment PC references one below 120.
- **J&K Reorganisation Act, 2019.** The Order's J&K PC 4 (Ladakh) is today its
  own UT with one seat.

**4 — Verification, spatial (independent).** For every (PC, AC) link the builder
takes the AC polygon's interior point and tests which PC polygon contains it.
Agreement is reported per PC (`ac_agreement`) and nationally. This is a genuine
cross-check: the composition comes from text, the check comes from geometry, and
the two share no inputs.

**5 — District shares (informational).** Each PC's interior is sampled on a
26×26 grid and classified by 2011 Census district polygon, producing a full
share vector (`district_shares`, and `district_shares_vector` in the JSON) —
the same shape as the ward crosswalk's `shares`. No truncation.

## Verification results

Four independent checks run on every build. Each one prints every failure it
finds, and all of them are reproduced under *Builder warnings* below — nothing
is suppressed to make the numbers look better.

**Check 0 — the post-2008 transcriptions against their own orders.** Before
either current order is allowed to override the 2008 basis it must reproduce the
seat counts, a gap-free non-duplicating AC sequence, and the reserved-seat
tallies its own gazette recites (Assam 1 SC + 2 ST parliamentary and 9 SC + 19 ST
assembly seats; J&K 0 reserved parliamentary and 7 SC + 9 ST assembly seats).
A failure refuses the override rather than publishing it.

**Check 1 — completeness against the Order's own seat allocation.** Schedule I
("Allocation of Seats in House of People") is parsed from the 2008 PDF:
**543 seats · 84 SC · 47 ST**. Every state's
Table B parse is asserted against it, and inside each state the constituent-AC
sets must partition the Assembly exactly — every AC in exactly one PC, none
missing, none doubled. Current status: **4122 AC links, 0 unassigned,
0 double-assigned**.

**Check 2 — reservation against Schedule I.** SC/ST status is read off the
Order's own `(SC)`/`(ST)` tags and the per-state totals are compared with
Schedule I. Result: **GEN 412 · ST 47 · SC 84** — exact.

**Check 3 — spatial, independent of the text.**

| Metric | Value |
|---|---|
| Parliamentary constituencies | **543** |
| Constituent-AC links | **4122** |
| AC links testable against polygons | 3903 of 4122 (94.7%) |
| **Spatial agreement** | **3876 / 3903 = 99.3%** |
| Disagreements recorded | 27 (all listed in `verification_disagreements.csv`) |

Per-PC verification tier:

| Tier | Seats | Meaning |
|---|---|---|
| `verified` | 517 | every locatable constituent AC lands inside this PC's polygon |
| `mostly-verified` | 17 | ≥70% do |
| `divergent` | 3 | <70% do — **suspect the geometry, not the composition**: in every case examined the Order's text is the fixed point and the AC polygon set is the stale side |
| `unverified` | 0 | no constituent AC could be located in the AC shapefile |
| `districts-only` | 1 | the Order defines the PC by district, not by AC (J&K, Ladakh) |
| `no-assembly` | 5 | UT without a Legislative Assembly, so the seat has no ACs |

### Where the disagreements are, and why

| State/UT | Disagreements |
|---|---|
| Assam | 5 |
| Rajasthan | 4 |
| Punjab | 3 |
| West Bengal | 3 |
| Andhra Pradesh | 2 |
| Delhi | 2 |
| Tamil Nadu | 2 |
| Uttar Pradesh | 2 |
| Jammu & Kashmir | 1 |
| Maharashtra | 1 |
| Odisha | 1 |
| Tripura | 1 |

Disagreement is concentrated exactly where DataMeet's own README says its AC
boundaries are pre-2008-delimitation (J&K, Jharkhand, Assam, Manipur, Nagaland,
Arunachal Pradesh) and where the shapefile is administratively stale (Telangana
is still filed under Andhra Pradesh; the file has 4,182 features for ~4,120 real
seats, i.e. duplicates and historical entries). These are **AC-polygon**
problems, not composition problems — which is why the Order stays primary and
geometry stays advisory. Every disagreement is published rather than suppressed
so a reader can check the call.

### The 19 seats governed by a post-2008 order

| State | Order | PCs | ACs | AC links locatable | agree | rate |
|---|---|---|---|---|---|---|
| Assam | Assam Delimitation Order | 14 | 126 | 77 | 72 | 93.5% |
| Jammu & Kashmir | Jammu and Kashmir Delimitation Order | 5 | 90 | 57 | 56 | 98.2% |

These are the seats that previously carried a "2008 basis, pending the newer
order" flag. Applying the real orders **raised the national agreement rate and
cut the disagreement count by more than a third** — Assam alone fell from 22
disagreements on the 2008 basis to 5, and J&K went from
unverifiable (the 2008 Order describes it only by district) to
1 across 90 ACs.

Read the *locatable* column with care: the AC polygon layer is DataMeet's
pre-delimitation set for both states, so only ACs whose name survived the
re-delimitation can be tested at all, and even those carry their **old**
boundary. The remaining handful of mismatches sit on that seam, compounded by
PC polygons that upstream georeferenced from ECI press-note images rather than
survey data. Neither layer is evidence against the gazetted composition.

A worked example of what a disagreement actually is: the Order gives Rajasthan
PC 8-Alwar the ACs 59, 60, 61, 62, 65, 66, 67, 68 — which is the current
Rajasthan numbering, verifiably (65 *is* Alwar Rural). Four of those polygons
nevertheless fall inside the neighbouring Bharatpur PC, because DataMeet's
Rajasthan AC layer carries 201 features for a 200-seat Assembly and is the
pre-2008 set. The composition is right; the polygons are old.

### Reservation status

Derived from the Order's own `(SC)`/`(ST)` tags, and for the 5 single-seat
Assembly-less UTs (which get no Table B row) from Schedule I. This **differs
from DataMeet's `pc_category` on 4 seat(s)** — exactly the
2-seat ST undercount the source-recon flagged:

- Assam 7-Karimganj — Order **GEN**, DataMeet `SC`
- Assam 8-Silchar — Order **SC**, DataMeet `GEN`
- Dadra and Nagar Haveli and Daman and Diu 2-Dadra & Nagar Haveli — Order **ST**, DataMeet `GEN`
- Lakshadweep 1-Lakshadweep — Order **ST**, DataMeet `GEN`

### Errata in the Order's own printed text

The 2008 Order contains typographical errors in Table B. Each is corrected only
where **Table A of the same Order settles it beyond doubt** — the printed number
belongs to a different, already-assigned constituency and exactly one unassigned
AC carries the printed name. Every correction applied is listed here and carried
in the JSON as `corrected_from` on the AC:

- ANDHRA PRADESH PC 24-AMALAPURAM: AC 62 → 162 (Mummidivaram) — the Order prints 62, Table A gives 162 for that name and 62 for "Sanathnagar"; dropped leading digit
- JHARKHAND PC 9: AC 41 → 44 (Baharagora). Table B prints '41-Bahragora' for Jamshedpur. Table A of the same Order lists 44 Baharagora; AC 41 is Jharia, already a segment of PC 7 Dhanbad. Misprinted number.
- MAHARASHTRA PC 5-Buldhana: AC 5 → 25 (Mehkar) — the Order prints 5, Table A gives 25 for that name and 5 for "Sakri (ST)"; dropped leading digit
- MANIPUR PC 2: AC 4 → 41 (Chandel). Table B prints '4i~Chandel' for Outer Manipur — a glyph artefact for 41. Table A lists 41 Chandel; AC 4 is Khetrigao, already a segment of PC 1 Inner Manipur.

Two further defects are layout artefacts, not text errors: the Order occasionally
prints a PC's extent one row *above* its vertically-centred name cell, which the
builder detects and undoes (Jharkhand 13→14, West Bengal 33→34).

## Known limitations

1. **No district mapping for Assam or Jammu & Kashmir.** Their AC↔district
   relation comes from each order's Table A, and only Table B was transcribed
   (for J&K the sourced gazette copy is missing most of Table A altogether).
   Those 19 rows therefore have an empty `districts_order` and rely on the
   spatial `district_shares` vector alone. The 2008 district mapping is **not**
   substituted, because both states renumbered their ACs — it would be wrong.
2. **J&K sub-AC detail is unavailable.** The sourced copy of Notification
   No. 282/J&K/2022 (Vol. IV) is a district-office bundle: Table B is complete,
   but Table A's ward/tehsil-level extent for most of the 90 ACs is not in it.
   Closing that needs a complete copy of the gazette — not required for this
   crosswalk, but it is the remaining gap on J&K.
3. **Ladakh remains on the 2008 basis.** It has no Legislative Assembly, so
   there are no ACs to map; the 2008 Order describes it by district and the
   2019 reorganisation only moved it out of J&K.
4. **Districts are 2011 Census vintage.** `district_shares` uses the 641-district
   2011 set; India now has 780+. `districts_order` uses the Order's own district
   names as on its stated reference dates. Neither is a current district list.
4. **Delhi has no district headings** in its Table A (ACs are described by
   municipal ward), so Delhi's `districts_order` is empty and only the spatial
   share vector is available.
5. **PC polygons for Assam/J&K/Ladakh are georeferenced from ECI press-note
   images**, not survey-grade (the upstream author's own caveat). International
   borders in particular are approximate.
6. **UTs without an Assembly** (Andaman & Nicobar, Chandigarh, Lakshadweep,
   Dadra & Nagar Haveli and Daman & Diu) have no constituent ACs by definition.
7. **A handful of Table A rows do not parse**, listed under builder warnings
   below. They cost only a district label on the ACs concerned — the AC↔PC
   composition comes from Table B, which parses completely (0 unassigned,
   0 doubled across all 4122 links).
8. **Sikkim's Sangha seat** is elected state-wide by the monasteries and has no
   territorial extent, so Sikkim contributes 31 territorial ACs, not 32.

### Builder warnings this run

- JHARKHAND PC 13→14: the following PC's extent opened above its name cell; moved "21-Barhi, 22-Barkagaon, 23-Ramgarh, 24-Mandu, 25-Hazaribagh." back to it
- WEST BENGAL PC 33→34: the following PC's extent opened above its name cell; moved "218. EGRA, 219. DANTAN, 223. KESHIARY (ST), 224." back to it
- ANDHRA PRADESH: parsed 291 ACs from Table A, expected 294 — missing AC numbers 151, 219, 259
- BIHAR: parsed 242 ACs from Table A, expected 243 — missing AC numbers 169
- ORISSA: parsed 145 ACs from Table A, expected 147 — missing AC numbers 125, 137
- WEST BENGAL: parsed 292 ACs from Table A, expected 294 — missing AC numbers 182, 183

## Corrections

This is a living dataset. To report an error open an issue at
`github.com/kaun-city/kaun` with label **`pc-crosswalk`**, citing the PC and AC
numbers and your source (ideally a gazette or ECI notification). Accepted
corrections bump `version` and are logged in this file's history.

## Files (all regenerated by `scripts/india/build-pc-crosswalk.mjs`)

- `data/pc-crosswalk/india_pc_crosswalk.csv` — 543 rows, one per PC, full AC list
- `data/pc-crosswalk/india_pc_crosswalk.json` — same + structured `acs`, district share vectors, provenance, caveats
- `data/pc-crosswalk/pc_ac_pairs.csv|.json` — long format, one row per PC↔AC link (4122 rows)
- `data/pc-crosswalk/verification_disagreements.csv` — every spatial mismatch (27)
- `data/pc-crosswalk/METHODOLOGY.md` — this file
- `data/pc-crosswalk/sources/` — the two hand-transcribed current-order Table Bs
  (Assam 2023, J&K 2022) and their provenance. **Inputs, not outputs** — the only
  files here the builder reads rather than writes.
- `wiki/docs/india/pc-crosswalk/*.{csv,json}` — public download copies,
  **auto-written by the builder; never hand-edit** (kept in lockstep so a
  correction can't leave the published files stale).
