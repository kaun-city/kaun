"""
SQLAlchemy ORM models.

Requires PostgreSQL with the PostGIS extension enabled:
    CREATE EXTENSION IF NOT EXISTS postgis;
"""

from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base


class Ward(Base):
    """
    A single administrative ward within a city.

    Geometry is stored as WGS84 (SRID 4326) so lat/lng coordinates
    can be used directly in ST_Contains queries without reprojection.
    """

    __tablename__ = "wards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ward_no: Mapped[int] = mapped_column(Integer, nullable=False)
    ward_name: Mapped[str] = mapped_column(String(256), nullable=False)
    zone: Mapped[str | None] = mapped_column(String(128), nullable=True)
    assembly_constituency: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # MultiPolygon to handle wards with disconnected sections
    geom: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("city_id", "ward_no", name="uq_ward_city_no"),
        # Note: GeoAlchemy2 creates the GIST spatial index automatically.
        # No need to define it here — doing so causes a duplicate on create_all.
    )

    def __repr__(self) -> str:
        return f"<Ward city={self.city_id} no={self.ward_no} name={self.ward_name!r}>"


class ElectedRep(Base):
    """
    An elected representative — MLA, MP, or Corporator — mapped to a
    constituency or ward. Data sourced from ECI / state assembly websites.
    """

    __tablename__ = "elected_reps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # 'MLA' | 'MP' | 'CORPORATOR'
    role: Mapped[str] = mapped_column(String(32), nullable=False)

    # For MLA/MP: assembly or lok sabha constituency name (matches ward.assembly_constituency)
    constituency: Mapped[str] = mapped_column(String(256), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    party: Mapped[str | None] = mapped_column(String(128), nullable=True)
    elected_since: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "May 2023"
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    profile_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_source: Mapped[str | None] = mapped_column(String(256), nullable=True)  # URL of source

    __table_args__ = (
        UniqueConstraint("city_id", "role", "constituency", name="uq_rep_city_role_constituency"),
    )

    def __repr__(self) -> str:
        return f"<ElectedRep {self.role} {self.name!r} @ {self.constituency}>"


class Officer(Base):
    """
    A civic officer (Ward Officer, AE, EE) responsible for a ward.
    Often blank — populated via RTI responses or manual compilation.
    """

    __tablename__ = "officers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ward_no: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(64), nullable=False)  # "GBA" | "BWSSB" | etc
    role: Mapped[str] = mapped_column(String(128), nullable=False)  # "Ward Officer" | "AE (Works)"
    name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)  # "RTI" | "manual"
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("city_id", "ward_no", "department", "role", name="uq_officer"),
    )


class Tender(Base):
    """
    A civic tender — road repair, drain work, streetlight etc.
    Sourced from KPPP (Karnataka Public Procurement Portal) via scraper.
    """

    __tablename__ = "tenders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ward_no: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # null = city-wide
    kppp_id: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    department: Mapped[str | None] = mapped_column(String(128), nullable=True)  # "GBA" | "BWSSB"
    contractor_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    contractor_blacklisted: Mapped[bool] = mapped_column(Boolean, default=False)
    value_lakh: Mapped[float | None] = mapped_column(Float, nullable=True)  # in lakhs INR

    # OPEN | AWARDED | COMPLETED | CANCELLED
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN")

    issued_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    scraped_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def __repr__(self) -> str:
        return f"<Tender ward={self.ward_no} title={self.title[:40]!r} val={self.value_lakh}L>"


# ---------------------------------------------------------------------------
# Community / Civic Wikipedia
# ---------------------------------------------------------------------------

class CommunityFact(Base):
    """
    A user-submitted claim about civic data for a ward.

    This is the core of the "civic Wikipedia" — citizens contribute what they
    know (officer names, phone numbers, issue statuses, etc.) and others
    corroborate it with a +1 to signal "I can verify this."

    Trust tiers (shown in UI):
      - source_type = "official"  → green "Govt source" badge
      - source_type = "rti"       → blue "RTI sourced" badge
      - source_type = "community" + corroboration_count >= 5 → amber "Community verified"
      - source_type = "community" + corroboration_count < 5  → grey "Unverified"
      - dispute_count > corroboration_count → "Disputed" warning
    """

    __tablename__ = "community_facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ward_no: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # What type of fact is this?
    # "officer" | "tender_update" | "issue" | "contact" | "info"
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Fine-grained subject: "gba_ward_officer" | "bwssb_ae" | "pothole_status" etc.
    subject: Mapped[str] = mapped_column(String(128), nullable=False)

    # The specific field being claimed: "name" | "phone" | "email" | "note" etc.
    field: Mapped[str] = mapped_column(String(64), nullable=False)

    # The actual value
    value: Mapped[str] = mapped_column(Text, nullable=False)

    # Where did this come from?
    # "community" | "rti" | "official" | "news"
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="community")
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Trust scores — updated atomically by vote handlers
    corroboration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dispute_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Anonymous contributor token (hashed browser fingerprint or session ID)
    # Never stored raw — only used for deduplication.
    contributor_token: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # updated via raw SQL increment in vote handler — not set from Python to avoid tz mismatch
    last_corroborated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, server_default=None)

    votes: Mapped[list["FactVote"]] = relationship("FactVote", back_populates="fact", lazy="select")

    __table_args__ = (
        Index("ix_community_facts_ward_category", "city_id", "ward_no", "category"),
    )

    def __repr__(self) -> str:
        preview = self.value[:30]
        return f"<CommunityFact ward={self.ward_no} {self.category}/{self.subject}/{self.field}={preview!r}>"


class FactVote(Base):
    """
    A single corroboration or dispute vote on a CommunityFact.

    Voter token prevents the same person from voting twice on the same fact.
    Tokens are hashed client-side (e.g. SHA256 of browser fingerprint) —
    Kaun never stores any identifying information.
    """

    __tablename__ = "fact_votes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fact_id: Mapped[int] = mapped_column(Integer, ForeignKey("community_facts.id"), nullable=False, index=True)

    # "corroborate" | "dispute"
    vote_type: Mapped[str] = mapped_column(String(16), nullable=False)

    # Hashed token — no PII
    voter_token: Mapped[str] = mapped_column(String(128), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    fact: Mapped["CommunityFact"] = relationship("CommunityFact", back_populates="votes")

    __table_args__ = (
        UniqueConstraint("fact_id", "voter_token", name="uq_fact_vote"),
    )
