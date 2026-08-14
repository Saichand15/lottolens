import fs from 'fs'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const zc = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length)
const bestIn = (res, min, max, used = new Set()) => res.find(r => r.number >= min && r.number <= max && !used.has(r.number))
const zoneIdx = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const add = (arr, c) => {
  if (c && !arr.some(p => p.number === c.number)) {
    arr.push(c)
    return true
  }
  return false
}

function original(res, seeds) {
  const used = new Set()
  const picks = []
  const counts = zc(seeds)
  if (counts[0] === 0) add(picks, bestIn(res, 1, 12, used))
  picks.forEach(p => used.add(p.number))
  if (counts[3] === 0) add(picks, bestIn(res, 30, 39, used))
  picks.forEach(p => used.add(p.number))
  if (counts[4] === 0) add(picks, bestIn(res, 37, 45, used) || bestIn(res, 30, 45, used))
  picks.forEach(p => used.add(p.number))
  for (const r of res) {
    if (picks.length < 5 && !used.has(r.number)) {
      picks.push(r)
      used.add(r.number)
    }
  }
  return picks.map(r => r.number)
}

const strategies = {
  top5: res => res.slice(0, 5).map(r => r.number),
  original,
  capZone2: res => {
    const picks = []
    const counts = [0, 0, 0, 0, 0]
    for (const r of res) {
      const zi = zoneIdx(r.number)
      if (picks.length < 5 && counts[zi] < 2) {
        picks.push(r.number)
        counts[zi]++
      }
    }
    for (const r of res) if (picks.length < 5 && !picks.includes(r.number)) picks.push(r.number)
    return picks
  },
  onePerZone: res => zones.map(([a, b]) => bestIn(res, a, b)).filter(Boolean).map(r => r.number),
  lowHigh: res => [
    ...res.filter(r => r.number <= 19).slice(0, 2),
    ...res.filter(r => r.number >= 20 && r.number <= 39).slice(0, 2),
    ...res.filter(r => r.number >= 40).slice(0, 1),
  ].map(r => r.number),
  noEdge: res => [...res.filter(r => r.number <= 39).slice(0, 5)].map(r => r.number),
  edge1: res => [
    ...res.filter(r => r.number <= 12).slice(0, 1),
    ...res.filter(r => r.number >= 13 && r.number <= 29).slice(0, 2),
    ...res.filter(r => r.number >= 30 && r.number <= 39).slice(0, 1),
    ...res.filter(r => r.number >= 40).slice(0, 1),
  ].map(r => r.number),
}

const scores = Object.fromEntries(Object.keys(strategies).map(k => [k, { hit: 0, zero: 0, oneOrLess: 0 }]))
scores.regime = { hit: 0, zero: 0, oneOrLess: 0 }
const regimeMemory = new Map()
for (let i = 3; i < draws.length; i++) {
  const pred = computeHybridPrediction(draws.slice(0, i))
  if (!pred) continue
  const res = pred.results
  const actual = draws[i]
  const sig = zc(pred.seeds).join('')
  const mem = regimeMemory.get(sig)
  const regimeName = mem && mem.count >= 3
    ? Object.entries(mem.hits).sort((a, b) => (b[1] / mem.count) - (a[1] / mem.count))[0][0]
    : 'original'
  for (const [name, fn] of Object.entries(strategies)) {
    const picks = fn(res, pred.seeds)
    const hits = actual.filter(n => picks.includes(n)).length
    scores[name].hit += hits
    if (hits === 0) scores[name].zero++
    if (hits <= 1) scores[name].oneOrLess++
  }
  const regimePicks = strategies[regimeName](res, pred.seeds)
  const regimeHits = actual.filter(n => regimePicks.includes(n)).length
  scores.regime.hit += regimeHits
  if (regimeHits === 0) scores.regime.zero++
  if (regimeHits <= 1) scores.regime.oneOrLess++

  if (!regimeMemory.has(sig)) regimeMemory.set(sig, { count: 0, hits: Object.fromEntries(Object.keys(strategies).map(k => [k, 0])) })
  const nextMem = regimeMemory.get(sig)
  nextMem.count++
  for (const [name, fn] of Object.entries(strategies)) {
    const picks = fn(res, pred.seeds)
    nextMem.hits[name] += actual.filter(n => picks.includes(n)).length
  }
}
for (const s of Object.values(scores)) s.avg = +(s.hit / (draws.length - 3)).toFixed(3)
console.table(scores)
