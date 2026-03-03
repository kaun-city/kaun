"""
Pydantic v2 request and response schemas.

All API responses follow a consistent shape — callers can always check
`found` or `ok` before accessing data fields.
"""

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

class Agency(BaseModel):
    """A civic agency responsible for a category of issues in a ward."""

    name: str
    short: str
    helpline: str | None = None
    website: str | None = None
    complaint_url: str | None = None


# ---------------------------------------------------------------------------
# /pin
# ---------------------------------------------------------------------------

class PinRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitude of the dropped pin")
    lng: float = Field(..., ge=-180, le=180, description="Longitude of the dropped pin")
    city_id: str = Field(default="bengaluru", description="City slug (matches cities/ directory)")
    issue_type: str | None = Field(
        default=None,
        description="Optional issue category (e.g. 'pothole', 'water_supply'). "
                    "When provided, returns only the responsible agency.",
    )


class PinResponse(BaseModel):
    found: bool
    city_id: str
    ward_no: int | None = None
    ward_name: str | None = None
    zone: str | None = None
    assembly_constituency: str | None = None
    agencies: list[Agency] = []
    primary_agency: Agency | None = None   # set when issue_type is provided


# ---------------------------------------------------------------------------
# /wards
# ---------------------------------------------------------------------------

class WardDetail(BaseModel):
    city_id: str
    ward_no: int
    ward_name: str
    zone: str | None
    assembly_constituency: str | None
    agencies: list[Agency]


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    ok: bool
    db: bool
    version: str = "0.1.0"
