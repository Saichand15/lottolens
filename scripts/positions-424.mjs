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

// Gather all similar transitions with their FULL next draw, keep similarity weight.
const matches = []
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
  const recency = 0.6 + (i / draws.length) * 0.8
  matches.push({ from: d, next: nxt, w: s * recency })
}
console.log(`Historical matches: ${matches.length}\n`)

const agent = computeFormulaAgent(draws)
const laserRank = new Map(agent.laser.map((r, i) => [r.number, i + 1]))
const spiderRank = new Map(agent.spider.map((r, i) => [r.number, i + 1]))
const formulaScore = new Map(agent.ranked.map(r => [r.number, Number(r.score)]))
const formulaVia = new Map(agent.ranked.map(r => [r.number, (r.formulas || []).slice(0, 3).join(', ')]))

// Position-by-position, conditioned on the chosen previous position value.
const chosen = []   // accumulates the locked-in sequence
const posLabels = ['1st', '2nd', '3rd', '4th', '5th']

for (let pos = 0; pos < 5; pos++) {
  const prevVal = pos === 0 ? 0 : chosen[pos - 1]
  // Distribution of next-draw value at this position, conditioned: value must be > prevVal
  const dist = new Map()
  const counts = new Map()
  let wsum = 0
  for (const m of matches) {
    const v = m.next[pos]
    if (v == null || v <= prevVal) continue
    // weight extra if this match's previous-position value is near our locked value
    let w = m.w
    if (pos > 0) {
      const mp = m.next[pos - 1]
      w *= 1 + Math.max(0, 4 - Math.abs(mp - prevVal)) * 0.25
    }
    dist.set(v, (dist.get(v) || 0) + w)
    counts.set(v, (counts.get(v) || 0) + 1)
    wsum += w
  }
  // Anti-cluster: penalize landing in the same zone as the previous locked number.
  const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
  const prevZone = pos === 0 ? -1 : zoneOf(prevVal)
  const usedZoneCount = {}
  chosen.forEach(c => { const z = zoneOf(c); usedZoneCount[z] = (usedZoneCount[z] || 0) + 1 })

  // Blend with positional history DOMINANT, formula/laser/spider as support, restricted to > prevVal
  const blend = new Map()
  const addB = (n, p) => {
    if (n <= prevVal || n > 45) return
    const z = zoneOf(n)
    // strong penalty for 2nd+ number in an already-used zone (kills clustering)
    let mult = 1
    if (usedZoneCount[z] >= 1) mult *= 0.35
    if (z === prevZone) mult *= 0.55
    blend.set(n, (blend.get(n) || 0) + p * mult)
  }
  // positional history is the most direct evidence -> highest weight
  ;[...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .forEach(([n], i) => addB(n, Math.max(0, 150 - i * 9)))
  // formula base (supportive)
  ;[...formulaScore.entries()].sort((a, b) => b[1] - a[1])
    .filter(([n]) => n > prevVal)
    .slice(0, 16).forEach(([n], i) => addB(n, Math.max(0, 55 - i * 3.2)))
  agent.laser.filter(r => r.number > prevVal).slice(0, 16)
    .forEach((r, i) => addB(r.number, Math.max(0, 42 - i * 2.4)))
  agent.spider.filter(r => r.number > prevVal).slice(0, 16)
    .forEach((r, i) => addB(r.number, Math.max(0, 38 - i * 2.2)))

  const distRank = [...dist.entries()].sort((a, b) => b[1] - a[1])
  const blendRank = [...blend.entries()].map(([n, p]) => ({ n, p })).sort((a, b) => b.p - a.p || a.n - b.n)

  console.log(`================ ${posLabels[pos]} NUMBER  (must be > ${prevVal}) ================`)
  console.log('History top:', distRank.slice(0, 8).map(([n, sc]) => `${n}(${(sc / wsum * 100).toFixed(0)}%,${counts.get(n)}x)`).join('  '))
  console.log('Blended verdict:')
  blendRank.slice(0, 6).forEach((r, i) => {
    const via = formulaVia.get(r.n) || ''
    console.log(`   ${i + 1}. ${String(r.n).padStart(2)}  (${r.p.toFixed(0)}pts) L#${laserRank.get(r.n) || '-'} S#${spiderRank.get(r.n) || '-'}  ${via ? 'via ' + via : ''}`)
  })
  // Lock the top pick for conditioning the next position
  chosen[pos] = blendRank[0]?.n ?? (prevVal + 5)
  console.log(`   --> LOCK ${posLabels[pos]} = ${chosen[pos]}\n`)
}

console.log('=================================================')
console.log('FULL POSITION-BUILT SEQUENCE:', chosen.join(', '))
console.log('Sum:', sumOf(chosen), '| sig:', sig(chosen.slice().sort((a, b) => a - b)))
