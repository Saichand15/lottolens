import fs from 'fs'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))
const manual = [
  [2, 9, 15, 21, 25],
  [1, 3, 15, 20, 27],
  [10, 18, 19, 21, 40],
  [22, 27, 32, 34, 39],
  [3, 4, 11, 17, 20],
  [3, 16, 27, 29, 39],
  [6, 8, 12, 17, 37],
  [2, 19, 22, 25, 31],
]
const draws = [...baseDraws, ...manual]
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const sum = d => d.reduce((a, b) => a + b, 0)
const gaps = d => d.slice(1).map((n, i) => n - d[i])
const pairGaps = d => [...new Set(d.flatMap((a, i) => d.slice(i + 1).map(b => Math.abs(b - a))))].sort((a, b) => a - b)
const wrap = n => { while (n < 1) n += 45; while (n > 45) n -= 45; return n }
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)

function add(map, key, pts, detail) {
  if (!map.has(key)) map.set(key, { key, pts: 0, hits: 0, tries: 0, examples: [] })
  const r = map.get(key)
  r.pts += pts
  r.tries++
  if (detail?.hit) r.hits++
  if (detail && r.examples.length < 8) r.examples.push(detail)
}

function candidateFamilies(prev) {
  const gs = gaps(prev)
  const pgs = pairGaps(prev).filter(g => g > 0 && g <= 20)
  const lowG = [...new Set([...gs, ...pgs].filter(g => g >= 1 && g <= 12))]
  const fams = []
  for (const s of prev) {
    for (const g of lowG) {
      fams.push({ family: `seed+gap${g}`, n: wrap(s + g), seed: s, g })
      fams.push({ family: `seed-gap${g}`, n: wrap(s - g), seed: s, g })
    }
    fams.push({ family: 'seed+1', n: wrap(s + 1), seed: s, g: 1 })
    fams.push({ family: 'seed-1', n: wrap(s - 1), seed: s, g: 1 })
    fams.push({ family: 'seed+2', n: wrap(s + 2), seed: s, g: 2 })
    fams.push({ family: 'seed-2', n: wrap(s - 2), seed: s, g: 2 })
    fams.push({ family: 'seed+5', n: wrap(s + 5), seed: s, g: 5 })
    fams.push({ family: 'seed-5', n: wrap(s - 5), seed: s, g: 5 })
    fams.push({ family: 'zone-up', n: wrap(s + 10), seed: s, g: 10 })
    fams.push({ family: 'zone-down', n: wrap(s - 10), seed: s, g: 10 })
  }
  // compression seats: derive next cluster from last/high anchor and current internal gaps
  const low = prev[0], mid = prev[2], high = prev[4]
  for (const g of lowG) {
    fams.push({ family: `high-gap${g}`, n: wrap(high - g), seed: high, g })
    fams.push({ family: `mid+gap${g}`, n: wrap(mid + g), seed: mid, g })
    fams.push({ family: `low+gap${g}`, n: wrap(low + g), seed: low, g })
  }
  return fams
}

