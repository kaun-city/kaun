"""Cross-validate corporator data vs GeoJSON ward list using DuckDB."""
import duckdb, json, re, sys, os
sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.join(os.path.dirname(__file__), "..", "data", "hyderabad")

conn = duckdb.connect()

# Load corporators
with open(os.path.join(BASE, "ghmc-corporators.json"), encoding="utf-8") as f:
    corps = json.load(f)

# Load GeoJSON wards
with open(os.path.join(BASE, "ghmc-wards.geojson"), encoding="utf-8") as f:
    gj = json.load(f)

geo_wards = []
for feat in gj["features"]:
    name = feat["properties"].get("name", "")
    m = re.match(r"^Ward (\d+)\s+(.+)$", name)
    if m:
        geo_wards.append({"ward_no": int(m.group(1)), "geo_name": m.group(2).strip()})

import pandas as pd
corps_df = pd.DataFrame(corps)
geo_df   = pd.DataFrame(geo_wards)

conn.register("corps", corps_df)
conn.register("geo",   geo_df)

print("=== Corporators loaded:", len(corps))
print("=== GeoJSON wards loaded:", len(geo_wards))

print("\n=== Ward name mismatches (corps Wikipedia vs GeoJSON OSM) ===")
mismatches = conn.execute("""
    SELECT c.ward_no, c.ward_name AS corp_name, g.geo_name
    FROM corps c
    LEFT JOIN geo g ON c.ward_no = g.ward_no
    WHERE g.geo_name IS NOT NULL
      AND LOWER(TRIM(c.ward_name)) != LOWER(TRIM(g.geo_name))
    ORDER BY c.ward_no
""").fetchdf()
if len(mismatches):
    print(mismatches.to_string(index=False))
else:
    print("  None - all names match!")
print(f"\n  {len(mismatches)} mismatches out of {len(corps)} wards")

print("\n=== Wards with corporator but missing from GeoJSON ===")
missing_geo = conn.execute("""
    SELECT c.ward_no, c.ward_name
    FROM corps c LEFT JOIN geo g ON c.ward_no = g.ward_no
    WHERE g.ward_no IS NULL ORDER BY c.ward_no
""").fetchdf()
print(missing_geo.to_string(index=False) if len(missing_geo) else "  None")

print("\n=== Party breakdown ===")
parties = conn.execute("SELECT party, COUNT(*) c FROM corps GROUP BY party ORDER BY c DESC").fetchall()
for party, count in parties:
    print(f"  {party}: {count}")

print("\n=== MLA data ===")
with open(os.path.join(BASE, "hyderabad-mlas.json"), encoding="utf-8") as f:
    mlas = json.load(f)
mla_df = pd.DataFrame(mlas)
conn.register("mlas", mla_df)
print(conn.execute("SELECT constituency, name, party FROM mlas ORDER BY constituency").fetchdf().to_string(index=False))
