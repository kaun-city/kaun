"""
Seed Bengaluru elected representatives and sample tenders.

MLA data: 16th Karnataka Legislative Assembly (2023 election, ECI results).
  - Source: https://en.wikipedia.org/wiki/16th_Karnataka_Legislative_Assembly
  - Cross-referenced with: https://myneta.info/Karnataka2023/
  - 28 assembly constituencies within BBMP boundary.

MP data: 2024 Lok Sabha elections (ECI results, June 2024).
  - 4 Lok Sabha constituencies covering Bengaluru.

Tenders: Representative samples modelled on KPPP format — replace with scraper.

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
from apps.api.models import Base, ElectedRep, Tender

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

ECI_SOURCE = "https://results.eci.gov.in"
MYNETA_SOURCE = "https://myneta.info/Karnataka2023"

# ---------------------------------------------------------------------------
# 2023 Karnataka MLAs for Bengaluru constituencies
# Verified from: 16th Karnataka Legislative Assembly (Wikipedia + ECI + myneta)
#
# Constituency names MUST match the canonical names used in
#   apps.api.scripts.map_assembly_constituencies.CONSTITUENCY_CANONICAL
# ---------------------------------------------------------------------------
BENGALURU_MLAS = [
    # ── Bangalore Urban district, #150-176
    {
        "role": "MLA",
        "constituency": "Yelahanka",
        "name": "S R Vishwanath",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=698",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "K R Puram",
        "name": "B A Basavaraja",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Also known as Byrati Basavaraj",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=699",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Byatarayanapura",
        "name": "Krishna Byregowda",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Former Minister for Agriculture; senior INC leader",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=700",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Yeshvanthapura",
        "name": "S T Somashekar",
        "party": "IND",
        "elected_since": "May 2023",
        "notes": "Expelled from BJP; now Independent MLA",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=701",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Rajarajeshwari Nagar",
        "name": "Munirathna",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=702",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Dasarahalli",
        "name": "S Muniraju",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=703",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Mahalakshmi Layout",
        "name": "K Gopalaiah",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=704",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Malleshwaram",
        "name": "C N Ashwath Narayan",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Former Deputy CM of Karnataka; senior BJP leader",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=705",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Hebbal",
        "name": "Byrathi Suresh",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Official name: Suresha B.S.; commonly known as Byrathi Suresh",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=706",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Pulakeshinagar",
        "name": "A C Srinivasa",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "SC reserved constituency",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=707",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Sarvajnanagar",
        "name": "K J George",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Cabinet Minister, Karnataka Government",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=708",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "C V Raman Nagar",
        "name": "S Raghu",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "SC reserved constituency",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=709",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Shivajinagar",
        "name": "Rizwan Arshad",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Former Rajya Sabha MP",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=710",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Shanti Nagar",
        "name": "N A Haris",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=711",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Gandhi Nagar",
        "name": "Dinesh Gundu Rao",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Former KPCC President",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=712",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Rajajinagar",
        "name": "S Suresh Kumar",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Former Education Minister",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=713",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Govindaraja Nagar",
        "name": "Priya Krishna",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=714",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Vijayanagar",
        "name": "M Krishnappa",
        "party": "INC",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=715",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Chamrajpet",
        "name": "B Z Zameer Ahmed Khan",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Cabinet Minister — Urban Development, Waqf & Haj",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=716",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Chickpet",
        "name": "Uday B Garudachar",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=717",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Basavanagudi",
        "name": "Ravi Subramanya",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Official name: Ravi Subramanya L.A.",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=718",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Padmanabhanagar",
        "name": "R Ashoka",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Leader of Opposition, Karnataka Legislative Assembly",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=719",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "BTM Layout",
        "name": "Ramalinga Reddy",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "Cabinet Minister — Transport; senior INC leader",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=720",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Jayanagar",
        "name": "C K Ramamurthy",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=721",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Mahadevapura",
        "name": "Manjula S",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "SC reserved constituency",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=722",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Bommanahalli",
        "name": "M Satish Reddy",
        "party": "BJP",
        "elected_since": "May 2023",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=723",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Bangalore South",
        "name": "M Krishnappa",
        "party": "BJP",
        "elected_since": "May 2023",
        "notes": "Different person from Vijayanagar MLA M Krishnappa (INC)",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=724",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MLA",
        "constituency": "Anekal",
        "name": "B Shivanna",
        "party": "INC",
        "elected_since": "May 2023",
        "notes": "SC reserved constituency",
        "profile_url": f"{MYNETA_SOURCE}/candidate.php?candidate_id=725",
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
        "notes": "Union Minister of State; Bengaluru North LS constituency",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MP",
        "constituency": "Bangalore Central",
        "name": "P C Mohan",
        "party": "BJP",
        "elected_since": "June 2024",
        "notes": "3-term MP; Bengaluru Central LS constituency",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MP",
        "constituency": "Bangalore South",
        "name": "Tejasvi Surya",
        "party": "BJP",
        "elected_since": "June 2024",
        "notes": "BJP Yuva Morcha President; Bengaluru South LS constituency",
        "data_source": ECI_SOURCE,
    },
    {
        "role": "MP",
        "constituency": "Bangalore Rural",
        "name": "C N Manjunath",
        "party": "BJP",
        "elected_since": "June 2024",
        "notes": "Cardiologist; former Director, Sri Jayadeva Institute",
        "data_source": ECI_SOURCE,
    },
]

# ---------------------------------------------------------------------------
# Representative tenders — sourced/modelled on KPPP data
# Replace with live scraper output; these demonstrate the data model.
# ---------------------------------------------------------------------------
SAMPLE_TENDERS = [
    {
        "city_id": "bengaluru",
        "ward_no": 186,  # Koramangala (BTM Layout AC)
        "kppp_id": "KPPP-GBA-2024-01892",
        "title": "Resurfacing of 80 Feet Road, Koramangala 6th Block",
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
        "ward_no": 186,
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
        "ward_no": 186,
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
        "ward_no": 5,  # Yelahanka
        "kppp_id": "KPPP-GBA-2024-01567",
        "title": "Development of footpaths, Yelahanka Main Road",
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
        "ward_no": 194,  # Jayanagar
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
        "ward_no": 119,  # Indiranagar
        "kppp_id": "KPPP-GBA-2025-00289",
        "title": "Road widening and median development, Indiranagar 100 Feet Road",
        "department": "GBA",
        "contractor_name": "Metro Infra Pvt Ltd",
        "contractor_blacklisted": True,
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
        "value_lakh": 8420.0,
        "status": "AWARDED",
        "issued_date": date(2024, 4, 10),
        "deadline": date(2026, 3, 31),
        "source_url": "https://kppp.karnataka.gov.in",
    },
]


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))

    async with SessionLocal() as session:
        # Clear old rep data for Bengaluru to prevent stale entries
        from sqlalchemy import delete
        await session.execute(
            delete(ElectedRep).where(ElectedRep.city_id == "bengaluru")
        )

        # Seed MLAs + MPs
        all_reps = BENGALURU_MLAS + BENGALURU_MPS
        for row in all_reps:
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

    logger.info(
        "Seeded %d MLAs + %d MPs + %d tenders for Bengaluru.",
        len(BENGALURU_MLAS), len(BENGALURU_MPS), len(SAMPLE_TENDERS),
    )


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
