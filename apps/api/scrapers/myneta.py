"""
Scrape MLA background data from myneta.info (ADR).

myneta.info doesn't have a stable API or predictable candidate IDs.
Strategy: search by candidate name → parse the result page for:
  - Criminal cases (total + serious)
  - Total assets
  - Total liabilities
  - Education level

Usage:
    python -m apps.api.scrapers.myneta
"""

import asyncio
import json
import logging
import re
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

BASE_URL = "https://myneta.info/Karnataka2023"


def _clean(text: str) -> str:
    """Strip whitespace and non-breaking spaces."""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _parse_rupees(text: str) -> int | None:
    """Parse 'Rs 67,55,45,178' → 675545178."""
    nums = re.findall(r"[\d,]+", text.replace(" ", ""))
    if nums:
        return int(nums[0].replace(",", ""))
    return None


async def scrape_candidate(client: httpx.AsyncClient, candidate_id: int) -> dict | None:
    """Scrape a single candidate page for background data."""
    url = f"{BASE_URL}/candidate.php?candidate_id={candidate_id}"
    try:
        r = await client.get(url)
        if r.status_code != 200:
            return None
        html = r.text

        data: dict = {"candidate_id": candidate_id, "url": url}

        # Name
        name_match = re.search(r"<h2[^>]*>\s*([^<]+)\s*</h2>", html)
        if name_match:
            data["name"] = _clean(name_match.group(1))

        # Constituency
        const_match = re.search(r"Constituency\s*:?\s*</[^>]+>\s*<[^>]+>\s*([^<]+)", html, re.I)
        if const_match:
            data["constituency"] = _clean(const_match.group(1))

        # Party
        party_match = re.search(r"Party\s*:?\s*</[^>]+>\s*<[^>]+>\s*([^<]+)", html, re.I)
        if party_match:
            data["party"] = _clean(party_match.group(1))

        # Criminal cases
        crime_match = re.search(r"(\d+)\s*Criminal\s*Case", html, re.I)
        if crime_match:
            data["criminal_cases"] = int(crime_match.group(1))

        serious_match = re.search(r"(\d+)\s*Serious\s*Criminal", html, re.I)
        if serious_match:
            data["serious_criminal_cases"] = int(serious_match.group(1))

        # Assets
        asset_match = re.search(r"Total\s*Assets\s*[:\s]*Rs\s*([\d,]+)", html, re.I)
        if asset_match:
            data["total_assets"] = int(asset_match.group(1).replace(",", ""))

        # Liabilities
        liab_match = re.search(r"Liabilit(?:y|ies)\s*[:\s]*Rs\s*([\d,]+)", html, re.I)
        if liab_match:
            data["total_liabilities"] = int(liab_match.group(1).replace(",", ""))

        # Education
        edu_match = re.search(
            r"(?:Education|Qualification)\s*:?\s*</[^>]+>\s*<[^>]+>\s*([^<]+)", html, re.I
        )
        if edu_match:
            data["education"] = _clean(edu_match.group(1))

        return data

    except Exception as e:
        logger.warning("Error scraping candidate %d: %s", candidate_id, e)
        return None


async def search_candidate(client: httpx.AsyncClient, name: str) -> int | None:
    """Search myneta for a candidate by name, return candidate_id if found."""
    search_url = f"https://myneta.info/search1.php?s={name.replace(' ', '+')}"
    try:
        r = await client.get(search_url, follow_redirects=True)
        # Look for Karnataka2023 candidate links
        matches = re.findall(r"Karnataka2023/candidate\.php\?candidate_id=(\d+)", r.text)
        if matches:
            return int(matches[0])
    except Exception as e:
        logger.warning("Error searching for %s: %s", name, e)
    return None


async def scrape_all_bengaluru_mlas() -> list[dict]:
    """Search for and scrape all Bengaluru MLAs from myneta."""
    from apps.api.scripts.seed_bengaluru import BENGALURU_MLAS

    results = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for mla in BENGALURU_MLAS:
            name = mla["name"]
            logger.info("Searching myneta for: %s (%s)", name, mla["constituency"])

            cid = await search_candidate(client, name)
            if cid:
                logger.info("  Found candidate_id=%d, scraping...", cid)
                data = await scrape_candidate(client, cid)
                if data:
                    data["kaun_constituency"] = mla["constituency"]
                    results.append(data)
                    logger.info(
                        "  → %s | cases=%s | assets=%s",
                        data.get("name"),
                        data.get("criminal_cases", "?"),
                        data.get("total_assets", "?"),
                    )
            else:
                logger.warning("  Not found on myneta")

            # Be polite
            await asyncio.sleep(1)

    return results


async def main():
    results = await scrape_all_bengaluru_mlas()
    outpath = Path(__file__).parent.parent / "data" / "myneta_bengaluru.json"
    outpath.parent.mkdir(parents=True, exist_ok=True)
    outpath.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    logger.info("Wrote %d results to %s", len(results), outpath)


if __name__ == "__main__":
    asyncio.run(main())
