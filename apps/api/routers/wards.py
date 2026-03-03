"""
GET /wards/{ward_no}

Returns full ward detail for a given city + ward number.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..city_config import get_all_agencies
from ..database import get_db
from ..models import Ward
from ..schemas import WardDetail

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/wards", tags=["wards"])


@router.get("/{ward_no}", response_model=WardDetail)
async def get_ward(
    ward_no: int,
    city_id: str = "bengaluru",
    db: AsyncSession = Depends(get_db),
) -> WardDetail:
    """
    Fetch a ward by its number within a city.

    Geometry is intentionally excluded from this response — use the
    GeoJSON endpoint or load from the static files in /cities/<city>/wards.geojson
    for boundary rendering.
    """
    try:
        result = await db.execute(
            select(Ward).where(Ward.city_id == city_id, Ward.ward_no == ward_no)
        )
        ward = result.scalar_one_or_none()
    except Exception as exc:
        logger.exception("DB error in /wards/%s", ward_no)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    if not ward:
        raise HTTPException(
            status_code=404,
            detail=f"Ward {ward_no} not found in city '{city_id}'",
        )

    return WardDetail(
        city_id=ward.city_id,
        ward_no=ward.ward_no,
        ward_name=ward.ward_name,
        zone=ward.zone,
        assembly_constituency=ward.assembly_constituency,
        agencies=get_all_agencies(city_id),
    )
