"""
City configuration loader.

Reads cities/<city_id>/config.json from the repo and exposes typed helpers
for resolving which agency is responsible for a given issue type.

Configs are cached in memory at startup — changes require a restart.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import get_settings
from .schemas import Agency

logger = logging.getLogger(__name__)


@lru_cache(maxsize=32)
def load_city_config(city_id: str) -> dict[str, Any] | None:
    """
    Load and cache a city config by its slug.
    Returns None if the config file does not exist.
    """
    settings = get_settings()
    config_path = settings.cities_dir / city_id / "config.json"

    if not config_path.exists():
        logger.warning("City config not found: %s", config_path)
        return None

    with config_path.open(encoding="utf-8") as f:
        return json.load(f)


def get_all_agencies(city_id: str) -> list[Agency]:
    """Return all agencies defined for a city."""
    config = load_city_config(city_id)
    if not config:
        return []

    agencies = []
    for agency_data in config.get("agencies", {}).values():
        agencies.append(
            Agency(
                name=agency_data["name"],
                short=agency_data["short"],
                helpline=agency_data.get("helpline"),
                website=agency_data.get("website"),
                complaint_url=agency_data.get("complaint_url"),
            )
        )
    return agencies


def resolve_agency(city_id: str, issue_type: str) -> Agency | None:
    """
    Given a city and issue type (e.g. 'pothole'), return the responsible agency.
    Returns None if no mapping exists.
    """
    config = load_city_config(city_id)
    if not config:
        return None

    resolver = config.get("jurisdiction_resolver", {})
    agency_key = resolver.get(issue_type)
    if not agency_key:
        return None

    agency_data = config.get("agencies", {}).get(agency_key)
    if not agency_data:
        return None

    return Agency(
        name=agency_data["name"],
        short=agency_data["short"],
        helpline=agency_data.get("helpline"),
        website=agency_data.get("website"),
        complaint_url=agency_data.get("complaint_url"),
    )
