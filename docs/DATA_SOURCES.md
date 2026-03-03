# Kaun Data Sources Registry

Curated list of authoritative, open data sources for civic transparency in India,
with focus on Bengaluru / Karnataka. Each entry notes what data it provides,
whether it has an API, and how Kaun should use it.

---

## 🏛️ Elected Representatives

### myneta.info (ADR / National Election Watch)
- **URL:** https://myneta.info
- **Data:** Criminal cases, assets, education, liabilities for every candidate
- **Karnataka 2023:** https://myneta.info/Karnataka2023/
- **API:** No official API, but structured HTML (scrapable)
- **Kaun use:** Profile links for all MLAs. Future: scrape criminal case count, asset data, and show on WHO tab as "X criminal cases pending"
- **Trust level:** High (sourced from ECI affidavits)

### PRS Legislative Research
- **URL:** https://prsindia.org
- **Data:** Bill tracking, MLA attendance, questions asked, debates participated
- **Karnataka:** https://prsindia.org/state-legislatures/karnataka
- **API:** No, but structured pages
- **Kaun use:** Link MLA profiles. Future: scrape attendance %, questions asked → MLA performance score
- **Trust level:** Very high (independent research org, cited by media)

### Lok Dhaba (Trivedi Centre, Ashoka University)
- **URL:** https://lokdhaba.ashoka.edu.in
- **Data:** Historical election data, vote shares, margins, turnout by constituency
- **API:** Yes — downloadable datasets
- **Kaun use:** Show "MLA won by X% margin" on WHO tab. Electoral history per constituency.
- **Trust level:** Very high (academic)

### Election Commission of India
- **URL:** https://results.eci.gov.in / https://eci.gov.in
- **Data:** Official election results, candidate lists, voter data
- **Kaun use:** Canonical source for election results. Currently used as `data_source`.
- **Trust level:** Authoritative (govt)

