import fs from 'fs'
import { computeFormulaAgent } from '../src/utils/formulaAgent.js'

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
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const sumOf = d => d.reduce((a, b) => a + b, 0)
const latestSig = sig(latest)
const latestSum = sumOf(latest)

console.log('Latest:', latest.join(','), 'sig', latestSig, 'sum', latestSum)

// ===== DEEP HISTORICAL ANALYSIS =====
// Find every past draw similar to the latest (signature match + sum proximity + positional nearness),
// then record what ACTUALLY came next. This is data-driven, not hardcoded.
const followers = new Map() // number -> weighted score
const zoneFollow = [0, 0, 0, 0, 0]
const sumFollow = []
let matchCount = 0
const exemplars = []

for (let i = 0; i < draws.length - 1; i++) {
  const d = draws[i]
  const nxt = draws[i + 1]
  let simScore = 0
  if (sig(d) === latestSig) simScore += 40
  // partial signature overlap
  const ds = sig(d).split('').map(Number)
  const ls = latestSig.split('').map(Number)
  const sigDist = ds.reduce((a, v, k) => a + Math.abs(v - ls[k]), 0)
  simScore += Math.max(0, 20 - sigDist * 4)
  // sum proximity
  simScore += Math.max(0, 22 - Math.abs(sumOf(d) - latestSum) / 4)
  // positional nearness to latest numbers
  const near = latest.reduce((a, n) => a + (d.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0)
  simScore += near * 5
  if (simScore < 35) continue
  matchCount++
  const recency = 0.6 + (i / draws.length) * 0.8
  const w = simScore * recency
  for (const n of nxt) {
    followers.set(n, (followers.get(n) || 0) + w)
    zoneFollow[zoneOf(n)] += w
  }
  sumFollow.push(sumOf(nxt))
  if (exemplars.length < 12) exemplars.push({ from: d, next: nxt, sim: simScore.toFixed(0) })
}

const followRank = [...followers.entries()].sort((a, b) => b[1] - a[1])
console.log(`\nHistorical matches found: ${matchCount}`)
console.log('Most likely NEXT-sum (avg):', (sumFollow.reduce((a, b) => a + b, 0) / Math.max(sumFollow.length, 1)).toFixed(0),
  'range', Math.min(...sumFollow), '-', Math.max(...sumFollow))
const zTot = zoneFollow.reduce((a, b) => a + b, 0)
console.log('Next-draw zone pressure %:', zoneFollow.map((v, i) => `Z${i}:${(v / zTot * 100).toFixed(0)}%`).join('  '))
console.log('\nTop historical followers:', followRank.slice(0, 25).map(([n, s]) => `${n}(${s.toFixed(0)})`).join(', '))
console.log('\nSample similar transitions:')
exemplars.forEach(e => console.log(`  ${e.from.join(',')} (sim${e.sim}) -> ${e.next.join(',')}`))

// ===== LIVE LASER + SPIDER (agent) =====
const agent = computeFormulaAgent(draws)
console.log('\n=== LIVE ENGINE ===')
console.log('Agent selected shape:', agent.selectedShape)
console.log('Top laser :', agent.laser.slice(0, 18).map(r => `${r.number}#${r.rank}`).join(', '))
console.log('Top spider:', agent.spider.slice(0, 18).map(r => `${r.number}#${r.rank}`).join(', '))

// ===== BLENDED PREDICTION =====
const blend = new Map()
const addB = (n, p) => blend.set(n, (blend.get(n) || 0) + p)
followRank.slice(0, 22).forEach(([n], i) => addB(n, Math.max(0, 100 - i * 3.5)))   // history weight
agent.laser.slice(0, 22).forEach((r, i) => addB(r.number, Math.max(0, 80 - i * 3)))  // laser weight
agent.spider.slice(0, 22).forEach((r, i) => addB(r.number, Math.max(0, 70 - i * 2.8))) // spider weight

const blended = [...blend.entries()].map(([n, p]) => ({ n, p })).sort((a, b) => b.p - a.p || a.n - b.n)
console.log('\nBlended top 24:', blended.slice(0, 24).map((r, i) => `${i + 1}.${r.n}(${r.p.toFixed(0)})`).join('  '))

// Build a ZONE-BALANCED formation (no tight clusters). Target zone weights from historical pressure.
const targetZones = zoneFollow.map((v, i) => ({ i, w: v }))
  .sort((a, b) => b.w - a.w)
// Decide seat counts: distribute 5 picks across top zones by pressure, cap 2 per zone for spread
function buildFormation() {
  const counts = [0, 0, 0, 0, 0]
  let left = 5
  // guarantee spread: at least the top 3 pressure zones get 1
  for (const z of targetZones) {
    if (left <= 0) break
    if (counts[z.i] === 0 && z.w > 0) { counts[z.i] = 1; left-- }
  }
  // fill remaining by pressure, cap 2/zone
  while (left > 0) {
    const z = targetZones.find(z => counts[z.i] < 2 && z.w > 0)
    if (!z) break
    counts[z.i]++
    left--
  }
  // pick best blended numbers per zone
  const used = new Set()
  const out = []
  counts.forEach((cnt, zi) => {
    const cands = blended.filter(r => zoneOf(r.n) === zi && !used.has(r.n)).slice(0, cnt)
    cands.forEach(c => { out.push(c.n); used.add(c.n) })
  })
  return out.sort((a, b) => a - b)
}
const formation = buildFormation()
console.log('\n>>> BALANCED FORMATION (main):', formation.join(', '))

// Backup lines: shift within zones
const backups = []
function altFormation(skip) {
  const used = new Set(skip)
  const counts = [0, 0, 0, 0, 0]
  let left = 5
  for (const z of targetZones) { if (left <= 0) break; if (counts[z.i] === 0 && z.w > 0) { counts[z.i] = 1; left-- } }
  while (left > 0) { const z = targetZones.find(z => counts[z.i] < 2 && z.w > 0); if (!z) break; counts[z.i]++; left-- }
  const out = []
  counts.forEach((cnt, zi) => {
    const cands = blended.filter(r => zoneOf(r.n) === zi && !used.has(r.n)).slice(0, cnt)
    cands.forEach(c => { out.push(c.n); used.add(c.n) })
  })
  return out.sort((a, b) => a - b)
}
backups.push(altFormation(formation.slice(0, 2)))
backups.push(altFormation(formation.slice(2, 5)))
backups.push(altFormation([formation[0], formation[2], formation[4]]))
console.log('Backup lines:')
backups.forEach((b, i) => console.log(`  ${i + 1}: ${b.join(', ')}`))

console.log('\nCover pool (12):', blended.slice(0, 12).map(r => r.n).join(', '))
