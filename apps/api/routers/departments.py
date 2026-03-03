"""
Departments / Agencies API.

Returns the full directory of government departments and agencies
relevant to a city — helplines, complaint portals, what they handle.
"""

from fastapi import APIRouter, Query
from sqlalchemy import text

from ..database import SessionLocal

router = APIRouter(tags=["departments"])


@router.get("/departments")
async def get_departments(
    city_id: str = Query(default="bengaluru"),
    category: str | None = Query(default=None, description="Filter: civic|utility|transport|law|planning|environment|grievance|emergency"),
):
    """
    Get all departments/agencies for a city.
    Optionally filter by category.
    """
    try:
        async with SessionLocal() as session:
            q = "SELECT * FROM departments WHERE city_id = :city_id"
            params: dict = {"city_id": city_id}

            if category:
                q += " AND category = :category"
                params["category"] = category

            q += " ORDER BY category, short"

            result = await session.execute(text(q), params)
            rows = result.mappings().all()
            return [dict(r) for r in rows]
    except Exception:
        return []


@router.get("/departments/{short}")
async def get_department(
    short: str,
    city_id: str = Query(default="bengaluru"),
):
    """Get a single department by its short code (e.g. 'BWSSB')."""
    try:
        async with SessionLocal() as session:
            result = await session.execute(
                text("SELECT * FROM departments WHERE city_id = :city_id AND short = :short"),
                {"city_id": city_id, "short": short.upper()},
            )
            row = result.mappings().first()
            if row:
                return dict(row)
            return {"error": "not found"}
    except Exception:
        return {"error": "failed"}
