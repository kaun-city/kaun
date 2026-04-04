"""
Scrape 2020 GHMC corporator election results from Wikipedia.
Stages into SQLite, validates, then outputs ready-to-insert JSON.

Usage: py -3 scripts/scrape-ghmc-corporators.py
Output: data/hyderabad/ghmc-corporators.json
        data/hyderabad/ghmc-corporators.db  (SQLite staging)
"""

import sqlite3, json, re, urllib.request, os, sys
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding='utf-8')

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "hyderabad")
os.makedirs(OUT_DIR, exist_ok=True)
DB_PATH  = os.path.join(OUT_DIR, "ghmc-corporators.db")
JSON_OUT = os.path.join(OUT_DIR, "ghmc-corporators.json")

WIKI_URL = "https://en.wikipedia.org/wiki/2020_Greater_Hyderabad_Municipal_Corporation_election"

# ── fetch page ───────────────────────────────────────────────────────────────
print("Fetching Wikipedia page...")
req = urllib.request.Request(WIKI_URL, headers={"User-Agent": "KaunCivicBot/1.0"})
with urllib.request.urlopen(req, timeout=15) as r:
    html = r.read().decode("utf-8", errors="replace")
print(f"  Got {len(html):,} bytes")

# ── parse tables ─────────────────────────────────────────────────────────────
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

parser = TableParser()
parser.feed(html)

# Table 4 (0-indexed) is the 152-row ward results table
# Header rows: ['Ward','Winner','Runner Up','Margin'] + ['#','Name','Candidate','Party','Votes','Candidate'...]
# Data rows: [ward_no, ward_name, winner_name, '', winner_party, winner_votes, ...]
ward_table = None
for t in parser.tables:
    if len(t) < 100:
        continue
    # Confirm it looks like the ward table by checking first data row
    for row in t[2:4]:
        if row and re.match(r'^\d+$', row[0].strip()):
            ward_table = t
            break
    if ward_table:
        break

if not ward_table:
    print("ERROR: Could not find ward results table")
    for i, t in enumerate(parser.tables):
        print(f"Table {i}: {len(t)} rows, sample: {t[0][:4] if t else '(empty)'}")
    sys.exit(1)

print(f"Found ward table: {len(ward_table)} rows")
print(f"Header row 1: {ward_table[0]}")
print(f"Header row 2: {ward_table[1]}")
print(f"Data row 1:   {ward_table[2]}")

# ── parse ward rows ──────────────────────────────────────────────────────────
# Columns: 0=ward_no, 1=ward_name, 2=winner_name, 3=blank, 4=winner_party, 5=winner_votes
corporators = []
party_map = {
    "TRS": "TRS",
    "BJP": "BJP",
    "INC": "INC",
    "AIMIM": "AIMIM",
    "MIM": "AIMIM",
    "TDP": "TDP",
    "IND": "Independent",
    "BSP": "BSP",
}

for row in ward_table[2:]:  # skip 2 header rows
    if not row or not row[0].strip():
        continue
    if not re.match(r'^\d+$', row[0].strip()):
        continue

    ward_no   = int(row[0].strip())
    ward_name = row[1].strip() if len(row) > 1 else ""
    winner    = row[2].strip() if len(row) > 2 else ""
    # party may be at col 4 (with blank col 3) or col 3
    party_raw = ""
    if len(row) > 4 and row[3].strip() == "":
        party_raw = row[4].strip()
    elif len(row) > 3:
        party_raw = row[3].strip()

    # Normalize party
    party = party_map.get(party_raw.upper(), party_raw) if party_raw else ""

    if ward_no < 1 or ward_no > 150:
        continue

    corporators.append({
        "ward_no": ward_no,
        "ward_name": ward_name,
        "name": winner,
        "party": party,
        "election_year": 2020,
        "city_id": "hyderabad",
        "role": "CORPORATOR",
        "constituency": f"Ward {ward_no} {ward_name}",
        "notes": "2020 GHMC election result. No current corporator - GHMC under administrator rule since Feb 2026.",
    })

print(f"\nParsed {len(corporators)} corporator records")

# ── stage in SQLite ───────────────────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH)
conn.execute("DROP TABLE IF EXISTS corporators")
conn.execute("""
    CREATE TABLE corporators (
        ward_no INTEGER PRIMARY KEY,
        ward_name TEXT,
        name TEXT,
        party TEXT,
        election_year INTEGER,
        city_id TEXT,
        role TEXT,
        constituency TEXT,
        notes TEXT
    )
""")
conn.executemany(
    "INSERT OR REPLACE INTO corporators VALUES (?,?,?,?,?,?,?,?,?)",
    [(c["ward_no"], c["ward_name"], c["name"], c["party"],
      c["election_year"], c["city_id"], c["role"], c["constituency"], c["notes"])
     for c in corporators]
)
conn.commit()

# ── validate ──────────────────────────────────────────────────────────────────
total     = conn.execute("SELECT COUNT(*) FROM corporators").fetchone()[0]
with_name = conn.execute("SELECT COUNT(*) FROM corporators WHERE name != ''").fetchone()[0]
parties   = conn.execute("SELECT party, COUNT(*) c FROM corporators GROUP BY party ORDER BY c DESC").fetchall()
missing   = conn.execute("""
    WITH RECURSIVE e(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM e WHERE n < 150)
    SELECT n FROM e WHERE n NOT IN (SELECT ward_no FROM corporators) ORDER BY n
""").fetchall()

print(f"\n=== Validation ===")
print(f"Total records:  {total}")
print(f"With name:      {with_name}")
print(f"Missing wards:  {[r[0] for r in missing]}")
print(f"\nParty breakdown:")
for party, count in parties:
    print(f"  {(party or '(blank)'):30s} {count}")

print("\nSample 5:")
for r in conn.execute("SELECT ward_no, ward_name, name, party FROM corporators LIMIT 5").fetchall():
    print(f"  Ward {r[0]:3d}: {r[1]:25s} | {r[2]:35s} | {r[3]}")

# ── write JSON output ─────────────────────────────────────────────────────────
with open(JSON_OUT, "w", encoding="utf-8") as f:
    json.dump(corporators, f, ensure_ascii=False, indent=2)

print(f"\nSaved {len(corporators)} records to {JSON_OUT}")
conn.close()
