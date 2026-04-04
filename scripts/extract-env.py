import re, sys
with open(r'apps\web\.env.production', 'rb') as f:
    content = f.read().decode('utf-8')
url = re.search(r'NEXT_PUBLIC_SUPABASE_URL="([^"\r\n]+)"', content)
key = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"\r\n]+)"', content)
print(url.group(1).strip() if url else '')
print(key.group(1).strip() if key else '')
