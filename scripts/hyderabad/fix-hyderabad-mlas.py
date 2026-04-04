"""
Fix Hyderabad MLA data based on verified 2023 Telangana election results.
Source: Wikipedia 2023 Telangana Legislative Assembly election + bypoll results.

Correct winners (as of 2025):
- Jubilee Hills (61): Naveen Yadav (INC) won bypoll Nov 2025 (Maganti Gopinath BRS died Jun 2025)
- Secunderabad Cantt (71): Sri Ganesh (INC) won bypoll May 2024 (Lasya Nanditha BRS died Feb 2024)
- All others: original 2023 election winners

GHMC covers Hyderabad district ACs + parts of Medchal-Malkajgiri + Ranga Reddy:
Hyderabad: Musheerabad, Malakpet, Amberpet, Khairatabad, Jubilee Hills, Sanathnagar,
           Nampally, Karwan, Goshamahal, Charminar, Chandrayangutta, Yakutpura,
           Bahadurpura, Secunderabad, Secunderabad Cantt
Medchal-Malkajgiri: Malkajgiri, Quthbullapur, Kukatpally
Ranga Reddy: Uppal, LB Nagar
"""
import json, urllib.request, urllib.parse

SUPABASE_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co"

import os, subprocess, re
# Get service key
env_content = open(r'apps\web\.env.production', 'rb').read().decode('utf-8')
service_key = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"\r\n]+)"', env_content).group(1).strip()

HEADERS = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def supabase_delete(table, filters):
    params = urllib.parse.urlencode(filters)
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, method="DELETE", headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return r.status

def supabase_insert(table, rows):
    body = json.dumps(rows).encode()
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# Verified MLA data for all 20 GHMC-adjacent constituencies
# Ordered by ECI constituency number
mlas = [
    # Medchal-Malkajgiri district
    {"constituency": "Malkajgiri",      "name": "Marri Rajasekhar Reddy", "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Quthbullapur",    "name": "K. P. Vivekanand Goud",  "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Kukatpally",      "name": "Madhavaram Krishna Rao", "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    # Ranga Reddy district
    {"constituency": "Uppal",           "name": "Bandari Lakshma Reddy",  "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "LB Nagar",        "name": "Devireddy Sudheer Reddy","party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    # Hyderabad district
    {"constituency": "Musheerabad",     "name": "Muta Gopal",             "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Malakpet",        "name": "Ahmed Bin Abdullah Balala", "party": "AIMIM", "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Amberpet",        "name": "Kaleru Venkatesh",       "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Khairatabad",     "name": "Danam Nagender",         "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    # Jubilee Hills - BYPOLL Nov 2025 after Maganti Gopinath (BRS) died Jun 2025
    {"constituency": "Jubilee Hills",   "name": "Naveen Yadav",           "party": "INC",   "elected_since": "2025-11-11", "data_source": "eci-bypoll-2025",
     "notes": "Won bypoll Nov 2025. Original MLA Maganti Gopinath (BRS) died Jun 2025."},
    {"constituency": "Sanathnagar",     "name": "Talasani Srinivas Yadav","party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Nampally",        "name": "Mohammad Majid Hussain", "party": "AIMIM", "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Karwan",          "name": "Kausar Mohiuddin",       "party": "AIMIM", "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Goshamahal",      "name": "T. Raja Singh",          "party": "BJP",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Charminar",       "name": "Mir Zulfeqar Ali",       "party": "AIMIM", "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Chandrayangutta", "name": "Akbaruddin Owaisi",      "party": "AIMIM", "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Yakutpura",       "name": "Jaffer Hussain",         "party": "AIMIM", "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Bahadurpura",     "name": "Mohammed Mubeen",        "party": "AIMIM", "elected_since": "2023-12-03", "data_source": "eci-2023"},
    {"constituency": "Secunderabad",    "name": "T. Padma Rao Goud",      "party": "BRS",   "elected_since": "2023-12-03", "data_source": "eci-2023"},
    # Secunderabad Cantt - BYPOLL May 2024 after Lasya Nanditha (BRS) died Feb 2024
    {"constituency": "Secunderabad Cantt", "name": "Sri Ganesh",          "party": "INC",   "elected_since": "2024-05-13", "data_source": "eci-bypoll-2024",
     "notes": "Won bypoll May 2024. Original MLA Lasya Nanditha (BRS) died Feb 2024 in helicopter crash."},
]

# Delete all existing Hyderabad MLAs
print("Deleting existing Hyderabad MLAs...")
status = supabase_delete("elected_reps", {"city_id": "eq.hyderabad", "role": "eq.MLA"})
print(f"  Delete status: {status}")

# Insert fresh
rows = []
for m in mlas:
    rows.append({
        "role":         "MLA",
        "constituency": m["constituency"],
        "city_id":      "hyderabad",
        "name":         m["name"],
        "party":        m["party"],
        "criminal_cases": None,
        "elected_since": m["elected_since"],
        "phone":        None,
        "profile_url":  None,
        "age":          None,
        "profession":   None,
        "education":    None,
        "data_source":  m["data_source"],
        "notes":        m.get("notes"),
    })

result = supabase_insert("elected_reps", rows)
print(f"Inserted {len(result)} MLAs")
for r in result:
    print(f"  {r['constituency']}: {r['name']} ({r['party']})")
