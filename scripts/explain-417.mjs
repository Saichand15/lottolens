import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const prev = [11, 16, 30, 37, 38]
const actual = [17, 26, 35, 42, 44]
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
const zones = [[1,9], [10,19], [20,29], [30,39], [40,45]]
const zoneSig = d => zones.map(([a,b]) => d.filter(n => n >= a && n <= b).length).join('')
const fmt = d => d.join(',')

function formulaList(s) {
  const S = s.S, NW = s.NW, NWa = s.NW_app, NWm = s.NW_miss, SW = s.SW, SWa = s.SW_app, SWm = s.SW_miss, ct = s.ctTotal
  const appSum = NWa + SWa
  const appDiff = SWa - NWa
  const missDiff = NWm - SWm
  const defs = [
    ['S+1', S + 1, 'neighbor'], ['S-1', S - 1, 'neighbor'], ['S+2', S + 2, 'neighbor'], ['S-2', S - 2, 'neighbor'],
    ['S+5', S + 5, 'offset'], ['S-5', S - 5, 'offset'], ['S+7', S + 7, 'offset'], ['S-7', S - 7, 'offset'],
    ['S+10', S + 10, 'edge'], ['S-10', S - 10, 'edge'],
    ['S+ct', S + ct, 'ct'], ['S-ct', S - ct, 'ct'], ['ct-S', ct - S, 'ct'], ['S+ct-1', S + ct - 1, 'ct'], ['S-ct+1', S - ct + 1, 'ct'],
    ['S+SWapp', S + SWa, 'app'], ['S-SWapp', S - SWa, 'app'], ['S+NWapp', S + NWa, 'app'], ['S-NWapp', S - NWa, 'app'],
    ['S+appSum', S + appSum, 'app'], ['S-appSum', S - appSum, 'app'], ['S+appDiff', S + appDiff, 'balance'], ['S-appDiff', S - appDiff, 'balance'],
    ['NWapp+ct', NWa + ct, 'appct'], ['SWapp+ct', SWa + ct, 'appct'], ['NWapp+SWapp+ct', NWa + SWa + ct, 'appct'],
    ['SW-SWapp', SW - SWa, 'miss'], ['SW+SWapp', SW + SWa, 'miss'], ['SW-SWmiss', SW - SWm, 'miss'], ['SW+SWmiss', SW + SWm, 'miss'], ['SWmiss', SWm, 'miss'],
    ['SW-NWapp', SW - NWa, 'miss'], ['SW+NWapp', SW + NWa, 'miss'], ['SW-ct', SW - ct, 'miss'], ['SW+ct', SW + ct, 'miss'],
    ['NW-SWapp', NW - SWa, 'miss'], ['NW+SWapp', NW + SWa, 'miss'], ['NW-NWapp', NW - NWa, 'miss'], ['NW+NWapp', NW + NWa, 'miss'],
    ['NW-SWmiss', NW - SWm, 'miss'], ['NW+NWmiss', NW + NWm, 'miss'], ['NW-ct', NW - ct, 'reach'], ['NW+ct', NW + ct, 'reach'],
    ['NW-S', NW - S, 'reach'], ['S-NW', S - NW, 'reach'], ['SW-S', SW - S, 'reach'], ['S-SW', S - SW, 'reach'],
    ['NWmiss-SWmiss', NWm - SWm, 'balance'], ['SWmiss-NWmiss', SWm - NWm, 'balance'], ['ct+missDiff', ct + missDiff, 'balance'], ['ct-missDiff', ct - missDiff, 'balance'],
    ['appSum-missDiff', appSum - missDiff, 'balance'], ['missDiff+appDiff', missDiff + appDiff, 'balance'],
  ]
  return defs.map(([name, raw, group]) => ({ seed: S, name, raw, n: wrap(raw), group, wrapped: wrap(raw) !== raw }))
}

const formulas = provided.flatMap(formulaList)
const byActual = actual.map(n => ({ n, hits: formulas.filter(f => f.n === n) }))

const pred = computeHybridPrediction(draws)
const results = pred.results
const top20 = results.slice(0, 20).map(r => r.number)
const top30 = results.slice(0, 30).map(r => r.number)

console.log('Previous D416:', fmt(prev), 'zone', zoneSig(prev), 'sum', prev.reduce((a,b)=>a+b,0))
console.log('Actual D417  :', fmt(actual), 'zone', zoneSig(actual), 'sum', actual.reduce((a,b)=>a+b,0))
console.log('\nHybrid top20:', top20.join(','))
console.log('Top20 hits:', actual.filter(n => top20.includes(n)).join(','), `${actual.filter(n => top20.includes(n)).length}/5`)
console.log('Top30 hits:', actual.filter(n => top30.includes(n)).join(','), `${actual.filter(n => top30.includes(n)).length}/5`)
console.log('\nActual ranks:')
for (const n of actual) {
  const r = results.find(x => x.number === n)
  console.log(n, r ? `rank #${results.indexOf(r)+1} score=${r.score} raw=${r.rawScore} reasons=${r.reasons.slice(0,8).join(' | ')}` : 'not ranked')
}

console.log('\nFormula hits from provided stats:')
for (const row of byActual) {
  console.log(`\n${row.n}: ${row.hits.length} formulas`)
  row.hits
    .sort((a,b) => a.wrapped - b.wrapped || a.seed - b.seed || a.name.localeCompare(b.name))
    .slice(0, 30)
    .forEach(f => console.log(`  seed ${f.seed}: ${f.name} = ${f.raw}${f.wrapped ? ' -> ' + f.n : ''} [${f.group}]`))
}

console.log('\nNearest movement map:')
for (const n of actual) {
  const moves = prev.map(s => ({ s, d: n - s, abs: Math.abs(n - s) })).sort((a,b)=>a.abs-b.abs).slice(0, 4)
  console.log(`${n}: ${moves.map(m => `${m.s}${m.d >= 0 ? '+' : ''}${m.d}`).join('  ')}`)
}

console.log('\nZone interpretation:')
console.log('Prev zone', zoneSig(prev), '-> actual zone', zoneSig(actual), 'meaning: boundary/mid/high/edge expansion, no low zone.')

console.log('\nWhat current engine missed:')
for (const n of actual.filter(n => !top20.includes(n))) {
  const hits = formulas.filter(f => f.n === n)
  console.log(`${n} was outside top20 but formula-backed by ${hits.length} formulas: ${hits.slice(0,8).map(f => `${f.seed}:${f.name}`).join(' | ')}`)
}
