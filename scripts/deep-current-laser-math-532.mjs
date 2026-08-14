import fs from 'fs'
import { computeFormulaAgent } from '../src/utils/formulaAgent.js'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8')).map(d => d.map(Number).sort((a, b) => a - b))
const latest = draws.at(-1)
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const sumOf = d => d.reduce((a, b) => a + b, 0)
const wrap = raw => { let n = Math.round(raw); while (n < 1) n += 45; while (n > 45) n -= 45; return n }
const gaps = d => d.slice(1).map((n, i) => n - d[i])
const pairGaps = d => [...new Set(d.flatMap((a, i) => d.slice(i + 1).map(b => Math.abs(b - a))))].filter(Boolean).sort((a, b) => a - b)

// User supplied exact live laser stats for current latest draw.
const exactStats = [
  { S: 10, NW: 17, NW_app: 2, NW_miss: 15, SW: 69, SW_app: 7, SW_miss: 62, ctTotal: 9 },
  { S: 14, NW: 25, NW_app: 5, NW_miss: 20, SW: 61, SW_app: 5, SW_miss: 56, ctTotal: 10 },
  { S: 16, NW: 29, NW_app: 3, NW_miss: 26, SW: 57, SW_app: 7, SW_miss: 50, ctTotal: 10 },
  { S: 17, NW: 31, NW_app: 2, NW_miss: 29, SW: 55, SW_app: 5, SW_miss: 50, ctTotal: 7 },
  { S: 31, NW: 59, NW_app: 6, NW_miss: 53, SW: 27, SW_app: 1, SW_miss: 26, ctTotal: 7 },
]

function formulaDefs(s) {
  const S = s.S, NW = s.NW, NWa = s.NW_app, NWm = s.NW_miss, SW = s.SW, SWa = s.SW_app, SWm = s.SW_miss, ct = s.ctTotal
  const appSum = NWa + SWa
  const appDiff = SWa - NWa
  const missDiff = NWm - SWm
  const defs = [
    ['S+1', S + 1, 10], ['S-1', S - 1, 10], ['S+2', S + 2, 8], ['S-2', S - 2, 8],
    ['S+5', S + 5, 12], ['S-5', S - 5, 10], ['S+7', S + 7, 11], ['S-7', S - 7, 9], ['S+10', S + 10, 13], ['S-10', S - 10, 13],
    ['S+ct', S + ct, 15], ['S-ct', S - ct, 15], ['S+ct-1', S + ct - 1, 13], ['S-ct+1', S - ct + 1, 13], ['ct-S', ct - S, 12],
    ['S+SWapp', S + SWa, 13], ['S-SWapp', S - SWa, 13], ['S+NWapp', S + NWa, 12], ['S-NWapp', S - NWa, 12],
    ['S+appSum', S + appSum, 12], ['S-appSum', S - appSum, 11], ['S+appDiff', S + appDiff, 11], ['S-appDiff', S - appDiff, 11],
    ['NWapp+ct', NWa + ct, 10], ['SWapp+ct', SWa + ct, 10], ['NWapp+SWapp+ct', NWa + SWa + ct, 11],
    ['SW-SWapp', SW - SWa, 12], ['SW+SWapp', SW + SWa, 11], ['SW-SWmiss', SW - SWm, 12], ['SW+SWmiss', SW + SWm, 9], ['SWmiss', SWm, 12],
    ['SW-NWapp', SW - NWa, 11], ['SW+NWapp', SW + NWa, 10], ['SW-ct', SW - ct, 12], ['SW+ct', SW + ct, 10],
    ['NW-SWapp', NW - SWa, 12], ['NW+SWapp', NW + SWa, 10], ['NW-NWapp', NW - NWa, 11], ['NW+NWapp', NW + NWa, 10], ['NW-SWmiss', NW - SWm, 12], ['NW+NWmiss', NW + NWm, 9], ['NW-ct', NW - ct, 13], ['NW+ct', NW + ct, 11],
    ['NW-S', NW - S, 11], ['S-NW', S - NW, 11], ['SW-S', SW - S, 11], ['S-SW', S - SW, 11],
    ['NWmiss-SWmiss', NWm - SWm, 10], ['SWmiss-NWmiss', SWm - NWm, 10], ['ct+missDiff', ct + missDiff, 9], ['ct-missDiff', ct - missDiff, 9], ['appSum-missDiff', appSum - missDiff, 9], ['missDiff+appDiff', missDiff + appDiff, 9],
  ]
  return defs.map(([name, raw, weight]) => ({ seed: S, name, raw, number: wrap(raw), weight }))
}

