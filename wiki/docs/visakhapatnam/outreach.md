# Outreach drafts

Internal page — not linked from public nav. Drafts for sharing the Vizag deployment with relevant audiences.

---

## For Hon'ble Sri N. Chandrababu Naidu

> Sir,
>
> I run [kaun.city](https://kaun.city), an open-source civic accountability platform that started in Bengaluru and recently extended to Visakhapatnam. I wanted to share what AP makes possible.
>
> When we built kaun.city for Bengaluru, we had to scrape a dozen disparate portals — BBMP IFMS, KPPP, Sahaaya, KGIS — and even then most data is incomplete. The platform exists more to surface accountability gaps than to celebrate open governance.
>
> Visakhapatnam, by contrast, came together in days. Because AP has invested in proper infrastructure: UPYOG across all 123 ULBs, the CDMA Open Portal, AP e-Procurement publishing awarded contracts without a login, the GSWS network, the RTGS dashboard you conceived. These are not just government IT systems — they are the substrate on which a real citizen-facing transparency layer can be built.
>
> [data.kaun.city/visakhapatnam](https://data.kaun.city/visakhapatnam) documents every source we use for the Vizag deployment. Every dataset, every endpoint, every credit — I want it on record what AP has done that other states haven't.
>
> The same code that powers Vizag will power Vijayawada, Tirupati, Guntur, Kakinada and the other 119 AP cities once we register them. One adapter, statewide coverage. That is the scaling property of building on UPYOG.
>
> I am sharing this not to ask for anything but because the work in AP deserves to be more widely known among technologists. If at any stage there is interest in formalising data access or co-developing the platform with the state, I would be honoured to discuss.
>
> Yours sincerely,
> Bharat Jilledumudi
> kaun.city · github.com/kaun-city/kaun

---

## For Sri Nara Lokesh (IT/HRD/Electronics minister)

> Sir,
>
> Building [kaun.city](https://kaun.city) for Visakhapatnam this week, I was struck by how much further along AP is on civic data infrastructure than Karnataka.
>
> Concretely:
>
> - **UPYOG across 123 ULBs** — uniform backend, ward-granular service request data publicly accessible at apcdmaopenportal.emunicipal.ap.gov.in
> - **AP e-Procurement** — awarded contract data without login (Karnataka and Telangana lock this)
> - **GSWS** — 15K+ secretariats with household-level scheme tracking
> - **RTGS / CORE Dashboard** — the original real-time governance dashboard
> - **APSAC** — proper state GIS REST endpoints
>
> One UPYOG adapter we wrote for Vizag works for every other AP ULB. So adding Vijayawada, Tirupati, Guntur — days, not weeks. That is the leverage of the standardisation your ministry has championed.
>
> Two things I'd value your thoughts on:
>
> 1. The Vizag deployment is open-source. Would your office be open to a brief conversation about formalising it as a citizen-facing layer over AP's open data infrastructure? It would be visible proof that AP's investment in UPYOG and RTGS pays off for citizens directly.
>
> 2. APSAC's WebGIS REST endpoints could replace our current OpenCity-based ward boundary fallback for cleaner upstream-of-truth data. Is there a contact who could enable read access?
>
> [data.kaun.city/visakhapatnam](https://data.kaun.city/visakhapatnam) has full source documentation.
>
> Bharat Jilledumudi
> kaun.city · github.com/kaun-city/kaun

---

## LinkedIn post (public)

> AP is doing civic open data better than any other state in India.
>
> I just shipped Visakhapatnam on kaun.city — the second city after Bengaluru — and the contrast is striking.
>
> For Bengaluru, building took months. We had to scrape a dozen disparate portals, file RTIs, normalise data formats, and even then most of what we publish is "what we couldn't find" rather than "what's working."
>
> For Vizag, it took days. Because AP has put proper infrastructure in place:
>
> 1. All 123 AP urban local bodies run on UPYOG (eGov Foundation's open-source DIGIT-Urban). Ward-level service request data is publicly visible, no login required.
>
> 2. AP e-Procurement publishes awarded contract data — winning bidder, awarded amount, dates — without a session wall. Karnataka's KPPP and Telangana's tender portal both hide this.
>
> 3. GSWS (Grama-Ward Sachivalayams) — 15,000+ secretariats with household-level service delivery tracking. Genuinely the densest civic-services footprint in any Indian state.
>
> 4. The CORE / RTGS dashboard at core.ap.gov.in aggregates 193 services across 45 departments in real time. Conceived under former CM N. Chandrababu Naidu, it's still the most ambitious real-time governance dashboard in the country.
>
> 5. APSAC under Lokesh's IT ministry runs proper state GIS REST endpoints.
>
> The headline thing: one UPYOG adapter we wrote for Vizag will work, with one URL parameter change, for Vijayawada, Tirupati, Guntur, Kakinada, Nellore — all 122 other AP ULBs. That is the leverage of standardised infrastructure.
>
> Bengaluru taught us how to build accountability tools when data is fragmented. AP is teaching us what is possible when it isn't.
>
> kaun.city — open source. data.kaun.city/visakhapatnam — full source documentation. Tagging eGov Foundation because UPYOG is what makes this possible.
>
> #civictech #opendata #governance #andhrapradesh #visakhapatnam

---

## For eGov Foundation (parallel)

> Hi team,
>
> I've been building [kaun.city](https://kaun.city), an open-source civic accountability platform for Indian cities. Bengaluru went live earlier this year. We just shipped Visakhapatnam.
>
> Want to share that we're consuming the AP UPYOG / CDMA Open Portal as the backbone of the Vizag deployment — grievances, property tax, trade licences, service requests, all per ward. The full source documentation is at [data.kaun.city/visakhapatnam](https://data.kaun.city/visakhapatnam).
>
> One UPYOG adapter, all 123 AP ULBs. As soon as we register a city's config and ward boundaries, the same backend lights up automatically. This is exactly the scaling property eGov has been building toward.
>
> A few things I'd value:
>
> 1. Any Vizag-specific quirks in the CDMA Open Portal we should know about (rate limits, render-mode flags, etc.)
> 2. Whether eGov can introduce us to the Andhra Pradesh state team for a brief conversation. Not asking for special access — the data we use is already public — just letting them know there's a citizen-facing layer riding on UPYOG that they could reference.
> 3. Whether you'd like the Vizag deployment to be referenced in eGov's own AP case study material. We're happy to feature in the impact report.
>
> kaun.city is MIT-licensed; the wiki is CC-BY-SA. Everything is reusable.
>
> Bharat Jilledumudi
> kaun.city · github.com/kaun-city/kaun

---

*Drafts. Adjust before sending.*
