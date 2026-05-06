# APPCB / CPCB — Pollution Control

Air, water, and industrial pollution monitoring for Vizag.

## Portals

- **APPCB**: [pcb.ap.gov.in](https://pcb.ap.gov.in/)
- **APOCMMS** (industrial consent): [apocmms.nic.in](https://apocmms.nic.in/)
- **CPCB live AQI**: [airquality.cpcb.gov.in/AQI_India](https://airquality.cpcb.gov.in/AQI_India/)
- **CPCB AQI API**: [data.gov.in/resource/real-time-air-quality-index-various-locations](https://www.data.gov.in/resource/real-time-air-quality-index-various-locations)

## At a glance

- 50+ manual + CAAQMS air quality stations across AP, including multiple in Vizag
- 120 surface water monitoring stations
- 80 groundwater stations
- APPCB Vizag zonal lab + zonal office (one of 4)

## What kaun.city pulls

Phase 1: **Vizag CAAQMS station readings** — PM2.5, PM10, NO2, SO2 — pulled from CPCB's `/api/aqi` endpoint nightly. Mapped to nearest ward for the Citizen tab.

Phase 2: **Industrial consent map** — APOCMMS publishes which industries have valid pollution consent. Useful for ward-level industrial-cluster overlays (Vizag has steel plant, port, refineries).

## Related

- [APSDMA](apsdma.md) — disaster + weather
- CPCB direct API requires registered key on data.gov.in

---
*Last updated: 2026-05-06*
