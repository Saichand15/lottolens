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
const sumOf = d => d.reduce((a, b) => a + b, 0)
const latestSig = sig(latest)
const latestSum = sumOf(latest)

console.log('Latest:', latest.join(','), 'sig', latestSig, 'sum', latestSum)
console.log('Question: what is the FIRST (lowest) number next?\n')

// ===== 1) HISTORICAL: distribution of the FIRST number after similar draws =====
const firstDist = new Map()      // firstNumber -> weighted score
const firstByValue = new Map()   // raw counts
let matchCount = 0
const exemplars = []
const firstBuckets = { '1-3': 0, '4-6': 0, '7-9': 0, '10-13': 0, '14+': 0 }

for (let i = 0; i < draws.length - 1; i++) {
  const d = draws[i]
  const nxt = draws[i + 1]
  let s = 0
  if (sig(d) === latestSig) s += 40
  const ds = sig(d).split('').map(Number)
  const ls = latestSig.split('').map(Number)
  s += Math.max(0, 20 - ds.reduce((a, v, k) => a + Math.abs(v - ls[k]), 0) * 4)
  s += Math.max(0, 22 - Math.abs(sumOf(d) - latestSum) / 4)
  const near = latest.reduce((a, n) => a + (d.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0)
  s += near * 5
  if (s < 35) continue
  matchCount++
  const recency = 0.6 + (i / draws.length) * 0.8
  const w = s * recency
  const f = nxt[0]
  firstDist.set(f, (firstDist.get(f) || 0) + w)
  firstByValue.set(f, (firstByValue.get(f) || 0) + 1)
  if (f <= 3) firstBuckets['1-3'] += w
  else if (f <= 6) firstBuckets['4-6'] += w
  else if (f <= 9) firstBuckets['7-9'] += w
  else if (f <= 13) firstBuckets['10-13'] += w
  else firstBuckets['14+'] += w
  if (exemplars.length < 14) exemplars.push({ from: d, first: f, next: nxt, sim: s.toFixed(0) })
}

const firstRank = [...firstDist.entries()].sort((a, b) => b[1] - a[1])
const bTot = Object.values(firstBuckets).reduce((a, b) => a + b, 0)
console.log(`Historical matches: ${matchCount}`)
console.log('First-number BUCKET probability:')
Object.entries(firstBuckets).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`   ${k.padEnd(6)}: ${(v / bTot * 100).toFixed(1)}%  ${'#'.repeat(Math.round(v / bTot * 40))}`))
console.log('\nMost likely FIRST numbers (history):')
firstRank.slice(0, 12).forEach(([n, sc], i) =>
  console.log(`   ${i + 1}. ${String(n).padStart(2)}  weight ${sc.toFixed(0)}  (seen ${firstByValue.get(n)}x)`))

console.log('\nSample similar transitions (first number in [brackets]):')
exemplars.forEach(e => console.log(`   ${e.from.join(',')} (sim${e.sim}) -> [${e.first}] ${e.next.slice(1).join(',')}`))

// ===== 2) FORMULA BASES: project the first number from current draw seeds =====
// Re-implement beamStats + formulaDefs locally via the agent's exported data is internal,
// so instead use the agent's per-number formula evidence for the low zone (1-9).
const agent = computeFormulaAgent(draws)
console.log('\n=== FORMULA-BASE projection for low zone (1-9) ===')
const lowFormulaHits = agent.ranked.filter(r => r.number <= 13)
lowFormulaHits.slice(0, 12).forEach((r, i) => {
  const fs = (r.formulas || []).slice(0, 3).join(', ')
  console.log(`   ${i + 1}. ${String(r.number).padStart(2)}  score ${Number(r.score).toFixed(0)}  L#${r.laserRank || '-'} S#${r.spiderRank || '-'}  via [${fs}]`)
})

// ===== 3) LIVE laser/spider lowest-number lean =====
const laserLow = agent.laser.filter(r => r.number <= 13).slice(0, 8)
const spiderLow = agent.spider.filter(r => r.number <= 13).slice(0, 8)
console.log('\nLaser low picks :', laserLow.map(r => `${r.number}#${r.rank}`).join(', '))
console.log('Spider low picks:', spiderLow.map(r => `${r.number}#${r.rank}`).join(', '))

// ===== 4) COMBINED first-number verdict =====
const combo = new Map()
const addC = (n, p) => { if (n <= 13) combo.set(n, (combo.get(n) || 0) + p) }
firstRank.slice(0, 12).forEach(([n], i) => addC(n, Math.max(0, 100 - i * 7)))
lowFormulaHits.slice(0, 12).forEach((r, i) => addC(r.number, Math.max(0, 85 - i * 6)))
laserLow.forEach((r, i) => addC(r.number, Math.max(0, 70 - i * 8)))
spiderLow.forEach((r, i) => addC(r.number, Math.max(0, 65 - i * 8)))
const comboRank = [...combo.entries()].map(([n, p]) => ({ n, p })).sort((a, b) => b.p - a.p || a.n - b.n)
console.log('\n>>> FIRST-NUMBER VERDICT (combined):')
comboRank.slice(0, 8).forEach((r, i) => console.log(`   ${i + 1}. ${String(r.n).padStart(2)}  (${r.p.toFixed(0)} pts)`))
console.log('\nTOP PICK for first number:', comboRank[0]?.n, '| backups:', comboRank.slice(1, 4).map(r => r.n).join(', '))
