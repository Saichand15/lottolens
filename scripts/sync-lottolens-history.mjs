import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kydenksknodtdhryjwqr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_c7R-TNkov2Z4RnBbovdTRA_yAF955Ge'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const { data, error, count } = await supabase
  .from('draws')
  .select('draw_number,n1,n2,n3,n4,n5', { count: 'exact' })
  .order('draw_number', { ascending: true })

if (error) {
  console.error('Failed to fetch LottoLens draws from Supabase:', error.message)
  process.exit(1)
}

const rows = data || []
const missing = []
for (let i = 1; i <= rows.length; i++) {
  if (rows[i - 1]?.draw_number !== i) missing.push(i)
}

const draws = rows.map(r => [r.n1, r.n2, r.n3, r.n4, r.n5].map(Number).sort((a, b) => a - b))

writeFileSync('public/all_draws.json', JSON.stringify(draws), 'utf8')

const latest = rows[rows.length - 1]
console.log(`Synced ${draws.length} LottoLens draws to public/all_draws.json`)
console.log(`Supabase count: ${count}`)
console.log(`Latest: D${latest.draw_number} [${[latest.n1, latest.n2, latest.n3, latest.n4, latest.n5].join(', ')}]`)
if (missing.length) console.log(`Warning: missing draw numbers: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '...' : ''}`)