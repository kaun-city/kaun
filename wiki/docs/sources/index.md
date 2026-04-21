# Pan-India Data Sources

Data sources that work across cities. City-specific sources (BBMP IFMS, KPPP, GHMC portals) live under the respective city folders.

## Election data

### [TCPD Lok Dhaba](https://tcpd.ashoka.edu.in/lok-dhaba/)

Trivedi Centre for Political Data, Ashoka University. Structured, cleaned election results for all Lok Sabha and Vidhan Sabha elections from 1962 onward.

- **Coverage:** National, every election
- **Format:** CSV downloads via web portal, bulk archive on [GitHub](https://github.com/tcpd/tcpd-ld-data-archive)
- **Cost:** Free, attribution-based
- **Includes:** Vote counts, margins, parties, candidates, constituency mapping

### [MyNeta / ADR](https://myneta.info)

Association for Democratic Reforms' scraped affidavit database. Criminal cases, declared assets, educational background, liabilities.

- **Coverage:** National, every election at all levels
- **Format:** HTML (scrapeable), no official API
- **Legal note:** ADR's ToS does not encourage redistribution — scrape with care
- **Also at:** [ECI affidavit portal](https://affidavit.eci.gov.in) for original PDFs

## Administrative boundaries

### [India Geodata](https://yashveeeeeeer.github.io/india-geodata/)

Administrative boundaries for all of India — states, districts, sub-districts, blocks, gram panchayats, villages, parliamentary and assembly constituencies.

- **Coverage:** National, latest delimitation
- **Format:** GeoJSON, TopoJSON, Shapefile, Parquet, PMTiles, GeoTIFF
- **License:** CC0 / CC-BY-4.0 / GODL-2.0
- **Size:** 160+ GB full archive — use subsets

### [DataMeet Municipal Spatial Data](https://github.com/datameet/Municipal_Spatial_Data)

Community-maintained ward boundaries for 28 Indian municipalities.

- **Coverage:** 28 cities (Bengaluru, Hyderabad, Mumbai, Delhi, Chennai, Kolkata, Pune, Ahmedabad, etc.)
- **Format:** GeoJSON, KML
- **License:** CC-BY-4.0
- **Gaps:** Many smaller cities not covered; some boundaries pre-delimitation

## Canonical identifiers

### [LGD (Local Government Directory)](https://lgdirectory.gov.in)

Government's canonical ID registry for every administrative unit in India. Use LGD codes as join keys across datasets.

- **Coverage:** National — states, districts, sub-districts, blocks, GPs, villages, ULBs, wards
- **Format:** CSV via [daily archive](https://ramseraph.github.io/opendata/lgd/)
- **Updates:** Daily
- **Why it matters:** Names vary ("BBMP" = "Greater Bengaluru Authority" = "Bruhat Bengaluru Mahanagara Palike"). LGD codes are stable across renames.

## Civic data aggregators

### [OpenCity.in](https://data.opencity.in)

The backbone of civic data in India. CKAN-based portal with 500+ datasets across cities.

- **Coverage:** 10+ major cities, strongest for Bengaluru, Chennai, Pune
- **Format:** CSV, PDF, KML
- **API:** CKAN REST API
- **Strong cities:** Bengaluru (100+ datasets), Chennai (51), Pune (40 + dedicated open data portal)
- **Weak cities:** Ahmedabad (4), Kolkata (17)

### [Open Budgets India](https://openbudgetsindia.org)

Municipal budget documents for ~60 corporations.

- **Coverage:** 60 municipal corporations
- **Format:** CSV / Excel / PDF mix
- **Strong:** Pune (10-year CSV), some metro corporations
- **Weak:** Most cities only have PDF — requires OCR/manual extraction

## National grievance

### [CPGRAMS](https://pgportal.gov.in)

Centralized Public Grievance Redress and Monitoring System — national grievance portal covering all central government departments and cooperating states.

- **Coverage:** National, government-wide
- **Format:** Web portal, no public API
- **Practical use:** File grievances; no bulk data access for analysis

## Procurement

### [eprocure.gov.in](https://eprocure.gov.in)

Central eProcurement — lists tenders from all government departments and many municipal corporations.

- **Coverage:** National
- **Format:** HTML (scrapeable)
- **Use case:** Cross-city contractor tracking, tender volume analysis

---

## Adding a source

Documented a new pan-India data source? Add a page here via PR. Template: see any existing source page, or [use the findings template as a starting structure](../bengaluru/findings/_template.md) adapted for data sources.
