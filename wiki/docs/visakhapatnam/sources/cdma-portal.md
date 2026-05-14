# AP CDMA Open Portal

**The single most important data source for Visakhapatnam.**

## Portal

- **Open portal**: [apcdmaopenportal.emunicipal.ap.gov.in](https://apcdmaopenportal.emunicipal.ap.gov.in/)
- **Application dashboard**: [apcdmaopenportal.emunicipal.ap.gov.in/application-dashboard](https://apcdmaopenportal.emunicipal.ap.gov.in/application-dashboard/)
- **CDMA umbrella**: [cdma.ap.gov.in](https://cdma.ap.gov.in/)
- **GVMC-specific page**: [cdma.ap.gov.in/en/gvmc-visakhapatnam](https://cdma.ap.gov.in/en/gvmc-visakhapatnam)
- **Backend platform**: UPYOG (eGov Foundation open-source DIGIT-Urban)
- **Status**: Active, public, no login required

## What's accessible

The portal is the citizen-facing analytics layer over AP's UPYOG deployment across all 110 ULBs. For Vizag specifically:

| Surface | What it shows | Granularity |
|---|---|---|
| Service Requests | Open / closed / SLA-breached requests by category | ULB → ward → locality |
| Request Analysis | Trends over time, rolling averages | ULB → ward |
| Service Type Analysis | Which services citizens use most | ULB |
| Source Analysis | Channel (mobile, kiosk, helpline, walk-in) | ULB |
| Compensation Tracking | Citizen Charter-mandated compensation paid for SLA breaches | ULB |
| Revenue Dashboard | Property tax, trade licence, water charges collected | ULB |

The **Citizen Charter compensation** number is the genuinely novel signal — when a service breaches its mandated SLA, the citizen is owed compensation, and the portal tracks how much has actually been paid out. No other Indian state exposes this publicly.

## What kaun.city pulls from it

Phase 1 (in progress):

- **Grievances per ward** — open vs closed, average resolution time, top 3 categories
- **Property tax collection per ward** — annual collection, % of demand realised, defaulter count
- **Trade licence activity** — new vs renewal vs cancelled, top trade types

Phase 2:

- **SLA breach map** — which ward × service-type combinations breach most frequently
- **Compensation paid** — total paid out per ward (a real measure of how seriously the SLA is taken)
- **Channel mix** — where citizens prefer to interact (mobile vs walk-in)

## How we access it

The portal renders dashboards as HTML with embedded JSON. The adapter (`scripts/adapters/upyog.mjs`) navigates to per-ULB views and extracts the underlying data. No API key, no authentication.

The same adapter works for any of AP's 123 ULBs — Vijayawada (`vijayawada.cdma.ap.gov.in`), Tirupati, Guntur, Kakinada, Nellore — by changing one URL parameter.

## Why this matters for AP

UPYOG / DIGIT is open-source civic infrastructure shipped by eGov Foundation. AP committed to it across all 110 ULBs in 2015 and has stayed with it. That commitment is the reason kaun.city for Vizag exists — the data is uniform, public, and ward-granular.

Compare to Karnataka, where BBMP runs custom legacy systems and we had to build adapters per portal (KPPP, IFMS, Sahaaya, KGIS, opencity.in mirroring) to get even a partial view.

## Related

- [GVMC eMunicipal](gvmc-emunicipal.md) — citizen-facing transactional layer (the same UPYOG backend)
- [GSWS](gsws.md) — village/ward secretariat layer (separate system, complementary granularity)
- [eGov Foundation DIGIT](https://digit.org/) — the platform itself, MIT-licensed

---
*Last updated: 2026-05-06*
