import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buf = readFileSync('C:/Users/Bharath/.openclaw/workspace-kaun/budget2526.xlsx')
const wb = XLSX.read(buf)

// Scan all sheets for department+amount patterns
for (const sheetName of wb.SheetNames.slice(0, 6)) {
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const nonEmpty = rows.filter(r => r.some(v => String(v).trim()))
  console.log(`\n=== ${sheetName} (${nonEmpty.length} rows) ===`)
  nonEmpty.slice(0, 10).forEach(r => console.log('  ', r.slice(0, 5).map(v => String(v).slice(0, 30)).join(' | ')))
}
