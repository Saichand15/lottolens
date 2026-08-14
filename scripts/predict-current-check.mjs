import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'
import { computeAutoSequence } from '../src/utils/autoSequence.js'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const latest = draws.at(-1)
const pred = computeHybridPrediction(draws)
const auto = computeAutoSequence(draws)

const provided = [
  { S: 11, NW: 19, NW_app: 2, NW_miss: 17, SW: 67, SW_app: 5, SW_miss: 62, ctTotal: 7 },
  { S: 16, NW: 29, NW_app: 3, NW_miss: 26, SW: 57, SW_app: 13, SW_miss: 44, ctTotal: 16 },
  { S: 30, NW: 57, NW_app: 5, NW_miss: 52, SW: 29, SW_app: 0, SW_miss: 29, ctTotal: 5 },
  { S: 37, NW: 71, NW_app: 5, NW_miss: 66, SW: 15, SW_app: 2, SW_miss: 13, ctTotal: 7 },
  { S: 38, NW: 73, NW_app: 9, NW_miss: 64, SW: 13, SW_app: 2, SW_miss: 11, ctTotal: 11 },
]
const MAX = 45
const wrap = raw => {
  let n = Math.round(raw)
  while (n < 1) n += MAX
  while (n > MAX) n -= MAX
  return n
}
const add = (map, n, w, why) => {
  n = wrap(n)
  if (!map.has(n)) map.set(n, { n, pts: 0, why: [] })
  const r = map.get(n)
  r.pts += w
  r.why.push(why)
}

const formula = new Map()
for (const s of provided) {
  const S = s.S, NW = s.NW, NWa = s.NW_app, NWm = s.NW_miss, SW = s.SW, SWa = s.SW_app, SWm = s.SW_miss, ct = s.ctTotal
  const defs = [
    ['S+1', S + 1, 10], ['S-1', S - 1, 10], ['S+2', S + 2, 7], ['S-2', S - 2, 7],
    ['S+10', S + 10, 12], ['S-10', S - 10, 12], ['S+ct', S + ct, 14], ['S-ct', S - ct, 14],
    ['S+SWapp', S + SWa, 13], ['S-SWapp', S - SWa, 13], ['S+NWapp', S + NWa, 12], ['S-NWapp', S - NWa, 12],
    ['SW-NWapp', SW - NWa, 12], ['SW+SWapp', SW + SWa, 12], ['SW+ct', SW + ct, 12], ['SW-ct', SW - ct, 12],
    ['SW-SWapp', SW - SWa, 12], ['SW-SWmiss', SW - SWm, 12], ['SW+SWmiss', SW + SWm, 10], ['SWmiss', SWm, 11],
    ['NW-SWapp', NW - SWa, 12], ['NW+SWapp', NW + SWa, 10], ['NW-SWmiss', NW - SWm, 12], ['NW-NWapp', NW - NWa, 10],
    ['NW-ct', NW - ct, 13], ['SW-ct', SW - ct, 13], ['NW-S', NW - S, 11], ['SW-S', SW - S, 11],
    ['ct+NWapp', ct + NWa, 10], ['ct+SWapp', ct + SWa, 10], ['NWapp+SWapp+ct', NWa + SWa + ct, 10],
    ['NWmiss-SWmiss', NWm - SWm, 9], ['SWmiss-NWmiss', SWm - NWm, 9],
  ]
  for (const [name, raw, w] of defs) add(formula, raw, w, `${S}:${name}=${raw}${wrap(raw) !== raw ? '→' + wrap(raw) : ''}`)
}
const formulaRank = [...formula.values()].sort((a, b) => b.pts - a.pts || a.n - b.n)
const hybridTop = pred.results.slice(0, 30)
const hybridMap = new Map(hybridTop.map((r, i) => [r.number, { rank: i + 1, score: r.score, raw: r.rawScore, reasons: r.reasons }]))

const combined = new Map()
for (const r of hybridTop) add(combined, r.number, Math.max(0, 80 - (r === hybridTop[0] ? 0 : hybridTop.indexOf(r) * 2.2)), `hybrid#${hybridTop.indexOf(r) + 1}`)
for (const r of formulaRank.slice(0, 30)) add(combined, r.n, r.pts * 1.4, `formulaPts:${r.pts}`)
const combinedRank = [...combined.values()].sort((a, b) => b.pts - a.pts || a.n - b.n)

console.log('Latest D' + draws.length, latest.join(','))
console.log('\nAUTO PRIMARY:', auto.primary.map(r => r.number).join(','))
console.log('AUTO COVER20:', auto.cover20.map(r => r.number).join(','))
console.log('\nHYBRID TOP 20:')
pred.results.slice(0, 20).forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${String(r.number).padStart(2)} score=${r.score} raw=${r.rawScore} ${r.reasons.slice(0, 5).join(' | ')}`))
console.log('\nFORMULA TOP 25 FROM PROVIDED STATS:')
formulaRank.slice(0, 25).forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${String(r.n).padStart(2)} pts=${r.pts} ${r.why.slice(0, 5).join(' | ')}`))
console.log('\nCOMBINED TOP 25:')
combinedRank.slice(0, 25).forEach((r, i) => {
  const h = hybridMap.get(r.n)
  console.log(`${String(i + 1).padStart(2)} ${String(r.n).padStart(2)} pts=${r.pts.toFixed(1)} ${h ? `H#${h.rank}` : 'H--'} ${r.why.slice(0, 4).join(' | ')}`)
})

function bestIn(min, max, arr = combinedRank) {
  return arr.find(r => r.n >= min && r.n <= max)?.n
}
const seqs = [
  [bestIn(1,9), bestIn(10,19), bestIn(20,29), bestIn(30,39), bestIn(40,45)],
  combinedRank.slice(0, 5).map(r => r.n),
  [bestIn(1,12), bestIn(13,19), bestIn(20,29), bestIn(30,36), bestIn(37,45)],
  [bestIn(1,9), bestIn(10,19), bestIn(20,29), ...combinedRank.filter(r => r.n >= 30 && r.n <= 45).slice(0,2).map(r => r.n)],
  auto.primary.map(r => r.number),
]
console.log('\nSUGGESTED SEQUENCES:')
seqs.forEach((s, i) => console.log(`${i + 1}: ${[...new Set(s)].filter(Boolean).sort((a,b)=>a-b).join(',')}`))
