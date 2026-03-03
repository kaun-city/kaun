"""
Seed Bengaluru government departments, agencies, and helplines.

This is the reference data for the REPORT tab — tells citizens which agency
handles what, how to reach them, and where to file complaints.

Sources:
  - BBMP/GBA official website
  - Karnataka state government portals
  - Sampark helpline directory

Usage:
    python -m apps.api.scripts.seed_departments
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from sqlalchemy import text

from apps.api.database import SessionLocal, engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Department / Agency reference data
# ---------------------------------------------------------------------------

DEPARTMENTS = [
    # ── Greater Bengaluru Authority (GBA) — formerly BBMP
    {
        "city_id": "bengaluru",
        "short": "GBA",
        "name": "Greater Bengaluru Authority",
        "alt_names": "BBMP, Bruhat Bengaluru Mahanagara Palike",
        "category": "civic",
        "description": "Primary civic body for Bengaluru. Handles roads, drains, "
                       "parks, solid waste, building permits, property tax.",
        "website": "https://bbmp.gov.in",
        "complaint_url": "https://bbmp.gov.in/complaints",
        "helpline": "080-22660000",
        "toll_free": "1533",
        "email": "commissioner@bbmp.gov.in",
        "handles": "roads,drains,footpaths,parks,streetlights,garbage,SWM,"
                   "building_permits,property_tax,trade_license,birth_death_cert",
    },
    {
        "city_id": "bengaluru",
        "short": "GBA-SWM",
        "name": "GBA Solid Waste Management",
        "category": "civic",
        "description": "Garbage collection, waste segregation, black spot clearing. "
                       "Reports to GBA but has separate complaint line.",
        "website": "https://bbmp.gov.in/swm",
        "complaint_url": "https://bbmp.gov.in/complaints",
        "helpline": "080-22660000",
        "toll_free": "1533",
        "handles": "garbage,waste_collection,segregation,composting,black_spots",
    },
    {
        "city_id": "bengaluru",
        "short": "GBA-Health",
        "name": "GBA Health Department",
        "category": "civic",
        "description": "Public health centres, vaccination drives, disease control, "
                       "food safety inspections within BBMP limits.",
        "website": "https://bbmp.gov.in",
        "helpline": "080-22660000",
        "handles": "PHC,vaccination,disease_control,food_safety,mosquito_fogging",
    },

    # ── Water & Sewage
    {
        "city_id": "bengaluru",
        "short": "BWSSB",
        "name": "Bangalore Water Supply & Sewerage Board",
        "category": "utility",
        "description": "Water supply, sewage connections, water quality, Cauvery "
                       "water distribution, borewell permits.",
        "website": "https://bwssb.karnataka.gov.in",
        "complaint_url": "https://bwssb.karnataka.gov.in/info-3/Online+Complaint+Registration/en",
        "helpline": "080-22945300",
        "toll_free": "1916",
        "email": "chairperson.bwssb@gmail.com",
        "handles": "water_supply,sewage,cauvery,borewell,water_quality,pipe_burst,"
                   "water_connection,sewage_overflow",
    },

    # ── Electricity
    {
        "city_id": "bengaluru",
        "short": "BESCOM",
        "name": "Bangalore Electricity Supply Company",
        "category": "utility",
        "description": "Power supply, outage management, new connections, billing, "
                       "transformer maintenance, streetlight complaints.",
        "website": "https://bescom.karnataka.gov.in",
        "complaint_url": "https://bescom.karnataka.gov.in/info-2/Online+Complaint+Registration/en",
        "helpline": "080-22873555",
        "toll_free": "1912",
        "email": "md@bescom.co.in",
        "handles": "power_supply,outage,transformer,streetlight,new_connection,"
                   "billing,meter,power_theft",
    },

    # ── Transport
    {
        "city_id": "bengaluru",
        "short": "BMTC",
        "name": "Bangalore Metropolitan Transport Corporation",
        "category": "transport",
        "description": "City bus services, Vajra/Vayu AC buses, bus passes, "
                       "route planning, bus shelter maintenance.",
        "website": "https://mybmtc.karnataka.gov.in",
        "complaint_url": "https://mybmtc.karnataka.gov.in/info-1/Complaint+Registration/en",
        "helpline": "080-22952522",
        "toll_free": "1800-425-1663",
        "handles": "bus_service,route,bus_pass,bus_shelter,driver_complaint",
    },
    {
        "city_id": "bengaluru",
        "short": "BMRCL",
        "name": "Bangalore Metro Rail Corporation Limited",
        "alt_names": "Namma Metro",
        "category": "transport",
        "description": "Metro rail operations — Purple and Green lines, upcoming "
                       "extensions, station facilities, smart card.",
        "website": "https://english.bmrc.co.in",
        "complaint_url": "https://english.bmrc.co.in/complaint-registration",
        "helpline": "080-22969555",
        "email": "md@bmrc.co.in",
        "handles": "metro,namma_metro,metro_station,smart_card,metro_route",
    },
    {
        "city_id": "bengaluru",
        "short": "BTP",
        "name": "Bengaluru Traffic Police",
        "category": "law",
        "description": "Traffic management, signal maintenance, parking violations, "
                       "accident response, challan/fine queries.",
        "website": "https://btp.gov.in",
        "complaint_url": "https://btp.gov.in/complaint.aspx",
        "helpline": "080-22942222",
        "toll_free": "103",
        "handles": "traffic,signal,parking,accident,challan,tow,speed_limit",
    },

    # ── Development & Planning
    {
        "city_id": "bengaluru",
        "short": "BDA",
        "name": "Bangalore Development Authority",
        "category": "planning",
        "description": "City planning, site allotments, layout approvals, "
                       "Revised Master Plan 2031, land acquisition.",
        "website": "https://bdabangalore.org",
        "helpline": "080-22271725",
        "email": "commissioner@bda.org.in",
        "handles": "land_allotment,layout_approval,master_plan,site_allotment,"
                   "unauthorized_construction",
    },

    # ── Lake & Environment
    {
        "city_id": "bengaluru",
        "short": "KLCDA",
        "name": "Karnataka Lake Conservation & Development Authority",
        "category": "environment",
        "description": "Lake restoration, encroachment prevention, buffer zone "
                       "maintenance, lake biodiversity conservation.",
        "website": "https://klcda.karnataka.gov.in",
        "handles": "lake,lake_encroachment,lake_pollution,buffer_zone,"
                   "wetland_conservation",
    },
    {
        "city_id": "bengaluru",
        "short": "KSPCB",
        "name": "Karnataka State Pollution Control Board",
        "category": "environment",
        "description": "Industrial pollution, air quality, noise pollution, "
                       "construction debris dumping, effluent discharge.",
        "website": "https://kspcb.karnataka.gov.in",
        "complaint_url": "https://kspcb.karnataka.gov.in/info-2/Online+Complaint/en",
        "helpline": "080-25589112",
        "handles": "pollution,air_quality,noise,industrial_waste,effluent,"
                   "construction_debris",
    },

    # ── Universal Grievance
    {
        "city_id": "bengaluru",
        "short": "Sampark",
        "name": "Sampark Karnataka — Integrated Grievance Portal",
        "category": "grievance",
        "description": "One-stop grievance portal for ALL Karnataka government "
                       "departments. File, track, and escalate complaints.",
        "website": "https://sampark.karnataka.gov.in",
        "complaint_url": "https://sampark.karnataka.gov.in",
        "toll_free": "1902",
        "handles": "any,all_departments,escalation,grievance",
    },

    # ── Police
    {
        "city_id": "bengaluru",
        "short": "BCP",
        "name": "Bengaluru City Police",
        "category": "law",
        "description": "Law and order, FIR filing, cyber crime, women safety, "
                       "community policing, Hoysala patrol.",
        "website": "https://bcp.karnataka.gov.in",
        "complaint_url": "https://bcp.karnataka.gov.in/info-3/Online+FIR/en",
        "helpline": "112",
        "toll_free": "100",
        "handles": "crime,FIR,cyber_crime,women_safety,hoysala,missing_person,"
                   "noise_complaint",
    },

    # ── Fire
    {
        "city_id": "bengaluru",
        "short": "KSFES",
        "name": "Karnataka State Fire & Emergency Services",
        "category": "emergency",
        "description": "Fire response, rescue operations, NOC for buildings, "
                       "fire safety inspections.",
        "website": "https://ksfes.karnataka.gov.in",
        "helpline": "101",
        "handles": "fire,rescue,fire_NOC,fire_safety",
    },

    # ── Gas
    {
        "city_id": "bengaluru",
        "short": "GAIL",
        "name": "GAIL Gas / City Gas Distribution",
        "category": "utility",
        "description": "Piped natural gas supply, PNG connections, gas leaks.",
        "website": "https://gailgas.com",
        "helpline": "1800-180-1803",
        "handles": "gas_supply,PNG,gas_leak,gas_connection",
    },
]


async def seed() -> None:
    async with SessionLocal() as session:
        # Create departments table if not exists
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY,
                city_id VARCHAR(64) NOT NULL,
                short VARCHAR(32) NOT NULL,
                name VARCHAR(256) NOT NULL,
                alt_names VARCHAR(256),
                category VARCHAR(64),
                description TEXT,
                website VARCHAR(512),
                complaint_url VARCHAR(512),
                helpline VARCHAR(64),
                toll_free VARCHAR(32),
                email VARCHAR(256),
                handles TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(city_id, short)
            )
        """))

        for dept in DEPARTMENTS:
            cols = ", ".join(dept.keys())
            placeholders = ", ".join(f":{k}" for k in dept.keys())
            update_set = ", ".join(
                f"{k} = EXCLUDED.{k}" for k in dept.keys() if k not in ("city_id", "short")
            )
            await session.execute(text(f"""
                INSERT INTO departments ({cols})
                VALUES ({placeholders})
                ON CONFLICT (city_id, short)
                DO UPDATE SET {update_set}
            """), dept)

        await session.commit()

    logger.info("Seeded %d departments/agencies for Bengaluru.", len(DEPARTMENTS))


if __name__ == "__main__":
    asyncio.run(seed())
