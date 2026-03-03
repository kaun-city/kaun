"""
POST /pin

Core endpoint: given a lat/lng, return the ward it falls in and the
agencies responsible for civic issues there.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..city_config import get_all_agencies, resolve_agency
from ..database import get_db
from ..schemas import PinRequest, PinResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pin", tags=["pin"])


@router.post("", response_model=PinResponse)
async def drop_pin(body: PinRequest, db: AsyncSession = Depends(get_db)) -> PinResponse:
    """
    Drop a pin at the given coordinates and return:
    - Which ward it falls in
    - Which agencies are responsible
    - (Optional) Primary agency for a specific issue type

    Returns `found: false` with empty fields if no ward matches the point
    (e.g. coordinates outside the city boundary).
    """
    try:
        result = await db.execute(
            text(
                """
                SELECT
                    ward_no,
                    ward_name,
                    zone,
                    assembly_constituency
                FROM wards
                WHERE
                    city_id = :city_id
                    AND ST_Contains(
                        geom,
                        ST_SetSRID(ST_Point(:lng, :lat), 4326)
                    )
                LIMIT 1
                """
            ),
            {"city_id": body.city_id, "lat": body.lat, "lng": body.lng},
        )
        row = result.mappings().first()
    except Exception as exc:
        logger.exception("DB error in /pin")
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    if not row:
        return PinResponse(found=False, city_id=body.city_id)

    agencies = get_all_agencies(body.city_id)
    primary = resolve_agency(body.city_id, body.issue_type) if body.issue_type else None

    return PinResponse(
        found=True,
        city_id=body.city_id,
        ward_no=row["ward_no"],
        ward_name=row["ward_name"],
        zone=row["zone"],
        assembly_constituency=row["assembly_constituency"],
        agencies=agencies,
        primary_agency=primary,
    )
