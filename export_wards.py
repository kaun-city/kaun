"""Export ward data from local DB as SQL INSERTs for Supabase."""
import asyncio
import json
from sqlalchemy import text
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from apps.api.database import engine


async def export():
    async with engine.begin() as conn:
        result = await conn.execute(text(
            "SELECT ward_no, ward_name, zone, assembly_constituency, "
            "ST_AsGeoJSON(geom) as geojson FROM wards WHERE city_id = 'bengaluru' ORDER BY ward_no"
        ))
        wards = []
        for row in result:
            wards.append({
                "ward_no": row[0],
                "ward_name": row[1],
                "zone": row[2],
                "ac": row[3],
                "geojson": row[4],
            })

        with open("ward_inserts.sql", "w", encoding="utf-8") as f:
            for w in wards:
                geojson = w["geojson"]
                if geojson:
                    geom_sql = f"ST_GeomFromGeoJSON('{geojson}')"
                else:
                    geom_sql = "NULL"
                name = (w["ward_name"] or "").replace("'", "''")
                zone = w["zone"]
                ac = w["ac"]
                zone_sql = f"'{zone}'" if zone else "NULL"
                ac_sql = f"'{ac}'" if ac else "NULL"

                f.write(
                    f"INSERT INTO wards (city_id, ward_no, ward_name, zone, assembly_constituency, geom) "
                    f"VALUES ('bengaluru', {w['ward_no']}, '{name}', {zone_sql}, {ac_sql}, {geom_sql}) "
                    f"ON CONFLICT (city_id, ward_no) DO UPDATE SET "
                    f"ward_name=EXCLUDED.ward_name, zone=EXCLUDED.zone, "
                    f"assembly_constituency=EXCLUDED.assembly_constituency, "
                    f"geom=EXCLUDED.geom;\n"
                )
        print(f"Exported {len(wards)} wards")


asyncio.run(export())
