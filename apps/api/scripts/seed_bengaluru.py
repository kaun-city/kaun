"""
Seed Bengaluru elected representatives and sample tenders.

MLA data from 2023 Karnataka Legislative Assembly elections (ECI source).
MP data from 2024 Lok Sabha elections.
Tenders are representative samples from KPPP — replace with real scraper output.

Usage:
    python -m apps.api.scripts.seed_bengaluru
"""

import asyncio
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from sqlalchemy.dialects.postgresql import insert as pg_insert

from apps.api.database import SessionLocal, engine
from apps.api.models import Base, ElectedRep, Officer, Tender

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

ECI_SOURCE = "https://results.eci.gov.in"
VIDHAN_SABHA_SOURCE = "https://kla.kar.nic.in"

# ---------------------------------------------------------------------------
# 2023 Karnataka MLA data for Bengaluru constituencies
# Source: Election Commission of India results, May 2023
# Constituency names must match the `Assembly` field in BBMP.geojson
# ---------------------------------------------------------------------------
BENGALURU_MLAS = [
    {
        "role": "MLA",
        "constituency": "Yelahanka",
        "name": "S R Vishwanath",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Hebbal",
        "name": "Byrathi Suresh",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Minister of State, Karnataka Government",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Dasarahalli",
        "name": "R Manjunath",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Mahalakshmi Layout",
        "name": "K Gopalaiah",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Switched from BJP to INC before 2023 election",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Malleshwaram",
        "name": "C N Manjunath",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Cardiologist; former Director, Jayadeva Institute",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Yeshvanthapura",
        "name": "S T Somashekar",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Rajajinagar",
        "name": "S Suresh Kumar",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Vijayanagar",
        "name": "M Krishnappa",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Chamrajpet",
        "name": "Zameer Ahmed Khan",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Minister for Urban Development, Waqf & Haj, Karnataka",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Shivajinagar",
        "name": "Rizwan Arshad",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Former MP; served as minister in earlier government",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Pulakeshinagar",
        "name": "Akhanda Srinivas Murthy",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Sarvajnanagar",
        "name": "Nandish Reddy",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "C V Raman Nagar",
        "name": "S Raghu",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Mahadevapura",
        "name": "Arvind Limbavali",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Former Minister for IT/BT",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "K R Puram",
        "name": "K Byregowda",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Basavanagudi",
        "name": "Ravi Subramanya",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Jayanagar",
        "name": "C K Ramamurthy",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Padmanabhanagar",
        "name": "N A Haris",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "BTM Layout",
        "name": "Ramalinga Reddy",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Senior INC leader; former Transport Minister",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Bommanahalli",
        "name": "Satish Reddy",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Anekal",
        "name": "Srinivas Gowda",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": "https://kla.kar.nic.in",
        "data_source": ECI_SOURCE,
    },
]

# ---------------------------------------------------------------------------
# 2024 Lok Sabha MPs for Bengaluru
# Source: ECI results, June 2024
# ---------------------------------------------------------------------------
BENGALURU_MPS = [
    {
        "role": "MP",
        "constituency": "Bangalore North",
        "name": "Shobha Karandlaje",
        "party": "BJP",
        "elected_since": "June 2024",
        "notes": "Union Minister of State; represents Bengaluru North Lok Sabha",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MP",
        "constituency": "Bangalore Central",
        "name": "P C Mohan",
        "party": "BJP",
        "elected_since": "June 2024",
        "notes": "Represents Bengaluru Central Lok Sabha constituency",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MP",
        "constituency": "Bangalore South",
        "name": "Tejasvi Surya",
        "party": "BJP",
        "elected_since": "June 2024",
        "notes": "Youngest MP in Bengaluru; BJP National President Youth Wing",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MP",
        "constituency": "Bangalore Rural",
        "name": "C N Manjunath",
        "party": "BJP",
        "elected_since": "June 2024",
        "notes": "Bangalore Rural Lok Sabha constituency",
        "data_source": ECI_SOURCE,
    },
]

