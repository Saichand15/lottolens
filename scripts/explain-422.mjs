import fs from 'fs'
import { computeFormulaAgent } from '../src/utils/formulaAgent.js'
import { computeAutoSequence } from '../src/utils/autoSequence.js'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))
const manualBefore = [
  [2, 9, 15, 21, 25],
  [1, 3, 15, 20, 27],
  [10, 18, 19, 21, 40],
]
const previous = [10, 18, 19, 21, 40]
const actual = [22, 27, 32, 34, 39]
const drawsBefore = [...baseDraws, ...manualBefore]
const drawsWithActual = [...drawsBefore, actual]

const agent = computeFormulaAgent(drawsBefore)
const auto = computeAutoSequence(drawsBefore)
const hybrid = computeHybridPrediction(drawsBefore)
const hMap = new Map(hybrid.results.map((r, i) => [r.number, { ...r, rank: i + 1 }]))
const aMap = new Map(agent.ranked.map((r, i) => [r.number, { ...r, rank: i + 1 }]))
const laserMap = new Map(agent.laser.map(r => [r.number, r]))
const spiderMap = new Map(agent.spider.map(r => [r.number, r]))

const zones = [[1,9], [10,19], [20,29], [30,39], [40,45]]
const sig = d => zones.map(([a,b]) => d.filter(n => n >= a && n <= b).length).join('')
const hits = (pool) => actual.filter(n => pool.includes(n))

console.log('Previous:', previous.join(','), 'sig', sig(previous), 'sum', previous.reduce((a,b)=>a+b,0))
console.log('Actual:', actual.join(','), 'sig', sig(actual), 'sum', actual.reduce((a,b)=>a+b,0))
console.log('\nAgent primary:', agent.primary.map(r=>r.number).join(','), 'hits', hits(agent.primary.map(r=>r.number)).join(',') || '-')
console.log('Laser primary:', agent.laserPrimary.map(r=>r.number).join(','), 'hits', hits(agent.laserPrimary.map(r=>r.number)).join(',') || '-')
console.log('Spider primary:', agent.spiderPrimary.map(r=>r.number).join(','), 'hits', hits(agent.spiderPrimary.map(r=>r.number)).join(',') || '-')
console.log('Agent cover20:', agent.cover20.map(r=>r.number).join(','), 'hits', hits(agent.cover20.map(r=>r.number)).join(',') || '-')
console.log('Auto cover20:', auto.cover20.map(r=>r.number).join(','), 'hits', hits(auto.cover20.map(r=>r.number)).join(',') || '-')
console.log('Hybrid top20:', hybrid.results.slice(0,20).map(r=>r.number).join(','), 'hits', hits(hybrid.results.slice(0,20).map(r=>r.number)).join(',') || '-')

console.log('\nActual ranks/details:')
actual.forEach(n => {
  const ar = aMap.get(n)
  const hr = hMap.get(n)
  const lr = laserMap.get(n)
  const sr = spiderMap.get(n)
  console.log(`${n}: agent#${ar?.rank || 'NA'} score=${ar?.score || 0} hybrid#${hr?.rank || 'NA'} hscore=${hr?.score || 0} laser#${lr?.rank || 'NA'} lscore=${lr?.score || 0} spider#${sr?.rank || 'NA'} sscore=${sr?.score || 0}`)
  if (ar) console.log('  formulas:', ar.formulas.slice(0,10).join(' | '))
  if (sr) console.log('  spider:', sr.pathTypes.slice(0,10).join(' | '), 'talkers:', sr.talkers.join(','))
  if (sr) console.log('  first paths:', sr.paths.slice(0,8).map(p => `${p.type}${p.from ? ':'+p.from+'->'+n : ''}${p.seed ? ':seed'+p.seed : ''}${p.dir ? ':'+p.dir : ''}${p.step ? ':s'+p.step : ''}`).join(' ; '))
  if (lr) console.log('  laser first:', lr.details.slice(0,6).map(d => `${d.type}@${d.seed}/${d.dir}/s${d.step}->${n}`).join(' ; '))
})

console.log('\nTop laser:', agent.laser.slice(0,25).map(r=>`${r.number}#${r.rank}:${r.score}`).join(', '))
console.log('\nTop spider:', agent.spider.slice(0,25).map(r=>`${r.number}#${r.rank}:${r.score}`).join(', '))
console.log('\nShape options:', agent.shapeOptions.slice(0,10).map(s=>`${s.signature}:${s.score.toFixed(1)}`).join(', '))

const nextAgent = computeFormulaAgent(drawsWithActual)
console.log('\nAfter appending actual, next agent primary:', nextAgent.primary.map(r=>r.number).join(','))
console.log('Next laser primary:', nextAgent.laserPrimary.map(r=>r.number).join(','))
console.log('Next spider primary:', nextAgent.spiderPrimary.map(r=>r.number).join(','))
console.log('Next cover20:', nextAgent.cover20.map(r=>r.number).join(','))
