"""
Use Overpass/Nominatim to resolve each GHMC ward centroid to its assembly constituency.
Ground truth: OSM boundary=administrative + admin_level=6 for ACs in Telangana.
"""
import json, re, time, urllib.request, urllib.parse, sys

GEOJSON = r'C:\Users\Bharath\Projects\kaun\data\hyderabad\ghmc-wards.geojson'
OUT = r'C:\Users\Bharath\Projects\kaun\data\hyderabad\ward-ac-mapping.json'

with open(GEOJSON, encoding='utf-8') as f:
    data = json.load(f)

pattern = re.compile(r'^Ward (\d+)\s+(.+)$')

def centroid(geom):
    coords = []
    def collect(g):
        t = g['type']
        if t == 'Polygon':
            for ring in g['coordinates']:
                coords.extend(ring)
        elif t == 'MultiPolygon':
            for poly in g['coordinates']:
                for ring in poly:
                    coords.extend(ring)
    collect(geom)
    if not coords:
        return None
    return sum(c[0] for c in coords)/len(coords), sum(c[1] for c in coords)/len(coords)

# Overpass query to get assembly constituency (admin_level=6) at a point
def lookup_ac_overpass(lat, lon):
    query = f"""
[out:json][timeout:10];
is_in({lat},{lon})->.a;
relation(pivot.a)[boundary=administrative][admin_level=6];
out tags;
"""
    url = "https://overpass-api.de/api/interpreter"
    data_enc = urllib.parse.urlencode({'data': query}).encode()
    req = urllib.request.Request(url, data=data_enc)
    req.add_header('User-Agent', 'kaun-city/1.0 civic-data-project')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
        for el in result.get('elements', []):
            tags = el.get('tags', {})
            name = tags.get('name:en') or tags.get('name')
            if name:
                return name
    except Exception as e:
        return f"ERROR:{e}"
    return None

wards = []
for feat in data['features']:
    props = feat['properties']
    name_raw = props.get('name', '')
    m = pattern.match(name_raw)
    if m:
        ward_no = int(m.group(1))
        ward_name = m.group(2).strip()
    else:
        continue
    c = centroid(feat['geometry'])
    if not c:
        continue
    wards.append({'ward_no': ward_no, 'ward_name': ward_name, 'lon': round(c[0], 6), 'lat': round(c[1], 6)})

# Sort by ward_no
wards.sort(key=lambda w: w['ward_no'])
print(f"Total wards with centroids: {len(wards)}", flush=True)

results = []
for i, w in enumerate(wards):
    ac = lookup_ac_overpass(w['lat'], w['lon'])
    w['assembly_constituency'] = ac
    results.append(w)
    print(f"[{i+1}/{len(wards)}] Ward {w['ward_no']} {w['ward_name']} -> {ac}", flush=True)
    if (i+1) % 10 == 0:
        # Save progress
        with open(OUT, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"  (saved {i+1} results)", flush=True)
    time.sleep(1.1)  # Overpass rate limit

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"Done. Saved to {OUT}")
