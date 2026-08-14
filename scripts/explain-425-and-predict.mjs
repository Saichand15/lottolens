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
]
const actual = [6, 8, 12, 17, 37]
const manualAfter = [...manualBefore, actual]
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const sumOf = d => d.reduce((a, b) => a + b, 0)
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const oddCount = d => d.filter(n => n % 2).length
const gapSig = d => d.slice(1).map((n, i) => n - d[i])

function similarRows(draws, latest, threshold = 34) {
  const latestSig = sig(latest)
  const latestSum = sumOf(latest)
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
    const recency = 0.58 + (i / draws.length) * 0.86
    out.push({ i, from: d, next, sim, w: sim * recency })
  }
  return out
}

function distRank(rows, pickFn) {
  const m = new Map()
  for (const r of rows) {
    const vals = pickFn(r)
    for (const v of vals) m.set(v, (m.get(v) || 0) + r.w)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function explainMiss() {
  const drawsBefore = [...baseDraws, ...manualBefore]
  const prev = manualBefore.at(-1)
  const agent = computeFormulaAgent(drawsBefore)
  const auto = computeAutoSequence(drawsBefore)
  const hybrid = computeHybridPrediction(drawsBefore)
  const laserRank = new Map(agent.laser.map((r, i) => [r.number, i + 1]))
  const spiderRank = new Map(agent.spider.map((r, i) => [r.number, i + 1]))
  const agentRank = new Map(agent.ranked.map((r, i) => [r.number, i + 1]))
  const hybridRank = new Map(hybrid.results.map((r, i) => [r.number, i + 1]))
  const cover20 = new Set(agent.cover20.map(r => r.number))

  console.log('================ MISS EXPLANATION ================')
  console.log('Prev:', prev.join(','), 'sig', sig(prev), 'sum', sumOf(prev))
  console.log('Actual:', actual.join(','), 'sig', sig(actual), 'sum', sumOf(actual), 'gap', gapSig(actual).join('-'))
  console.log('Transition:', sig(prev), '->', sig(actual), '| sum change', sumOf(actual) - sumOf(prev))
  console.log('Agent selected shape:', agent.selectedShape, '| Agent primary:', agent.primary.map(r => r.number).join(','))
  console.log('Auto primary:', auto.primary.map(r => r.number).join(','))
  console.log('\nActual ranks before draw:')
  for (const n of actual) {
    console.log(`  ${String(n).padStart(2)}: laser#${laserRank.get(n) || '-'} spider#${spiderRank.get(n) || '-'} agent#${agentRank.get(n) || '-'} hybrid#${hybridRank.get(n) || '-'} cover20:${cover20.has(n) ? 'Y' : 'n'}`)
  }

  const similarBefore = similarRows(drawsBefore, prev, 30)
  const nextSigs = distRank(similarBefore, r => [sig(r.next)]).slice(0, 8)
  const firsts = distRank(similarBefore, r => [r.next[0]]).slice(0, 10)
  const collapse = similarBefore.filter(r => sumOf(r.next) <= 85 || sig(r.next)[0] >= '2').length
  console.log('\nHistorical similar-to-prev rows:', similarBefore.length)
  console.log('Top next shapes:', nextSigs.map(([k, v]) => `${k}:${v.toFixed(0)}`).join(', '))
  console.log('Top first numbers:', firsts.map(([k, v]) => `${k}:${v.toFixed(0)}`).join(', '))
  console.log('Collapse rows (sum<=85 or >=2 lows):', collapse, '/', similarBefore.length)
}

function predictNext() {
  const drawsAfter = [...baseDraws, ...manualAfter]
  const latest = actual
  const agent = computeFormulaAgent(drawsAfter)
  const auto = computeAutoSequence(drawsAfter)
  const hybrid = computeHybridPrediction(drawsAfter)
  const rows = similarRows(drawsAfter, latest, 34)

  const followNums = distRank(rows, r => r.next)
  const posDists = Array.from({ length: 5 }, (_, pos) => distRank(rows, r => [r.next[pos]]))
  const nextSigs = distRank(rows, r => [sig(r.next)]).slice(0, 10)
  const nextSums = rows.map(r => sumOf(r.next))
  const avgSum = nextSums.reduce((a, b) => a + b, 0) / Math.max(nextSums.length, 1)

  const blend = new Map()
  const why = new Map()
  const add = (n, pts, reason) => {
    blend.set(n, (blend.get(n) || 0) + pts)
    if (!why.has(n)) why.set(n, [])
    why.get(n).push(reason)
  }
  followNums.slice(0, 28).forEach(([n], i) => add(n, Math.max(0, 115 - i * 4), `history#${i + 1}`))
  agent.ranked.slice(0, 28).forEach((r, i) => add(r.number, Math.max(0, 95 - i * 3.2), `formula#${i + 1}`))
  agent.laser.slice(0, 28).forEach((r, i) => add(r.number, Math.max(0, 88 - i * 3.1), `laser#${i + 1}`))
  agent.spider.slice(0, 28).forEach((r, i) => add(r.number, Math.max(0, 82 - i * 2.9), `spider#${i + 1}`))
  hybrid.results.slice(0, 28).forEach((r, i) => add(r.number, Math.max(0, 68 - i * 2.2), `hybrid#${i + 1}`))

  const blended = [...blend.entries()].map(([n, pts]) => ({ n, pts, zone: zoneOf(n), why: why.get(n) || [] }))
    .sort((a, b) => b.pts - a.pts || a.n - b.n)

  function buildLine(targetShape) {
    const counts = targetShape.split('').map(Number)
    const used = new Set()
    const out = []
    counts.forEach((cnt, zi) => {
      const zc = blended.filter(r => r.zone === zi && !used.has(r.n)).slice(0, cnt)
      zc.forEach(r => { out.push(r.n); used.add(r.n) })
    })
    for (const r of blended) {
      if (out.length >= 5) break
      if (!used.has(r.n)) { out.push(r.n); used.add(r.n) }
    }
    return out.sort((a, b) => a - b)
  }

  const shapeCandidates = [...new Set([
    nextSigs[0]?.[0],
    agent.selectedShape,
    '12110', '21110', '22010', '11120', '11210', '11111'
  ].filter(Boolean))]
  const lines = shapeCandidates.map(shape => ({ shape, line: buildLine(shape) }))
    .filter(x => x.line.length === 5)
    .map(x => ({ ...x, sum: sumOf(x.line), sig: sig(x.line) }))

  console.log('\n================ NEXT PREDICTION ================')
  console.log('Latest:', latest.join(','), 'sig', sig(latest), 'sum', sumOf(latest), 'gap', gapSig(latest).join('-'))
  console.log('Historical matches:', rows.length, '| avg next sum:', avgSum.toFixed(0), '| sum range:', Math.min(...nextSums), '-', Math.max(...nextSums))
  console.log('Historical next shapes:', nextSigs.map(([k, v]) => `${k}:${v.toFixed(0)}`).join(', '))
  console.log('Agent selected shape:', agent.selectedShape, '| Auto primary:', auto.primary.map(r => r.number).join(','))
  console.log('Top history followers:', followNums.slice(0, 20).map(([n, v]) => `${n}(${v.toFixed(0)})`).join(', '))
  console.log('Top formula/agent:', agent.ranked.slice(0, 20).map((r, i) => `${r.number}#${i + 1}:L${r.laserRank || '-'}:S${r.spiderRank || '-'}`).join(', '))
  console.log('Top laser:', agent.laser.slice(0, 18).map(r => `${r.number}#${r.rank}`).join(', '))
  console.log('Top spider:', agent.spider.slice(0, 18).map(r => `${r.number}#${r.rank}`).join(', '))
  console.log('\nBlended top 25:')
  console.log(blended.slice(0, 25).map((r, i) => `${i + 1}.${r.n}(${r.pts.toFixed(0)}:${r.why.slice(0, 4).join('|')})`).join('  '))
  console.log('\nPosition history tops:')
  posDists.forEach((d, i) => console.log(`${i + 1}: ${d.slice(0, 8).map(([n, v]) => `${n}(${v.toFixed(0)})`).join(', ')}`))
  console.log('\nCandidate lines:')
  lines.forEach((l, i) => console.log(`${i + 1}. ${l.line.join(', ')}  sig=${l.sig} shapeAim=${l.shape} sum=${l.sum}`))
}

explainMiss()
predictNext()
