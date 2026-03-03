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


# ---------------------------------------------------------------------------
# /community
# ---------------------------------------------------------------------------

class FactTrustLevel(str):
    """Trust tier labels for display."""
    OFFICIAL = "official"
    RTI = "rti"
    COMMUNITY_VERIFIED = "community_verified"  # 5+ corroborations
    UNVERIFIED = "unverified"
    DISPUTED = "disputed"


class CommunityFactRead(BaseModel):
    """A community fact as returned by the API."""
    id: int
    city_id: str
    ward_no: int | None
    category: str
    subject: str
    field: str
    value: str
    source_type: str
    source_url: str | None = None
    source_note: str | None = None
    corroboration_count: int
    dispute_count: int
    trust_level: str   # one of FactTrustLevel values
    created_at: str
    last_corroborated_at: str | None = None

    model_config = {"from_attributes": True}


class SubmitFactRequest(BaseModel):
    """Submit a new community fact."""
    city_id: str = Field(default="bengaluru")
    ward_no: int | None = Field(default=None)
    category: str = Field(
        ...,
        description="'officer' | 'tender_update' | 'issue' | 'contact' | 'info'"
    )
    subject: str = Field(
        ...,
        description="Fine-grained subject e.g. 'gba_ward_officer', 'bwssb_ae'"
    )
    field: str = Field(
        ...,
        description="The specific field: 'name' | 'phone' | 'email' | 'note'"
    )
    value: str = Field(..., min_length=1, max_length=1024)
    source_type: str = Field(default="community", description="'community' | 'rti' | 'official' | 'news'")
    source_url: str | None = Field(default=None, max_length=512)
    source_note: str | None = Field(default=None, max_length=512)
    contributor_token: str | None = Field(
        default=None,
        description="Hashed anonymous session token for deduplication. Never stored raw."
    )


class SubmitFactResponse(BaseModel):
    ok: bool
    fact: CommunityFactRead
    is_duplicate: bool = False  # true if this exact claim already exists


class VoteRequest(BaseModel):
    """Cast a corroborate or dispute vote on a fact."""
    vote_type: str = Field(..., description="'corroborate' | 'dispute'")
    voter_token: str = Field(..., min_length=8, max_length=128, description="Hashed anonymous token")


class VoteResponse(BaseModel):
    ok: bool
    fact_id: int
    corroboration_count: int
    dispute_count: int
    trust_level: str
    already_voted: bool = False
