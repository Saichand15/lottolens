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
  [2, 19, 22, 25, 31],
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
function distRank(rows, pickFn) {
  const m = new Map()
  for (const r of rows) for (const v of pickFn(r)) m.set(v, (m.get(v) || 0) + r.w)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const rows = similarRows(draws, latest)
const agent = computeFormulaAgent(draws)
const hybrid = computeHybridPrediction(draws)
const posDist = Array.from({ length: 5 }, (_, i) => distRank(rows, r => [r.next[i]]))
const allDist = distRank(rows, r => r.next)
const shapeDist = distRank(rows, r => [sig(r.next)])
const targetSum = rows.reduce((a, r) => a + sumOf(r.next) * r.w, 0) / rows.reduce((a, r) => a + r.w, 0)

const scoreMap = new Map(), why = new Map()
function add(n, pts, reason) {
  scoreMap.set(n, (scoreMap.get(n) || 0) + pts)
  if (!why.has(n)) why.set(n, [])
  why.get(n).push(reason)
}
allDist.slice(0, 35).forEach(([n], i) => add(n, Math.max(0, 130 - i * 3.2), `hist#${i + 1}`))
agent.ranked.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 118 - i * 3), `formula#${i + 1}`))
agent.laser.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 105 - i * 2.8), `laser#${i + 1}`))
agent.spider.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 98 - i * 2.6), `spider#${i + 1}`))
hybrid.results.slice(0, 35).forEach((r, i) => add(r.number, Math.max(0, 72 - i * 2), `hybrid#${i + 1}`))
const global = [...scoreMap.entries()].map(([n, pts]) => ({ n, pts, why: why.get(n), zone: zoneOf(n) })).sort((a, b) => b.pts - a.pts || a.n - b.n)
const globalRankPts = new Map(global.map((r, i) => [r.n, Math.max(0, 120 - i * 3)]))

const pools = [
  [2, 5, 6, 1, 3, 4, 7, 10],
  [16, 15, 10, 13, 21, 12, 9, 24, 19, 18, 17],
  [29, 28, 19, 16, 20, 24, 18, 15, 22, 27, 26, 21],
  [29, 28, 35, 32, 33, 34, 37, 23, 31, 30, 36],
  [44, 43, 45, 42, 38, 36, 41, 40, 35, 34],
]
const shapeWeight = new Map(shapeDist)
const shapeMax = shapeDist[0]?.[1] || 1
const posMax = posDist.map(d => d[0]?.[1] || 1)
const allMax = allDist[0]?.[1] || 1
const lines = []
for (const a of pools[0]) for (const b of pools[1]) for (const c of pools[2]) for (const d of pools[3]) for (const e of pools[4]) {
  const line = [a, b, c, d, e].sort((x, y) => x - y)
  if (new Set(line).size !== 5) continue
  const s = sumOf(line), shape = sig(line)
  if (s < 95 || s > 135) continue
  if (new Set(line.map(zoneOf)).size < 4) continue
  let score = 0
  line.forEach((n, i) => {
    score += ((posDist[i].find(([x]) => x === n)?.[1] || 0) / posMax[i]) * 130
    score += ((allDist.find(([x]) => x === n)?.[1] || 0) / allMax) * 70
    score += (globalRankPts.get(n) || 0)
  })
  score += ((shapeWeight.get(shape) || 0) / shapeMax) * 120
  score += Math.max(0, 65 - Math.abs(s - targetSum) * 3)
  const repeatCount = line.filter(n => latest.includes(n)).length
  if (repeatCount > 1) score -= (repeatCount - 1) * 45
  // Middle compression already happened; don't overpack 20s again unless shape says so.
  if (line.filter(n => n >= 20 && n <= 31).length >= 3) score -= 30
  lines.push({ line, score, sum: s, sig: shape })
}
const best = lines.sort((a, b) => b.score - a.score || Math.abs(a.sum - targetSum) - Math.abs(b.sum - targetSum)).slice(0, 20)
console.log('Latest:', latest.join(','), 'sig', sig(latest), 'sum', sumOf(latest))
console.log('Rows:', rows.length, 'targetSum:', targetSum.toFixed(1))
console.log('Shape pressure:', shapeDist.slice(0, 10).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(', '))
console.log('Global top:', global.slice(0, 25).map((r, i) => `${i + 1}.${r.n}(${r.pts.toFixed(0)}:${r.why.slice(0, 4).join('|')})`).join('  '))
console.log('Pos tops:')
posDist.forEach((d, i) => console.log(`${i + 1}: ${d.slice(0, 8).map(([n,v]) => `${n}(${v.toFixed(0)})`).join(', ')}`))
console.log('\nBEST LINES:')
best.forEach((x, i) => console.log(`${i + 1}. ${x.line.join(', ')} sum=${x.sum} sig=${x.sig} score=${x.score.toFixed(1)}`))
