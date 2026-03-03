import httpx

url = "https://www.reddit.com/r/bangalore/search.json"
headers = {
    "User-Agent": "kaun-civic-app/0.1 (civic accountability platform)",
    "Accept": "application/json",
}
params = {
    "q": "BBMP road pothole",
    "sort": "new",
    "limit": 5,
    "restrict_sr": "1",
    "t": "month",
}

r = httpx.get(url, params=params, headers=headers, timeout=15, follow_redirects=True)
print("Status:", r.status_code)
print("URL:", r.url)
print("Headers:", dict(r.headers))
data = r.json()
dist = data.get("data", {}).get("dist", 0)
print("dist:", dist)
children = data.get("data", {}).get("children", [])
print("children:", len(children))
for c in children[:3]:
    print(" -", c["data"]["title"][:80])

# Try without restrict_sr
print("\n--- Without restrict_sr ---")
params2 = {"q": "BBMP road", "sort": "new", "limit": 3}
r2 = httpx.get(url, params=params2, headers=headers, timeout=15, follow_redirects=True)
print("Status:", r2.status_code)
data2 = r2.json()
for c in data2.get("data", {}).get("children", [])[:3]:
    print(" -", c["data"]["title"][:80])
