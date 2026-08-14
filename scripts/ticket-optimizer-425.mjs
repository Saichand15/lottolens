import fs from 'fs'
import { computeFormulaAgent } from '../src/utils/formulaAgent.js'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

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
]
const draws = [...baseDraws, ...manual]
const latest = manual.at(-1)
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const sumOf = d => d.reduce((a, b) => a + b, 0)
const oddCount = d => d.filter(n => n % 2).length

function similarRows(draws, latest, threshold = 34) {
  const latestSig = sig(latest), latestSum = sumOf(latest)
  const out = []
  for (let i = 0; i < draws.length - 1; i++) {
    const d = draws[i], next = draws[i + 1]
    let sim = 0
    if (sig(d) === latestSig) sim += 42
    const ds = sig(d).split('').map(Number), ls = latestSig.split('').map(Number)
    sim += Math.max(0, 22 - ds.reduce((a, v, k) => a + Math.abs(v - ls[k]), 0) * 4)
    sim += Math.max(0, 22 - Math.abs(sumOf(d) - latestSum) / 4)
    sim += Math.max(0, 8 - Math.abs(oddCount(d) - oddCount(latest)) * 2)
    sim += latest.reduce((a, n) => a + (d.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0) * 4
    if (sim < threshold) continue
    out.push({ from: d, next, w: sim * (0.58 + (i / draws.length) * 0.86) })
  }
  return out
}
const rows = similarRows(draws, latest)
const posDist = Array.from({ length: 5 }, () => new Map())
const allDist = new Map()
const shapeDist = new Map()
for (const r of rows) {
  r.next.forEach((n, i) => {
    posDist[i].set(n, (posDist[i].get(n) || 0) + r.w)
    allDist.set(n, (allDist.get(n) || 0) + r.w)
  })
  shapeDist.set(sig(r.next), (shapeDist.get(sig(r.next)) || 0) + r.w)
}
const posMax = posDist.map(m => Math.max(...m.values()))
const allMax = Math.max(...allDist.values())
const shapeMax = Math.max(...shapeDist.values())
const targetSum = rows.reduce((a, r) => a + sumOf(r.next) * r.w, 0) / rows.reduce((a, r) => a + r.w, 0)

const agent = computeFormulaAgent(draws)
const hybrid = computeHybridPrediction(draws)
const live = new Map()
function add(n, pts) { live.set(n, (live.get(n) || 0) + pts) }
agent.ranked.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 100 - i * 2.8)))
agent.laser.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 88 - i * 2.5)))
agent.spider.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 82 - i * 2.3)))
hybrid.results.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 65 - i * 1.9)))
const liveMax = Math.max(...live.values())

const pools = [
  [2, 5, 1, 3, 6, 4, 7, 8],
  [12, 6, 15, 9, 10, 16, 11, 21, 17],
  [29, 15, 16, 19, 26, 22, 20, 28, 21, 25],
  [29, 28, 32, 23, 26, 31, 34, 35, 30, 33],
  [43, 42, 44, 45, 40, 39, 37, 38],
]

const candidates = []
for (const a of pools[0]) for (const b of pools[1]) for (const c of pools[2]) for (const d of pools[3]) for (const e of pools[4]) {
  const line = [a, b, c, d, e].sort((x, y) => x - y)
  if (new Set(line).size !== 5) continue
  // Keep sorted seats close to intended positional pools.
  const s = sumOf(line)
  if (s < 92 || s > 132) continue
  const shape = sig(line)
  const zoneSpread = new Set(line.map(zoneOf)).size
  if (zoneSpread < 4) continue
  let score = 0
  line.forEach((n, i) => {
    score += ((posDist[i].get(n) || 0) / posMax[i]) * 115
    score += ((allDist.get(n) || 0) / allMax) * 55
    score += ((live.get(n) || 0) / liveMax) * 95
  })
  score += ((shapeDist.get(shape) || 0) / shapeMax) * 95
  score += Math.max(0, 55 - Math.abs(s - targetSum) * 3)
  score += zoneSpread * 20
  // Avoid too many direct repeats from latest after a repeat-heavy collapse.
  const repeatCount = line.filter(n => latest.includes(n)).length
  if (repeatCount > 1) score -= (repeatCount - 1) * 65
  candidates.push({ line, score, sum: s, sig: shape })
}

const best = candidates.sort((a, b) => b.score - a.score || Math.abs(a.sum - targetSum) - Math.abs(b.sum - targetSum)).slice(0, 20)
console.log('Latest:', latest.join(','), 'sig', sig(latest), 'sum', sumOf(latest))
console.log('Similar rows:', rows.length, 'target weighted next sum:', targetSum.toFixed(1))
console.log('Top shape transitions:', [...shapeDist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`${k}:${v.toFixed(0)}`).join(', '))
console.log('Top live:', [...live.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([n,v])=>`${n}(${v.toFixed(0)})`).join(', '))
console.log('\nBEST OPTIMIZED LINES:')
best.forEach((x, i) => console.log(`${i + 1}. ${x.line.join(', ')}  sum=${x.sum} sig=${x.sig} score=${x.score.toFixed(1)}`))