function add(map, n, pts, why) {
  if (!map.has(n)) map.set(n, { n, pts: 0, why: [] })
  const r = map.get(n)
  r.pts += pts
  if (why) r.why.push(why)
}

// Exact formula tally.
const formulaMap = new Map()
for (const st of exactStats) {
  formulaDefs(st).forEach(f => add(formulaMap, f.number, f.weight, `${f.seed}:${f.name}`))
}
const exactFormula = [...formulaMap.values()].sort((a, b) => b.pts - a.pts || b.why.length - a.why.length || a.n - b.n)

// Cross-seed arithmetic: stats talk to each other, not just formula per seed.
const mathMap = new Map()
const importantVals = exactStats.flatMap(s => [
  { seed: s.S, label: 'S', v: s.S }, { seed: s.S, label: 'ct', v: s.ctTotal },
  { seed: s.S, label: 'NWa', v: s.NW_app }, { seed: s.S, label: 'SWa', v: s.SW_app },
  { seed: s.S, label: 'appSum', v: s.NW_app + s.SW_app },
  { seed: s.S, label: 'appDiff', v: Math.abs(s.SW_app - s.NW_app) },
  { seed: s.S, label: 'NW-ct', v: Math.abs(s.NW - s.ctTotal) },
  { seed: s.S, label: 'SW-ct', v: Math.abs(s.SW - s.ctTotal) },
  { seed: s.S, label: 'NWm-SWm', v: Math.abs(s.NW_miss - s.SW_miss) },
])
for (const a of importantVals) {
  for (const b of importantVals) {
    if (a === b) continue
    const sumN = wrap(a.v + b.v)
    const diffN = wrap(Math.abs(a.v - b.v))
    add(mathMap, sumN, 2.2, `${a.seed}.${a.label}+${b.seed}.${b.label}`)
    if (Math.abs(a.v - b.v) > 0) add(mathMap, diffN, 2.8, `|${a.seed}.${a.label}-${b.seed}.${b.label}|`)
  }
}

// Gap handoff from current draw.
const gapMap = new Map()
const gs = [...new Set([...gaps(latest), ...pairGaps(latest)].filter(g => g >= 1 && g <= 14))]
for (const seed of latest) {
  for (const g of gs) {
    add(gapMap, wrap(seed + g), 34, `${seed}+gap${g}`)
    add(gapMap, wrap(seed - g), 34, `${seed}-gap${g}`)
  }
  ;[1, 2, 5, 10].forEach(g => {
    add(gapMap, wrap(seed + g), g === 10 ? 58 : 42, `${seed}+${g}`)
    add(gapMap, wrap(seed - g), g === 10 ? 58 : 42, `${seed}-${g}`)
  })
}

