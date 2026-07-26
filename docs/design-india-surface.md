# Kaun for India — the surface

Status: **built, fixture-driven, not live.** No production data exists behind
these pages yet.
Date: 2026-07-26 · Branch: `feat/india-surface` (stacked on `feat/india-schema`)

Companion files:
`apps/web/lib/host-routing.ts` · `apps/web/proxy.ts` ·
`apps/web/lib/india/` · `apps/web/components/india/` ·
`apps/web/app/india/` · `scripts/india/build-pc-geojson.mjs` ·
`docs/design-india-schema.md` (the schema this reads)

---

## 1. Routing: one app, two surfaces, one switch

kaun.city becomes the **national** layer. Each city moves to its own
subdomain, starting with `bengaluru.kaun.city`. Both are served by the same
Next app on the same Vercel project; a host-based rewrite in `proxy.ts` decides
which surface a request belongs to.

| Host | Serves |
|---|---|
| `kaun.city` | India layer — national map, constituency pages, project tracker |
| `bengaluru.kaun.city` | the existing ward UI, unchanged |
| anything else | root behaviour |

### Why not the existing multi-city mechanism

PR #37 made the city UI city-agnostic and selects a city with `?city=<id>`
against a registry in `apps/web/lib/cities/`. That is the right shape for
*cities*: they share one map, one ward drawer, one set of tabs, and differ only
in config. `feat/hyderabad` confirms the pattern — it adds data and scripts, no
routing.

The India layer is not another city. It has different entities (seats, MPs,
central projects), different tables (`in_*`), and different pages. Putting it in
the city registry would mean a `CityConfig` whose every feature flag is false
and a HomePage full of `if (isNational)`. So it gets its own route group,
`app/india/*`, and the host picks between the two.

### Why a host rewrite rather than a second Vercel project

One deployment, one set of env vars, one analytics stream, one root layout. A
second project would duplicate all of it and immediately drift.

### The cutover is one env var, off by default

`NEXT_PUBLIC_INDIA_ROOT` unset or `0` — **the default, and what merging this PR
gives you** — means nothing a visitor can see changes. `kaun.city/` still serves
Bengaluru exactly as today. The India surface is reachable at `kaun.city/india/*`
and nowhere else.

`NEXT_PUBLIC_INDIA_ROOT=1` flips the root to the India layer and starts
permanently redirecting the city UI's entry URLs to the city subdomain.

This ordering exists because the flag is the only thing that can 308 live
traffic at a host that may not resolve yet. Set it **after** DNS, never before.

### What must never move, and what enforces it

`/api/*` is passed through untouched on every host in every mode. Those paths
are load-bearing outside the browser: cron workflows authenticate to them with
`CRON_SECRET`, the weekly wiki generator reads them, and the BNP partnership
pulls its stable file exports from them. `tests/host-routing.test.mjs` asserts
this exhaustively — every API path × every host × both modes — rather than by
example, and does the same for `/_next`, `/_vercel` and any path with a file
extension.

### Legacy deep links

`kaun.city/?ward=42` and `?report=118` were shared in screenshots and forwards
when the site went viral. After the cutover they 308 (permanent) to
`bengaluru.kaun.city` with their query string intact. Same for `?city=`,
`?layer=`, and the city UI's own pages `/how-it-works`, `/data`, `/admin`.

`/status` stays on the root domain: it reports on the whole platform, not one
city.

### Local development

No DNS required, three ways in:

* `http://localhost:3000/india/*` — always works, in either mode.
* `http://bengaluru.localhost:3000/` — browsers resolve `*.localhost` to the
  loopback address, so city-subdomain routing can be exercised as-is.
* `?host=bengaluru.kaun.city` — overrides the Host header. Ignored on
  production, and stripped from the query string before any redirect is built
  so it cannot end up in a shared link.

### Internal links

`indiaHref()` builds links with or without the `/india` prefix depending on the
flag. **Both forms always resolve** — `/india/c/29-25` works after the cutover,
`/c/29-25` works via the rewrite — so flipping the flag in either direction can
never produce a dead internal link.

---

## 2. Reading the data: one path

The ward-crosswalk work left a trap worth not repeating: kaun.city has two ways
to read data — the interactive UI hits Supabase PostgREST directly with the anon
key (`lib/api.ts` → `lib/supabase.ts`), while `/api/data/*` exists separately for
third parties. They drifted, and a fix applied to one did not reach the other.

