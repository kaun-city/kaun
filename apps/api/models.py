"""
SQLAlchemy ORM models.

Requires PostgreSQL with the PostGIS extension enabled:
    CREATE EXTENSION IF NOT EXISTS postgis;
"""

from geoalchemy2 import Geometry
from sqlalchemy import Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

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
        # Spatial index — essential for ST_Contains performance
        Index("idx_wards_geom", "geom", postgresql_using="gist"),
    )

    def __repr__(self) -> str:
        return f"<Ward city={self.city_id} no={self.ward_no} name={self.ward_name!r}>"