function similarity(a, b) {
  let s = 0
  if (sig(a) === sig(b)) s += 40
  const as = sig(a).split('').map(Number), bs = sig(b).split('').map(Number)
  s += Math.max(0, 22 - as.reduce((x, v, i) => x + Math.abs(v - bs[i]), 0) * 4)
  s += Math.max(0, 22 - Math.abs(sum(a) - sum(b)) / 4)
  s += a.reduce((acc, n) => acc + (b.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0) * 4
  const ag = gaps(a), bg = gaps(b)
  s += Math.max(0, 12 - ag.reduce((acc, g, i) => acc + Math.min(6, Math.abs(g - (bg[i] || 0))), 0) / 2)
  return s
}

function learnFor(current, lookback = 260) {
  const famScore = new Map()
  const numScore = new Map()
  const rows = []
  for (let i = 0; i < draws.length - 1; i++) {
    const prev = draws[i], next = draws[i + 1]
    const sim = similarity(prev, current)
    if (sim < 34) continue
    const rec = 0.6 + (i / draws.length) * 0.85
    const actual = new Set(next)
    const cands = candidateFamilies(prev)
    for (const c of cands) {
      const hit = actual.has(c.n)
      const near = next.some(n => Math.abs(n - c.n) <= 1)
      const pts = (hit ? 12 : near ? 2.6 : -0.22) * rec * (sim / 50)
      add(famScore, c.family, pts, { hit, prev, next, n: c.n, seed: c.seed, g: c.g, sim: sim.toFixed(1) })
      if (hit || near) add(numScore, c.n, (hit ? 8 : 2) * rec * (sim / 50), { hit, prev, next, family: c.family, seed: c.seed, g: c.g })
    }
    rows.push({ prev, next, sim, w: sim * rec })
  }
  return {
    rows,
    families: [...famScore.values()].sort((a, b) => b.pts - a.pts),
    numbers: [...numScore.values()].sort((a, b) => b.pts - a.pts),
  }
}

function project(current) {
  const learned = learnFor(current)
  const topFams = new Set(learned.families.slice(0, 18).map(f => f.key))
  const projected = new Map()
  const why = new Map()
  for (const c of candidateFamilies(current)) {
    if (!topFams.has(c.family)) continue
    const fam = learned.families.find(f => f.key === c.family)
    const pts = Math.max(0, fam.pts) + 15
    projected.set(c.n, (projected.get(c.n) || 0) + pts)
    if (!why.has(c.n)) why.set(c.n, [])
    why.get(c.n).push(`${c.family} from ${c.seed} g${c.g}`)
  }
  // add historical followers directly
  learned.numbers.slice(0, 30).forEach((r, i) => {
    projected.set(Number(r.key), (projected.get(Number(r.key)) || 0) + Math.max(0, 120 - i * 4))
    if (!why.has(Number(r.key))) why.set(Number(r.key), [])
    why.get(Number(r.key)).push(`learned-number#${i + 1}`)
  })
  return { learned, ranked: [...projected.entries()].map(([n, pts]) => ({ n, pts, zone: zoneOf(n), why: why.get(n) || [] })).sort((a, b) => b.pts - a.pts || a.n - b.n) }
}

function explainTransition(prev, actual) {
  const fams = candidateFamilies(prev)
  console.log('\nEXPLAIN', prev.join(','), '->', actual.join(','), 'sig', sig(prev), '->', sig(actual), 'sum', sum(prev), '->', sum(actual))
  for (const a of actual) {
    const hits = fams.filter(c => c.n === a).slice(0, 12)
    console.log(`${String(a).padStart(2)} <= ${hits.map(h => `${h.family}(${h.seed},g${h.g})`).join(' | ') || 'NO GAP FAMILY'}`)
  }
}

explainTransition([3,16,27,29,39], [6,8,12,17,37])
explainTransition([6,8,12,17,37], [2,19,22,25,31])
explainTransition([2,19,22,25,31], [])

const current = [2,19,22,25,31]
const out = project(current)
console.log('\nCURRENT', current.join(','), 'sig', sig(current), 'sum', sum(current), 'gaps', gaps(current).join('-'), 'pairGaps', pairGaps(current).join(','))
console.log('\nTOP LEARNED GAP FAMILIES:')
out.learned.families.slice(0, 25).forEach((f, i) => console.log(`${i + 1}. ${f.key} pts=${f.pts.toFixed(1)} hits=${f.hits}/${f.tries}`))
console.log('\nGAP-GRAMMAR PROJECTED NUMBERS:')
out.ranked.slice(0, 30).forEach((r, i) => console.log(`${i + 1}. ${r.n} pts=${r.pts.toFixed(1)} Z${r.zone} ${r.why.slice(0, 5).join(' | ')}`))

function buildLine(shape, ranked) {
  const counts = shape.split('').map(Number)
  const used = new Set(), line = []
  counts.forEach((cnt, zi) => {
    ranked.filter(r => r.zone === zi && !used.has(r.n)).slice(0, cnt).forEach(r => { line.push(r.n); used.add(r.n) })
  })
  for (const r of ranked) if (line.length < 5 && !used.has(r.n)) { line.push(r.n); used.add(r.n) }
  return line.sort((a, b) => a - b)
}
const shapes = ['11120', '12110', '11111', '11210', '12101', '21110']
console.log('\nGAP-GRAMMAR LINES:')
shapes.forEach(s => {
  const l = buildLine(s, out.ranked)
  console.log(`${s}: ${l.join(',')} sum=${sum(l)} sig=${sig(l)}`)
})
