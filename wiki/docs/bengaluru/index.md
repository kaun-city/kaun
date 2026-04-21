# Bengaluru

Civic data for Bengaluru — BBMP/GBA, 243 wards, and the contractors, findings, and sources that make the city's public money visible.

## What's documented

| Section | What | Count |
|---|---|---|
| [Contractors](contractors/index.md) | Contractor profiles with aliases, blacklist flags, ward footprint | Starting with KRIDL |
| [Findings](findings/index.md) | Verified civic scandals and systemic issues with evidence | 2 documented |
| [Data Sources](sources/bbmp-ifms.md) | BBMP IFMS, KPPP, opencity.in — the upstream portals | 3 documented |
| [Wards](wards/index.md) | All 243 BBMP wards with MLA, constituency, and kaun.city links | 243 wards listed |
| [RTI Responses](rti-responses/_template.md) | RTI filings and responses archive | Template ready |

On [kaun.city](https://kaun.city) itself, the Bengaluru experience includes: 243 ward map, 1,305 contractor profiles (entity-resolved), elected reps with criminal cases and attendance, ward-level spending 2018-23, Sakala rankings, and citizen reports.

## Featured findings

- **[Rs 934 Cr Ghost Workers Scam](findings/ghost-workers-scam.md)** — 6,600 non-existent sanitation workers paid for 10 years. ACB investigation ongoing.
- **[KRIDL 4(g) Exemption — Rs 4,700 Cr](findings/kridl-4g-exemption.md)** — contracts awarded without competitive tendering, as documented by BNP.

## Data sources (Karnataka/BBMP-specific)

| Source | Portal | What it has | Status |
|---|---|---|---|
| [BBMP IFMS](sources/bbmp-ifms.md) | [accounts.bbmp.gov.in](https://accounts.bbmp.gov.in/vssifms/) | Work orders, payments, bills | PublicView accessible |
| [KPPP](sources/kppp.md) | [kppp.karnataka.gov.in](https://kppp.karnataka.gov.in) | Tenders, procurement | API integrated, weekly refresh |
| [OpenCity.in](sources/opencity.md) | [data.opencity.in](https://data.opencity.in) | Work orders, budgets, grievances | CSV integrated |
| MyNeta | [myneta.info](https://myneta.info) | MLA affidavits, criminal cases | Integrated on kaun.city |
| KGIS | [kgis.ksrsac.in](https://kgis.ksrsac.in) | Trees, clinics, waste centers | Integrated on kaun.city |
| OSM | [openstreetmap.org](https://openstreetmap.org) | Amenities, signals, bus stops | Integrated on kaun.city |
| KSPCB / CPCB | - | Water & air quality | Integrated on kaun.city |
| BNP B-RIGHT | [bright.nammabnp.org](https://bright.nammabnp.org) | 63,629 BBMP projects | Collaboration pending |
| BBMP HRMS | [hrms.bbmp.gov.in](https://hrms.bbmp.gov.in) | Staffing data | Login required (RTI path) |

For pan-India data sources (TCPD, MyNeta, India Geodata, LGD), see [Pan-India Sources](../sources/index.md).

## Civic bodies

Bengaluru's civic administration has been restructured:

- **BBMP (Bruhat Bengaluru Mahanagara Palike)** — 243 wards. Under administrator rule since Sept 2020 (no elected corporators).
- **GBA (Greater Bengaluru Authority)** — 2025 restructuring splits BBMP into 5 corporations (Central, East, North, South, West) with 369 total wards. Elections pending.

The commons documents both. Most historical data uses BBMP 243-ward delimitation; new data will align to GBA structure as it rolls out.

## How to contribute to Bengaluru content

See [Contributing](../about/contributing.md) for the general guide. For Bengaluru specifically:

- File RTIs to BBMP PIO or Zonal Offices, upload responses
- Document contractor aliases — the 4(g) exemption means contractor entity resolution is critical
- Document ward-level issues you've verified on the ground
- Credit BNP and journalism sources where findings originate

## Links

- [Bengaluru on kaun.city](https://kaun.city) — map interface
- [Open data APIs](../about/api.md) — consume Bengaluru data programmatically
- [BNP B-RIGHT portal](https://bright.nammabnp.org) — partner project, 63,629 projects documented
