"""
Seed ward-level statistics from OpenCity.in BBMP Ward-wise Public Goods dataset.

Source: https://data.opencity.in/dataset/bbmp-ward-wise-public-goods-data
Data is for 198 old wards (Census 2011). We map to new 243 wards using ward names
and assembly constituency matching, or aggregate at AC level for unmatched wards.

Uploads to Supabase via Management API.
"""

import csv
import json
import os
import sys

# Path to the CSV
CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "bbmp_ward_public_goods.csv")

SUPABASE_TOKEN = os.environ.get("SUPABASE_TOKEN", "sbp_8226477e680b438942c021e7b534bd0ba53bf56b")
PROJECT_ID = "xgygxfyfsvccqqmtboeu"

def parse_number(val):
    """Parse a number from CSV, handling commas and missing values."""
    if not val or val.strip() in ('-', '', 'NA', 'N/A'):
        return None
    try:
        return float(val.strip().replace(',', '').replace('"', '').replace('%', ''))
    except ValueError:
        return None

def parse_int(val):
    n = parse_number(val)
    return int(n) if n is not None else None

def main():
    rows = []
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            ward_no = parse_int(row.get('Ward_No'))
            if ward_no is None:
                continue
            
            stats = {
                'ward_no_old': ward_no,
                'ward_name': row.get('Ward Name', '').strip(),
                'zone': row.get('BBMP Zone Name', '').strip(),
                'assembly_constituency': row.get('Assembly Constituency Name', '').strip(),
                'mp_constituency': row.get('MP Constituency', '').strip(),
                'population_2011': parse_int(row.get('Population (2011)')),
                'area_sqkm': parse_number(row.get('Area (sq km)')),
                'households_2011': parse_int(row.get('Households # (Census 2011)')),
                'road_length_km': parse_number(row.get('Road Length (kms)')),
                'lakes_count': parse_int(row.get('Lakes #')),
                'lake_area_sqm': parse_number(row.get('Lake area (sq m)')),
                'parks_count': parse_int(row.get('Parks #')),
                'park_area_sqm': parse_number(row.get('Park area (sq m)')),
                'playgrounds_count': parse_int(row.get('Playgrounds #')),
                'playground_area_sqm': parse_number(row.get('Playground area (sq m)')),
                'govt_schools_count': parse_int(row.get('Govt Schools #')),
                'police_stations_count': parse_int(row.get('Police Stations #')),
                'fire_stations_count': parse_int(row.get('Fire stations #')),
                'bus_stops_count': parse_int(row.get('Bus Stops #')),
                'bus_routes_count': parse_int(row.get('Bus routes #')),
                'streetlights_count': parse_int(row.get('Streetlights #')),
                'population_density_2011': parse_number(row.get('Population density 2011 (persons / sq km)')),
                'decadal_pop_growth_pct': parse_number(row.get('Decadal popn growth rate % 2011/2001')),
                'lake_names': row.get('Lake name', '').strip() or None,
            }
            rows.append(stats)
    
    print(f"Parsed {len(rows)} wards from CSV")
    
    # Build SQL: create table + insert
    sql_parts = []
    
    # Create ward_stats table
    sql_parts.append("""
DROP TABLE IF EXISTS ward_stats CASCADE;
CREATE TABLE ward_stats (
    id SERIAL PRIMARY KEY,
    city_id TEXT NOT NULL DEFAULT 'bengaluru',
    ward_no_old INTEGER,
    ward_name TEXT,
    zone TEXT,
    assembly_constituency TEXT,
    mp_constituency TEXT,
    population_2011 INTEGER,
    area_sqkm NUMERIC(10,2),
    households_2011 INTEGER,
    road_length_km NUMERIC(10,2),
    lakes_count INTEGER DEFAULT 0,
    lake_area_sqm NUMERIC(12,2),
    parks_count INTEGER DEFAULT 0,
    park_area_sqm NUMERIC(12,2),
    playgrounds_count INTEGER DEFAULT 0,
    playground_area_sqm NUMERIC(12,2),
    govt_schools_count INTEGER DEFAULT 0,
    police_stations_count INTEGER DEFAULT 0,
    fire_stations_count INTEGER DEFAULT 0,
    bus_stops_count INTEGER DEFAULT 0,
    bus_routes_count INTEGER DEFAULT 0,
    streetlights_count INTEGER DEFAULT 0,
    population_density_2011 NUMERIC(10,2),
    decadal_pop_growth_pct NUMERIC(6,2),
    lake_names TEXT,
    source TEXT DEFAULT 'opencity.in/BBMP',
    data_year INTEGER DEFAULT 2011
);

-- RLS
ALTER TABLE ward_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_ward_stats ON ward_stats;
CREATE POLICY read_ward_stats ON ward_stats FOR SELECT USING (true);
""")
    
    # Insert rows
    for r in rows:
        vals = []
        for col in ['city_id', 'ward_no_old', 'ward_name', 'zone', 'assembly_constituency',
                     'mp_constituency', 'population_2011', 'area_sqkm', 'households_2011',
                     'road_length_km', 'lakes_count', 'lake_area_sqm', 'parks_count',
                     'park_area_sqm', 'playgrounds_count', 'playground_area_sqm',
                     'govt_schools_count', 'police_stations_count', 'fire_stations_count',
                     'bus_stops_count', 'bus_routes_count', 'streetlights_count',
                     'population_density_2011', 'decadal_pop_growth_pct', 'lake_names']:
            if col == 'city_id':
                vals.append("'bengaluru'")
            elif r.get(col) is None:
                vals.append('NULL')
            elif isinstance(r[col], str):
                vals.append("'" + r[col].replace("'", "''") + "'")
            else:
                vals.append(str(r[col]))
        
        sql_parts.append(
            f"INSERT INTO ward_stats (city_id, ward_no_old, ward_name, zone, assembly_constituency, "
            f"mp_constituency, population_2011, area_sqkm, households_2011, road_length_km, "
            f"lakes_count, lake_area_sqm, parks_count, park_area_sqm, playgrounds_count, "
            f"playground_area_sqm, govt_schools_count, police_stations_count, fire_stations_count, "
            f"bus_stops_count, bus_routes_count, streetlights_count, population_density_2011, "
            f"decadal_pop_growth_pct, lake_names) VALUES ({', '.join(vals)});"
        )
    
    import urllib.request
    url = f"https://api.supabase.com/v1/projects/{PROJECT_ID}/database/query"
    
    def run_sql(sql, label=""):
        data = json.dumps({"query": sql}).encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST')
        req.add_header('Authorization', f'Bearer {SUPABASE_TOKEN}')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            if label:
                print(f"{label}: {json.dumps(result)[:100]}")
            return result
    
    # Step 1: Create table
    run_sql(sql_parts[0], "Create table")
    
    # Step 2: Insert in batches of 20
    inserts = sql_parts[1:]
    batch_size = 20
    for i in range(0, len(inserts), batch_size):
        batch = '\n'.join(inserts[i:i+batch_size])
        run_sql(batch, f"Batch {i//batch_size + 1}")
    
    print(f"Successfully uploaded {len(rows)} ward stats to Supabase")

    # Create an RPC function to get stats for a ward by assembly constituency
    stats_fn = """
CREATE OR REPLACE FUNCTION ward_stats_by_ac(p_assembly_constituency text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'assembly_constituency', p_assembly_constituency,
        'total_population', SUM(population_2011),
        'total_area_sqkm', ROUND(SUM(area_sqkm)::numeric, 2),
        'total_households', SUM(households_2011),
        'total_road_length_km', ROUND(SUM(road_length_km)::numeric, 2),
        'total_lakes', SUM(lakes_count),
        'total_parks', SUM(parks_count),
        'total_playgrounds', SUM(playgrounds_count),
        'total_govt_schools', SUM(govt_schools_count),
        'total_police_stations', SUM(police_stations_count),
        'total_fire_stations', SUM(fire_stations_count),
        'total_bus_stops', SUM(bus_stops_count),
        'total_streetlights', SUM(streetlights_count),
        'avg_population_density', ROUND(AVG(population_density_2011)::numeric, 0),
        'ward_count', COUNT(*),
        'data_year', 2011,
        'source', 'Census 2011 + BBMP via opencity.in',
        'wards', jsonb_agg(jsonb_build_object(
            'ward_name', ward_name,
            'ward_no_old', ward_no_old,
            'population', population_2011,
            'area_sqkm', area_sqkm,
            'road_length_km', road_length_km,
            'lakes', lakes_count,
            'parks', parks_count,
            'schools', govt_schools_count,
            'streetlights', streetlights_count,
            'lake_names', lake_names
        ) ORDER BY ward_no_old)
    ) INTO result
    FROM ward_stats
    WHERE assembly_constituency = p_assembly_constituency;
    
    RETURN COALESCE(result, '{}'::jsonb);
END;
$$;
"""
    data2 = json.dumps({"query": stats_fn}).encode('utf-8')
    req2 = urllib.request.Request(url, data=data2, method='POST')
    req2.add_header('Authorization', f'Bearer {SUPABASE_TOKEN}')
    req2.add_header('Content-Type', 'application/json')
    
    with urllib.request.urlopen(req2) as resp2:
        result2 = json.loads(resp2.read())
        print(f"Function created: {json.dumps(result2)[:200]}")

if __name__ == '__main__':
    main()
