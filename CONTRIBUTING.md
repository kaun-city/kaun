# Contributing to Kaun

Thanks for being here. Kaun is a public good — every contribution makes a city more accountable.

## Ways to Contribute

### 1. Add Your City
The most impactful contribution. See [docs/adding-a-city.md](docs/adding-a-city.md) for a step-by-step guide. No coding required for basic city configs.

### 2. Improve Existing Data
- Fix an officer name or contact
- Update a ward boundary
- Add a tender source we missed
- Correct jurisdiction mappings

Open an issue or submit a PR against `cities/<city>/`.

### 3. Build Features
Pick an open issue labeled `good first issue` or `help wanted`. Comment before starting so we don't duplicate effort.

### 4. Report Bugs
Open an issue. Include: what you expected, what happened, city + ward if relevant.

---

## Development Setup

```bash
git clone https://github.com/kaun-city/kaun
cd kaun
# See README for stack setup
```

---

## PR Guidelines

- Keep PRs focused — one thing at a time
- Data changes don't need tests
- Code changes should not break existing city configs
- Update `cities/<city>/config.json` if you're changing data schema (and update other cities too)

---

## Code of Conduct

Be direct. Be kind. This is civic infrastructure — it should work for everyone, not just the technically confident.

No tolerance for: discrimination, bad faith contributions, doxxing of private individuals (officers' personal details, not official contact, are off limits).
