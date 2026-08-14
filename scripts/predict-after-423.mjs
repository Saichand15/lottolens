import fs from 'fs'
import { computeFormulaAgent } from '../src/utils/formulaAgent.js'
import { computeAutoSequence } from '../src/utils/autoSequence.js'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))
const manual = [
  [2, 9, 15, 21, 25],
  [1, 3, 15, 20, 27],
  [10, 18, 19, 21, 40],
  [22, 27, 32, 34, 39],
  [3, 4, 11, 17, 20],
]
const draws = [...baseDraws, ...manual]
const latest = manual.at(-1)
const zones = [[1,9], [10,19], [20,29], [30,39], [40,45]]
const sig = d => zones.map(([a,b]) => d.filter(n => n >= a && n <= b).length).join('')
const zoneOf = n => zones.findIndex(([a,b]) => n >= a && n <= b)
const agent = computeFormulaAgent(draws)
const auto = computeAutoSequence(draws)
const hybrid = computeHybridPrediction(draws)

function pickBySeats(pool, seats) {
  const byN = new Map(pool.map(r => [r.number, r]))
  const used = new Set()
  const out = []
  for (const group of seats) {
    const found = group.find(n => byN.has(n) && !used.has(n))
    if (found) { out.push(found); used.add(found) }
  }
  return out.sort((a,b)=>a-b)
}

const combined = new Map()
const add = (n, pts, why) => {
  if (!combined.has(n)) combined.set(n, { n, pts: 0, why: [] })
  const r = combined.get(n)
  r.pts += pts
  r.why.push(why)
}
agent.ranked.slice(0, 30).forEach((r,i)=>add(r.number, Math.max(0, 90-i*2.2), `agent#${i+1}`))
agent.laser.slice(0, 30).forEach((r,i)=>add(r.number, Math.max(0, 92-i*2.4), `laser#${i+1}`))
agent.spider.slice(0, 30).forEach((r,i)=>add(r.number, Math.max(0, 96-i*2.5), `spider#${i+1}`))
hybrid.results.slice(0, 30).forEach((r,i)=>add(r.number, Math.max(0, 70-i*1.8), `hybrid#${i+1}`))

// Avoid over-tight same-zone line after 22100 collapse: choose rebound seats instead.
// Candidate formations from shape options: keep low anchor, 1-2 teens, one 20s, one high/edge.
const ranked = [...combined.values()].sort((a,b)=>b.pts-a.pts || a.n-b.n)
const shapeOptions = agent.shapeOptions.map(s => s.signature)
const seatLines = [
  pickBySeats(ranked.map(r => ({ number:r.n })), [[5,6,7,8,9,3,4], [14,15,16], [18,19,17], [20,21,22,25,29], [30,32,33,34,42,44]]),
  pickBySeats(ranked.map(r => ({ number:r.n })), [[5,6,7,8], [10,11,12,13], [15,16,17,18,19], [20,21,22,25], [29,30,32,33,34]]),
  pickBySeats(ranked.map(r => ({ number:r.n })), [[3,4,5,6,7,8], [14,15,16,17], [20,21,22], [29,30,32], [33,34,42,44]]),
]

console.log('Latest:', latest.join(','), 'sig', sig(latest), 'sum', latest.reduce((a,b)=>a+b,0))
console.log('Agent selected shape:', agent.selectedShape)
console.log('Shape options:', agent.shapeOptions.slice(0,10).map(s=>`${s.signature}:${s.score.toFixed(1)}`).join(', '))
console.log('\nAgent primary:', agent.primary.map(r=>r.number).join(','))
console.log('Laser primary:', agent.laserPrimary.map(r=>r.number).join(','))
console.log('Spider primary:', agent.spiderPrimary.map(r=>r.number).join(','))
console.log('Auto primary:', auto.primary.map(r=>r.number).join(','))
console.log('\nTop laser:', agent.laser.slice(0,25).map(r=>`${r.number}#${r.rank}:${r.score}`).join(', '))
console.log('\nTop spider:', agent.spider.slice(0,25).map(r=>`${r.number}#${r.rank}:${r.score}:${r.pathTypes.slice(0,4).join('|')}`).join(', '))
console.log('\nAgent ranked:', agent.ranked.slice(0,25).map((r,i)=>`${r.number}#${i+1}:${r.score}:L${r.laserRank||'-'}:S${r.spiderRank||'-'}`).join(', '))
console.log('\nCombined top30:', ranked.slice(0,30).map((r,i)=>`${i+1}.${r.n}(${r.pts.toFixed(1)}:${r.why.slice(0,4).join('|')})`).join('  '))
console.log('\nSeat-built lines:')
seatLines.forEach((line,i)=>console.log(`${i+1}: ${line.join(',')}`))
console.log('\nCover20:', ranked.slice(0,20).map(r=>r.n).join(','))
