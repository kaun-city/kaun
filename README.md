# KAUN?

**Pin a place. Know who's responsible.**

Kaun is an open civic accountability platform. Drop a pin anywhere in a city — see the officer responsible, active public works, budget allocations, and generate a pre-filled RTI application in under 5 minutes.

Built for Bengaluru. Designed for every city.

**[kaun.city](https://kaun.city)** — live for Bengaluru

---

## The Problem

When a road caves in, a drain overflows, or a tender goes missing — no one knows who to call. Official portals are broken, officer directories don't exist, and RTI feels impossible. Accountability is invisible.

Kaun makes it visible.

---

## What It Does

- **Drop a pin** anywhere in the city
- **See who's responsible** — officer name, designation, contact (where public)
- **Browse active tenders** — what's being built, by whom, for how much
- **File citizen issues** — photo + location, visible to the neighborhood
- **Generate an RTI** — legally valid application, pre-filled, ready in 5 minutes
- **Share on WhatsApp** — ward accountability cards that spread through RWA groups

---

## How It Works (For Cities)

Kaun is city-config driven. Each city is a folder:

```
cities/
  bengaluru/
    config.json       # agencies, helplines, RTI addresses
    wards.geojson     # ward boundary polygons
    agencies.json     # jurisdiction resolver
```

Adding a new city = adding a folder + config. No core code changes needed.

---

## Stack

- **Frontend**: Next.js + Leaflet.js
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + PostGIS
- **Scrapers**: Python + GitHub Actions (weekly)
- **Hosting**: ~$15/month on Fly.io + Cloudflare Pages

---

## Contributing

We welcome contributions of any kind:

- **Add your city** — see [docs/adding-a-city.md](docs/adding-a-city.md)
- **Improve data** — fix officer names, add tender links, update ward boundaries
- **Build features** — pick an open issue
- **Spread the word** — star the repo, share with civic orgs in your city

Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## Status

- [x] Research complete (jurisdiction mapping, tenders, RTI, UX)
- [x] FastAPI backend — PostGIS ward model, `/pin` endpoint, city config loader
- [x] Ward loader script — downloads datameet GeoJSON, upserts into PostGIS
- [x] Next.js frontend — Leaflet map, ward overlay, pin-to-ward card
- [ ] Deployment — Fly.io (API) + Cloudflare Pages (web)
- [ ] Bengaluru ward data loaded into production DB
- [ ] Tender scraper (KPPP, GitHub Actions weekly)
- [ ] RTI generator (5 templates, PDF output)
- [ ] WhatsApp share cards (OG image per ward)
- [ ] kaun.city live

---

## Why Open Source?

Civic data belongs to everyone. The code that surfaces it should too.

Kaun is MIT licensed. Fork it, deploy it, improve it. If you make it better, send a PR.

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with frustration, maintained with hope.*
