# Civic Data Commons

**An open knowledge base for Indian civic data — built with and for the civic community.**

This is the shared data layer underneath [kaun.city](https://kaun.city) and other civic tools. Contractor profiles, verified findings, data source documentation, and RTI responses — all community-maintained, all cited, all consumable via public JSON APIs.

## What's inside

| Section | What |
|---|---|
| [**Bengaluru**](bengaluru/index.md) | Contractors, findings, data sources, RTI archive, ward profiles |
| [**Visakhapatnam**](visakhapatnam/index.md) | UPYOG/CDMA service data, AP eProc tenders, GVMC budget, GSWS coverage, outreach drafts |
| [**Sources**](sources/index.md) | Pan-India data sources shared across cities |
| [**About**](about/partners.md) | Partners, contributing, API documentation |

## Cities covered

- **[Bengaluru](bengaluru/index.md)** — Live. 243 wards, 1,305 contractor profiles, verified findings documented, BBMP/KPPP/IFMS sources integrated. *Accountability tone.*
- **[Visakhapatnam](visakhapatnam/index.md)** — Live. 98 GVMC wards, UPYOG (CDMA Open Portal) ward-level service data, AP eProcurement awarded tenders, GVMC FY24-25 budget, RTGS + GSWS context. *Transparency tone* — AP's open-data infrastructure is genuinely best-in-class and the editorial framing leads with what's working.
- **Hyderabad** — In development. 150 GHMC wards, elected reps seeded.
- **Pune, Chennai, Mumbai, Delhi** — On the roadmap. Data sourcing in progress.
- **Vijayawada, Tirupati, Guntur, Kakinada, Nellore, Kurnool, Rajahmundry** — Adapter built (`scripts/adapters/upyog.mjs`). Each is one config file + ward GeoJSON away from being live, since all 123 AP ULBs share the UPYOG/DIGIT backend.

Your city not here? [Request it on GitHub](https://github.com/kaun-city/kaun/issues/new?template=city-request.yml).

## Built with the civic community

This commons exists because activists and journalists shared what they had built:

- **[BNP (Bengaluru Navanirmana Party)](https://bright.nammabnp.org)** — 63,629 BBMP projects documented, the Rs 4,700 Cr KRIDL scam investigation
- **Civic journalists** — ghost worker scam coverage (TNM, Deccan Herald, Swarajya)
- **[kaun.city](https://kaun.city)** — entity-resolved contractor profiles, ward-level aggregation, citizen interface

Each partner brings a piece. Together it becomes infrastructure that no single project could build alone.

See [Partners & Contributors](about/partners.md) for the full list.

## How to use this data

### Browse
Navigate by city above. Every claim cites a source. Every page is editable via GitHub PR.

### Consume (for civic tools)
Four public JSON APIs, CORS-enabled, no auth:

```
https://kaun.city/api/data/wards
https://kaun.city/api/data/contractors
https://kaun.city/api/data/reps
https://kaun.city/api/data/spending
```

Full documentation: [API reference](about/api.md) · [Data catalog](https://kaun.city/data)

### Contribute
- **Document a contractor** — add a profile with known aliases, phone numbers, flags
- **File a finding** — verified civic scandal with sources and evidence
- **Upload an RTI response** — scanned document + summary
- **Correct data** — every page has an edit button; open a PR

See [Contributing](about/contributing.md) for the full guide.

## License

- Wiki content: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Code (kaun.city platform + APIs): [MIT](https://github.com/kaun-city/kaun/blob/master/LICENSE)
- Data: from public records (government portals, RTI responses, open data portals)

## Links

- [kaun.city](https://kaun.city) — the map-first citizen interface
- [data.kaun.city](https://data.kaun.city) — this wiki
- [GitHub repo](https://github.com/kaun-city/kaun)
- [BNP B-RIGHT portal](https://bright.nammabnp.org)