The India surface therefore has exactly one read module, `lib/india/api.ts`. It
uses the same `query()` helper as `lib/api.ts`, and **both** the server
components (constituency and project pages) and the client components (map,
tracker) call the same functions. There is no `/api/data/india/*` route in this
PR; when one is wanted it must be a thin wrapper over these functions.

RLS does the access control, not this module. `in_mp_affidavits` is
row-restricted to `needs_review = false AND parse_status = 'ok'`, so an
unreviewed MyNeta↔PC join physically cannot reach a page.

### Fixture mode

`NEXT_PUBLIC_KAUN_INDIA_FIXTURES` defaults to **on**, because the `in_*` tables
do not exist in production yet — pointing this at Supabase today returns 404s.
Fixtures are real rows from the P0 recon captures (four Karnataka seats, eleven
MoSPI projects across three monthly reports), with one labelled exception: no
per-MP MPLADS figures were captured in recon, so those values are illustrative
and say so in their own `data_source` string, which the sources footer prints.

Fixture mode drives an unmissable banner on every India page. On a
civic-transparency site, sample numbers that look live are the worst failure
available — worse than an empty page.

The shaping code (folding snapshots into tracked projects, computing months
since last change) is shared by both paths, so fixture mode exercises the real
derivation rather than a parallel one.

---

## 3. Pages

Object pages are the primitive. The map is an entry point; it is never the only
home of a fact. Every seat and every project has a stable URL, and both follow
the same structure: **identity header → key facts → money → time → sources.**

| Route | What it is |
|---|---|
| `/india` | national map, 543 seats, choropleth layers, state filter, search by seat or MP |
| `/india/c/[pc_code]` | one constituency |
| `/india/projects` | the overrun tracker, led by what changed this month |
| `/india/projects/[project_code]` | one central project, with its month-by-month history |

`ObjectHeader` reserves an empty **presence slot** in the top right. It renders
nothing in v1. It exists because a header laid out with no room on the right is
the version that has to be rebuilt the moment an object grows a watch or
follower count.

### No composite scores

The ward pages grade a ward out of 100. That pattern is deliberately **not**
ported. Reducing a named national politician to one number is an editorial
position; this surface takes none. Components are shown separately, each with
its source.

### The minister rule

Ministers and the Speaker do not sign the attendance register, do not ask
questions and do not introduce private member bills. sansad.in reports
`signedDaysCount: 0`; PRS states it in words. The schema refuses to store the
zero (`in_mp_activity_excluded_is_null_not_zero`), and the UI refuses to render
one: the copy is **"N/A (Minister)"**, the same words in the same muted italic
the city app's MLA scorecard already uses, with PRS's own sentence beneath.

The attendance choropleth carries no value for those seats at all, and its
legend says why.

### Criminal cases

Copied from `components/tabs/WhoTab.tsx` in wording and weight: *"{n} criminal
case{s} declared"* over *"Self-declared in Election Commission nomination
affidavit"*, in the same small red-tinted block. No larger type, no icon, no
adjective. The one addition is a link to the declaration itself, which
strengthens the claim rather than amplifying it.

An unparsed affidavit renders as "not recorded", never as zero — on MyNeta a
candidate with no cases has no case text at all, so absence and zero are
genuinely different facts and the schema keeps them apart.

---

## 4. The boundary asset

`scripts/india/build-pc-geojson.mjs` builds
`apps/web/public/india-pc.geojson` — 543 seats, ~1.4 MB raw, ~245 KB
brotli-compressed over the wire.

The Bengaluru map streams DataMeet's ward GeoJSON straight from
raw.githubusercontent.com. That is fine for one 243-feature city file, but the
national inputs are ~10.7 MB across two repos and are not a coherent 543-seat
file until they are merged. So the merge and simplification run once, in the
builder, and the result is committed like `bengaluru-ward-crosswalk.json`.

* **Base**: DataMeet `india_pc_2019_simplified.geojson` (CC0), richest
  attributes.
* **Overrides**: shijithpk's 2024 supplement (Unlicense) for Assam (2023
  delimitation), J&K (2022, 6 → 5 seats) and Ladakh — which DataMeet does not
  contain at all, its single seat still folded into old J&K.
* **Simplification**: Ramer-Douglas-Peucker per ring at 0.005° (≈1 screen pixel
  at zoom 8, the deepest zoom this map allows) plus 4-decimal quantisation;
  −31% vertices. Implemented in the script rather than shelled out to
  mapshaper/ogr2ogr, matching `scripts/wardmap/build-crosswalk.mjs`, which ships
  its own point-in-polygon rather than taking a GIS dependency. Deterministic:
  same inputs, byte-identical output.