// Historical followers for similar state.
function similarity(a, b) {
  let s = 0
  if (sig(a) === sig(b)) s += 42
  const as = sig(a).split('').map(Number), bs = sig(b).split('').map(Number)
  s += Math.max(0, 22 - as.reduce((x, v, i) => x + Math.abs(v - bs[i]), 0) * 4)
  s += Math.max(0, 24 - Math.abs(sumOf(a) - sumOf(b)) / 4)
  s += a.reduce((acc, n) => acc + (b.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0) * 4
  const ag = gaps(a), bg = gaps(b)
  s += Math.max(0, 12 - ag.reduce((acc, g, i) => acc + Math.min(6, Math.abs(g - (bg[i] || 0))), 0) / 2)
  return s
}
const rows = []
for (let i = 0; i < draws.length - 1; i++) {
  const sim = similarity(draws[i], latest)
  if (sim < 34) continue
  const w = sim * (0.6 + (i / draws.length) * 0.85)
  rows.push({ prev: draws[i], next: draws[i + 1], sim, w })
}
const histMap = new Map()
const shapeMap = new Map()
const posMaps = Array.from({ length: 5 }, () => new Map())
for (const r of rows) {
  r.next.forEach((n, i) => { add(histMap, n, r.w, `hist ${r.prev.join(',')}→${r.next.join(',')}`); add(posMaps[i], n, r.w, `pos${i + 1}`) })
  add(shapeMap, sig(r.next), r.w, 'shape')
}

const agent = computeFormulaAgent(draws)
const hybrid = computeHybridPrediction(draws)
const combined = new Map()
exactFormula.slice(0, 35).forEach((r, i) => add(combined, r.n, Math.max(0, 130 - i * 3.5), `exactFormula#${i + 1}:${r.why.slice(0, 3).join('|')}`))
;[...mathMap.values()].sort((a, b) => b.pts - a.pts).slice(0, 35).forEach((r, i) => add(combined, r.n, Math.max(0, 90 - i * 2.2), `crossMath#${i + 1}:${r.why.slice(0, 2).join('|')}`))
;[...gapMap.values()].sort((a, b) => b.pts - a.pts).slice(0, 35).forEach((r, i) => add(combined, r.n, Math.max(0, 95 - i * 2.5), `gap#${i + 1}:${r.why.slice(0, 3).join('|')}`))
;[...histMap.values()].sort((a, b) => b.pts - a.pts).slice(0, 35).forEach((r, i) => add(combined, r.n, Math.max(0, 115 - i * 3), `history#${i + 1}`))
agent.ranked.slice(0, 30).forEach((r, i) => add(combined, r.number, Math.max(0, 105 - i * 3), `agent#${i + 1}:L${r.laserRank || '-'}:S${r.spiderRank || '-'}`))
hybrid.results.slice(0, 30).forEach((r, i) => add(combined, r.number, Math.max(0, 70 - i * 2), `hybrid#${i + 1}`))
const finalRank = [...combined.values()].sort((a, b) => b.pts - a.pts || a.n - b.n)

function lineForShape(shape) {
  const counts = shape.split('').map(Number)
  const used = new Set(), out = []
  counts.forEach((cnt, zi) => {
    finalRank.filter(r => zoneOf(r.n) === zi && !used.has(r.n)).slice(0, cnt).forEach(r => { out.push(r.n); used.add(r.n) })
  })
  for (const r of finalRank) if (out.length < 5 && !used.has(r.n)) { out.push(r.n); used.add(r.n) }
  return out.sort((a, b) => a - b)
}

console.log('Latest:', latest.join(','), 'sig', sig(latest), 'sum', sumOf(latest), 'gaps', gaps(latest).join('-'), 'pairGaps', pairGaps(latest).join(','))
console.log('\nExact formula top:')
exactFormula.slice(0, 25).forEach((r, i) => console.log(`${i + 1}. ${r.n} pts=${r.pts} hits=${r.why.length} ${r.why.slice(0, 6).join(' | ')}`))
console.log('\nCross-stat math top:')
;[...mathMap.values()].sort((a, b) => b.pts - a.pts).slice(0, 20).forEach((r, i) => console.log(`${i + 1}. ${r.n} pts=${r.pts.toFixed(1)} ${r.why.slice(0, 5).join(' | ')}`))
console.log('\nGap handoff top:')
;[...gapMap.values()].sort((a, b) => b.pts - a.pts).slice(0, 20).forEach((r, i) => console.log(`${i + 1}. ${r.n} pts=${r.pts.toFixed(1)} ${r.why.slice(0, 6).join(' | ')}`))
console.log('\nHistorical matches:', rows.length)
console.log('Shape pressure:', [...shapeMap.values()].sort((a, b) => b.pts - a.pts).slice(0, 10).map(r => `${r.n || r.key}:${r.pts.toFixed(0)}`).join(', '))
console.log('History followers:', [...histMap.values()].sort((a, b) => b.pts - a.pts).slice(0, 25).map(r => `${r.n}(${r.pts.toFixed(0)})`).join(', '))
console.log('\nAgent primary:', agent.primary.map(r => r.number).join(','), 'selectedShape', agent.selectedShape)
console.log('Agent top:', agent.ranked.slice(0, 20).map((r, i) => `${i + 1}.${r.number}:L${r.laserRank || '-'}:S${r.spiderRank || '-'}:${r.formulas.slice(0, 3).join('/')}`).join('  '))
console.log('\nFINAL CONFIRMATION RANK:')
finalRank.slice(0, 30).forEach((r, i) => console.log(`${i + 1}. ${r.n} pts=${r.pts.toFixed(0)} Z${zoneOf(r.n)} ${r.why.slice(0, 5).join(' || ')}`))
console.log('\nLines by strongest shapes:')
;['12110','11120','11210','11111','03110','12101','21110'].forEach(shape => {
  const line = lineForShape(shape)
  console.log(`${shape}: ${line.join(',')} sum=${sumOf(line)} sig=${sig(line)}`)
})
