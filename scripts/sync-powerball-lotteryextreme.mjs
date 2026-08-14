import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'public', 'all_pb_draws.json')
const SOURCE_URL = 'https://www.lotteryextreme.com/powerball/results'
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'

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
    const nums = [...match[2].matchAll(/<li[^>]*>(\d+)/g)].map(m => Number(m[1]))
    if (nums.length < 6) continue
    const numbers = nums.slice(0, 5).sort((a, b) => a - b)
    const pb = nums[5]
    if (numbers.some(n => n < 1 || n > 69) || new Set(numbers).size !== 5 || pb < 1 || pb > 26) continue
    draws.push({ date, numbers, pb })
  }
  return draws
}

async function fetchMonth(yearMonth) {
  const body = new URLSearchParams({ mode: 'month', year_month: yearMonth })
  const response = await fetch(SOURCE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      accept: 'text/html,application/xhtml+xml',
    },
    body: body.toString(),
  })
  if (!response.ok) throw new Error(`Fetch failed for ${yearMonth}: ${response.status}`)
  return extractDraws(await response.text())
}

function assignIds(draws) {
  return draws
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d, index) => ({ id: index + 1, date: d.date, numbers: d.numbers, pb: d.pb }))
}

const existing = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'))
const latestDate = existing.at(-1)?.date || '2015-10-01'
const [startYear, startMonth] = latestDate.split('-').map(Number)
const now = new Date()
const months = monthRange(startYear, startMonth, now.getFullYear(), now.getMonth() + 1)
const byDate = new Map(existing.map(d => [d.date, { date: d.date, numbers: d.numbers, pb: d.pb }]))
let fetchedCount = 0
let newCount = 0

for (const ym of months) {
  const fetched = await fetchMonth(ym)
  fetchedCount += fetched.length
  let monthNew = 0
  for (const d of fetched) {
    const old = byDate.get(d.date)
    const changed = !old || old.pb !== d.pb || old.numbers.join(',') !== d.numbers.join(',')
    if (changed) {
      byDate.set(d.date, d)
      if (!old) { newCount++; monthNew++ }
    }
  }
  console.log(`Fetched ${ym}: ${fetched.length} draws, new ${monthNew}`)
}

const updated = assignIds([...byDate.values()])
await fs.writeFile(OUT_FILE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')

console.log(`Existing history: ${existing.length}`)
console.log(`Fetched total: ${fetchedCount}`)
console.log(`Appended new dates: ${newCount}`)
console.log(`Updated history: ${updated.length}`)
console.log(`Latest stored D${updated.length}: ${updated.at(-1).date} [${updated.at(-1).numbers.join(', ')}] PB ${updated.at(-1).pb}`)