### Karnataka Legislative Assembly
- **URL:** https://kla.kar.nic.in
- **Data:** MLA profiles, session proceedings, questions, bills
- **Kaun use:** Official MLA profile links (when the site is up — it's often down)
- **Trust level:** Authoritative (govt)

---

## 💰 Money / Tenders / Budgets

### KPPP (Karnataka Public Procurement Portal)
- **URL:** https://kppp.karnataka.gov.in / https://eproc.karnataka.gov.in
- **Data:** All government tenders, contractor details, award values
- **API:** No, but scrapable
- **Kaun use:** Primary source for MONEY tab. Scrape tender data per ward/department.
- **Trust level:** Authoritative (govt)

### Open Budgets India (CBGA)
- **URL:** https://openbudgetsindia.org
- **Data:** Union + state budgets, expenditure data, district allocations
- **Karnataka:** Budget docs, expenditure analysis
- **Kaun use:** Show ward-level budget allocations when available. Link to city/zone budgets.
- **Trust level:** High (CBGA is a respected fiscal policy org)

### GBA / BBMP Budget Documents
- **URL:** https://bbmp.gov.in (archived) / GBA official site
- **Data:** Ward-wise budget allocation, expenditure reports
- **Kaun use:** Direct ward budget data → MONEY tab
- **Trust level:** Authoritative (govt)

### GEM (Government e-Marketplace)
- **URL:** https://gem.gov.in
- **Data:** Government procurement, vendor ratings, order history
- **API:** Yes (limited)
- **Kaun use:** Cross-reference contractor names from KPPP with GEM ratings
- **Trust level:** Authoritative (govt)

---

## 📋 Grievances & Complaints

### Sampark Karnataka
- **URL:** https://sampark.karnataka.gov.in
- **Helpline:** 1902
- **Data:** Grievance filing, status tracking across all state departments
- **Kaun use:** Already linked in REPORT tab. Could scrape aggregate complaint counts per ward.
- **Trust level:** Authoritative (govt)

### BWSSB Complaint Portal
- **URL:** https://bwssb.karnataka.gov.in
- **Helpline:** 1916
- **Data:** Water/sewage complaints
- **Kaun use:** Link in REPORT tab under BWSSB agency
- **Trust level:** Authoritative (govt)

### BESCOM
- **URL:** https://bescom.karnataka.gov.in
- **Helpline:** 1912
- **Data:** Power outage complaints, bill queries
- **Kaun use:** Link in REPORT tab under BESCOM agency
- **Trust level:** Authoritative (govt)

### PGRS (Public Grievance Redressal System)
- **URL:** https://pgrs.karnataka.gov.in
- **Data:** State-level grievance tracking
- **Kaun use:** Alternative to Sampark for filing
- **Trust level:** Authoritative (govt)

---

## 🗺️ Spatial / Geographic

### DataMeet
- **URL:** https://github.com/datameet/Municipal_Spatial_Data
- **Data:** Ward boundaries (GeoJSON), constituency boundaries
- **Kaun use:** Currently using BBMP.geojson for ward boundaries + old wards for assembly mapping
- **Trust level:** High (community-curated from official sources)

### KGIS (Karnataka Geographic Information System)
- **URL:** https://kgis.ksrsac.in
- **Data:** Official ward boundaries, land use, infrastructure layers
- **Kaun use:** Alternative/validation source for ward boundaries
- **Trust level:** Authoritative (govt)

### Bhuvan (ISRO)
- **URL:** https://bhuvan.nrsc.gov.in
- **Data:** Satellite imagery, administrative boundaries
- **Kaun use:** Backup spatial data source
- **Trust level:** Authoritative (govt)

---

## 📰 Community / Crowdsourced / News

### r/bangalore (Reddit)
- **URL:** https://reddit.com/r/bangalore
- **API:** Reddit API (limited free tier)
- **Kaun use:** Already integrated — BUZZ section shows ward-relevant posts
- **Trust level:** Community (unverified, but useful signal)

### Janaagraha (Civic Participation)
- **URL:** https://janaagraha.org
- **Data:** Annual Survey of India's City-Systems (ASICS), civic participation data
- **Kaun use:** City governance quality scores, benchmarking
- **Trust level:** High (established civic org)

### I Paid A Bribe
- **URL:** https://ipaidabribe.com
- **Data:** Crowdsourced bribery reports by department/location
- **Kaun use:** Could aggregate bribery reports per dept shown in a ward's agencies
- **Trust level:** Community (crowdsourced, unverified)

### LocalCircles
- **URL:** https://localcircles.com
- **Data:** Citizen surveys, governance satisfaction scores
- **Kaun use:** Link to relevant surveys for the city
- **Trust level:** Medium (survey-based)

---

## 🏗️ Infrastructure & Services

### Fixmystreet.in / Swachh Bharat App
- **Data:** Reported civic issues (potholes, garbage, streetlights)
- **Kaun use:** Future: aggregate issue reports per ward for a "civic health" score
- **Trust level:** Community

### BMTC / Namma Metro
- **URL:** https://mybmtc.karnataka.gov.in / https://english.bmrc.co.in
- **Data:** Route data, station locations
- **Kaun use:** Show transit connectivity per ward
- **Trust level:** Authoritative (govt)

---

## 📊 Open Data Portals

### data.gov.in
- **URL:** https://data.gov.in
- **Data:** National open data platform — census, infrastructure, schemes
- **API:** Yes (CKAN-based)
- **Kaun use:** Census data per ward (population, literacy, etc.)
- **Trust level:** Authoritative (govt)

### Karnataka Open Data
- **URL:** https://data.karnataka.gov.in (if active)
- **Data:** State-specific datasets
- **Kaun use:** Any ward-level datasets available
- **Trust level:** Authoritative (govt)

---

## 🔍 RTI / Legal

### RTI Online
- **URL:** https://rtionline.gov.in
- **Data:** File RTI applications to central govt bodies
- **Kaun use:** Link from REPORT tab for central agencies (Railways, etc.)
- **Trust level:** Authoritative (govt)

### Karnataka Information Commission
- **URL:** https://kic.karnataka.gov.in
- **Data:** State RTI appeals, orders
- **Kaun use:** Guide users on RTI appeals process. Link from REPORT tab.
- **Trust level:** Authoritative (govt)

---

## Priority for Integration

### Phase 1 (Now — link from UI)
1. ✅ myneta.info — MLA profile links (done)
2. PRS India — MLA performance links
3. ECI — election result links
4. Sampark/BWSSB/BESCOM — complaint portals (done in REPORT tab)

### Phase 2 (Scrape & display)
5. myneta.info — criminal cases, assets → WHO tab badges
6. KPPP — real tender data → MONEY tab
7. PRS — attendance, questions asked → MLA scorecard
8. Lok Dhaba — victory margins, turnout → WHO tab context

### Phase 3 (Deep integration)
9. data.gov.in — census demographics per ward
10. Reddit — already done, improve relevance
11. Community facts — already built, scale it
12. GEM — contractor verification
