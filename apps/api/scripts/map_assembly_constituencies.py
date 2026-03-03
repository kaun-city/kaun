"""
Map ward -> assembly constituency using spatial join with old ward boundaries.

The current BBMP.geojson (243 wards, 2022 delimitation) doesn't include
assembly constituency data. This script:
  1. Downloads BBMP_oldWards.geojson (198 wards, has ASS_CONST1 field)
  2. For each new ward, finds its centroid and checks which old ward it falls in
  3. Updates the `wards` table with the matched assembly_constituency value

Also normalises constituency names to match ECI canonical format (stored in
CONSTITUENCY_CANONICAL below), so MLA lookups work reliably.

Usage:
    python -m apps.api.scripts.map_assembly_constituencies
"""

import asyncio
import logging
import sys
from pathlib import Path

import httpx
from shapely.geometry import shape
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from apps.api.database import SessionLocal, engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

GEOJSON_OLD = (
    "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data"
    "/master/Bangalore/BBMP_oldWards.geojson"
)
GEOJSON_NEW = (
    "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data"
    "/master/Bangalore/BBMP.geojson"
)

# Normalise GeoJSON names -> ECI canonical form used in seed_bengaluru.py
# GeoJSON (old ward) value -> canonical name
CONSTITUENCY_CANONICAL: dict[str, str] = {
    "B.T.M. Layout": "BTM Layout",
    "Bangalore South": "Bangalore South",
    "Basavanagudi": "Basavanagudi",
    "Bommana Halli": "Bommanahalli",
    "Byatarayanapura": "Byatarayanapura",
    "C.V. Ramannagar (SC)": "C V Raman Nagar",
    "Chamarajpet": "Chamrajpet",
    "Chickpet": "Chickpet",
    "Dasarahalli": "Dasarahalli",
    "Gandhi Nagar": "Gandhi Nagar",
    "Govindaraja Nagar": "Govindaraja Nagar",
    "Hebbal": "Hebbal",
    "Jaya Nagar": "Jayanagar",
    "K.R. Puram": "K R Puram",
    "Mahadevapura": "Mahadevapura",
    "Mahalakshmi Layout": "Mahalakshmi Layout",
    "Malleswaram": "Malleshwaram",
    "Padmanaba Nagar": "Padmanabhanagar",
    "Pulakeshi Nagar (SC)": "Pulakeshinagar",
    "Rajaji Nagar": "Rajajinagar",
    "Rajarajeswari Nagar": "Rajarajeswari Nagar",
    "Sarvagna Nagar": "Sarvajnanagar",
    "Shanthi Nagar": "Shanti Nagar",
    "Shivaji Nagar": "Shivajinagar",
    "Vijaya Nagar": "Vijayanagar",
    "Yelahanka": "Yelahanka",
    "Yeshwantpura": "Yeshvanthapura",
    # Anekal covers wards on the outer boundary; add if encountered
    "Anekal": "Anekal",
}


async def build_ward_mapping() -> dict[int, str | None]:
    """Return {ward_no: canonical_assembly_constituency} for all 243 wards."""
    async with httpx.AsyncClient(timeout=60) as client:
        logger.info("Downloading old ward boundaries (198 wards)...")
        old_data = (await client.get(GEOJSON_OLD)).json()
        logger.info("Downloading new ward boundaries (243 wards)...")
        new_data = (await client.get(GEOJSON_NEW)).json()

    # Build old ward shapes with assembly constituency
    old_wards: list[tuple] = []
    for f in old_data["features"]:
        p = f.get("properties") or {}
        ac_raw = (p.get("ASS_CONST1") or "").strip()
        if ac_raw and f.get("geometry"):
            try:
                old_wards.append((shape(f["geometry"]), ac_raw))
            except Exception:
                pass

    logger.info("Built %d old ward shapes.", len(old_wards))

    mapping: dict[int, str | None] = {}
    unmatched: list[int] = []

    for f in new_data["features"]:
        p = f.get("properties") or {}
        ward_no_raw = p.get("KGISWardNo")
        if ward_no_raw is None or not f.get("geometry"):
            continue
        ward_no = int(ward_no_raw)

        try:
            centroid = shape(f["geometry"]).centroid
            matched_ac: str | None = None
            for old_shape, ac_raw in old_wards:
                if old_shape.contains(centroid):
                    matched_ac = CONSTITUENCY_CANONICAL.get(ac_raw, ac_raw)
                    break
            mapping[ward_no] = matched_ac
            if matched_ac is None:
                unmatched.append(ward_no)
        except Exception as e:
            logger.warning("Ward %d: geometry error: %s", ward_no, e)
            mapping[ward_no] = None
            unmatched.append(ward_no)

    matched_count = sum(1 for v in mapping.values() if v is not None)
    logger.info(
        "Matched %d / %d wards to assembly constituencies.", matched_count, len(mapping)
    )
    if unmatched:
        logger.warning("Unmatched ward numbers: %s", unmatched)

    return mapping


async def apply_mapping(mapping: dict[int, str | None]) -> None:
    """Update wards table with assembly_constituency values."""
    async with SessionLocal() as session:
        updated = 0
        for ward_no, ac in mapping.items():
            if ac:
                await session.execute(
                    text(
                        "UPDATE wards SET assembly_constituency = :ac "
                        "WHERE city_id = 'bengaluru' AND ward_no = :wno"
                    ),
                    {"ac": ac, "wno": ward_no},
                )
                updated += 1
        await session.commit()
    logger.info("Updated %d wards with assembly_constituency.", updated)


async def main() -> None:
    mapping = await build_ward_mapping()
    await apply_mapping(mapping)
    logger.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
