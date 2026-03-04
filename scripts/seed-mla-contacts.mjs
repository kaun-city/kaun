/**
 * seed-mla-contacts.mjs
 * Adds phone + email to elected_reps for MLAs.
 * Source: opencity.in dataset 4c303f90 (Feb 2025)
 * Also seeds police_stations table from dataset e3444619
 *
 * Run: node scripts/seed-mla-contacts.mjs
 */

const MGMT = 'https://api.supabase.com/v1/projects/xgygxfyfsvccqqmtboeu/database/query'
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN

async function dbq(sql) {
  const res = await fetch(MGMT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`DB ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

// ---- 1. Add columns to elected_reps ----
await dbq(`ALTER TABLE elected_reps ADD COLUMN IF NOT EXISTS phone TEXT;`)
await dbq(`ALTER TABLE elected_reps ADD COLUMN IF NOT EXISTS email TEXT;`)
console.log('Added phone/email columns to elected_reps')

// ---- 2. Parse MLA CSV ----
const mlaUrl = 'https://data.opencity.in/dataset/4c303f90-715c-4784-aa59-4acb29c5d089/resource/83ad108c-f279-4272-9e65-8a472ddb98dc/download/6ccc20f9-2589-48c9-81b9-179ae6be9c5c.csv'
const raw = await fetch(mlaUrl).then(r => r.text())

// Parse CSV manually - rows can span multiple lines due to quoted fields
const rows = []
let inQuote = false, cur = '', fields = []
for (let i = 0; i < raw.length; i++) {
  const ch = raw[i]
  if (ch === '"') {
    inQuote = !inQuote
  } else if (ch === ',' && !inQuote) {
    fields.push(cur.trim()); cur = ''
  } else if ((ch === '\n' || ch === '\r') && !inQuote) {
    if (cur.trim() || fields.length) { fields.push(cur.trim()); rows.push(fields); fields = []; cur = '' }
    if (ch === '\r' && raw[i+1] === '\n') i++
  } else {
    cur += ch
  }
}
if (cur.trim() || fields.length) { fields.push(cur.trim()); rows.push(fields) }

console.log(`Parsed ${rows.length - 1} MLA rows`)

let updated = 0
for (const row of rows.slice(1)) {
  if (row.length < 5) continue
  const [acNo, mlaName, acName, address, contactRaw] = row
  if (!contactRaw) continue

  // Extract phone(s) - look for 10-digit numbers or 080-XXXX patterns
  const phones = [...contactRaw.matchAll(/(?:080[-\s]?\d{8}|\d{10})/g)].map(m => m[0].replace(/\s/g, ''))
  // Extract email
  const emailMatch = contactRaw.match(/[\w.+-]+@[\w.-]+\.[a-z]+/i)

  const phone = phones[0] || null
  const email = emailMatch ? emailMatch[0].toLowerCase() : null

  if (!phone && !email) continue

  // AC Name format: "Yelahanka (150)" → extract just the name
  const acClean = acName.replace(/\s*\(\d+\)\s*$/, '').trim()

  const phoneEsc = phone ? `'${phone}'` : 'NULL'
  const emailEsc = email ? `'${email}'` : 'NULL'

  // Update by constituency match (case-insensitive LIKE)
  const sql = `UPDATE elected_reps SET phone = ${phoneEsc}, email = ${emailEsc}
    WHERE role = 'MLA' AND LOWER(constituency) LIKE LOWER('${acClean.replace(/'/g, "''")}%');`
  const result = await dbq(sql)
  if (Array.isArray(result) && result.length === 0) {
    // No match - try by MLA name
    const nameParts = mlaName.split(' ').slice(-1)[0] // last name
    const sql2 = `UPDATE elected_reps SET phone = ${phoneEsc}, email = ${emailEsc}
      WHERE role = 'MLA' AND LOWER(name) LIKE LOWER('%${nameParts.replace(/'/g, "''")}%');`
    await dbq(sql2)
  }
  updated++
}

console.log(`Processed ${updated} MLA contacts`)

// ---- 3. Seed police_stations table ----
await dbq(`CREATE TABLE IF NOT EXISTS police_stations (
  id SERIAL PRIMARY KEY,
  division TEXT,
  subdivision TEXT,
  station_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  station_type TEXT DEFAULT 'city'
);`)
await dbq(`DELETE FROM police_stations;`)
console.log('Created/cleared police_stations')

// City police stations
const policeUrl = 'https://data.opencity.in/dataset/e3444619-12c5-43bd-9fc5-a54e83cc162f/resource/4bb84b28-93cb-4194-a6a5-41ec7fb8e351/download/b3d423f9-7ec6-41b8-b605-c15e03e03fd9.csv'
const policeRaw = await fetch(policeUrl).then(r => r.text())
const pRows = policeRaw.split('\n').filter(l => l.trim()).slice(1)

const policeVals = pRows.map(line => {
  const parts = line.split(',')
  const division = (parts[1] || '').trim().replace(/'/g, "''")
  const subdivision = (parts[2] || '').trim().replace(/'/g, "''")
  const station = (parts[3] || '').trim().replace(/'/g, "''")
  const phone = (parts[4] || '').trim().replace(/'/g, "''")
  const email = (parts[5] || '').trim().replace(/'/g, "''").replace('\r','')
  return `('${division}','${subdivision}','${station}','${phone}','${email}','city')`
}).filter(v => v)

if (policeVals.length > 0) {
  await dbq(`INSERT INTO police_stations(division,subdivision,station_name,phone,email,station_type) VALUES ${policeVals.join(',')}`)
  console.log(`Seeded ${policeVals.length} city police stations`)
}

// Traffic police stations
const trafficUrl = 'https://data.opencity.in/dataset/e3444619-12c5-43bd-9fc5-a54e83cc162f/resource/8521e8fb-168b-46fa-9faa-00faf2f2daa6/download/570ea599-d0af-4d1d-a659-381204a3d918.csv'
const trafficRaw = await fetch(trafficUrl).then(r => r.text())
const tRows = trafficRaw.split('\n').filter(l => l.trim()).slice(1)
const trafficVals = tRows.map(line => {
  const parts = line.split(',')
  const division = (parts[1] || '').trim().replace(/'/g, "''")
  const subdivision = (parts[2] || '').trim().replace(/'/g, "''")
  const station = (parts[3] || '').trim().replace(/'/g, "''")
  const phone = (parts[4] || '').trim().replace(/'/g, "''")
  const email = (parts[5] || '').trim().replace(/'/g, "''").replace('\r','')
  return `('${division}','${subdivision}','${station}','${phone}','${email}','traffic')`
}).filter(v => v)

if (trafficVals.length > 0) {
  await dbq(`INSERT INTO police_stations(division,subdivision,station_name,phone,email,station_type) VALUES ${trafficVals.join(',')}`)
  console.log(`Seeded ${trafficVals.length} traffic police stations`)
}

// Verify
const mlaCheck = await dbq(`SELECT COUNT(*) FROM elected_reps WHERE role='MLA' AND phone IS NOT NULL;`)
const psCheck = await dbq(`SELECT station_type, COUNT(*) cnt FROM police_stations GROUP BY station_type;`)
console.log(`MLA rows with phone: ${mlaCheck[0].count}`)
console.log('Police stations:', psCheck)
