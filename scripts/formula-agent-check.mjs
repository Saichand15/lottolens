import fs from 'fs'
import { computeFormulaAgent } from '../src/utils/formulaAgent.js'
import { computeAutoSequence } from '../src/utils/autoSequence.js'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const manual = [
  [2, 9, 15, 21, 25],
  [1, 3, 15, 20, 27],
  [10, 18, 19, 21, 40],
]
const draws = [...baseDraws, ...manual]
const agent = computeFormulaAgent(draws)
const auto = computeAutoSequence(draws)

console.log('Latest:', agent.current.join(','), 'sig:', agent.currentSig, 'regime:', agent.currentRegime)
console.log('Rows analyzed:', agent.rowsAnalyzed)
console.log('\nPredicted next shape:', agent.selectedShape)
console.log('Shape options:')
agent.shapeOptions.slice(0, 8).forEach((s, i) => {
  console.log(`${i + 1}. ${s.signature} score=${s.score.toFixed(1)} examples=${s.examples.map(e => `D${e.drawNum}:${e.transition}`).join(' | ')}`)
})

console.log('\nTop working formulas now:')
agent.topFormulas.slice(0, 15).forEach((f, i) => {
  console.log(`${String(i + 1).padStart(2)} ${f.name} score=${f.score.toFixed(1)} hits=${f.hits}/${f.tries} rate=${(f.hitRate * 100).toFixed(1)}% examples=${f.examples.map(e => `D${e.drawNum}->${e.number}`).join(',')}`)
})

console.log('\nLive laser decision ranking:')
agent.laser.slice(0, 20).forEach((l, i) => {
  const d = l.details[0]
  console.log(`${String(i + 1).padStart(2)} ${l.number} laser=${l.score} seeds=${l.seedsHit} dirs=${l.dirsHit} direct=${l.direct} corner=${l.corner} first=${d ? `${d.type}@${d.seed}/${d.dir}/s${d.step}` : '-'}`)
})

console.log('\nFormula Agent primary:', agent.primary.map(p => p.number).join(','))
agent.primary.forEach(p => {
  console.log(`${p.number}: score=${p.score} laser=${p.laserScore || 0} L#${p.laserRank || '-'} formulas=${p.formulas.slice(0, 8).join('|')}`)
})

console.log('\nLaser-only primary:', agent.laserPrimary.map(p => p.number).join(','))
agent.laserPrimary.forEach(p => {
  console.log(`${p.number}: laser=${p.laserScore} L#${p.laserRank} seeds=${p.laserSeeds} direct=${p.laserDirect} corner=${p.laserCorner}`)
})

console.log('\nSpider movement ranking:')
agent.spider.slice(0, 20).forEach(s => {
  const first = s.paths[0]
  const motion = first ? `${first.type}${first.from ? ` ${first.from}->${s.number}` : ''}${first.seed ? ` seed${first.seed}` : ''}` : '-'
  console.log(`#${s.rank} ${s.number} spider=${s.score} laser=${s.laserScore || 0} L#${s.laserRank || '-'} talkers=${s.talkers.join(',') || '-'} paths=${s.pathTypes.slice(0, 5).join('|')} first=${motion}`)
})

console.log('\nSpider-only primary:', agent.spiderPrimary.map(p => p.number).join(','))
agent.spiderPrimary.forEach(p => {
  console.log(`${p.number}: spider=${p.spiderScore} S#${p.spiderRank} paths=${p.spiderPaths.join('|')} talkers=${p.spiderTalkers.join(',') || '-'}`)
})

console.log('\nFormula Agent cover20:', agent.cover20.map(p => p.number).join(','))
console.log('Auto primary:', auto.primary.map(p => p.number).join(','))
console.log('Auto cover20:', auto.cover20.map(p => p.number).join(','))