# ---------------------------------------------------------------------------
# Representative tenders — sourced/modelled on KPPP data
# Replace with live scraper output; these demonstrate the data model.
# ward_no = None means city-wide; otherwise ward-specific.
# ---------------------------------------------------------------------------
SAMPLE_TENDERS = [
    {
        "city_id": "bengaluru",
        "ward_no": 67,  # Koramangala 6th Block (Mahadevapura zone)
        "kppp_id": "KPPP-GBA-2024-01892",
        "title": "Resurfacing of 80 Feet Road, Koramangala 6th Block, Ward 67",
        "department": "GBA",
        "contractor_name": "Shree Constructions Pvt Ltd",
        "contractor_blacklisted": False,
        "value_lakh": 185.4,
        "status": "AWARDED",
        "issued_date": date(2024, 9, 12),
        "deadline": date(2025, 3, 31),
        "source_url": "https://kppp.karnataka.gov.in",
    },
    {
        "city_id": "bengaluru",
        "ward_no": 67,
        "kppp_id": "KPPP-GBA-2024-02341",
        "title": "Stormwater drain repair and desilting, Koramangala Inner Ring Road",
        "department": "GBA",
        "contractor_name": "Deccan Civil Works",
        "contractor_blacklisted": False,
        "value_lakh": 94.2,
        "status": "COMPLETED",
        "issued_date": date(2024, 6, 5),
        "deadline": date(2024, 11, 30),
        "source_url": "https://kppp.karnataka.gov.in",
    },
    {
        "city_id": "bengaluru",
        "ward_no": 67,
        "kppp_id": "KPPP-GBA-2025-00134",
        "title": "LED streetlight installation, Koramangala 6th Block lanes",
        "department": "GBA",
        "contractor_name": "Apex Electrical Solutions",
        "contractor_blacklisted": False,
        "value_lakh": 42.8,
        "status": "OPEN",
        "issued_date": date(2025, 1, 20),
        "deadline": date(2025, 4, 15),
        "source_url": "https://kppp.karnataka.gov.in",
    },
    {
        "city_id": "bengaluru",
        "ward_no": 149,  # Yelahanka New Town
        "kppp_id": "KPPP-GBA-2024-01567",
        "title": "Development of footpaths, Yelahanka New Town Main Road",
        "department": "GBA",
        "contractor_name": "Karnataka Road Works",
        "contractor_blacklisted": False,
        "value_lakh": 67.5,
        "status": "AWARDED",
        "issued_date": date(2024, 8, 3),
        "deadline": date(2025, 2, 28),
        "source_url": "https://kppp.karnataka.gov.in",
    },
    {
        "city_id": "bengaluru",
        "ward_no": 75,  # Jayanagar
        "kppp_id": "KPPP-GBA-2024-03102",
        "title": "Renovation of park and walking track, Jayanagar 4th Block",
        "department": "GBA",
        "contractor_name": "Green Space Developers",
        "contractor_blacklisted": False,
        "value_lakh": 38.9,
        "status": "COMPLETED",
        "issued_date": date(2024, 5, 15),
        "deadline": date(2024, 10, 31),
        "source_url": "https://kppp.karnataka.gov.in",
    },
    {
        "city_id": "bengaluru",
        "ward_no": 85,  # Indiranagar / CV Raman Nagar
        "kppp_id": "KPPP-GBA-2025-00289",
        "title": "Road widening and median development, Indiranagar 100 Feet Road",
        "department": "GBA",
        "contractor_name": "Metro Infra Pvt Ltd",
        "contractor_blacklisted": True,  # flagged on KPPP debarred list
        "value_lakh": 312.6,
        "status": "OPEN",
        "issued_date": date(2025, 2, 1),
        "deadline": date(2025, 6, 30),
        "source_url": "https://kppp.karnataka.gov.in",
    },
    {
        "city_id": "bengaluru",
        "ward_no": None,  # city-wide
        "kppp_id": "KPPP-BWSSB-2024-00782",
        "title": "Underground drainage network upgrade, South Bengaluru zones",
        "department": "BWSSB",
        "contractor_name": "Larsen & Toubro Ltd",
        "contractor_blacklisted": False,
        "value_lakh": 8420.0,  # 84.2 Cr
        "status": "AWARDED",
        "issued_date": date(2024, 4, 10),
        "deadline": date(2026, 3, 31),
        "source_url": "https://kppp.karnataka.gov.in",
    },
]


async def seed() -> None:
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))

    async with SessionLocal() as session:
        # Seed MLAs
        for row in BENGALURU_MLAS + BENGALURU_MPS:
            stmt = (
                pg_insert(ElectedRep)
                .values(city_id="bengaluru", **row)
                .on_conflict_do_update(
                    constraint="uq_rep_city_role_constituency",
                    set_={k: row[k] for k in row if k not in ("role", "constituency")},
                )
            )
            await session.execute(stmt)

        # Seed tenders
        for row in SAMPLE_TENDERS:
            kppp_id = row.get("kppp_id")
            stmt = (
                pg_insert(Tender)
                .values(**row)
                .on_conflict_do_update(
                    index_elements=["kppp_id"],
                    set_={k: row[k] for k in row if k != "kppp_id"},
                )
            )
            await session.execute(stmt)

        await session.commit()

    logger.info("Seeded %d MLAs/MPs and %d tenders.", len(BENGALURU_MLAS) + len(BENGALURU_MPS), len(SAMPLE_TENDERS))


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
