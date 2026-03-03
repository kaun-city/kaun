"""
Load Bengaluru ward boundaries into PostGIS.

Downloads the BBMP ward GeoJSON from the datameet repository and upserts
each ward into the `wards` table.

Usage:
    python -m apps.api.scripts.load_wards
    python -m apps.api.scripts.load_wards --city bengaluru --source /path/to/local.geojson

Requirements:
    - PostgreSQL running with PostGIS extension enabled
    - DATABASE_URL set in .env or environment
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import delete, text
from sqlalchemy.dialects.postgresql import insert

# Allow running as script from repo root
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from apps.api.database import SessionLocal, engine
from apps.api.models import Base, Ward

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

GEOJSON_URLS: dict[str, str] = {
    "bengaluru": (
        "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data"
        "/master/Bangalore/BBMP.geojson"
    ),
}


def _extract_ward_props(feature: dict[str, Any]) -> dict[str, Any] | None:
    """
    Extract normalised ward properties from a datameet GeoJSON feature.
    Returns None if required fields are missing.
    """
    props = feature.get("properties") or {}

    # datameet uses KGISWardNo as the canonical ward number
    ward_no = props.get("KGISWardNo") or props.get("WardNo")
    ward_name = props.get("KGISWardName") or props.get("WardName") or props.get("WARD_NAME")

    if ward_no is None or not ward_name:
        return None

    return {
        "ward_no": int(ward_no),
        "ward_name": str(ward_name).strip(),
        "zone": props.get("ZoneName") or props.get("Zone") or None,
        "assembly_constituency": props.get("Assembly") or props.get("AC_NAME") or None,
    }


def _to_multipolygon_wkt(geometry: dict[str, Any]) -> str:
    """
    Convert a GeoJSON geometry (Polygon or MultiPolygon) to WKT for insertion.
    PostGIS accepts ST_GeomFromGeoJSON directly, so we just serialise the geometry.
    """
    return json.dumps(geometry)


async def load_city(city_id: str, source: str | None = None) -> None:
    """
    Download (or read local) GeoJSON and upsert wards for a given city.
    """
    # 1. Fetch GeoJSON
    if source:
        logger.info("Reading local GeoJSON: %s", source)
        raw = Path(source).read_text(encoding="utf-8")
        geojson = json.loads(raw)
    else:
        url = GEOJSON_URLS.get(city_id)
        if not url:
            logger.error("No GeoJSON URL configured for city: %s", city_id)
            sys.exit(1)

        logger.info("Downloading ward boundaries for %s ...", city_id)
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(url)
            response.raise_for_status()
            geojson = response.json()

    features = geojson.get("features", [])
    logger.info("Found %d features in GeoJSON", len(features))

    # 2. Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))

    # 3. Upsert wards
    inserted = 0
    skipped = 0

    async with SessionLocal() as session:
        for feature in features:
            props = _extract_ward_props(feature)
            if not props:
                skipped += 1
                continue

            geometry = feature.get("geometry")
            if not geometry:
                skipped += 1
                continue

            # Normalise Polygon -> MultiPolygon for consistency
            if geometry["type"] == "Polygon":
                geometry = {"type": "MultiPolygon", "coordinates": [geometry["coordinates"]]}

            stmt = (
                insert(Ward)
                .values(
                    city_id=city_id,
                    ward_no=props["ward_no"],
                    ward_name=props["ward_name"],
                    zone=props["zone"],
                    assembly_constituency=props["assembly_constituency"],
                    geom=text(f"ST_SetSRID(ST_GeomFromGeoJSON('{json.dumps(geometry)}'), 4326)"),
                )
                .on_conflict_do_update(
                    constraint="uq_ward_city_no",
                    set_={
                        "ward_name": props["ward_name"],
                        "zone": props["zone"],
                        "assembly_constituency": props["assembly_constituency"],
                        "geom": text(
                            f"ST_SetSRID(ST_GeomFromGeoJSON('{json.dumps(geometry)}'), 4326)"
                        ),
                    },
                )
            )
            await session.execute(stmt)
            inserted += 1

        await session.commit()

    logger.info(
        "Done. Upserted %d wards, skipped %d features (missing required fields).",
        inserted,
        skipped,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Load ward boundaries into PostGIS")
    parser.add_argument("--city", default="bengaluru", help="City slug")
    parser.add_argument("--source", default=None, help="Local GeoJSON path (skips download)")
    args = parser.parse_args()

    asyncio.run(load_city(args.city, args.source))


if __name__ == "__main__":
    main()
