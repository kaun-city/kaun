"""
GET /buzz

Returns recent Reddit posts from r/bangalore mentioning a ward or area name.
Proxied server-side to avoid CORS issues and to allow future caching.
"""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/buzz", tags=["buzz"])

REDDIT_SEARCH = "https://www.reddit.com/r/bangalore/search.json"
HEADERS = {
    "User-Agent": "kaun-civic-app/0.1 (civic accountability platform)",
    "Accept": "application/json",
}


@router.get("")
async def get_buzz(
    ward_name: str = Query(..., description="Ward name to search for"),
    limit: int = Query(default=5, ge=1, le=10),
) -> list[dict[str, Any]]:
    """
    Fetch recent r/bangalore posts mentioning the given ward name.
    Returns an empty list on error (never crashes the frontend).
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                REDDIT_SEARCH,
                params={
                    "q": ward_name,
                    "sort": "new",
                    "limit": limit,
                    "restrict_sr": "1",
                    "t": "month",
                },
                headers=HEADERS,
            )
            if r.status_code != 200:
                logger.warning("Reddit returned %s for ward=%s", r.status_code, ward_name)
                return []

            children = r.json().get("data", {}).get("children", [])
            posts = []
            for child in children:
                d = child.get("data", {})
                posts.append({
                    "title": d.get("title", ""),
                    "url": f"https://reddit.com{d.get('permalink', '')}",
                    "score": d.get("score", 0),
                    "num_comments": d.get("num_comments", 0),
                    "created_utc": d.get("created_utc", 0),
                    "author": d.get("author", ""),
                    "flair": d.get("link_flair_text", None),
                })
            return posts

    except Exception:
        logger.exception("Error fetching buzz for ward=%s", ward_name)
        return []
