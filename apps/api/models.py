"""
SQLAlchemy ORM models.

Requires PostgreSQL with the PostGIS extension enabled:
    CREATE EXTENSION IF NOT EXISTS postgis;
"""

from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Date, DateTime, Float, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
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
