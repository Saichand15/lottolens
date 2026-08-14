import fs from 'fs'

const URL = 'https://www.lotteryextreme.com/illinois/luckydaylotto-numbers'
const OUT = 'public/all_draws.json'

const html = await fetch(URL, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    accept: 'text/html,application/xhtml+xml',
  },
}).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
})

const groupRe = /<tr><td colspan=2 class='cx'>[\s\S]*?\((\d{2})\/(\d{2})\/(\d{4})\)<\/tr><TR>([\s\S]*?)<\/TR>/g
const ballRe = /<ul class='displayball'[^>]*>([\s\S]*?)<\/ul>/g
const liRe = /<li>(\d+)/g
const draws = []
let group
while ((group = groupRe.exec(html))) {
  const [, mm, dd, yyyy, body] = group
  const dateKey = `${yyyy}-${mm}-${dd}`
  let drawIndex = 0
  let ballGroup
  while ((ballGroup = ballRe.exec(body))) {
    const nums = []
    let li
    while ((li = liRe.exec(ballGroup[1]))) nums.push(Number(li[1]))
    if (nums.length === 5) {
      draws.push({ dateKey, drawIndex: drawIndex++, nums: nums.sort((a, b) => a - b) })
    }
  }
}

draws.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.drawIndex - b.drawIndex)
const parsed = draws.map(d => d.nums)
if (!parsed.length) throw new Error('No draws parsed from LotteryExtreme page')

const current = JSON.parse(fs.readFileSync(OUT, 'utf8'))
const sameDraw = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((n, i) => Number(n) === Number(b[i]))
let overlap = 0
const maxOverlap = Math.min(current.length, parsed.length)
for (let k = maxOverlap; k >= 1; k--) {
  let ok = true
  for (let i = 0; i < k; i++) {
    if (!sameDraw(current[current.length - k + i], parsed[i])) { ok = false; break }
  }
  if (ok) { overlap = k; break }
}

const toAppend = parsed.slice(overlap)
const updated = [...current, ...toAppend]
fs.writeFileSync(OUT, JSON.stringify(updated), 'utf8')

console.log(`Parsed ${parsed.length} recent LotteryExtreme draws`)
console.log(`Existing history: ${current.length}`)
console.log(`Overlap: ${overlap}`)
console.log(`Appended: ${toAppend.length}`)
console.log(`Updated history: ${updated.length}`)
console.log(`First parsed: ${parsed[0].join(',')}`)
console.log(`Latest parsed: ${parsed.at(-1).join(',')}`)
console.log(`Latest stored D${updated.length}: ${updated.at(-1).join(',')}`)
