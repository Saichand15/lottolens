import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'
import { computeAutoSequence } from '../src/utils/autoSequence.js'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const latestGiven = [8, 15, 22, 23, 34]
const draws = [...baseDraws, latestGiven]
const provided = [
  { S: 8, NW: 13, NW_app: 0, NW_miss: 13, SW: 73, SW_app: 9, SW_miss: 64, ctTotal: 9 },
  { S: 15, NW: 27, NW_app: 4, NW_miss: 23, SW: 59, SW_app: 12, SW_miss: 47, ctTotal: 16 },
  { S: 22, NW: 41, NW_app: 3, NW_miss: 38, SW: 45, SW_app: 4, SW_miss: 41, ctTotal: 7 },
  { S: 23, NW: 43, NW_app: 4, NW_miss: 39, SW: 43, SW_app: 2, SW_miss: 41, ctTotal: 6 },
  { S: 34, NW: 65, NW_app: 9, NW_miss: 56, SW: 21, SW_app: 4, SW_miss: 17, ctTotal: 13 },
]
const MAX = 45
const wrap = raw => {
  let n = Math.round(raw)
  while (n < 1) n += MAX
  while (n > MAX) n -= MAX
  return n
}
const zones = [[1,9], [10,19], [20,29], [30,39], [40,45]]
const zoneSig = d => zones.map(([a,b]) => d.filter(n => n >= a && n <= b).length).join('')
const add = (map, n, w, why) => {
  n = wrap(n)
  if (!map.has(n)) map.set(n, { n, pts: 0, why: [] })
  const r = map.get(n)
  r.pts += w
  r.why.push(why)
}

function formulaList(s) {
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
  return defs.map(([name, raw, w]) => ({ seed: S, name, raw, n: wrap(raw), w, wrapped: wrap(raw) !== raw }))
}

const pred = computeHybridPrediction(draws)
const auto = computeAutoSequence(draws)
const formula = new Map()
for (const f of provided.flatMap(formulaList)) add(formula, f.n, f.w, `${f.seed}:${f.name}=${f.raw}${f.wrapped ? '→' + f.n : ''}`)
const formulaRank = [...formula.values()].sort((a,b)=>b.pts-a.pts || a.n-b.n)

const combined = new Map()
pred.results.slice(0, 35).forEach((r, idx) => add(combined, r.number, Math.max(0, 90 - idx * 2.1), `hybrid#${idx+1}`))
formulaRank.slice(0, 35).forEach(r => add(combined, r.n, r.pts * 1.35, `formula:${r.pts}`))

// Shape/collapse interpretation: latest 11210 often rebounds high/edge or keeps mid-pair.
// Add small non-engine decision support, not overwhelming.
const sig = zoneSig(latestGiven)
if (sig === '11210') {
  ;[
    [7, 16, 'low neighbor'], [9, 14, 'low neighbor'],
    [14, 16, 'boundary pull'], [16, 18, 'boundary pull'], [17, 14, 'boundary pull'],
    [21, 18, 'mid keep'], [22, 16, 'mid repeat'], [23, 16, 'mid repeat'], [24, 16, 'mid keep'], [29, 14, 'mid push'],
    [33, 16, 'high neighbor'], [35, 18, 'high rebound'], [36, 14, 'high rebound'], [40, 12, 'edge return'], [42, 12, 'edge return']
  ].forEach(([n, w, why]) => add(combined, n, w, `shape11210:${why}`))
}
const combinedRank = [...combined.values()].sort((a,b)=>b.pts-a.pts || a.n-b.n)
const hMap = new Map(pred.results.map((r, idx) => [r.number, { rank: idx + 1, score: r.score, raw: r.rawScore, reasons: r.reasons }]))

console.log('Assumed latest D' + draws.length + ':', latestGiven.join(','), 'zone', sig, 'sum', latestGiven.reduce((a,b)=>a+b,0))
console.log('\nAUTO PRIMARY:', auto.primary.map(r => r.number).join(','))
console.log('AUTO COVER20:', auto.cover20.map(r => r.number).join(','))
console.log('\nHYBRID TOP 25:')
pred.results.slice(0,25).forEach((r,i)=>console.log(`${String(i+1).padStart(2)} ${String(r.number).padStart(2)} score=${r.score} raw=${r.rawScore} ${r.reasons.slice(0,6).join(' | ')}`))
console.log('\nFORMULA TOP 30:')
formulaRank.slice(0,30).forEach((r,i)=>console.log(`${String(i+1).padStart(2)} ${String(r.n).padStart(2)} pts=${r.pts} ${r.why.slice(0,6).join(' | ')}`))
console.log('\nCOMBINED TOP 30:')
combinedRank.slice(0,30).forEach((r,i)=> {
  const h = hMap.get(r.n)
  console.log(`${String(i+1).padStart(2)} ${String(r.n).padStart(2)} pts=${r.pts.toFixed(1)} ${h ? 'H#'+h.rank : 'H--'} ${r.why.slice(0,5).join(' | ')}`)
})
function best(min,max,arr=combinedRank, exclude=new Set()) { return arr.find(r => r.n>=min && r.n<=max && !exclude.has(r.n))?.n }
function make(nums) { return [...new Set(nums)].filter(Boolean).sort((a,b)=>a-b) }
const seqs = []
seqs.push(make(combinedRank.slice(0,5).map(r=>r.n)))
seqs.push(make([best(1,9), best(10,19), best(20,29), best(30,39), best(40,45)]))
seqs.push(make([best(1,12), best(13,19), best(20,24), best(25,34), best(35,45)]))
seqs.push(make([7,16,22,35,42]))
seqs.push(make([9,14,23,33,40]))
console.log('\nSUGGESTED SEQUENCES:')
seqs.forEach((s,i)=>console.log(`${i+1}: ${s.join(',')}`))
