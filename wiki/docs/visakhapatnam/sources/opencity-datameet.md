# DataMeet & OpenCity — Spatial and Census Data

## Sources

- **DataMeet**: [github.com/datameet/Municipal_Spatial_Data](https://github.com/datameet/Municipal_Spatial_Data)
- **DataMeet villages**: [projects.datameet.org/indian_village_boundaries](https://projects.datameet.org/indian_village_boundaries/)
- **OpenCity Vizag datasets**: [data.opencity.in/dataset?city=Visakhapatnam](https://data.opencity.in/dataset?city=Visakhapatnam)
- **OpenCity 98-ward map**: [data.opencity.in/dataset/visakhapatnam-wards-map-2024](https://data.opencity.in/dataset/visakhapatnam-wards-map-2024)
- **AP Space Applications Centre (APSAC)**: [apsac.ap.gov.in](https://apsac.ap.gov.in/)
- **APSAC GIS Dashboard**: [apsac.ap.gov.in/dashboard-staging](https://apsac.ap.gov.in/dashboard-staging/)
- **State GIS Portal (BharatMaps)**: [stategisportal.nic.in](https://stategisportal.nic.in/)

## What kaun.city uses

**Foundation**: OpenCity's 2024 GVMC ward delimitation — 98 wards as KML, converted to GeoJSON, loaded into PostGIS by `scripts/seed-boundaries-visakhapatnam.mjs`.

**Census 2011 fallback**: where modern AP-level numbers aren't available, we fall back to Census 2011 PCA — particularly population, household count, and density.

- Census PCA AP: [data.gov.in/catalog/villagetown-wise-primary-census-abstract-2011-andhra-pradesh](https://www.data.gov.in/catalog/villagetown-wise-primary-census-abstract-2011-andhra-pradesh)
- Vizag DCHB 2011: [censusindia.gov.in/nada/index.php/catalog/122](https://censusindia.gov.in/nada/index.php/catalog/122)

## Why APSAC matters

APSAC is the AP government's space applications centre under Lokesh's IT/ITE&C ministry. They run the authoritative state GIS layer including ward boundaries, land use, and infrastructure overlays.

The OpenCity 98-ward GeoJSON is the publicly downloadable fallback — APSAC is the upstream-of-truth. A future partnership could see kaun.city consuming directly from APSAC's WebGIS REST endpoints rather than from OpenCity's snapshot.

## Related

- [GVMC eMunicipal](gvmc-emunicipal.md) — joins to ward boundaries
- [CDMA Open Portal](cdma-portal.md) — uses ward IDs that match this delimitation

---
*Last updated: 2026-05-06*
