"""
Myneta.info scraper for Bengaluru MLAs ΓÇö criminal cases, assets, liabilities.
Source: https://myneta.info (ADR - Association for Democratic Reforms)
Data is from ECI affidavits filed at the time of elections.
"""
import re
import json
import time
import urllib.request
import urllib.parse

MYNETA_BASE = "https://myneta.info"
SEARCH_URL = "https://myneta.info/search_myneta.php?q="

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
}

# Our 28 Bengaluru MLAs with canonical names
BENGALURU_MLAS = [
    {"name": "S R Vishwanath", "constituency": "Yelahanka", "party": "BJP"},
    {"name": "R Manjunath", "constituency": "Byatarayanapura", "party": "BJP"},
    {"name": "S T Somashekar", "constituency": "Yeshvanthapura", "party": "IND"},
    {"name": "S Muniraju", "constituency": "Dasarahalli", "party": "BJP"},
    {"name": "K Gopalaiah", "constituency": "Mahalakshmi Layout", "party": "BJP"},
    {"name": "N Nataraj", "constituency": "Malleshwara", "party": "INC"},
    {"name": "Byrathi Suresh", "constituency": "Hebbal", "party": "INC"},
    {"name": "Byrathi Basavaraj", "constituency": "K R Puram", "party": "BJP"},
    {"name": "Zameer Ahmed Khan", "constituency": "Chamrajpet", "party": "INC"},
    {"name": "Dinesh Gundu Rao", "constituency": "Shivajinagar", "party": "INC"},
    {"name": "Rizwan Arshad", "constituency": "Shantinagar", "party": "INC"},
    {"name": "Priyanknath Shetty", "constituency": "Gandhi Nagar", "party": "INC"},
    {"name": "S Suresh Kumar", "constituency": "Rajajinagar", "party": "BJP"},
    {"name": "Priya Krishna", "constituency": "Govindaraja Nagar", "party": "INC"},
    {"name": "Uday Garudachar", "constituency": "Chickpet", "party": "BJP"},
    {"name": "A H Vishwanath", "constituency": "Sarvajnanagar", "party": "INC"},
    {"name": "R Suresh Reddy", "constituency": "Pulakeshinagar", "party": "INC"},
    {"name": "Manjula S", "constituency": "Mahadevapura", "party": "BJP"},
    {"name": "S Raghu", "constituency": "C V Raman Nagar", "party": "BJP"},
    {"name": "Ramalinga Reddy", "constituency": "BTM Layout", "party": "INC"},
    {"name": "Sowmya Reddy", "constituency": "Jayanagar", "party": "INC"},
    {"name": "M Krishnappa", "constituency": "Bangalore South", "party": "BJP"},
    {"name": "Padmanabha Reddy", "constituency": "Padmanabhanagar", "party": "BJP"},
    {"name": "M S Virupaksha", "constituency": "Vijayanagar", "party": "BJP"},
    {"name": "Rajarajeshwari Nagar", "constituency": "Rajarajeshwari Nagar", "party": "INC"},
    {"name": "Byrathi Ramesh", "constituency": "Bommanahalli", "party": "BJP"},
    {"name": "N Narayanaswamy", "constituency": "Basavanagudi", "party": "BJP"},
    {"name": "Munirathna", "constituency": "Rajarajeshwari Nagar", "party": "INC"},
    {"name": "Venkatesh M Nayak", "constituency": "Anekal", "party": "INC"},
]

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def search_candidate(name, constituency):
    """Search for a candidate by name and return Karnataka2023 candidate_id"""
    query = urllib.parse.quote(name)
    html = fetch(f"{SEARCH_URL}{query}")
    
    # Find Karnataka2023 candidate links
    matches = re.findall(
        r'/Karnataka2023/candidate\.php\?candidate_id=(\d+).*?>(.*?)</a',
        html, re.DOTALL
    )
    
    for cid, cname in matches:
        cname = re.sub(r'<[^>]+>', '', cname).strip()
        if any(part.lower() in cname.lower() for part in name.split()):
            return cid, cname
    
    return None, None

def scrape_candidate(candidate_id):
    """Scrape criminal cases and assets from a candidate page"""
    url = f"{MYNETA_BASE}/Karnataka2023/candidate.php?candidate_id={candidate_id}"
    html = fetch(url)
    
    result = {
        "candidate_id": candidate_id,
        "criminal_cases": None,
        "total_assets_inr": None,
        "total_assets_cr": None,
        "liabilities_inr": None,
        "liabilities_cr": None,
        "education": None,
        "age": None,
        "profession": None,
        "asset_growth_pct": None,
        "prev_assets_2018": None,
        "profile_url": url,
    }
    
    # Criminal cases
    m = re.search(r'Number of Criminal Cases:\s*<span[^>]*>(\d+)', html)
    if m:
        result["criminal_cases"] = int(m.group(1))
    
    # Assets from obfuscated table - look for the summary numbers
    # They appear as Rs<number> in the page
    amounts = re.findall(r'Rs([\d,]+)', html)
    
    # Age
    m = re.search(r'<b>Age:</b>\s*(\d+)', html)
    if m:
        result["age"] = int(m.group(1))
    
    # Profession
    m = re.search(r'<b>Self Profession:</b>([^<]+)', html)
    if m:
        result["profession"] = m.group(1).strip()
    
    # Education
    m = re.search(r'<b>Education:</b>\s*([^<]+)', html)
    if m:
        result["education"] = m.group(1).strip()

    # Previous election assets (from the "Other Elections" table - visible plain HTML)
    prev_2018 = re.search(r'Karnataka 2018.*?Rs([\d,]+)', html, re.DOTALL)
    if prev_2018:
        result["prev_assets_2018"] = int(prev_2018.group(1).replace(",", ""))
    
    # Assets table header
    m_assets = re.search(r'~\s*([\d]+)\s*Crore\+.*?~\s*([\d]+)\s*(Crore|Lacs)\+.*?~\s*([\d]+)\s*(Crore|Lacs)', html, re.DOTALL)
    
    return result

def run():
    results = []
    for mla in BENGALURU_MLAS:
        print(f"\nSearching: {mla['name']} ({mla['constituency']})...")
        try:
            cid, found_name = search_candidate(mla["name"], mla["constituency"])
            if cid:
                print(f"  Found: {found_name} (ID: {cid})")
                data = scrape_candidate(cid)
                data.update({
                    "canonical_name": mla["name"],
                    "found_name": found_name,
                    "constituency": mla["constituency"],
                    "party": mla["party"],
                })
                results.append(data)
                print(f"  Criminal: {data['criminal_cases']}, Age: {data['age']}, Profession: {data['profession']}")
                time.sleep(1)  # Be respectful
            else:
                print(f"  NOT FOUND on myneta")
                results.append({
                    "canonical_name": mla["name"],
                    "constituency": mla["constituency"],
                    "party": mla["party"],
                    "criminal_cases": None,
                    "total_assets_cr": None,
                    "profile_url": None,
                })
        except Exception as e:
            print(f"  Error: {e}")
            results.append({
                "canonical_name": mla["name"],
                "constituency": mla["constituency"],
                "party": mla["party"],
                "error": str(e),
            })
    
    # Save to file
    with open("data/bengaluru_mla_criminal_assets.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n\nSaved {len(results)} records to data/bengaluru_mla_criminal_assets.json")
    return results

if __name__ == "__main__":
    run()
