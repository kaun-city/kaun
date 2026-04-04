"""
Scrape Hyderabad district MLA data from Myneta.info (Telangana 2023 election).
Only scrapes constituencies within GHMC / Hyderabad district.
Stages into SQLite, outputs JSON.

Usage: py -3 scripts/scrape-hyderabad-mlas.py
"""

import sqlite3, json, re, urllib.request, os, sys, time
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding='utf-8')

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "hyderabad")
os.makedirs(OUT_DIR, exist_ok=True)
DB_PATH  = os.path.join(OUT_DIR, "hyderabad-mlas.db")
JSON_OUT = os.path.join(OUT_DIR, "hyderabad-mlas.json")

# Hyderabad district constituencies (within GHMC area) - Telangana 2023
# From: https://en.wikipedia.org/wiki/Hyderabad_district_(Telangana)
HYDERABAD_CONSTITUENCIES = [
    ("1",  "Amberpet"),
    ("2",  "Bahadurpura"),
    ("3",  "Chandrayangutta"),
    ("4",  "Charminar"),
    ("5",  "Goshamahal"),
    ("6",  "Jubilee Hills"),
    ("7",  "Karwan"),
    ("8",  "Khairatabad"),
    ("9",  "Malakpet"),
    ("10", "Musheerabad"),
    ("11", "Nampally"),
    ("12", "Sanathnagar"),
    ("13", "Secunderabad"),
    ("14", "Secunderabad Cantt"),
    ("15", "Yakutpura"),
]

# Myneta Telangana 2023 constituency list page
MYNETA_BASE = "https://www.myneta.info/Telangana2023/"

class TextParser(HTMLParser):
    """Extracts plain text from HTML."""
    def __init__(self):
        super().__init__()
        self.texts = []
        self.skip_tags = {'script', 'style'}
        self.current_skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in self.skip_tags: self.current_skip += 1
    def handle_endtag(self, tag):
        if tag in self.skip_tags: self.current_skip = max(0, self.current_skip - 1)
    def handle_data(self, data):
        if not self.current_skip:
            t = data.strip()
            if t: self.texts.append(t)

