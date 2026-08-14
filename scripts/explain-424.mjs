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
]
const actual = [3, 16, 27, 29, 39]
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)

// Agent state BEFORE the actual draw (history ends at 3,4,11,17,20)
const draws = [...baseDraws, ...manual]
const prev = manual.at(-1)
const agent = computeFormulaAgent(draws)

console.log('Prev draw :', prev.join(','), 'sig', sig(prev), 'sum', prev.reduce((a, b) => a + b, 0))
console.log('ACTUAL    :', actual.join(','), 'sig', sig(actual), 'sum', actual.reduce((a, b) => a + b, 0))
console.log('Transition:', sig(prev), '->', sig(actual))
console.log('\nAgent selected shape:', agent.selectedShape)
console.log('Shape options:', agent.shapeOptions.slice(0, 10).map(s => `${s.signature}:${s.score.toFixed(1)}`).join(', '))
console.log('Agent primary :', agent.primary.map(r => r.number).join(','))
console.log('Laser primary :', agent.laserPrimary.map(r => r.number).join(','))
console.log('Spider primary:', agent.spiderPrimary.map(r => r.number).join(','))

console.log('\n=== Where did each ACTUAL number rank? ===')
const laserRank = new Map(agent.laser.map((r, i) => [r.number, i + 1]))
const spiderRank = new Map(agent.spider.map((r, i) => [r.number, i + 1]))
const agentRank = new Map(agent.ranked.map((r, i) => [r.number, i + 1]))
const coverSet = new Set(agent.cover20.map(r => r.number))
for (const n of actual) {
  console.log(`  ${String(n).padStart(2)} (zone ${zoneOf(n)}): laser#${laserRank.get(n) || '-'}  spider#${spiderRank.get(n) || '-'}  agent#${agentRank.get(n) || '-'}  cover20:${coverSet.has(n) ? 'YES' : 'no'}`)
}

console.log('\nTop laser :', agent.laser.slice(0, 25).map(r => `${r.number}#${r.rank}`).join(', '))
console.log('\nTop spider:', agent.spider.slice(0, 25).map(r => `${r.number}#${r.rank}`).join(', '))
console.log('\nAgent ranked:', agent.ranked.slice(0, 25).map((r, i) => `${r.number}#${i + 1}`).join(', '))
console.log('\nCover20:', agent.cover20.map(r => r.number).join(','))

const hits = actual.filter(n => coverSet.has(n)).length
console.log(`\nCover20 hits: ${hits}/5`)
