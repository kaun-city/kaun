import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'

const buf = readFileSync('C:/Users/Bharath/.openclaw/workspace-kaun/budget2526.xlsx')
const wb = XLSX.read(buf)

// Table 5 is PAYMENTS - find the 2025-26 BE column
const ws5 = wb.Sheets['Table 5']
const rows5 = XLSX.utils.sheet_to_json(ws5, { header: 1, defval: '' })
console.log('Table 5 - PAYMENTS (all cols):')
rows5.forEach(r => {
  if (r.some(v => String(v).trim())) {
    console.log(r.map(v => String(v).slice(0,28)).join(' | '))
  }
})
