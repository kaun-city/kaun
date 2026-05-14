# GVMC eMunicipal

**The citizen-facing transactional layer over UPYOG for GVMC.**

## Portal

- **City portal**: [visakhapatnam.emunicipal.ap.gov.in](https://visakhapatnam.emunicipal.ap.gov.in/)
- **Property tax search**: [/ptis/citizen/search/search-searchForm.action](https://visakhapatnam.emunicipal.ap.gov.in/ptis/citizen/search/search-searchForm.action)
- **GVMC main site**: [gvmc.gov.in](https://gvmc.gov.in/)
- **GVMC tax portal**: [gvmc.gov.in/wss/PtAssessmentOnline.htm](https://gvmc.gov.in/wss/PtAssessmentOnline.htm)
- **Status**: Active, public, no login for lookups

## What citizens can do here

- Look up any property by **assessment number, owner name, or door number**
- View tax demand and collection (DCB — Demand, Collection, Balance) — full payment history
- Pay property tax online
- Apply for a new assessment, mutation, or revision
- Apply for trade licence (new / renewal)
- Apply for water connection, sewerage connection
- Submit building plan applications
- Submit grievances (routed into UPYOG-PGR)

## What kaun.city uses

Phase 1: **Property tax aggregates per ward** — total demand, total collected, % realised, default rate. Pulled via the search endpoint, aggregated nightly.

Phase 2: **DCB time series** — per-ward collection trend over the last 5 years.

Phase 3: **Top defaulters** (only after privacy review) — published commercial defaulters above a threshold; never residential.

## Cross-ULB pattern

All 110 AP ULBs follow the URL pattern `{ulb}.emunicipal.ap.gov.in`:

- Vizag: `visakhapatnam.emunicipal.ap.gov.in`
- Vijayawada: `vijayawada.emunicipal.ap.gov.in`
- Tirupati: `tirupati.emunicipal.ap.gov.in`
- Kakinada, Nellore, Kurnool, Guntur, Rajahmundry, etc.

This is by far the cleanest cross-city pattern in any Indian state. One adapter, 110 cities.

## Why this is unusual

In most Indian cities, looking up your own property tax online is either:
1. Impossible (paper-only)
2. Possible but the underlying data is locked behind login walls citizens never use
3. Possible but the system is so brittle that the data isn't reliable

AP's eMunicipal predates the UPYOG branding — it's the same platform that became DIGIT-Urban, now adopted in Punjab, Odisha, and elsewhere. Vizag was effectively a launch customer.

## Related

- [CDMA Open Portal](cdma-portal.md) — analytics layer over the same UPYOG backend
- [GSWS](gsws.md) — neighbourhood secretariats, separate transactional system

---
*Last updated: 2026-05-06*