* **Keys**: every feature carries `pc_code` from `scripts/india/lib/pc-code.mjs`
  — the same helper the loaders use and the same string the
  `in_constituencies_pc_code_derived` CHECK reproduces. Ladakh is st_code 38.
* **Not included**: reserved (SC/ST) status. Every boundary and roster source
  under-reports it. The constituency page reads it from `in_constituencies`,
  where a value is CHECK-constrained to name its source, and shows nothing when
  it has none.

`data/india/pc-boundaries-manifest.json` records counts, sources, licences and
simplification parameters.

`apps/web/lib/india/pc-code.ts` is a browser-side mirror of the two pure
functions the surface needs. `tests/india-surface.test.mjs` imports both copies
and asserts they agree across all 543 real `(st_code, pc_no)` pairs and on every
malformed input, so three copies of one rule cannot drift.

---

## 5. The data-colour system

`lib/india/viz.ts` defines two ramps and nothing else defines any.

* **Sequential** (magnitude — money, counts, percentages): dim → bright amber.
  On a near-black basemap luminance is the magnitude channel, so the ramp climbs
  monotonically in lightness and can be ordered without reading the legend.
* **Diverging** (signed — cost overrun, schedule slip, which have a true zero):
  teal below, neutral grey at zero, amber → deep orange above.

Teal↔orange rather than red↔green: the hues stay distinguishable under
deuteranopia and protanopia, and the ends differ in lightness so the ramp still
reads in monochrome.

Bucketing reuses `quantileBreaks`/`colorFor` from `lib/map-layers.ts`, so the
national and city maps bucket identically. Absent values get a dedicated grey
and are never given a ramp colour — a missing number must not look like a low
one.

---

## 6. What this surface does NOT claim

**Central projects are state-level.** MoSPI publishes Table 6 with a state
column and nothing finer — verified across the March, April and May 2026 reports
(1,987 / 1,981 / 1,941 rows, none carrying a district). The constituency page
therefore shows *the state's* projects and says so in as many words. Inferring a
district from a project's name is the name matching this codebase refuses to do
anywhere else, and it is not done here.

The sibling PC↔district crosswalk (#64) will let Kaun narrow this the day MoSPI
publishes anything below state level. Not before.

---

## 7. Rollout

Ordered. Each step is safe to stop at.

1. **Merge this PR.** Nothing user-visible changes. The India surface is live at
   `kaun.city/india/*` in fixture mode, reviewable immediately.
2. **Apply the schema** (`feat/india-schema`, PR #63) to Supabase.
3. **Run the loaders** — `seed-constituencies`, `sansad-roster`,
   `myneta-affidavits`, `mp-activity`, `esakshi-mplads`,
   `mospi/load_flash_report`.
4. **Set `NEXT_PUBLIC_KAUN_INDIA_FIXTURES=0`** in Vercel. The pages now read
   Supabase. The banner disappears. Nothing about routing has changed yet.
5. **Add `bengaluru.kaun.city`** as a domain on the existing Vercel project and
   create its DNS record. Verify it serves the ward UI.
6. **Set `NEXT_PUBLIC_INDIA_ROOT=1`.** The root becomes the India layer and the
   legacy city URLs start redirecting. This is the only user-visible cutover,
   and it is one env var to undo.

Steps 4 and 6 are independent — either can be done first, or one without the
other.

---

## 8. Open questions

1. **Wildcard DNS.** `*.kaun.city` on Vercel means a new city needs a
   `CITY_HOSTS` entry and a deploy, no DNS work. One record per city is more
   explicit but is a manual step per launch. Wildcard is the scalable choice;
   confirm before Hyderabad.
2. **`/data` and `/how-it-works` after the cutover.** Both are Bengaluru
   content, so both redirect to the city subdomain. The national layer will
   eventually want its own of each. Fine to leave until there is national data
   to document?
3. **MPLADS source precedence.** eSAKSHI (official, aggregate) and Empowered
   Indian (unofficial, per-work) disagree. Both render, each labelled with its
   source. If only one should be shown by default, which?
4. **Rajya Sabha.** The schema models RS members; the surface is Lok Sabha only,
   because RS has no constituency and therefore no seat page to hang off. Does
   RS need its own object page type in v2?
5. **Tracker window.** The tracker fetches the top 200 rows by the selected
   metric, out of ~1,987 ongoing projects. A full table wants either pagination
   or a database function; "longest unchanged" in particular is derived after
   the fetch and so ranks only within that window. Worth a `security_invoker`
   view or an RPC in the schema PR?
