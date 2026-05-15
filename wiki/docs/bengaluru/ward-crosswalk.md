# Ward Crosswalk: BBMP-Final-2023 (225) ↔ DataMeet/KGIS (243)

!!! abstract "What this is"
    The **first public correspondence** between BBMP's 2023 *Final* **225-ward**
    delimitation — the numbering BBMP/IFMS tags every work order, payment and
    tender with — and the **243-ward** KGIS/DataMeet set that the kaun.city map,
    the `wards` table and this wiki render. No government or civic source
    publishes this mapping. Kaun derives and maintains it.

## Why it matters

Bengaluru has had **four** ward delimitations in a decade:

| Scheme | Wards | Where it shows up |
|---|---|---|
| 2015 (old) | 198 | KGIS `BBMP_Ward` layer; historical records |
| 2023 *Final* | **225** | **BBMP/IFMS work orders, payments, KPPP tenders** |
| KGIS/DataMeet | **243** | **kaun.city map, `wards` table, this wiki** |
| GBA (proposed) | 369 | Future — Greater Bengaluru Authority, elections pending |

Civic spending is recorded against the **225** scheme but displayed against the
**243** scheme. Without a crosswalk, money gets shown under the wrong ward. This
page is that crosswalk — built deterministically, sourced, versioned, and open
to correction.

## Sources

| Set | Source | Carries |
|---|---|---|
| BBMP-Final-225 | [opencity.in — *BBMP Final Wards Map 2023* (KML)](https://data.opencity.in/dataset/bbmp-wards-delimitation-2023) | ward id, English + Kannada name, Assembly Constituency, population, polygon |
| DataMeet-243 | [DataMeet `Municipal_Spatial_Data` Bangalore/BBMP.geojson](https://github.com/datameet/Municipal_Spatial_Data) | KGISWardNo, KGISWardName, LGD ward code, polygon |

The 225 KML numbering was verified to match `bbmp_work_orders.ward_no`
**exactly** (1 Kempegowda · 3 Atturu · 5 Kogilu · 8 Amrutahalli · 9 Hebbal
Kempapura · …).

## Method

Deterministic and **geometry-based — no name matching** (ward names collide:
HBR / HSR / HRBR Layout, Chikka- / Chokka-sandra). For every 225 ward we sample
its interior on an 18×18 grid and classify each interior point by the 243 ward
polygon that contains it. The 243 ward holding the largest area share is the
primary match; the full share vector records cases where a 225 ward spans
several 243 wards.

## Result

**225 wards · version `2023f-2026.05`**

| Tier | Count | Meaning |
|---|---|---|
| **clean** | 123 | ≥70% of the 225 ward sits in one 243 ward → safe 1:1 |
| **split-primary** | 83 | 50–70% in the top 243 ward; clear primary, remainder recorded |
| **true-split** | 19 | <50% in any single 243 ward; no dominant target (see below) |

A *split* is **expected, not an error** — 225 and 243 are genuinely different
boundary sets. Every row carries the full area-share vector so consumers can
choose a policy (Kaun uses **max-overlap assignment** and records the split).

### The 19 true-split wards

These 225 wards do not sit cleanly inside any single 243 ward — e.g.
`2 Chowdeswari Ward` → 243 #2 (0.43) / #3 (0.42) / #5 (0.12). They are listed
explicitly with shares in the dataset. Treat ward-level figures for these with
the split in mind.

## City-wide works (the 11 non-ward buckets)

BBMP also tags **5,494 work orders** to non-geographic engineering buckets —
`Mayor`, `CE Major Roads`, `CE Lakes`, `CE SWM`, `CE SWD`, `JD Horticulture`,
`CE Electrical`, `CE Road Infra`, `CE Quality Control`, `CE Project`,
`Emergency`. These have **no single ward** by nature. In the backfill they are
classified `ward_class = 'citywide'` (not attributed to any ward, so they
neither pollute a ward nor vanish). They are queryable on their own:

```
GET https://kaun.city/api/data/spending?type=citywide-works
```

A further **13** work orders carry an unrecognised ward number with no label;
they are classified `ward_class = 'unmapped'` and flagged rather than guessed.

## Download

- [:material-file-delimited: CSV — `bbmp2023_225_to_datameet_243.csv`](ward-crosswalk/bbmp2023_225_to_datameet_243.csv)
- [:material-code-json: JSON (with provenance + caveats header)](ward-crosswalk/bbmp2023_225_to_datameet_243.json)

CSV columns: `bbmp225_no, bbmp225_name_en, bbmp225_name_ka,
assembly_constituency, population, datameet243_no, datameet243_name,
lgd_ward_code, overlap_confidence, tier, runner_up_243_no, runner_up_share,
outside_share, split, samples, method`.

`split` is the **complete** area-share vector (every overlapped 243 ward, no
truncation). The JSON adds a machine-readable `shares` array
(`[{datameet243_no, share}, …]`) for proportional consumers — `shares` plus
`outside_share` sum to ~1.

## Corrections

This is a **living dataset**. If you can show a mapping is wrong — citing the
ward numbers and a source — open an issue at
[github.com/kaun-city/kaun](https://github.com/kaun-city/kaun) with the label
**`ward-crosswalk`**. Accepted corrections bump the `version` and are logged.

## Provenance & licence

Derived by Kaun from public open data (opencity.in CC BY 4.0; DataMeet ODbL).
Crosswalk released under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
consistent with the rest of this wiki. Methodology is reproducible — see
`scripts/wardmap/build-crosswalk.mjs` in the repo.
