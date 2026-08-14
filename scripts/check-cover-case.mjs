import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'
import { computeSequenceReplay } from '../src/utils/autoSequence.js'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const prev = [1, 23, 34, 36, 40]
const actual = [11, 16, 30, 37, 38]
const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i])
let idx = draws.findIndex(d => same(d, prev))
if (idx < 0) {
  const actualIdx = draws.findIndex(d => same(d, actual))
  console.log('previous exact draw not found in local JSON; actual index', actualIdx, 'drawNum', actualIdx + 1, 'previous there', draws[actualIdx - 1])
  idx = actualIdx - 1
}
console.log('prev index', idx, 'drawNum', idx + 1, 'next', draws[idx + 1])

const pred = computeHybridPrediction(draws.slice(0, idx + 1))
const top20 = pred.results.slice(0, 20).map(r => r.number)
console.log('top20', top20.join(','))
console.log('hits', actual.filter(n => top20.includes(n)).join(','), actual.filter(n => top20.includes(n)).length)
console.log('actual ranks')
for (const n of actual) {
  const r = pred.results.find(x => x.number === n)
  console.log(n, r ? `rank ${pred.results.indexOf(r) + 1} score ${r.score} raw ${r.rawScore} reasons ${r.reasons.slice(0, 8).join(' | ')}` : 'missing')
}

const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const bestIn = (res, min, max, used = new Set()) => res.find(r => r.number >= min && r.number <= max && !used.has(r.number))
const zoneIdx = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const zc = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length)
const strategies = {
  top5: res => res.slice(0, 5).map(r => r.number),
  original: (res, seeds) => {
    const used = new Set(), picks = [], counts = zc(seeds)
    const add = c => { if (c && !picks.some(p => p.number === c.number)) picks.push(c) }
    if (counts[0] === 0) add(bestIn(res, 1, 12, used)); picks.forEach(p => used.add(p.number))
    if (counts[3] === 0) add(bestIn(res, 30, 39, used)); picks.forEach(p => used.add(p.number))
    if (counts[4] === 0) add(bestIn(res, 37, 45, used) || bestIn(res, 30, 45, used)); picks.forEach(p => used.add(p.number))
    for (const r of res) if (picks.length < 5 && !used.has(r.number)) { picks.push(r); used.add(r.number) }
    return picks.map(r => r.number)
  },
  capZone2: res => {
    const picks = [], counts = [0, 0, 0, 0, 0]
    for (const r of res) {
      const zi = zoneIdx(r.number)
      if (picks.length < 5 && counts[zi] < 2) { picks.push(r.number); counts[zi]++ }
    }
    for (const r of res) if (picks.length < 5 && !picks.includes(r.number)) picks.push(r.number)
    return picks
  },
  edge1: res => [
    ...res.filter(r => r.number <= 12).slice(0, 1),
    ...res.filter(r => r.number >= 13 && r.number <= 29).slice(0, 2),
    ...res.filter(r => r.number >= 30 && r.number <= 39).slice(0, 1),
    ...res.filter(r => r.number >= 40).slice(0, 1),
  ].map(r => r.number),
}
console.log('selector policy hits')
for (const [name, fn] of Object.entries(strategies)) {
  const picks = fn(pred.results, pred.seeds)
  console.log(name, picks.join(','), 'hits', actual.filter(n => picks.includes(n)).join(','))
}

const replay = computeSequenceReplay(draws, { limit: 'all' })
const row = replay.find(r => r.prevDrawNum === idx + 1)
console.log('replay row', row && {
  prevDrawNum: row.prevDrawNum,
  drawNum: row.drawNum,
  seeds: row.seeds,
  actual: row.actual,
  top20: row.top20,
  exact20: row.exact20,
  missed20: row.missed20,
  primary: row.primary,
})
