/**
 * seed-gba-contacts.mjs
 * Seeds BBMP GBA City Corporation contact details into gba_contacts table.
 * Source: BBMP updates portal (as on 2025-12-08 / 2025-11-10)
 * URL: https://updates.bbmpgov.in/v1/api/file/835746023571-City Corp Contact Details.pdf
 *
 * Run: node scripts/seed-gba-contacts.mjs
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
  if (!res.ok) throw new Error(`DB ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

const CONTACTS = [
  // --- CENTRAL CITY CORPORATION ---
  {
    corporation: 'Bengaluru Central City Corporation',
    role: 'Commissioner',
    name: 'Rajendra Cholan P, IAS',
    phone: '94485 73007',
    email: 'commissionerbccc@gmail.com',
    control_room: '080-22975803 / 94806 85702',
    office_address: '10th Floor, Multipurpose P.U. Building, Mahatma Gandhi Road, Bengaluru - 560001',
  },
  {
    corporation: 'Bengaluru Central City Corporation',
    role: 'Addl Commissioner (Development)',
    name: 'Daljeet Kumar, IAS',
    phone: '99276 62057',
  },
  {
    corporation: 'Bengaluru Central City Corporation',
    role: 'Addl Commissioner (Revenue)',
    name: 'Ranganath K, KAS',
    phone: '96206 30581',
  },
  {
    corporation: 'Bengaluru Central City Corporation',
    role: 'Joint Commissioner Zone-01',
    name: 'Ranganath K, KAS',
    phone: '96206 30581',
  },
  {
    corporation: 'Bengaluru Central City Corporation',
    role: 'Joint Commissioner Zone-02',
    name: 'Hemanth Sharan, KMAS',
    phone: '98458 16773',
  },
  {
    corporation: 'Bengaluru Central City Corporation',
    role: 'Health Officer',
    name: 'Dr. Shivakumar',
    phone: '94809 73395',
  },

  // --- EAST CITY CORPORATION ---
  {
    corporation: 'Bengaluru East City Corporation',
    role: 'Commissioner',
    name: 'Ramesh D S, IAS',
    phone: '87627 08901',
    email: 'commissioner.becc@gmail.com',
    control_room: '080-28512300 / 080-28512301 / 94806 85706',
    office_address: 'RHB Colony, Opposite Phoenix Mall, Whitefield Main Road, Mahadevapura Post, Bengaluru - 560048',
  },
  {
    corporation: 'Bengaluru East City Corporation',
    role: 'Addl Commissioner (Development)',
    name: 'Lokhande Snehal Sudhakar, IAS',
    phone: '94806 83831',
  },
  {
    corporation: 'Bengaluru East City Corporation',
    role: 'Addl Commissioner (Revenue)',
    name: 'Dr. Prajna Ammembala, KAS',
    phone: '80508 99833',
  },
  {
    corporation: 'Bengaluru East City Corporation',
    role: 'Joint Commissioner Zone-01',
    name: 'Dr. Dakshayini, KAS',
    phone: '98459 25372',
  },
  {
    corporation: 'Bengaluru East City Corporation',
    role: 'Joint Commissioner Zone-02',
    name: 'Smt. Sudha, KAS',
    phone: '99015 75664',
  },
  {
    corporation: 'Bengaluru East City Corporation',
    role: 'Health Officer',
    name: 'Dr. Savitha',
    phone: '94806 88560',
  },

  // --- WEST CITY CORPORATION ---
  {
    corporation: 'Bengaluru West City Corporation',
    role: 'Commissioner',
    name: 'Dr. Rajendra K V, IAS',
    phone: '99722 46800',
    email: 'commissioner.bwcc@gmail.com',
    control_room: '080-23561692 / 080-23463366 / 94806 85703',
    office_address: '18th Cross Road, Ideal Homes Township, Rajarajeshwari Nagar, Bengaluru - 560098',
  },
  {
    corporation: 'Bengaluru West City Corporation',
    role: 'Addl Commissioner (Development)',
    name: 'Digvijay Bhodke, IAS',
    phone: '94806 83345',
  },
  {
    corporation: 'Bengaluru West City Corporation',
    role: 'Addl Commissioner (Revenue)',
    name: 'Manjunath Saamy, KAS',
    phone: '99454 2835',
  },
  {
    corporation: 'Bengaluru West City Corporation',
    role: 'Joint Commissioner Zone-01',
    name: 'Smt. Arathi Anand, KAS',
    phone: '80730 77109',
  },
  {
    corporation: 'Bengaluru West City Corporation',
    role: 'Joint Commissioner Zone-02',
    name: 'Sangappa, KAS',
    phone: '99026 02220',
  },
  {
    corporation: 'Bengaluru West City Corporation',
    role: 'Health Officer',
    name: 'Dr. Manoranjan Hegde',
    phone: '94806 88561',
  },

  // --- NORTH CITY CORPORATION ---
  {
    corporation: 'Bengaluru North City Corporation',
    role: 'Commissioner',
    name: 'Pommala Sunil Kumar, IAS',
    phone: '94806 84949',
    email: 'bengalurunorthcitycorporation@gmail.com',
    control_room: '080-22975936 / 080-28636671 / 94806 85705',
    office_address: 'Byatarayanapura, Amruthahalli Main Road, Ballari Road, Bengaluru - 560092',
  },
  {
    corporation: 'Bengaluru North City Corporation',
    role: 'Addl Commissioner (Development)',
    name: 'Smt. Latha R, IAS',
    phone: '98452 00485',
  },
  {
    corporation: 'Bengaluru North City Corporation',
    role: 'Addl Commissioner (Revenue)',
    name: 'Amaresh, KAS',
    phone: '94803 54143',
  },
  {
    corporation: 'Bengaluru North City Corporation',
    role: 'Joint Commissioner Zone-01',
    name: 'Mohammed Naeem Momin, KAS',
    phone: '96207 57186',
  },
  {
    corporation: 'Bengaluru North City Corporation',
    role: 'Joint Commissioner Zone-02',
    name: 'Smt. K R Pallavi, KAS',
    phone: '95918 60887',
  },
  {
    corporation: 'Bengaluru North City Corporation',
    role: 'Health Officer',
    name: 'Dr. Siddappaji',
    phone: '94806 88298',
  },

  // --- SOUTH CITY CORPORATION ---
  {
    corporation: 'Bengaluru South City Corporation',
    role: 'Commissioner',
    name: 'Ramesh K N, IAS',
    phone: '94825 09549',
    email: 'comm.south.gba@gmail.com',
    control_room: '080-26566362 / 080-22975703 / 94806 85704',
    office_address: '9th Main Road, 9th Cross Road, 2nd Stage, Jayanagar, Bengaluru - 560011',
  },
  {
    corporation: 'Bengaluru South City Corporation',
    role: 'Addl Commissioner (Development)',
    name: 'Naveen Kumar Raju S, IAS',
    phone: '73383 72368',
  },
  {
    corporation: 'Bengaluru South City Corporation',
    role: 'Addl Commissioner (Revenue)',
    name: 'Rachappa, KAS',
    phone: '94800 56951',
  },
  {
    corporation: 'Bengaluru South City Corporation',
    role: 'Joint Commissioner Zone-01',
    name: 'Smt. Madhu N N, KAS',
    phone: '94814 92649',
  },
  {
    corporation: 'Bengaluru South City Corporation',
    role: 'Joint Commissioner Zone-02',
    name: 'Satish Babu, KAS',
    phone: '87627 16711',
  },
  {
    corporation: 'Bengaluru South City Corporation',
    role: 'Health Officer',
    name: 'Dr. Balasundar',
    phone: '94806 88300',
  },
]

async function seed() {
  await dbq(`DELETE FROM gba_contacts`)
  console.log('Cleared existing rows')

  const vals = CONTACTS.map(c => {
    const esc = (v) => v ? `'${v.replace(/'/g, "''")}'` : 'NULL'
    return `(${esc(c.corporation)}, ${esc(c.role)}, ${esc(c.name)}, ${esc(c.phone)}, ${esc(c.email)}, ${esc(c.control_room)}, ${esc(c.office_address)})`
  })

  await dbq(`INSERT INTO gba_contacts (corporation, role, name, phone, email, control_room, office_address) VALUES ${vals.join(',\n')}`)
  console.log(`Seeded ${CONTACTS.length} contacts`)

  const counts = await dbq(`SELECT corporation, COUNT(*) cnt FROM gba_contacts GROUP BY corporation ORDER BY corporation`)
  console.table(counts)
}

seed().catch(err => { console.error(err); process.exit(1) })
