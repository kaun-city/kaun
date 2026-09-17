/**
 * egress.mjs — the rules for Kaun's India egress relay (app/api/egress).
 *
 * Several government sources don't answer GitHub Actions runners (US
 * datacenter IPs): MoSPI's PAIMANA ("fetch failed" on the August and September
 * 2026 scheduled runs), BBMP IFMS (connect timeouts on 3 of 8 weekly runs) and
 * Sakala ("Host not in allowlist"). All three answered Kaun's Vercel functions
 * in Mumbai (bom1) on 2026-09-17, including a 6.45 MB PAIMANA PDF streamed
 * through byte-for-byte. So the scheduled jobs keep running on GitHub, but
 * their requests to these hosts go through kaun.city in Mumbai.
 *
 * Shared by the route (which enforces them) and scripts/lib/egress.mjs (which
 * decides what to send through it), so the two cannot drift apart.
 */

/** Hosts the relay will fetch. Anything else is refused. */
export const EGRESS_HOSTS = {
  "paimana-proj.mospi.gov.in": { http: false },
  "accounts.bbmp.gov.in": { http: false },
  // Sakala's ASP.NET pages redirect to http:// URLs on the same host.
  "sakala.kar.nic.in": { http: true },
}

/** Request headers passed upstream. Everything else (auth, Vercel, forwarding) is dropped. */
export const FORWARD_REQUEST_HEADERS = [
  "accept", "accept-language", "content-type", "cookie", "origin", "referer", "user-agent", "x-requested-with",
]

/** Response headers passed back. Content-Encoding is never forwarded: the relay asks for identity. */
export const FORWARD_RESPONSE_HEADERS = [
  "content-type", "content-disposition", "location", "set-cookie", "last-modified", "etag", "x-total-count",
]

/** The header that carries the shared secret (CRON_SECRET) from a job to the relay. */
export const EGRESS_SECRET_HEADER = "x-kaun-egress-secret"
/** Set on relay-level failures, so a job can tell them from the upstream's own responses. */
export const EGRESS_ERROR_HEADER = "x-kaun-egress-error"

/**
 * BBMP IFMS serves its leaf certificate without the GoDaddy G2 intermediate,
 * which Node does not fetch. Same certificate as scripts/adapters/ca/godaddy-g2.pem
 * (a test keeps them identical).
 */
export const GODADDY_G2_INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIIE0DCCA7igAwIBAgIBBzANBgkqhkiG9w0BAQsFADCBgzELMAkGA1UEBhMCVVMx
EDAOBgNVBAgTB0FyaXpvbmExEzARBgNVBAcTClNjb3R0c2RhbGUxGjAYBgNVBAoT
EUdvRGFkZHkuY29tLCBJbmMuMTEwLwYDVQQDEyhHbyBEYWRkeSBSb290IENlcnRp
ZmljYXRlIEF1dGhvcml0eSAtIEcyMB4XDTExMDUwMzA3MDAwMFoXDTMxMDUwMzA3
MDAwMFowgbQxCzAJBgNVBAYTAlVTMRAwDgYDVQQIEwdBcml6b25hMRMwEQYDVQQH
EwpTY290dHNkYWxlMRowGAYDVQQKExFHb0RhZGR5LmNvbSwgSW5jLjEtMCsGA1UE
CxMkaHR0cDovL2NlcnRzLmdvZGFkZHkuY29tL3JlcG9zaXRvcnkvMTMwMQYDVQQD
EypHbyBEYWRkeSBTZWN1cmUgQ2VydGlmaWNhdGUgQXV0aG9yaXR5IC0gRzIwggEi
MA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC54MsQ1K92vdSTYuswZLiBCGzD
BNliF44v/z5lz4/OYuY8UhzaFkVLVat4a2ODYpDOD2lsmcgaFItMzEUz6ojcnqOv
K/6AYZ15V8TPLvQ/MDxdR/yaFrzDN5ZBUY4RS1T4KL7QjL7wMDge87Am+GZHY23e
cSZHjzhHU9FGHbTj3ADqRay9vHHZqm8A29vNMDp5T19MR/gd71vCxJ1gO7GyQ5HY
pDNO6rPWJ0+tJYqlxvTV0KaudAVkV4i1RFXULSo6Pvi4vekyCgKUZMQWOlDxSq7n
eTOvDCAHf+jfBDnCaQJsY1L6d8EbyHSHyLmTGFBUNUtpTrw700kuH9zB0lL7AgMB
AAGjggEaMIIBFjAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAdBgNV
HQ4EFgQUQMK9J47MNIMwojPX+2yz8LQsgM4wHwYDVR0jBBgwFoAUOpqFBxBnKLbv
9r0FQW4gwZTaD94wNAYIKwYBBQUHAQEEKDAmMCQGCCsGAQUFBzABhhhodHRwOi8v
b2NzcC5nb2RhZGR5LmNvbS8wNQYDVR0fBC4wLDAqoCigJoYkaHR0cDovL2NybC5n
b2RhZGR5LmNvbS9nZHJvb3QtZzIuY3JsMEYGA1UdIAQ/MD0wOwYEVR0gADAzMDEG
CCsGAQUFBwIBFiVodHRwczovL2NlcnRzLmdvZGFkZHkuY29tL3JlcG9zaXRvcnkv
MA0GCSqGSIb3DQEBCwUAA4IBAQAIfmyTEMg4uJapkEv/oV9PBO9sPpyIBslQj6Zz
91cxG7685C/b+LrTW+C05+Z5Yg4MotdqY3MxtfWoSKQ7CC2iXZDXtHwlTxFWMMS2
RJ17LJ3lXubvDGGqv+QqG+6EnriDfcFDzkSnE3ANkR/0yBOtg2DZ2HKocyQetawi
DsoXiWJYRBuriSUBAA/NxBti21G00w9RKpv0vHP8ds42pM3Z2Czqrpv1KrKQ0U11
GIo/ikGQI31bS/6kA1ibRrLDYGCD+H1QQc7CoZDDu+8CL9IVVO5EFdkKrqeKM+2x
LXY2JtwE65/3YR8V3Idv7kaWKK2hJn0KCacuBKONvPi8BDAB
-----END CERTIFICATE-----`

/** The target URL when the relay may fetch it; otherwise the reason it may not. */
export function egressTarget(raw) {
  let url
  try {
    url = new URL(String(raw ?? ""))
  } catch {
    return { error: "not a URL" }
  }
  const rule = EGRESS_HOSTS[url.hostname]
  if (!rule) return { error: `host ${url.hostname} is not relayed` }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && rule.http)) return { error: `${url.protocol} is not allowed for ${url.hostname}` }
  if (url.username || url.password || (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))) return { error: "credentials and ports are not relayed" }
  return { url }
}

/** True when a job should send this URL through the relay. */
export function isEgressUrl(raw) {
  return !egressTarget(raw).error
}
