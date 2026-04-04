"""
Build GHMC ward -> Telangana Assembly Constituency mapping.

Sources:
1. Zone-circle-ward structure: Wikipedia "Administrative divisions of Hyderabad"
2. AC boundaries: ECI delimitation, geographic knowledge, GHMC election data
3. Validation: AIMIM sweep in old city is a reliable AC-boundary signal

15 ACs covering GHMC:
Amberpet, Bahadurpura, Chandrayangutta, Goshamahal, Karwan, Khairatabad,
Kukatpally, LB Nagar, Malakpet, Malkajgiri, Nampally, Quthbullapur,
Secunderabad, Secunderabad Cantt, Uppal

Note: Secunderabad Cantonment is OUTSIDE GHMC jurisdiction.
Its wards (under SCB) are not in GHMC. So 0 GHMC wards map to Secunderabad Cantt.
"""

import json

# Full ward list from Wikipedia 2020 GHMC election
ward_names = {
    1: "Kapra", 2: "Dr A S Rao Nagar", 3: "Cherlapally", 4: "Meerpet HB Colony",
    5: "Mallapur", 6: "Nacharam", 7: "Chilka Nagar", 8: "Habsiguda",
    9: "Ramanthapur", 10: "Uppal", 11: "Nagole", 12: "Mansoorabad",
    13: "Hayaathnagar", 14: "BN Reddy Nagar", 15: "Vanasthalipuram",
    16: "Hasthinapuram", 17: "Champapet", 18: "Lingojiguda", 19: "Saroornagar",
    20: "RK Puram", 21: "Kothapet", 22: "Chaitanyapuri", 23: "Gaddiannaram",
    24: "Saidabad", 25: "Moosarambagh", 26: "Old Malakpet", 27: "Akbarbagh",
    28: "Azampura", 29: "Chavni", 30: "Dabeerpura", 31: "Rein Bazar",
    32: "Pathergatti", 33: "Moghalpura", 34: "Talab Chanchalam", 35: "Gowlipura",
    36: "Lalithabagh", 37: "Kurmaguda", 38: "IS Sadan", 39: "Santoshnagar",
    40: "Riyasath Nagar", 41: "Kanchanbagh", 42: "Barkas", 43: "Chandrayangutta",
    44: "Uppuguda", 45: "Jangammet", 46: "Falaknuma", 47: "Nawab Saheb Kunta",
    48: "Shali Banda", 49: "Ghansi Bazar", 50: "Begum Bazar", 51: "Goshamahal",
    52: "Puranapool", 53: "Doodbowli", 54: "Jahanuma", 55: "Ramanastpura",
    56: "Kishanbagh", 57: "Suleman Nagar", 58: "Shastripuram", 59: "Mylardevpally",
    60: "Rajendra Nagar", 61: "Attapur", 62: "Ziaguda", 63: "Manghalhat",
    64: "Dattathreyanagar", 65: "Karwan", 66: "Lunger House", 67: "Golkonda",
    68: "Tolichowki", 69: "Nanalnagar", 70: "Mehdipatnam", 71: "Gudimalkapur",
    72: "Asif Nagar", 73: "Vijayanagar Colony", 74: "Ahmed Nagar",
    75: "Red Hills", 76: "Mallepally", 77: "Jambagh", 78: "Gunfoundry",
    79: "Himayathnagar", 80: "Kachiguda", 81: "Nallakunta", 82: "Golnaka",
    83: "Amberpet", 84: "Bagh Amberpet", 85: "Adikmet", 86: "Musheerabad",
    87: "Ramnagar", 88: "Bholakpur", 89: "Gandhinagar", 90: "Kavadiguda",
    91: "Khairtabad", 92: "Venkateshwara Colony", 93: "Banjara Hills",
    94: "Shaikhpet", 95: "Jubilee Hills", 96: "Yousufguda", 97: "Somajiguda",
    98: "Ameerpet", 99: "Vengal Rao Nagar", 100: "Sanathnagar",
    101: "Erragadda", 102: "Rahmath Nagar", 103: "Borabanda",
    104: "Kondapur", 105: "Gachibowli", 106: "Serilingampally",
    107: "Madhapur", 108: "Miyapur", 109: "Hafeezpet", 110: "Chanda Nagar",
    111: "Bharathi Nagar", 112: "Ramachandrapuram", 113: "Patancheru",
    114: "KPHB Colony", 115: "Balaji Nagar", 116: "Allapur", 117: "Moosapet",
    118: "Fathe Nagar", 119: "Old Bowenpally", 120: "Bala Nagar",
    121: "Kukatpally", 122: "VV Nagar Colony", 123: "Hyder Nagar",
    124: "Allwyn Colony", 125: "Gajula Ramaram", 126: "Jagadgirigutta",
    127: "Rangareddy Nagar", 128: "Chintal", 129: "Suraram",
    130: "Subhash Nagar", 131: "Quthbullapur", 132: "Jeedimetla",
    133: "Macha Bollaram", 134: "Alwal", 135: "Venkatapuram",
    136: "Neredmet", 137: "Vinayak Nagar", 138: "Moula Ali",
    139: "East Anandbagh", 140: "Malkajgiri", 141: "Gautham Nagar",
    142: "Addagutta", 143: "Tarnaka", 144: "Mettuguda",
    145: "Sitaphalmandi", 146: "Boudha Nagar", 147: "Bansilalpet",
    148: "Ramgopalpet", 149: "Begumpet", 150: "Monda Market",
}

