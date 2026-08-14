import fs from 'fs'
import { computeAutoSequence, computeSequenceReplay } from '../src/utils/autoSequence.js'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const zones = [[1,9], [10,19], [20,29], [30,39], [40,45]]
const zoneOf = n => zones.findIndex(([a,b]) => n >= a && n <= b)
const zc = d => zones.map(([a,b]) => d.filter(n => n >= a && n <= b).length)
const zsig = d => zc(d).join('')
const sum = d => d.reduce((a,b)=>a+b,0)
const odd = d => d.filter(n => n % 2).length
const range = d => d[d.length - 1] - d[0]
const consecutivePairs = d => d.filter((n, i) => i && n === d[i-1] + 1).length

function stats(rows) {
  const s = { count: rows.length, primary: 0, top10: 0, top20: 0, missed20: 0 }
  for (const r of rows) {
    s.primary += r.primaryHits.length
    s.top10 += r.exact10.length
    s.top20 += r.exact20.length
    s.missed20 += r.missed20.length
  }
  for (const k of ['primary','top10','top20','missed20']) s[k] = +(s[k] / rows.length).toFixed(2)
  return s
}

const replay = computeSequenceReplay(draws, { limit: 'all' }).reverse()
console.log('OVERALL', stats(replay))

const bad = replay.filter(r => r.primaryHits.length <= 1 && r.exact20.length >= 3)
console.log('Selection failures primary<=1 but top20>=3:', bad.length)

const buckets = new Map()
for (const r of replay) {
  const key = zsig(r.seeds)
  if (!buckets.has(key)) buckets.set(key, [])
  buckets.get(key).push(r)
}
console.log('\nWorst zone-shape selection buckets (min 5):')
;[...buckets.entries()]
  .filter(([, rows]) => rows.length >= 5)
  .map(([key, rows]) => ({ key, ...stats(rows) }))
  .sort((a,b) => a.primary - b.primary)
  .slice(0, 20)
  .forEach(x => console.log(x))

console.log('\nRecent failures:')
bad.slice(-25).forEach(r => {
  console.log(`D${r.prevDrawNum}->D${r.drawNum} seeds ${r.seeds.join(',')} z${zsig(r.seeds)} sum${sum(r.seeds)} odd${odd(r.seeds)} range${range(r.seeds)} cons${consecutivePairs(r.seeds)} actual ${r.actual.join(',')} z${zsig(r.actual)} primary ${r.primary.join(',')} hit${r.primaryHits.length} top20hit${r.exact20.length} missed20 ${r.missed20.join(',')}`)
  console.log(' actual ranks:', r.actualRank.map(a => `${a.number}#${a.rank || 'X'}:${a.explanation}`).join(' | '))
})

console.log('\nMissed top20 reasons by number/zone:')
const missZone = [0,0,0,0,0]
const missNums = new Map()
for (const r of replay) {
  for (const n of r.missed20) {
    missZone[zoneOf(n)]++
    missNums.set(n, (missNums.get(n) || 0) + 1)
  }
}
console.log('missZone', missZone)
console.log([...missNums.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([n,c])=>`${n}:${c}`).join(' '))

console.log('\nRank distribution of actuals:')
const rankBuckets = { top5:0, top10:0, top20:0, top30:0, outside30:0 }
for (const r of replay) for (const a of r.actualRank) {
  if (a.rank <= 5) rankBuckets.top5++
  else if (a.rank <= 10) rankBuckets.top10++
  else if (a.rank <= 20) rankBuckets.top20++
  else if (a.rank <= 30) rankBuckets.top30++
  else rankBuckets.outside30++
}
console.log(rankBuckets)
