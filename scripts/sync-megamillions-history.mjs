import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'public', 'all_mm_draws.json')
const SOURCE_URL = 'https://www.lotteryextreme.com/megamillions/results'
const START_YEAR = 2017
const START_MONTH = 10
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36'

function monthRange(startYear, startMonth, endYear, endMonth) {
  const months = []
  let year = startYear
  let month = startMonth
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

function extractDraws(html) {
  const draws = []
  const blockRegex = /<tr class='cy'><td class='cx'>(\d{4}-\d{2}-\d{2})[\s\S]*?<ul class='displayball'[^>]*>([\s\S]*?)<\/ul>/gi
  let match
  while ((match = blockRegex.exec(html)) !== null) {
    const date = match[1]
    const liPart = match[2]
    const nums = [...liPart.matchAll(/<li[^>]*>(\d+)/g)].map(m => Number(m[1]))
    if (nums.length < 6) continue
    const numbers = nums.slice(0, 5).sort((a, b) => a - b)
    const mb = nums[5]
    if (numbers.some(n => n < 1 || n > 70) || new Set(numbers).size !== 5 || mb < 1 || mb > 25) continue
    draws.push({ date, numbers, mb })
  }
  return draws
}

async function fetchMonth(yearMonth) {
  const body = new URLSearchParams({ mode: 'month', year_month: yearMonth })
  const response = await fetch(SOURCE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent
    },
    body: body.toString()
  })
  if (!response.ok) throw new Error(`Fetch failed for ${yearMonth}: ${response.status}`)
  return extractDraws(await response.text())
}

function assignIds(draws) {
  return draws
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d, index) => ({ id: index + 1, ...d }))
}

async function syncSupabase(draws) {
  const url = process.env.SUPABASE_URL || 'https://kydenksknodtdhryjwqr.supabase.co'
  const key = process.env.SUPABASE_KEY || 'sb_publishable_c7R-TNkov2Z4RnBbovdTRA_yAF955Ge'
  const supabase = createClient(url, key)
  const payload = draws.map(d => ({
    draw_number: d.id,
    n1: d.numbers[0],
    n2: d.numbers[1],
    n3: d.numbers[2],
    n4: d.numbers[3],
    n5: d.numbers[4],
    mb: d.mb,
    draw_date: d.date
  }))
  const { error } = await supabase.from('mm_draws').upsert(payload, { onConflict: 'draw_number' })
  if (error) throw error
}

async function main() {
  const now = new Date()
  const months = monthRange(START_YEAR, START_MONTH, now.getFullYear(), now.getMonth() + 1)
  const dedupe = new Map()

  for (const ym of months) {
    const draws = await fetchMonth(ym)
    draws.forEach(d => dedupe.set(d.date, d))
    process.stdout.write(`Fetched ${ym}: ${draws.length} draws\n`)
  }

  const normalized = assignIds([...dedupe.values()])
  await fs.writeFile(OUT_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  process.stdout.write(`Wrote ${normalized.length} Mega Millions draws to ${OUT_FILE}\n`)

  if (process.argv.includes('--sync-supabase') || process.env.MM_SYNC_SUPABASE === '1') {
    try {
      await syncSupabase(normalized)
      process.stdout.write('Supabase sync succeeded.\n')
    } catch (error) {
      process.stderr.write(`Supabase sync failed: ${error.message}\n`)
      process.exitCode = 1
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