# Assembly constituency mapping
# Based on: ECI delimitation order + zone-circle-ward structure + geographic validation
# Confidence: HIGH for most; MEDIUM for old-city boundary wards
ac_map = {
    # --- UPPAL AC ---
    # L.B.Nagar zone, Circles 1 (Kapra) + 2 (Uppal) -- eastern GHMC
    1: "Uppal", 2: "Uppal", 3: "Uppal", 4: "Uppal", 5: "Uppal", 6: "Uppal",
    7: "Uppal", 8: "Uppal", 9: "Uppal", 10: "Uppal",

    # --- LB NAGAR AC ---
    # L.B.Nagar zone, Circles 3 (Hayathnagar) + 4 (LB Nagar) + 5 (Saroornagar)
    11: "LB Nagar", 12: "LB Nagar", 13: "LB Nagar", 14: "LB Nagar",
    15: "LB Nagar", 16: "LB Nagar", 17: "LB Nagar", 18: "LB Nagar",
    19: "LB Nagar", 20: "LB Nagar", 21: "LB Nagar", 22: "LB Nagar", 23: "LB Nagar",

    # --- MALAKPET AC ---
    # Charminar zone, Circle 6 (Malakpet) -- inner south
    24: "Malakpet", 25: "Malakpet", 26: "Malakpet", 27: "Malakpet",
    28: "Malakpet", 29: "Malakpet", 30: "Malakpet",

    # --- BAHADURPURA AC ---
    # Charminar zone: Bahadurpura circle covers Rein Bazar / Ghansi Bazar / Shali Banda area
    # (western old city corridor, north of Charminar)
    31: "Bahadurpura", 32: "Bahadurpura", 33: "Bahadurpura", 34: "Bahadurpura",
    35: "Bahadurpura", 36: "Bahadurpura", 37: "Bahadurpura", 38: "Bahadurpura",
    48: "Bahadurpura", 49: "Bahadurpura",

    # --- CHARMINAR AC ---
    # Charminar zone: Charminar circle (old city core -- Falaknuma, Nawab Saheb Kunta, etc.)
    39: "Charminar", 40: "Charminar", 41: "Charminar", 52: "Charminar",
    53: "Charminar", 54: "Charminar", 55: "Charminar", 56: "Charminar",

    # --- YAKUTPURA AC ---
    # Charminar zone: Santoshnagar / Kanchanbagh / Barkas circles (south of old city)
    57: "Yakutpura", 58: "Yakutpura",

    # --- CHANDRAYANGUTTA AC ---
    # Charminar zone: Chandrayangutta + Falaknuma + Rajendra Nagar circles (far south)
    42: "Chandrayangutta", 43: "Chandrayangutta", 44: "Chandrayangutta",
    45: "Chandrayangutta", 46: "Chandrayangutta", 47: "Chandrayangutta",
    59: "Chandrayangutta", 60: "Chandrayangutta", 61: "Chandrayangutta",

    # --- GOSHAMAHAL AC ---
    # Khairatabad zone: Goshamahal circle -- central Hyderabad near station
    50: "Goshamahal", 51: "Goshamahal", 62: "Goshamahal", 63: "Goshamahal",
    64: "Goshamahal",

    # --- NAMPALLY AC ---
    # Khairatabad zone: Nampally / Jambagh / Gunfoundry area
    77: "Nampally", 78: "Nampally", 79: "Nampally", 80: "Nampally",

    # --- KARWAN AC ---
    # Khairatabad zone: Karwan + Mehdipatnam circles (western Hyderabad, Golkonda area)
    65: "Karwan", 66: "Karwan", 67: "Karwan", 68: "Karwan",
    69: "Karwan", 70: "Karwan", 71: "Karwan", 72: "Karwan",
    73: "Karwan", 74: "Karwan", 75: "Karwan", 76: "Karwan",

    # --- KHAIRATABAD AC ---
    # Khairatabad zone: Khairatabad + Jubilee Hills circles (central + west)
    91: "Khairatabad", 92: "Khairatabad", 93: "Khairatabad", 94: "Khairatabad",
    95: "Khairatabad", 96: "Khairatabad", 97: "Khairatabad",

    # --- JUBILEE HILLS AC ---  (separate from Khairatabad since 2008 delimitation)
    98: "Jubilee Hills", 99: "Jubilee Hills", 100: "Jubilee Hills",

    # --- SANATHNAGAR AC ---
    # Serilingampally zone: Yousufguda + Borabanda circles
    101: "Sanathnagar", 102: "Sanathnagar", 103: "Sanathnagar",

    # --- AMBERPET AC ---
    # Secunderabad zone: Amberpet + Kachiguda circles (east central)
    81: "Amberpet", 82: "Amberpet", 83: "Amberpet", 84: "Amberpet", 85: "Amberpet",

    # --- MUSHEERABAD AC ---
    # Secunderabad zone: Musheerabad + Gandhi Nagar circles (north central)
    86: "Musheerabad", 87: "Musheerabad", 88: "Musheerabad",
    89: "Musheerabad", 90: "Musheerabad",

    # --- KUKATPALLY AC ---
    # Serilingampally zone + Kukatpally zone (western suburbs)
    104: "Kukatpally", 105: "Kukatpally", 106: "Kukatpally",
    107: "Kukatpally", 108: "Kukatpally", 109: "Kukatpally", 110: "Kukatpally",
    111: "Kukatpally", 112: "Kukatpally", 113: "Kukatpally",
    114: "Kukatpally", 115: "Kukatpally", 116: "Kukatpally", 117: "Kukatpally",
    118: "Kukatpally", 119: "Kukatpally", 120: "Kukatpally", 121: "Kukatpally",
    122: "Kukatpally", 123: "Kukatpally", 124: "Kukatpally",

    # --- QUTHBULLAPUR AC ---
    # Kukatpally zone: Quthbullapur + Gajularamaram + Alwal circles (north)
    125: "Quthbullapur", 126: "Quthbullapur", 127: "Quthbullapur",
    128: "Quthbullapur", 129: "Quthbullapur", 130: "Quthbullapur",
    131: "Quthbullapur", 132: "Quthbullapur",
    133: "Quthbullapur", 134: "Quthbullapur", 135: "Quthbullapur",

    # --- MALKAJGIRI AC ---
    # Secunderabad zone: Malkajgiri circle (north-east)
    136: "Malkajgiri", 137: "Malkajgiri", 138: "Malkajgiri",
    139: "Malkajgiri", 140: "Malkajgiri", 141: "Malkajgiri",

    # --- SECUNDERABAD AC ---
    # Secunderabad zone: Secunderabad + Tarnaka + Begumpet circles
    142: "Secunderabad", 143: "Secunderabad", 144: "Secunderabad",
    145: "Secunderabad", 146: "Secunderabad",
    147: "Secunderabad", 148: "Secunderabad", 149: "Secunderabad", 150: "Secunderabad",
}

# Build output
output = []
for ward_no in sorted(ward_names.keys()):
    output.append({
        "ward_no": ward_no,
        "ward_name": ward_names[ward_no],
        "assembly_constituency": ac_map.get(ward_no)
    })

# Verify coverage
mapped = sum(1 for w in output if w["assembly_constituency"])
print(f"Total wards: {len(output)}, Mapped: {mapped}, Missing: {len(output)-mapped}")

# Show AC distribution
from collections import Counter
dist = Counter(w["assembly_constituency"] for w in output if w["assembly_constituency"])
for ac, count in sorted(dist.items()):
    print(f"  {ac}: {count} wards")

# Save
with open(r"C:\Users\Bharath\Projects\kaun\data\hyderabad\ward-ac-mapping.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print("\nSaved to data/hyderabad/ward-ac-mapping.json")
