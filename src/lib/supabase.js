import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kydenksknodtdhryjwqr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_c7R-TNkov2Z4RnBbovdTRA_yAF955Ge'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── DRAWS ────────────────────────────────────────────────────────────────────
export async function fetchAllDraws() {
  const { data, error } = await supabase
    .from('draws')
    .select('draw_number,n1,n2,n3,n4,n5,draw_sum')
    .order('draw_number', { ascending: true })
  if (error) throw error
  return data.map(r => ({
    id: r.draw_number,
    numbers: [r.n1, r.n2, r.n3, r.n4, r.n5]
  }))
}

export async function fetchLatestDraw() {
  const { data, error } = await supabase
    .from('draws')
    .select('draw_number,n1,n2,n3,n4,n5')
    .order('draw_number', { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return { id: data.draw_number, numbers: [data.n1, data.n2, data.n3, data.n4, data.n5] }
}

export async function insertDraw(drawNumber, numbers) {
  const [n1, n2, n3, n4, n5] = numbers
  const { error } = await supabase
    .from('draws')
    .upsert({ draw_number: drawNumber, n1, n2, n3, n4, n5 }, { onConflict: 'draw_number' })
  if (error) throw error
}

export async function fetchDrawCount() {
  const { count, error } = await supabase
    .from('draws')
    .select('*', { count: 'exact', head: true })
  if (error) throw error
  return count
}
