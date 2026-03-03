"""
GET /ward-profile

Returns the full accountability profile for a ward:
  - Elected representatives (MLA, MP, Corporator)
  - Officers (Ward Officer, AE — often blank, RTI-sourced)
  - Recent tenders (from KPPP scraper)
  - Governance alert (no corporator since 2020)
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import ElectedRep, Officer, Tender

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ward-profile", tags=["ward-profile"])


def _rep_to_dict(r: ElectedRep) -> dict[str, Any]:
    return {
        "id": r.id,
        "role": r.role,
        "constituency": r.constituency,
        "name": r.name,
        "party": r.party,
        "elected_since": r.elected_since,
        "photo_url": r.photo_url,
        "phone": r.phone,
        "email": r.email,
        "profile_url": r.profile_url,
        "notes": r.notes,
        "data_source": r.data_source,
    }


def _officer_to_dict(o: Officer) -> dict[str, Any]:
    return {
        "id": o.id,
        "department": o.department,
        "role": o.role,
        "name": o.name,
        "phone": o.phone,
        "source": o.source,
    }


def _tender_to_dict(t: Tender) -> dict[str, Any]:
    return {
        "id": t.id,
        "kppp_id": t.kppp_id,
        "title": t.title,
        "department": t.department,
        "contractor_name": t.contractor_name,
        "contractor_blacklisted": t.contractor_blacklisted,
        "value_lakh": t.value_lakh,
        "status": t.status,
        "issued_date": t.issued_date.isoformat() if t.issued_date else None,
        "deadline": t.deadline.isoformat() if t.deadline else None,
        "source_url": t.source_url,
    }


@router.get("")
async def get_ward_profile(
    city_id: str = Query(default="bengaluru"),
    ward_no: int = Query(..., description="Ward number"),
    assembly_constituency: str | None = Query(default=None, description="Assembly constituency name from ward data"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Full accountability profile for a ward.
    Returns empty lists gracefully — never crashes the frontend.
    """

    # 1. Elected reps: match by assembly_constituency for MLA, and by lok sabha for MP
    reps: list[dict] = []
    if assembly_constituency:
        try:
            result = await db.execute(
                select(ElectedRep).where(
                    ElectedRep.city_id == city_id,
                    ElectedRep.constituency == assembly_constituency,
                )
            )
            for rep in result.scalars().all():
                reps.append(_rep_to_dict(rep))
        except Exception:
            logger.exception("Error fetching elected reps")

    # 2. Officers for this ward
    officers: list[dict] = []
    try:
        result = await db.execute(
            select(Officer).where(
                Officer.city_id == city_id,
                Officer.ward_no == ward_no,
            )
        )
        for o in result.scalars().all():
            officers.append(_officer_to_dict(o))
    except Exception:
        logger.exception("Error fetching officers")

    # 3. Tenders for this ward (most recent 10)
    tenders: list[dict] = []
    try:
        result = await db.execute(
            select(Tender)
            .where(
                Tender.city_id == city_id,
                Tender.ward_no == ward_no,
            )
            .order_by(Tender.issued_date.desc())
            .limit(10)
        )
        for t in result.scalars().all():
            tenders.append(_tender_to_dict(t))
    except Exception:
        logger.exception("Error fetching tenders")

    # 4. Governance alert — no elected corporators since 2020 (BBMP dissolved)
    governance_alert = {
        "type": "no_corporator",
        "title": "No elected corporator",
        "body": (
            "BBMP was dissolved in September 2020. Elections have been delayed repeatedly. "
            "GBA (Greater Bengaluru Authority) was formed in 2025 but ward-level elections "
            "are still pending. Your ward has no elected local representative."
        ),
        "since": "September 2020",
    }

    total_value = sum(t["value_lakh"] or 0 for t in tenders)

    return {
        "ward_no": ward_no,
        "city_id": city_id,
        "assembly_constituency": assembly_constituency,
        "elected_reps": reps,
        "officers": officers,
        "tenders": tenders,
        "tender_count": len(tenders),
        "tender_total_lakh": round(total_value, 1),
        "governance_alert": governance_alert,
    }
