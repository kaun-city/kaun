import httpx, json

url = 'https://kppp.karnataka.gov.in/supplier-registration-service/v1/api/portal-service/works/search-eproc-tenders'
headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': 'https://kppp.karnataka.gov.in',
    'Referer': 'https://kppp.karnataka.gov.in/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

# Systematic probe - known good field names: category, title, districtId, status
# Unknown: how pagination works, what the 500 error is about
attempts = [
    ('page QS', '?page=0&size=5&order-by-tender-publish=true', {'category': 'WORKS', 'title': None}),
    ('pageNo QS', '?pageNo=0&pageSize=5', {'category': 'WORKS', 'title': None}),
    ('no QS, body page', '', {'category': 'WORKS', 'title': None, 'pageable': {'page': 0, 'size': 5}}),
    ('district 29', '?page=0&size=5', {'category': 'WORKS', 'title': 'Koramangala', 'districtId': 29}),
    ('empty title str', '?page=0&size=5', {'category': 'WORKS', 'title': ''}),
    ('status active', '?page=0&size=5', {'category': 'WORKS', 'title': None, 'status': 'ACTIVE'}),
]

for label, qs, payload in attempts:
    r = httpx.post(url + qs, headers=headers, json=payload, timeout=15)
    print(f'\n[{label}] -> HTTP {r.status_code}')
    txt = r.text[:200] if r.status_code != 200 else 'OK!'
    print(txt)
    if r.status_code == 200:
        data = r.json()
        print('Records:', len(data) if isinstance(data, list) else type(data))
        print(json.dumps(data[0] if isinstance(data, list) and data else data, indent=2, ensure_ascii=False)[:500])
        break
