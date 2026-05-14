# Visakhapatnam (GVMC)

**98 wards · 21 lakh residents · Greater Visakhapatnam Municipal Corporation**

Visakhapatnam is the second city deployed on kaun.city. The data tells a different story than Bengaluru, and the platform reflects that.

## Why Vizag is different

Andhra Pradesh has invested seriously in digital governance infrastructure, and it shows in the data:

- **All 123 AP urban local bodies run on UPYOG** (eGov Foundation's open platform) — a uniform digital backbone for property tax, trade licenses, building plans, water connections, and grievances since 2015.
- **The CDMA Open Portal** (`apcdmaopenportal.emunicipal.ap.gov.in`) exposes ward-level service request and revenue analytics publicly, without authentication. This is closer to what civic transparency *should* look like than anything else in India.
- **The CORE dashboard** at `core.ap.gov.in/cmdashboard` aggregates 193 services across 45 departments in real time. Conceived under former CM Chandrababu Naidu, it remains India's most ambitious real-time governance dashboard.
- **AP e-procurement** publishes awarded tender data without a login wall. Karnataka and Telangana lock this behind a session.
- **GSWS (Grama-Ward Sachivalayam)** runs 15,000+ secretariats with ward-granular service delivery tracking — the densest civic-services infrastructure in any Indian state.

Kaun.city for Vizag is built on top of this infrastructure rather than around the absence of it. The framing here is **transparency** — surfacing what's working, where service requests resolve fastest, which wards have the highest scheme uptake — rather than **accountability** in the BBMP sense of exposing scams.

That doesn't mean problems don't exist. It means the data trail is healthier and citizens benefit from a different kind of layer on top.

## What Vizag shows you

When you drop a pin in Vizag, you see:

- **Who represents you** — MLA (from MyNeta 2024 affidavits) and corporator (from the 2024 GVMC ward delimitation).
- **What's happening in your ward** — open grievances and resolution times from the CDMA Open Portal. Property tax collections. Trade license activity.
- **What's getting built** — GVMC and VMRDA tenders + awarded contracts from AP e-procurement.
- **The neighbourhood** — schools, hospitals (Aarogyasri-empanelled), pharmacies, ATMs, public toilets, bus stops, EV charging — from OpenStreetMap.
- **Real-time signals** — air quality from CPCB stations, power outages from APEPDCL OMS, cyclone alerts from APSDMA.
- **What you can do** — file a Spandana grievance, look up your assessment, access GSWS services, draft an RTI.

## How this scales

The same UPYOG adapter that powers Vizag works for **122 other AP ULBs**. Vijayawada, Tirupati, Guntur, Kakinada, Nellore, Kurnool, Rajahmundry, Anantapur, Kadapa, Eluru — once Vizag is live, each additional AP city is days of work, not weeks.

This is the strategic asset: AP's standardised civic infrastructure means kaun.city goes from "Bengaluru transparency tool" to "AP-wide civic platform" with one well-built integration.

## Data sources

→ [GVMC eMunicipal](sources/gvmc-emunicipal.md) — property tax, trade licenses, building plans (ward-granular)<br>
→ [CDMA Open Portal](sources/cdma-portal.md) — grievances, service requests, revenue analytics<br>
→ [AP e-Procurement](sources/ap-eproc.md) — tenders and awarded contracts<br>
→ [GSWS](sources/gsws.md) — Grama-Ward Sachivalayam (15K+ secretariats, scheme delivery)<br>
→ [APSDMA GIS](sources/apsdma.md) — disaster response, cyclone tracking, AWS data<br>
→ [APPCB / CPCB](sources/appcb.md) — air and water quality monitoring<br>
→ [APEPDCL OMS](sources/apepdcl.md) — feeder-level power outage data<br>
→ [APRERA](sources/aprera.md) — real estate registrations and approvals<br>
→ [MyNeta AP](sources/myneta-ap.md) — MLA affidavits, criminal cases, assets<br>
→ [Open Budgets India — GVMC](sources/openbudgets-gvmc.md) — function-wise receipts and expenditure<br>
→ [Datameet / OpenCity](sources/opencity-datameet.md) — ward boundaries, Census, primary spatial data<br>
→ [Yo Vizag](sources/yovizag.md) — local journalism feed for City Pulse<br>

## Findings

→ [98-ward delimitation (2024)](findings/ward-delimitation-2024.md) — what changed and why historical data needs a layer<br>
→ [Operation Lungs encroachment removal](findings/operation-lungs.md) — GVMC's coastal forest reclamation drive<br>

## Acknowledgements

This deployment owes its data layer to:

- **eGov Foundation** for UPYOG / DIGIT — the open-source platform that powers AP's 123 ULBs and made this build feasible in days rather than months
- **CDMA Andhra Pradesh** for keeping the open portal actually public
- **OpenCity Foundation / DataMeet** for the 98-ward GVMC GeoJSON
- **MyNeta / ADR** for elected representative data
- **Yo Vizag** for being the closest thing to local civic journalism in Vizag

> Vizag is on kaun.city because AP made it possible. Not despite the state — because of it.

---
*Last updated: 2026-05-06*