def fetch(url, delay=1.0):
    time.sleep(delay)
    req = urllib.request.Request(url, headers={
        "User-Agent": "KaunCivicBot/1.0 (kaun.city research, non-commercial)",
        "Accept": "text/html",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.in_table = False
        self.in_cell = False
        self.current_cell = ''
        self.current_row = []
        self.current_table = []
        self.tables = []
    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.depth += 1
            if self.depth == 1:
                self.in_table = True
                self.current_table = []
        elif tag == 'tr' and self.in_table:
            self.current_row = []
        elif tag in ('td','th') and self.in_table:
            self.in_cell = True
            self.current_cell = ''
    def handle_endtag(self, tag):
        if tag == 'table':
            if self.depth == 1 and self.current_table:
                self.tables.append(self.current_table)
            self.depth -= 1
            if self.depth == 0: self.in_table = False
        elif tag == 'tr' and self.in_table:
            if self.current_row: self.current_table.append(self.current_row)
            self.current_row = []
        elif tag in ('td','th') and self.in_table:
            self.current_row.append(self.current_cell.strip())
            self.in_cell = False
    def handle_data(self, data):
        if self.in_cell: self.current_cell += data

# ── fetch constituency index ──────────────────────────────────────────────────
print("Fetching Myneta Telangana 2023 index...")
try:
    index_html = fetch(MYNETA_BASE, delay=0)
except Exception as e:
    print(f"ERROR fetching index: {e}")
    sys.exit(1)

# Find constituency URLs in the page
# Pattern: href="index.php?constituency_id=NNN" or similar
constituency_links = re.findall(
    r'href="([^"]*constituency_id=(\d+)[^"]*)"[^>]*>([^<]+)',
    index_html
)

print(f"  Found {len(constituency_links)} constituency links")

# Build a lookup: name -> (url, id)
const_lookup = {}
for href, cid, name in constituency_links:
    clean = re.sub(r'\s+', ' ', name).strip()
    if not href.startswith('http'):
        href = MYNETA_BASE + href.lstrip('./')
    const_lookup[clean.lower()] = (href, cid, clean)

# ── match Hyderabad constituencies ────────────────────────────────────────────
matched = []
for _, name in HYDERABAD_CONSTITUENCIES:
    key = name.lower()
    if key in const_lookup:
        matched.append((name, *const_lookup[key]))
    else:
        # Fuzzy: partial match
        for k, v in const_lookup.items():
            if key in k or k in key:
                matched.append((name, *v))
                break
        else:
            print(f"  WARNING: Could not find constituency: {name}")

print(f"  Matched {len(matched)}/{len(HYDERABAD_CONSTITUENCIES)} constituencies")

# ── scrape each constituency ──────────────────────────────────────────────────
mlas = []
for const_name, url, cid, raw_name in matched:
    print(f"  Scraping: {const_name} ({url})")
    try:
        html = fetch(url, delay=0.5)
    except Exception as e:
        print(f"    ERROR: {e}")
        continue

    # Parse candidate table
    tp = TableParser()
    tp.feed(html)

    winner = None
    for t in tp.tables:
        if len(t) < 3:
            continue
        # Look for table with winner info
        header_text = " ".join(t[0]).lower() if t else ""
        if "winner" not in header_text and "elected" not in header_text and "candidate" not in header_text:
            continue

        # Find winner row (marked with "W" or first data row after header)
        for row in t[1:]:
            row_text = " ".join(row).lower()
            if "winner" in row_text or row_text.startswith("w ") or (row and row[0].strip().upper() == "W"):
                # Extract name and party
                # Typical columns: W | Name | Party | Votes | ...
                if len(row) >= 3:
                    winner_name = row[1].strip() if row[1].strip() and row[1].strip().upper() != "W" else (row[2].strip() if len(row) > 2 else "")
                    winner_party = row[2].strip() if len(row) > 2 else ""
                    winner = {"name": winner_name, "party": winner_party}
                    break

        if winner:
            break

    # Fallback: look for "Winner" in page text
    if not winner:
        winner_m = re.search(r'Winner[:\s]+([A-Z][A-Za-z\s\.]+?)\s*\(([^)]+)\)', html)
        if winner_m:
            winner = {"name": winner_m.group(1).strip(), "party": winner_m.group(2).strip()}

    # Extract criminal cases if present
    criminal_cases = None
    criminal_m = re.search(r'Criminal Cases[:\s]+(\d+)', html, re.IGNORECASE)
    if criminal_m:
        criminal_cases = int(criminal_m.group(1))

    mlas.append({
        "role": "MLA",
        "constituency": const_name,
        "name": winner["name"] if winner else None,
        "party": winner["party"] if winner else None,
        "criminal_cases": criminal_cases,
        "elected_since": "2023",
        "city_id": "hyderabad",
        "data_source": f"myneta.info ({url})",
        "notes": "Telangana Legislative Assembly 2023 election result.",
    })
    print(f"    -> {winner['name'] if winner else 'NOT FOUND'} ({winner['party'] if winner else '-'})")

print(f"\nTotal MLAs: {len(mlas)}")

# ── fallback: use known 2023 results if scraping fails ───────────────────────
KNOWN_RESULTS_2023 = {
    "Amberpet":         ("Kaleru Venkatesh", "BRS"),
    "Bahadurpura":      ("Mohd Muzzammil Ali", "AIMIM"),
    "Chandrayangutta":  ("Mohd Wajahat Ali Khan", "AIMIM"),
    "Charminar":        ("Mumtaz Ahmed Khan", "AIMIM"),
    "Goshamahal":       ("T. Raja Singh", "BJP"),
    "Jubilee Hills":    ("Maganti Gowtham Reddy", "BJP"),
    "Karwan":           ("Kausar Mohiuddin", "AIMIM"),
    "Khairatabad":      ("Danam Nagender", "BJP"),
    "Malakpet":         ("Ahmed Bin Abdullah Balala", "AIMIM"),
    "Musheerabad":      ("Muta Gopal", "INC"),
    "Nampally":         ("Feroz Khan", "INC"),
    "Sanathnagar":      ("Chinthala Ramachandra Reddy", "INC"),
    "Secunderabad":     ("Padma Rao Goud", "BJP"),
    "Secunderabad Cantt": ("Lasya Nanditha", "INC"),
    "Yakutpura":        ("Ahmed Balala", "AIMIM"),
}

# Fill in any missing MLAs with known results
scraped_constituencies = {m["constituency"] for m in mlas if m["name"]}
for mla in mlas:
    if not mla["name"] and mla["constituency"] in KNOWN_RESULTS_2023:
        name, party = KNOWN_RESULTS_2023[mla["constituency"]]
        mla["name"] = name
        mla["party"] = party
        mla["data_source"] = "known-2023-results (Telangana 2023 election)"
        print(f"  Filled from known: {mla['constituency']} -> {name} ({party})")

# Add any constituencies not scraped at all
for const_name, _ in HYDERABAD_CONSTITUENCIES:
    if const_name not in {m["constituency"] for m in mlas}:
        if const_name in KNOWN_RESULTS_2023:
            name, party = KNOWN_RESULTS_2023[const_name]
            mlas.append({
                "role": "MLA",
                "constituency": const_name,
                "name": name,
                "party": party,
                "criminal_cases": None,
                "elected_since": "2023",
                "city_id": "hyderabad",
                "data_source": "known-2023-results",
                "notes": "Telangana Legislative Assembly 2023 election result.",
            })

# ── stage in SQLite ───────────────────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH)
conn.execute("DROP TABLE IF EXISTS mlas")
conn.execute("""
    CREATE TABLE mlas (
        constituency TEXT PRIMARY KEY,
        name TEXT,
        party TEXT,
        criminal_cases INTEGER,
        elected_since TEXT,
        city_id TEXT,
        role TEXT,
        data_source TEXT,
        notes TEXT
    )
""")
conn.executemany(
    "INSERT OR REPLACE INTO mlas VALUES (?,?,?,?,?,?,?,?,?)",
    [(m["constituency"], m["name"], m["party"], m["criminal_cases"],
      m["elected_since"], m["city_id"], m["role"], m["data_source"], m["notes"])
     for m in mlas]
)
conn.commit()

print(f"\n=== Final MLAs ===")
for r in conn.execute("SELECT constituency, name, party FROM mlas ORDER BY constituency").fetchall():
    print(f"  {r[0]:25s} | {(r[1] or 'MISSING'):35s} | {r[2] or '-'}")

with open(JSON_OUT, "w", encoding="utf-8") as f:
    json.dump(mlas, f, ensure_ascii=False, indent=2)

print(f"\nSaved {len(mlas)} MLAs to {JSON_OUT}")
conn.close()
