import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const prev = [8, 15, 22, 23, 34]
const actual = [2, 9, 15, 21, 25]
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
const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i])
const prevIdx = baseDraws.findIndex(d => same(d, prev))
const history = prevIdx >= 0 ? baseDraws.slice(0, prevIdx + 1) : [...baseDraws, prev]

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
    ['S+1', S + 1, 'neighbor'], ['S-1', S - 1, 'neighbor'], ['S+2', S + 2, 'neighbor'], ['S-2', S - 2, 'neighbor'],
    ['S+5', S + 5, 'offset'], ['S-5', S - 5, 'offset'], ['S+7', S + 7, 'offset'], ['S-7', S - 7, 'offset'], ['S+10', S + 10, 'edge'], ['S-10', S - 10, 'edge'],
    ['S+ct', S + ct, 'ct'], ['S-ct', S - ct, 'ct'], ['S+ct-1', S + ct - 1, 'ct'], ['S-ct+1', S - ct + 1, 'ct'], ['ct-S', ct - S, 'ct'],
    ['S+SWapp', S + SWa, 'app'], ['S-SWapp', S - SWa, 'app'], ['S+NWapp', S + NWa, 'app'], ['S-NWapp', S - NWa, 'app'], ['S+appSum', S + appSum, 'app'], ['S-appSum', S - appSum, 'app'],
    ['S+appDiff', S + appDiff, 'balance'], ['S-appDiff', S - appDiff, 'balance'], ['NWapp+ct', NWa + ct, 'appct'], ['SWapp+ct', SWa + ct, 'appct'], ['NWapp+SWapp+ct', NWa + SWa + ct, 'appct'],
    ['SW-SWapp', SW - SWa, 'miss'], ['SW+SWapp', SW + SWa, 'miss'], ['SW-SWmiss', SW - SWm, 'miss'], ['SW+SWmiss', SW + SWm, 'miss'], ['SWmiss', SWm, 'miss'], ['SW-NWapp', SW - NWa, 'miss'], ['SW+NWapp', SW + NWa, 'miss'], ['SW-ct', SW - ct, 'miss'], ['SW+ct', SW + ct, 'miss'],
    ['NW-SWapp', NW - SWa, 'miss'], ['NW+SWapp', NW + SWa, 'miss'], ['NW-NWapp', NW - NWa, 'miss'], ['NW+NWapp', NW + NWa, 'miss'], ['NW-SWmiss', NW - SWm, 'miss'], ['NW+NWmiss', NW + NWm, 'miss'], ['NW-ct', NW - ct, 'reach'], ['NW+ct', NW + ct, 'reach'],
    ['NW-S', NW - S, 'reach'], ['S-NW', S - NW, 'reach'], ['SW-S', SW - S, 'reach'], ['S-SW', S - SW, 'reach'], ['NWmiss-SWmiss', NWm - SWm, 'balance'], ['SWmiss-NWmiss', SWm - NWm, 'balance'], ['ct+missDiff', ct + missDiff, 'balance'], ['ct-missDiff', ct - missDiff, 'balance'], ['appSum-missDiff', appSum - missDiff, 'balance'], ['missDiff+appDiff', missDiff + appDiff, 'balance'],
  ]
  return defs.map(([name, raw, group]) => ({ seed: S, name, raw, n: wrap(raw), group, wrapped: wrap(raw) !== raw }))
}

const stats = prev.map(seed => beamStats(history, seed))
const formulas = stats.flatMap(formulaList)
const pred = computeHybridPrediction(history)
const top20 = pred.results.slice(0, 20).map(r => r.number)
const top30 = pred.results.slice(0, 30).map(r => r.number)

console.log('Previous D' + history.length + ':', prev.join(','), 'zone', zoneSig(prev), 'sum', prev.reduce((a,b)=>a+b,0))
console.log('Actual next:', actual.join(','), 'zone', zoneSig(actual), 'sum', actual.reduce((a,b)=>a+b,0))
console.log('\nStats:')
stats.forEach(s => console.log(`${s.S}: NW=${s.NW} NW_app=${s.NW_app} NW_miss=${s.NW_miss} SW=${s.SW} SW_app=${s.SW_app} SW_miss=${s.SW_miss} ctTotal=${s.ctTotal}`))
console.log('\nHybrid top20:', top20.join(','))
console.log('Top20 hits:', actual.filter(n => top20.includes(n)).join(','), `${actual.filter(n => top20.includes(n)).length}/5`)
console.log('Top30 hits:', actual.filter(n => top30.includes(n)).join(','), `${actual.filter(n => top30.includes(n)).length}/5`)
console.log('\nActual ranks:')
for (const n of actual) {
  const r = pred.results.find(x => x.number === n)
  console.log(n, r ? `rank #${pred.results.indexOf(r)+1} score=${r.score} raw=${r.rawScore} reasons=${r.reasons.slice(0,8).join(' | ')}` : 'not ranked')
}
console.log('\nFormula hits:')
for (const n of actual) {
  const hits = formulas.filter(f => f.n === n)
  console.log(`\n${n}: ${hits.length} formulas`)
  hits.sort((a,b)=>a.wrapped-b.wrapped || a.seed-b.seed || a.name.localeCompare(b.name)).slice(0,35)
    .forEach(f => console.log(`  seed ${f.seed}: ${f.name} = ${f.raw}${f.wrapped ? ' -> ' + f.n : ''} [${f.group}]`))
}
console.log('\nNearest movement map:')
for (const n of actual) {
  const moves = prev.map(s => ({ s, d: n - s, abs: Math.abs(n - s) })).sort((a,b)=>a.abs-b.abs).slice(0,5)
  console.log(`${n}: ${moves.map(m => `${m.s}${m.d >= 0 ? '+' : ''}${m.d}`).join('  ')}`)
}
console.log('\nMissed from top20:')
for (const n of actual.filter(n => !top20.includes(n))) {
  const hits = formulas.filter(f => f.n === n)
  console.log(`${n}: formula-backed ${hits.length}; ${hits.slice(0,10).map(f => `${f.seed}:${f.name}`).join(' | ')}`)
}
