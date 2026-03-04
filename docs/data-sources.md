# Kaun — Data Sources Master List

Last updated: 2026-03-04

## Status Legend
- ✅ Live in app
- 🟡 Data available, not yet ingested
- 🔴 Blocked / needs auth / broken API
- 🔵 Needs scraping / no direct download

---

## Already Live

| Dataset | Source | Notes |
|---|---|---|
| BBMP Grievances 2024 + 2025 | opencity.in | 334K rows → ward aggregates |
| BBMP Trade Licenses 2025 | opencity.in | 444K rows → ward+year aggregates |
| BBMP Work Orders 2024-25 | opencity.in | 465 rows seeded |
| KPPP Tenders (BBMP) | kppp.karnataka.gov.in | 1,446 tenders; weekly cron |
| Sakala Performance Rankings | sakala.karnataka.gov.in | 28 ACs; monthly cron |
| Ward Public Goods Stats | opencity.in/BBMP | 198 wards; one-time static |

---

## Ready to Ingest (opencity.in — CKAN API works, CSVs available)

### Infrastructure
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| BBMP Parks | `bebaa2e8-cb85-4be2-a084-4927943513a9` | 11 | Ward-level parks data |
| Bengaluru Parks & Playgrounds | `ef2c49c9-2d0f-472a-921d-869c702b59c6` | 5 | Includes playground locations |
| Bengaluru Streetlights | `68bab2e1-a94b-4ad5-b1b5-dc9658e462e4` | 4 | Ward-wise streetlight counts |
| BBMP Road History | `478a42e2-4980-4af1-92d5-6ec771497606` | 66 | Road work history per zone |
| BBMP Roads Projects | `865313bc-c287-406a-be69-1b23c8392fca` | 7 | Ongoing road projects |
| Bengaluru Stormwater Drains | `fc97e05c-c54b-44e9-8d98-7663ee887922` | 13 | Drain maps by zone |
| Flooding Locations | `b03218ea-4b7c-4fa9-ab67-b9054d7ecc4c` | 3 | Low-lying/flood prone areas |
| BBMP Solid Waste Management Plans | `c7cbb05f-e919-4547-b4b9-3f4f36d6cf3e` | 217 | Per-ward SWM plans |
| RRR Centres | `524f56ce-68b7-40c6-9448-2dfb3a634fc4` | 3 | Recycling centres in Bengaluru |

### Work Orders (Historical)
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| Work Orders by Ward 2013-22 | `d22cea6d-5256-43af-8ad5-68db551e0760` | 198 | One CSV per ward — 10 years of history |
| Work Orders Categorised 2018-23 | `b130b893-ce8d-4fd6-a916-d145084b986b` | 4 | Grouped by ward + category |
| Work Orders & Bill Payment | `968e5202-74ed-4279-92df-7b7a1a111108` | 87 | Payment status included |
| Work Orders 2022-23 | `57ab37f1-b93e-40be-b553-c528bfcbf12d` | 1 | Single CSV |
| Work Orders 2023-24 | `356bfc9c-6abe-4d16-b719-a90e265c2e28` | 1 | Single CSV |

### Health & Education
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| Bengaluru Hospitals | `fcd871ba-47c5-4542-aebd-946ebfac3011` | 4 | BBMP hospitals + maternity homes |
| Bengaluru Urban PHCs | `b7a0a3ea-36b4-4706-9f63-b139097e089e` | 3 | Public Health Centres |
| Bengaluru Schools | `947c79ea-7377-463d-8aae-2816b423b94f` | 5 | BBMP primary schools |
| Crematoriums & Burial Grounds | `846ff5ff-24be-4ce0-9814-7424e6f4533e` | 2 | |

### Environment
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| Bengaluru Lakes Data | `36741bed-897a-496a-aec3-24341aec1953` | 11 | Lakes by ward + water levels |
| Bengaluru Lakes Map | `14aaf1e9-d3a9-4d5a-b698-bb93bd064264` | 4 | GIS data |
| BBMP Street Dogs Survey 2023 | `448cdb35-7249-4ca7-8523-75e1e20632cf` | 4 | Zone-wise stray dog population |

### Civic Participation
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| BBMP Fix My Street Data | `3a1a98f8-f924-4257-a2a1-3b957b55b9f5` | 2 | Pothole complaints May-Jun 2022 |
| Ward Committee Meetings | `4bf0928b-ab6b-4a13-8d24-53b739e1cdc3` | 1 | Meetings held 2020-22 per ward |
| BBMP Ward Information | `87b978d1-352e-4b90-aa2c-9991e55d3425` | 13 | General ward info |

