"""Upload ward data + departments + tenders to Supabase via Management API."""
import httpx
import asyncio
import json

SUPABASE_TOKEN = "sbp_8226477e680b438942c021e7b534bd0ba53bf56b"
PROJECT_ID = "xgygxfyfsvccqqmtboeu"
SQL_URL = f"https://api.supabase.com/v1/projects/{PROJECT_ID}/database/query"
HEADERS = {
    "Authorization": f"Bearer {SUPABASE_TOKEN}",
    "Content-Type": "application/json",
}


async def run_sql(client: httpx.AsyncClient, sql: str) -> dict | None:
    try:
        r = await client.post(SQL_URL, headers=HEADERS, json={"query": sql}, timeout=60)
        if r.status_code not in (200, 201):
            print(f"ERROR {r.status_code}: {r.text[:200]}")
            return None
        try:
            return r.json()
        except Exception:
            return {}
    except Exception as e:
        print(f"ERROR: {e}")
        return None


async def main():
    async with httpx.AsyncClient(timeout=120) as client:
        # Upload wards in batches (each has large GeoJSON)
        print("Uploading 243 wards...")
        with open("ward_inserts.sql", encoding="utf-8") as f:
            lines = f.readlines()

        batch_size = 5  # Small batches due to large GeoJSON payloads
        for i in range(0, len(lines), batch_size):
            batch = "".join(lines[i:i + batch_size])
            result = await run_sql(client, batch)
            done = min(i + batch_size, len(lines))
            status = "OK" if result is not None else "FAIL"
            print(f"  Wards {i+1}-{done}/{len(lines)} {status}")

        # Verify
        r = await run_sql(client, "SELECT COUNT(*) as cnt FROM wards WHERE city_id = 'bengaluru'")
        print(f"  Total wards in Supabase: {r}")

        # Upload departments
        print("\nUploading departments...")
        from apps.api.scripts.seed_departments import DEPARTMENTS
        for dept in DEPARTMENTS:
            cols = ", ".join(dept.keys())
            vals = ", ".join(
                f"'{str(v).replace(chr(39), chr(39)+chr(39))}'" if v is not None else "NULL"
                for v in dept.values()
            )
            update_set = ", ".join(
                f"{k} = EXCLUDED.{k}" for k in dept.keys() if k not in ("city_id", "short")
            )
            sql = (
                f"INSERT INTO departments ({cols}) VALUES ({vals}) "
                f"ON CONFLICT (city_id, short) DO UPDATE SET {update_set};"
            )
            await run_sql(client, sql)
        print(f"  Departments done: {len(DEPARTMENTS)}")

        # Upload sample tenders
        print("\nUploading tenders...")
        from apps.api.scripts.seed_bengaluru import SAMPLE_TENDERS
        for t in SAMPLE_TENDERS:
            cols = []
            vals = []
            for k, v in t.items():
                cols.append(k)
                if v is None:
                    vals.append("NULL")
                elif isinstance(v, bool):
                    vals.append("TRUE" if v else "FALSE")
                elif isinstance(v, (int, float)):
                    vals.append(str(v))
                else:
                    vals.append(f"'{str(v).replace(chr(39), chr(39)+chr(39))}'")
            update_set = ", ".join(
                f"{k} = EXCLUDED.{k}" for k in t.keys() if k != "kppp_id"
            )
            sql = (
                f"INSERT INTO tenders ({', '.join(cols)}) VALUES ({', '.join(vals)}) "
                f"ON CONFLICT (kppp_id) DO UPDATE SET {update_set};"
            )
            await run_sql(client, sql)
        print(f"  Tenders done: {len(SAMPLE_TENDERS)}")

        # Final verification
        print("\n--- Verification ---")
        for table in ["wards", "elected_reps", "departments", "tenders"]:
            r = await run_sql(client, f"SELECT COUNT(*) as cnt FROM {table}")
            print(f"  {table}: {r}")


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent))
    asyncio.run(main())
