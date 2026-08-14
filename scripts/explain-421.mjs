import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))
const d419 = [2, 9, 15, 21, 25]
const previous = [1, 3, 15, 20, 27]
const actual = [10, 18, 19, 21, 40]
const historyBefore = [...baseDraws, d419, previous]
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

function shapeCases(history, seeds) {
  const seedSig = zoneSig(seeds)
  const seedSum = seeds.reduce((a,b)=>a+b,0)
  const seedOdd = seeds.filter(n => n % 2).length
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
    const hits = next.filter(n => actual.includes(n)).length
    cases.push({ drawNum: i + 1, d, next, sim, sig, hits })
  }
  return cases.sort((a,b)=>b.hits-a.hits || b.sim-a.sim).slice(0,14)
}

const stats = previous.map(seed => beamStats(historyBefore, seed))
const pred = computeHybridPrediction(historyBefore)
const formula = new Map()
stats.flatMap(formulaList).forEach(f => add(formula, f.n, f.w, `${f.seed}:${f.name}=${f.raw}${f.wrapped ? '→'+f.n : ''}`))
const formulaRank = [...formula.values()].sort((a,b)=>b.pts-a.pts || a.n-b.n)
const fMap = new Map(formulaRank.map((r, i) => [r.n, { ...r, rank: i + 1 }]))
const hMap = new Map(pred.results.map((r, i) => [r.number, { ...r, rank: i + 1 }]))

console.log('Previous:', previous.join(','), 'zone', zoneSig(previous), 'sum', previous.reduce((a,b)=>a+b,0))
console.log('Actual next:', actual.join(','), 'zone', zoneSig(actual), 'sum', actual.reduce((a,b)=>a+b,0))
console.log('\nHybrid top20:', pred.results.slice(0,20).map(r=>r.number).join(','))
console.log('Hybrid top20 hits:', actual.filter(n => pred.results.slice(0,20).some(r => r.number === n)).join(',') || 'none')
console.log('Hybrid top30 hits:', actual.filter(n => pred.results.slice(0,30).some(r => r.number === n)).join(',') || 'none')
console.log('\nActual ranks:')
actual.forEach(n => {
  const h = hMap.get(n)
  const f = fMap.get(n)
  console.log(`${n}: hybrid#${h?.rank || 'NA'} score=${h?.score || 0} formula#${f?.rank || 'NA'} pts=${f?.pts || 0}`)
  if (f) console.log('  formulas:', f.why.slice(0,12).join(' | '))
  if (h) console.log('  hybrid:', h.reasons.slice(0,12).join(' | '))
})
console.log('\nFormula top35:', formulaRank.slice(0,35).map(r=>`${r.n}(${r.pts})`).join(', '))
console.log('\nSimilar cases hitting actuals:')
shapeCases([...baseDraws, d419], previous).forEach(c => console.log(`D${c.drawNum} ${c.d.join(',')} -> ${c.next.join(',')} hits=${c.hits} sim=${c.sim.toFixed(1)} sig=${c.sig}`))
