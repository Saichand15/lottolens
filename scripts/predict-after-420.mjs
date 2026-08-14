import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'
import { computeAutoSequence } from '../src/utils/autoSequence.js'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const d419 = [2, 9, 15, 21, 25]
const latestGiven = [1, 3, 15, 20, 27]
const draws = [...baseDraws, d419, latestGiven]
const MAX = 45
const DIRS = { NW: [-1, -1], NE: [1, -1], SW: [-1, 1], SE: [1, 1] }
const zones = [[1,9], [10,19], [20,29], [30,39], [40,45]]
const zoneSig = d => zones.map(([a,b]) => d.filter(n => n >= a && n <= b).length).join('')
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

function beamStats(history, seed) {
  const win = history.slice(-100)
  const ci = win.length - 1
  const sets = win.map(d => new Set(d))
  const rowIdx = seed - 1
  const out = { S: seed, NW: 0, NW_app: 0, SW: 0, SW_app: 0, NE_app: 0, SE_app: 0 }
  for (const [dir, [dc, dr]] of Object.entries(DIRS)) {
    let step = 1
    while (true) {
      const c = ci + dc * step
      const r = rowIdx + dr * step
      if (c < 0 || c >= win.length || r < 0 || r >= MAX) break
      const n = r + 1
      const hit = sets[c]?.has(n) || false
      if (dir === 'NW') { out.NW++; if (hit) out.NW_app++ }
      if (dir === 'SW') { out.SW++; if (hit) out.SW_app++ }
      if (dir === 'NE' && hit) out.NE_app++
      if (dir === 'SE' && hit) out.SE_app++
      const adjR = dr < 0 ? r - 1 : r + 1
      if (adjR >= 0 && adjR < MAX) {
        const adjN = adjR + 1
        const adjHit = sets[c]?.has(adjN) || false
        if (dir === 'NW') { out.NW++; if (adjHit) out.NW_app++ }
        if (dir === 'SW') { out.SW++; if (adjHit) out.SW_app++ }
        if (dir === 'NE' && adjHit) out.NE_app++
        if (dir === 'SE' && adjHit) out.SE_app++
      }
      step++
    }
  }
  out.NW_miss = out.NW - out.NW_app
  out.SW_miss = out.SW - out.SW_app
  out.ctTotal = out.NW_app + out.SW_app + out.NE_app + out.SE_app
  return out
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

function shapeReplay(history, seeds) {
  const seedSig = zoneSig(seeds)
  const seedSum = seeds.reduce((a,b)=>a+b,0)
  const seedOdd = seeds.filter(n => n % 2).length
  const score = new Map()
  const cases = []
  for (let i = 0; i < history.length - 1; i++) {
    const d = history[i]
    const next = history[i + 1]
    const sig = zoneSig(d)
    const sum = d.reduce((a,b)=>a+b,0)
    const odd = d.filter(n => n % 2).length
    const exact = d.filter(n => seeds.includes(n)).length
    const near = seeds.reduce((s, n) => s + (d.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0)
    let sim = exact * 12 + near * 3
    if (sig === seedSig) sim += 24
    sim += Math.max(0, 12 - Math.abs(seedSum - sum) / 7)
    sim += Math.max(0, 5 - Math.abs(seedOdd - odd) * 2)
    if (sim < 22) continue
    cases.push({ drawNum: i + 1, d, next, sim, sig })
    next.forEach(n => add(score, n, sim, `shape D${i+1}->D${i+2}`))
    for (const a of d) for (const b of next) {
      const delta = b - a
      if (Math.abs(delta) <= 14) seeds.forEach(s => add(score, s + delta, sim * 0.13, `move ${delta}`))
    }
  }
  return { ranked: [...score.values()].sort((a,b)=>b.pts-a.pts || a.n-b.n), cases: cases.sort((a,b)=>b.sim-a.sim).slice(0,12) }
}

const stats = latestGiven.map(seed => beamStats(draws, seed))
const pred = computeHybridPrediction(draws)
const auto = computeAutoSequence(draws)
const formula = new Map()
stats.flatMap(formulaList).forEach(f => add(formula, f.n, f.w, `${f.seed}:${f.name}=${f.raw}${f.wrapped ? '→'+f.n : ''}`))
const formulaRank = [...formula.values()].sort((a,b)=>b.pts-a.pts || a.n-b.n)
const shape = shapeReplay([...baseDraws, d419], latestGiven)

const combined = new Map()
pred.results.slice(0, 35).forEach((r, idx) => add(combined, r.number, Math.max(0, 94 - idx * 2.1), `hybrid#${idx+1}`))
formulaRank.slice(0, 35).forEach(r => add(combined, r.n, r.pts * 1.35, `formula:${r.pts}`))
shape.ranked.slice(0, 25).forEach((r, idx) => add(combined, r.n, Math.max(0, 62 - idx * 1.6), `shape#${idx+1}`))

// Current shape is a second 21200 with lower sum. Treat as low hold with controlled mid continuation and one rebound cover.
if (zoneSig(latestGiven) === '21200' && latestGiven.reduce((a,b)=>a+b,0) <= 75) {
  ;[
    [2, 22, 'low edge mirror'], [4, 20, 'low step'], [5, 22, 'low return'], [6, 16, 'low return'], [8, 14, 'low return'],
    [10, 22, 'boundary rebound'], [12, 18, 'boundary return'], [14, 18, 'boundary return'], [16, 18, 'teen anchor'], [17, 16, 'teen anchor'],
    [19, 15, 'teen/mid gate'], [21, 22, 'mid hold'], [22, 20, 'mid hold'], [25, 17, 'mid return'], [28, 18, 'mid push'], [29, 16, 'mid push'],
    [31, 16, 'controlled high'], [33, 18, 'controlled high'], [35, 15, 'controlled high']
  ].forEach(([n, w, why]) => add(combined, n, w, `second21200:${why}`))
}

const combinedRank = [...combined.values()].sort((a,b)=>b.pts-a.pts || a.n-b.n)
const hMap = new Map(pred.results.map((r, idx) => [r.number, { rank: idx + 1, score: r.score, raw: r.rawScore, reasons: r.reasons }]))

console.log('Assumed latest D' + draws.length + ':', latestGiven.join(','), 'zone', zoneSig(latestGiven), 'sum', latestGiven.reduce((a,b)=>a+b,0))
console.log('\nBeam stats:')
stats.forEach(s => console.log(`${s.S}: NW=${s.NW} NW_app=${s.NW_app} NW_miss=${s.NW_miss} SW=${s.SW} SW_app=${s.SW_app} SW_miss=${s.SW_miss} ctTotal=${s.ctTotal}`))
console.log('\nAUTO PRIMARY:', auto.primary.map(r => r.number).join(','))
console.log('AUTO COVER20:', auto.cover20.map(r => r.number).join(','))
console.log('\nHYBRID TOP 25:')
pred.results.slice(0,25).forEach((r,i)=>console.log(`${String(i+1).padStart(2)} ${String(r.number).padStart(2)} score=${r.score} raw=${r.rawScore} ${r.reasons.slice(0,7).join(' | ')}`))
console.log('\nFORMULA TOP 30:')
formulaRank.slice(0,30).forEach((r,i)=>console.log(`${String(i+1).padStart(2)} ${String(r.n).padStart(2)} pts=${r.pts} ${r.why.slice(0,7).join(' | ')}`))
console.log('\nSHAPE CASES:')
shape.cases.slice(0,10).forEach(c => console.log(`D${c.drawNum} ${c.d.join(',')} -> ${c.next.join(',')} sim=${c.sim.toFixed(1)} sig=${c.sig}`))
console.log('\nCOMBINED TOP 30:')
combinedRank.slice(0,30).forEach((r,i)=> {
  const h = hMap.get(r.n)
  console.log(`${String(i+1).padStart(2)} ${String(r.n).padStart(2)} pts=${r.pts.toFixed(1)} ${h ? 'H#'+h.rank : 'H--'} ${r.why.slice(0,6).join(' | ')}`)
})
function best(min,max,arr=combinedRank, exclude=new Set()) { return arr.find(r => r.n>=min && r.n<=max && !exclude.has(r.n))?.n }
function make(nums) { return [...new Set(nums)].filter(Boolean).sort((a,b)=>a-b) }
const seqs = []
seqs.push(make(auto.primary.map(r=>r.number)))
seqs.push(make(combinedRank.slice(0,5).map(r=>r.n)))
seqs.push(make([best(1,9), best(1,9, combinedRank, new Set([best(1,9)])), best(10,19), best(20,29), best(20,29, combinedRank, new Set([best(20,29)]))]))
seqs.push(make([best(1,9), best(10,19), best(20,29), best(30,39), best(40,45)]))
seqs.push(make([2,10,21,28,33]))
seqs.push(make([4,12,16,22,31]))
console.log('\nSUGGESTED SEQUENCES:')
seqs.forEach((s,i)=>console.log(`${i+1}: ${s.join(',')}`))
