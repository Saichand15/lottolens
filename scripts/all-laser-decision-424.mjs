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
]
const draws = [...baseDraws, ...manual]
const latest = manual.at(-1)
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const sumOf = d => d.reduce((a, b) => a + b, 0)

// Exact formula projection already recomputed from user's app beam stats.
const formulaTop = new Map([
  [32, 143], [19, 127], [17, 122], [18, 112], [30, 105], [21, 103],
  [20, 88], [37, 88], [3, 86], [9, 83], [2, 80], [11, 80],
  [34, 79], [44, 79], [13, 78], [28, 76], [43, 70], [39, 70],
  [22, 69], [15, 69], [4, 68], [14, 66], [31, 64], [10, 63], [33, 61],
  [1, 35], [5, 50], [6, 55], [7, 45], [12, 58], [24, 54], [26, 40], [27, 50], [42, 55]
])

const contacts = {
  3: {
    path: [16, 20, 32, 42], first: [16],
    corner: [1, 15, 20, 24, 28, 30, 31, 32, 33, 37, 42, 44], nwCorner: [1],
  },
  16: {
    path: [37], first: [37], corner: [18, 30], nwCorner: [13, 1],
  },
  27: {
    path: [19, 34, 43, 44], first: [19, 34], corner: [22, 20, 18, 15, 5, 4], nwCorner: [22, 20, 18, 15, 5, 4],
  },
  29: {
    path: [27, 22, 21, 20, 17, 16, 13, 7, 6, 30, 34], first: [27, 30], corner: [27, 24, 32, 42], nwCorner: [27, 24],
  },
  39: {
    path: [34, 32, 12, 6], first: [34], corner: [26, 18, 17, 10, 5], nwCorner: [26, 18, 17, 10, 5],
  },
}

const score = new Map()
const why = new Map()
const touchedBy = new Map()
function add(n, pts, reason, seed = null) {
  score.set(n, (score.get(n) || 0) + pts)
  if (!why.has(n)) why.set(n, [])
  why.get(n).push(reason)
  if (seed != null) {
    if (!touchedBy.has(n)) touchedBy.set(n, new Set())
    touchedBy.get(n).add(seed)
  }
}

for (const [seedRaw, c] of Object.entries(contacts)) {
  const seed = Number(seedRaw)
  c.path.forEach((n, i) => add(n, Math.max(45, 125 - i * 8), `S${seed} path`, seed))
  c.first.forEach(n => add(n, 60, `S${seed} first-contact`, seed))
  c.corner.forEach((n, i) => add(n, Math.max(30, 64 - i * 4), `S${seed} corner`, seed))
  c.nwCorner.forEach(n => add(n, 32, `S${seed} NW-corner`, seed))
  c.path.forEach(n => {
    if (c.corner.includes(n) || c.nwCorner.includes(n)) add(n, 70, `S${seed} path+corner resonance`, seed)
  })
}

for (const [n, pts] of formulaTop) add(n, pts * 0.78, 'exact formula')

// Multi-seed convergence: if the same number is touched by many seeds, it is decision-level.
for (const [n, seeds] of touchedBy) {
  if (seeds.size >= 2) add(n, 55 * (seeds.size - 1), `multi-seed convergence x${seeds.size}`)
  if (seeds.size >= 3) add(n, 75, 'strong laser consensus')
}

