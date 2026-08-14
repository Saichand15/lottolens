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
  [22, 27, 32, 34, 39],
  [3, 4, 11, 17, 20],
  [3, 16, 27, 29, 39],
  [6, 8, 12, 17, 37],
]
const actual = [2, 19, 22, 25, 31]
const manualAfter = [...manualBefore, actual]
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const sumOf = d => d.reduce((a, b) => a + b, 0)
const oddCount = d => d.filter(n => n % 2).length
const gapSig = d => d.slice(1).map((n, i) => n - d[i])

function similarRows(draws, latest, threshold = 34) {
  const latestSig = sig(latest), latestSum = sumOf(latest)
  const out = []
  for (let i = 0; i < draws.length - 1; i++) {
    const d = draws[i], next = draws[i + 1]
    let sim = 0
    if (sig(d) === latestSig) sim += 42
    const ds = sig(d).split('').map(Number), ls = latestSig.split('').map(Number)
    sim += Math.max(0, 22 - ds.reduce((a, v, k) => a + Math.abs(v - ls[k]), 0) * 4)
    sim += Math.max(0, 22 - Math.abs(sumOf(d) - latestSum) / 4)
    sim += Math.max(0, 8 - Math.abs(oddCount(d) - oddCount(latest)) * 2)
    sim += latest.reduce((a, n) => a + (d.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0) * 4
    if (sim < threshold) continue
    out.push({ idx: i, from: d, next, w: sim * (0.58 + (i / draws.length) * 0.86), sim })
  }
  return out
}

function rankMap(arr, key = 'number') {
  return new Map(arr.map((r, i) => [r[key], i + 1]))
}
function distRank(rows, pickFn) {
  const m = new Map()
  for (const r of rows) for (const v of pickFn(r)) m.set(v, (m.get(v) || 0) + r.w)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function explainMiss() {
  const drawsBefore = [...baseDraws, ...manualBefore]
  const prev = manualBefore.at(-1)
  const agent = computeFormulaAgent(drawsBefore)
  const auto = computeAutoSequence(drawsBefore)
  const hybrid = computeHybridPrediction(drawsBefore)
  const rows = similarRows(drawsBefore, prev)
  const historyFollowers = distRank(rows, r => r.next)
  const historyRank = new Map(historyFollowers.map(([n], i) => [n, i + 1]))
  const posDists = Array.from({ length: 5 }, (_, pos) => distRank(rows, r => [r.next[pos]]))

  const laserRank = rankMap(agent.laser)
  const spiderRank = rankMap(agent.spider)
  const agentRank = rankMap(agent.ranked)
  const hybridRank = rankMap(hybrid.results)
  const cover20 = new Set(agent.cover20.map(r => r.number))

  console.log('================ MISS EXPLANATION ================')
  console.log('Prev:', prev.join(','), 'sig', sig(prev), 'sum', sumOf(prev), 'gap', gapSig(prev).join('-'))
  console.log('Actual:', actual.join(','), 'sig', sig(actual), 'sum', sumOf(actual), 'gap', gapSig(actual).join('-'))
  console.log('Transition:', sig(prev), '->', sig(actual), '| sum change', sumOf(actual) - sumOf(prev))
  console.log('Agent selected shape:', agent.selectedShape, '| Agent primary:', agent.primary.map(r => r.number).join(','))
  console.log('Auto primary:', auto.primary.map(r => r.number).join(','))
  console.log('\nActual number ranks BEFORE draw:')
  actual.forEach((n, pos) => {
    const pRank = new Map(posDists[pos].map(([x], i) => [x, i + 1])).get(n) || '-'
    console.log(` ${n.toString().padStart(2)} pos${pos + 1}: historyAll#${historyRank.get(n) || '-'} pos#${pRank} laser#${laserRank.get(n) || '-'} spider#${spiderRank.get(n) || '-'} formula#${agentRank.get(n) || '-'} hybrid#${hybridRank.get(n) || '-'} cover20:${cover20.has(n) ? 'Y' : 'n'}`)
  })

  console.log('\nHistorical shape pressure from prev:')
  console.log(distRank(rows, r => [sig(r.next)]).slice(0, 12).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(', '))
  console.log('\nPosition history tops from prev:')
  posDists.forEach((d, i) => console.log(`${i + 1}: ${d.slice(0, 10).map(([n, v]) => `${n}(${v.toFixed(0)})`).join(', ')}`))
  console.log('\nTop all-history followers:', historyFollowers.slice(0, 28).map(([n, v]) => `${n}(${v.toFixed(0)})`).join(', '))

  const midCompressionRows = rows.filter(r => sig(r.next) === '11310' || (r.next.filter(n => n >= 20 && n <= 31).length >= 3 && sumOf(r.next) <= 115))
  console.log('\nMiddle compression rows:', midCompressionRows.length, '/', rows.length)
  console.log('Middle compression examples:')
  midCompressionRows.slice(-12).forEach(r => console.log(` ${r.from.join(',')} -> ${r.next.join(',')} sig=${sig(r.next)} sum=${sumOf(r.next)}`))
}

function predictNext() {
  const drawsAfter = [...baseDraws, ...manualAfter]
  const latest = actual
  const rows = similarRows(drawsAfter, latest, 34)
  const agent = computeFormulaAgent(drawsAfter)
  const auto = computeAutoSequence(drawsAfter)
  const hybrid = computeHybridPrediction(drawsAfter)

  const historyFollowers = distRank(rows, r => r.next)
  const shapePressure = distRank(rows, r => [sig(r.next)])
  const posDists = Array.from({ length: 5 }, (_, pos) => distRank(rows, r => [r.next[pos]]))
  const sums = rows.map(r => sumOf(r.next))
  const targetSum = rows.reduce((a, r) => a + sumOf(r.next) * r.w, 0) / rows.reduce((a, r) => a + r.w, 0)

  const live = new Map(), why = new Map()
  const add = (n, pts, reason) => {
    live.set(n, (live.get(n) || 0) + pts)
    if (!why.has(n)) why.set(n, [])
    why.get(n).push(reason)
  }
  historyFollowers.slice(0, 32).forEach(([n], i) => add(n, Math.max(0, 125 - i * 3.5), `history#${i + 1}`))
  agent.ranked.slice(0, 32).forEach((r, i) => add(r.number, Math.max(0, 108 - i * 3), `formula#${i + 1}`))
  agent.laser.slice(0, 32).forEach((r, i) => add(r.number, Math.max(0, 98 - i * 2.8), `laser#${i + 1}`))
  agent.spider.slice(0, 32).forEach((r, i) => add(r.number, Math.max(0, 92 - i * 2.6), `spider#${i + 1}`))
  hybrid.results.slice(0, 32).forEach((r, i) => add(r.number, Math.max(0, 68 - i * 2), `hybrid#${i + 1}`))

  const blended = [...live.entries()].map(([n, pts]) => ({ n, pts, zone: zoneOf(n), why: why.get(n) || [] }))
    .sort((a, b) => b.pts - a.pts || a.n - b.n)

  const topShapes = [...new Set([shapePressure[0]?.[0], shapePressure[1]?.[0], agent.selectedShape, '11111', '12110', '11210', '21110', '11120'].filter(Boolean))]
  function buildLine(shape) {
    const counts = shape.split('').map(Number)
    const used = new Set(), out = []
    counts.forEach((cnt, zi) => {
      const cands = blended.filter(r => r.zone === zi && !used.has(r.n)).slice(0, cnt)
      cands.forEach(r => { out.push(r.n); used.add(r.n) })
    })
    for (const r of blended) if (out.length < 5 && !used.has(r.n)) { out.push(r.n); used.add(r.n) }
    return out.sort((a, b) => a - b)
  }

  console.log('\n================ NEXT PREDICTION ================')
  console.log('Latest:', latest.join(','), 'sig', sig(latest), 'sum', sumOf(latest), 'gap', gapSig(latest).join('-'))
  console.log('Historical matches:', rows.length, '| target avg sum:', targetSum.toFixed(1), '| range:', Math.min(...sums), '-', Math.max(...sums))
  console.log('Shape pressure:', shapePressure.slice(0, 12).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(', '))
  console.log('Agent selected shape:', agent.selectedShape, '| Auto:', auto.primary.map(r => r.number).join(','))
  console.log('Top history followers:', historyFollowers.slice(0, 25).map(([n, v]) => `${n}(${v.toFixed(0)})`).join(', '))
  console.log('Top formula:', agent.ranked.slice(0, 22).map((r, i) => `${r.number}#${i + 1}:L${r.laserRank || '-'}:S${r.spiderRank || '-'}`).join(', '))
  console.log('Top laser:', agent.laser.slice(0, 20).map(r => `${r.number}#${r.rank}`).join(', '))
  console.log('Top spider:', agent.spider.slice(0, 20).map(r => `${r.number}#${r.rank}`).join(', '))
  console.log('\nBlended top 30:', blended.slice(0, 30).map((r, i) => `${i + 1}.${r.n}(${r.pts.toFixed(0)}:${r.why.slice(0, 4).join('|')})`).join('  '))
  console.log('\nPosition history tops:')
  posDists.forEach((d, i) => console.log(`${i + 1}: ${d.slice(0, 8).map(([n, v]) => `${n}(${v.toFixed(0)})`).join(', ')}`))
  console.log('\nCandidate lines:')
  topShapes.forEach((shape, i) => {
    const line = buildLine(shape)
    console.log(`${i + 1}. ${line.join(', ')}  sig=${sig(line)} aim=${shape} sum=${sumOf(line)}`)
  })
}

explainMiss()
predictNext()