### Budget & Finance
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| BBMP Budget 2025-26 | `9a3ed136-1251-4f2a-aec6-1d62034bef1d` | 8 | Latest budget book |
| BBMP Budget 2024-25 | `9d3f1f19-5e78-46a2-baad-e9a1e25deadd` | 8 | Already partially seeded |
| BBMP Expenditure & Receipts | `bab726c5-370b-4f04-b5ce-2958c92b65ed` | 4 | Year-wise financials |
| BBMP ATR on Budget | `6d3f67c0-8200-471f-8207-bfb59fa163d6` | 4 | Action Taken Reports |
| MyCityMyBudget Reports | `1ab4c290-4cf7-4b72-bf45-b61799b7704c` | 4 | Citizen budget analysis |

### Elections & Governance (GBA 2026)
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| GBA Ward Reservations 2026 | `e6356d29-ce41-4bc7-8292-bbd790070e14` | 5 | SC/ST/OBC/Women reservations by ward |
| GBA Voter Rolls 2026 | `6c256e19-6c68-404a-a19c-903afa148ed0` | 1 | Ward-wise voter counts |
| GBA Wards Delimitation 2025 | `863209cb-4ced-4f51-b5c5-156939c50922` | 20 | New 5-corporation boundaries |
| GBA Corporations Delimitation | `3faa72e4-688f-4896-bfbb-0ee5a848bbd6` | 7 | Full GBA zone maps |
| Bengaluru Ward-wise Street Map | `9b732006-d0f0-4df2-bf2a-06b02b224104` | 392 | Street-level maps per ward |
| Polling Booth Maps | `8f15ebad-69fa-4c68-9078-a111c36338d6` | 31 | Per-constituency booth maps |

### Transport
| Dataset | ID | Resources | Notes |
|---|---|---|---|
| BMTC Bus Stops by Ward | `c4d9efee-e13b-4fe9-b5db-ce034a153e55` | 57 | Bus routes + stops per ward |
| Bengaluru Public Transport | `22c502bf-1fe1-4455-8ec4-97baab1989ad` | 12 | Infrastructure overview |

---

## External APIs / Scrapers

| Source | URL | Status | Notes |
|---|---|---|---|
| KPPP Karnataka | kppp.karnataka.gov.in | ✅ Working | BBMP works/goods/services tenders; BWSSB/BDA returning 400 — possibly different body format needed |
| Sakala Karnataka | sakala.karnataka.gov.in | ✅ Working | AC-level Sakala rankings; JSON API |
| Myneta.info | myneta.info/Karnataka2023 | 🔵 Scrapeable | MLA criminal cases + assets (already scraped) |
| CPCB Air Quality | cpcbccr.com | 🔴 DNS broken | BBMP runs 4 Bengaluru AQI stations |
| OpenAQ | api.openaq.org/v3 | 🔴 Needs API key | Free tier available; covers KSPCB/CPCB stations |
| data.gov.in | data.gov.in | 🔴 422 on all filters | SPA, API broken for filtered queries |
| BESCOM | bescom.co.in | 🔴 No API | Outage data only on app/portal |
| KSEC | ksec.kar.nic.in | 🔴 DNS fail | Election commission Karnataka |
| BWSSB | bwssb.karnataka.gov.in | 🔴 No API | Water supply complaints only via portal |

---

## Priority Ranking (what to do next)

### High value, easy to ingest
1. **Schools** — ward-level, gives "civic amenities" story
2. **Hospitals/PHCs** — same; essential services per ward
3. **Parks** — ward-level CSV ready to go
4. **BBMP Budget 2025-26** — latest financials, good for Expenses tab
5. **GBA Ward Reservations 2026** — hot topic pre-election; SC/ST/OBC/Women quotas

### High value, more work
6. **Work Orders 2013-22** (198 CSVs) — 10 years of spending per ward; needs aggregation
7. **Streetlights** — count per ward; easy to ingest
8. **Flooding locations** — map layer, needs GeoJSON processing
9. **Lakes data** — water levels over time, good environment tab
10. **BMTC bus stops** — connectivity metric per ward

### Needs external API/auth
11. **Air quality** — OpenAQ free tier (needs signup), 4 Bengaluru CPCB stations
12. **KPPP for BWSSB/BDA** — same scraper, different title search

---

## Notes
- opencity.in CKAN API: `https://data.opencity.in/api/3/action/`
  - `package_show?id=<dataset_id>` → list resources
  - `datastore_search?resource_id=<id>&limit=100` → query rows (when datastore enabled)
  - Most datasets: download CSV directly from resource URL
- KPPP body format: `{ category: "WORKS"|"GOODS"|"SERVICES", status: "ALL", title: "<search>" }`
  - Endpoint: `/portal-service/works/search-eproc-tenders` (works)
  - Paginated via `?page=N&size=100`