// Historical positional pressure after similar latest draws.
const latestSig = sig(latest)
const latestSum = sumOf(latest)
const posDist = Array.from({ length: 5 }, () => new Map())
let matches = 0
for (let i = 0; i < draws.length - 1; i++) {
  const d = draws[i], next = draws[i + 1]
  let sim = 0
  if (sig(d) === latestSig) sim += 40
  const ds = sig(d).split('').map(Number), ls = latestSig.split('').map(Number)
  sim += Math.max(0, 20 - ds.reduce((a, v, k) => a + Math.abs(v - ls[k]), 0) * 4)
  sim += Math.max(0, 22 - Math.abs(sumOf(d) - latestSum) / 4)
  const near = latest.reduce((a, n) => a + (d.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0)
  sim += near * 5
  if (sim < 35) continue
  matches++
  const recency = 0.6 + (i / draws.length) * 0.8
  next.forEach((n, pos) => {
    posDist[pos].set(n, (posDist[pos].get(n) || 0) + sim * recency)
  })
}

const globalRank = [...score.entries()]
  .map(([n, pts]) => ({ n, pts, zone: zoneOf(n), why: why.get(n) || [] }))
  .sort((a, b) => b.pts - a.pts || a.n - b.n)

console.log('Latest:', latest.join(','), 'sig', latestSig, 'sum', latestSum)
console.log('Similar historical transitions:', matches)
console.log('\n=== ALL-SEED LASER + EXACT FORMULA RANK ===')
globalRank.slice(0, 25).forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${String(r.n).padStart(2)}  ${r.pts.toFixed(1)}  Z${r.zone}  ${r.why.slice(0, 7).join(' | ')}`)
})

console.log('\n=== POSITION HISTORY TOPS ===')
posDist.forEach((m, pos) => {
  const total = [...m.values()].reduce((a, b) => a + b, 0)
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([n, v]) => `${n}(${(v / total * 100).toFixed(0)}%)`).join('  ')
  console.log(`${pos + 1}: ${top}`)
})

// Build positional line: position history + global laser/formula, with spread penalty.
const chosen = []
for (let pos = 0; pos < 5; pos++) {
  const prev = pos ? chosen[pos - 1] : 0
  const usedZones = new Map(chosen.map(n => [zoneOf(n), (chosen.filter(x => zoneOf(x) === zoneOf(n)).length)]))
  const candidates = new Map()
  const addC = (n, pts) => {
    if (n <= prev) return
    const z = zoneOf(n)
    let mult = 1
    if ((usedZones.get(z) || 0) >= 1) mult *= 0.38
    candidates.set(n, (candidates.get(n) || 0) + pts * mult)
  }
  ;[...posDist[pos].entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .forEach(([n], i) => addC(n, Math.max(0, 135 - i * 8)))
  globalRank.filter(r => r.n > prev).slice(0, 20)
    .forEach((r, i) => addC(r.n, Math.max(0, 120 - i * 5)))
  const pick = [...candidates.entries()].map(([n, pts]) => ({ n, pts }))
    .sort((a, b) => b.pts - a.pts || a.n - b.n)[0]
  chosen.push(pick.n)
}

function lineScore(line) {
  const global = new Map(globalRank.map((r, i) => [r.n, Math.max(0, 100 - i * 3)]))
  const pos = line.reduce((acc, n, i) => acc + ((posDist[i].get(n) || 0) / 20), 0)
  const laser = line.reduce((acc, n) => acc + (global.get(n) || 0), 0)
  const spread = new Set(line.map(zoneOf)).size * 35
  return pos + laser + spread
}

const backupPools = [
  [2, 3, 5, 4, 1, 6],
  [19, 18, 17, 16, 15, 13],
  [20, 21, 22, 24, 28, 27],
  [32, 30, 34, 37, 35, 33],
  [44, 43, 42, 40, 45, 39],
]
const lines = []
for (const a of backupPools[0].slice(0, 4))
for (const b of backupPools[1].slice(0, 4))
for (const c of backupPools[2].slice(0, 4))
for (const d of backupPools[3].slice(0, 4))
for (const e of backupPools[4].slice(0, 4)) {
  const line = [a, b, c, d, e].sort((x, y) => x - y)
  if (new Set(line).size !== 5) continue
  const s = sumOf(line)
  if (s < 105 || s > 135) continue
  lines.push({ line, score: lineScore(line), sig: sig(line), sum: s })
}
const bestLines = lines.sort((a, b) => b.score - a.score || Math.abs(119 - a.sum) - Math.abs(119 - b.sum)).slice(0, 12)

console.log('\nPOSITION-BUILT LINE:', chosen.join(', '), 'sum', sumOf(chosen), 'sig', sig(chosen))
console.log('\n=== BEST TICKET LINES ===')
bestLines.forEach((l, i) => console.log(`${i + 1}. ${l.line.join(', ')}  sum=${l.sum} sig=${l.sig} score=${l.score.toFixed(1)}`))
