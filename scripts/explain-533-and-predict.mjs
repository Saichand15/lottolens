import fs from 'fs'
import { computeFormulaAgent } from '../src/utils/formulaAgent.js'
import { computeHybridPrediction } from '../src/utils/hybridPrediction.js'

const FILE = 'public/all_draws.json'
let draws = JSON.parse(fs.readFileSync(FILE, 'utf8')).map(d => d.map(Number).sort((a, b) => a - b))
const actual = [6, 7, 21, 22, 44]
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)
const sumOf = d => d.reduce((a, b) => a + b, 0)
const gaps = d => d.slice(1).map((n, i) => n - d[i])
const pairGaps = d => [...new Set(d.flatMap((a, i) => d.slice(i + 1).map(b => Math.abs(b - a))))].filter(Boolean).sort((a, b) => a - b)
const same = (a, b) => a?.length === b?.length && a.every((n, i) => n === b[i])
const wrap = n => { while (n < 1) n += 45; while (n > 45) n -= 45; return n }

if (!same(draws.at(-1), actual)) {
  draws.push(actual)
  fs.writeFileSync(FILE, JSON.stringify(draws), 'utf8')
  console.log(`Appended actual to ${FILE}; new count ${draws.length}`)
} else {
  console.log(`Actual already latest in ${FILE}; count ${draws.length}`)
}

function matrixConfig(max = 45) { return { cols: 5, rows: 9, max } }
function pos(n, c) { return { row: Math.floor((n - 1) / c.cols), col: (n - 1) % c.cols } }
function nAt(row, col, c) { const n = row * c.cols + col + 1; return row >= 0 && row < c.rows && col >= 0 && col < c.cols && n <= c.max ? n : null }
function cardinalScore(seeds) {
  const c = matrixConfig(), dirs = { N: [-1,0], S: [1,0], W: [0,-1], E: [0,1], NW: [-1,-1], NE: [-1,1], SW: [1,-1], SE: [1,1] }
  const m = new Map()
  const add = (n, pts, why) => { if (n < 1 || n > 45) return; if (!m.has(n)) m.set(n, { n, pts: 0, why: [] }); const r = m.get(n); r.pts += pts; r.why.push(why) }
  seeds.forEach(seed => {
    const p = pos(seed, c)
    Object.entries(dirs).forEach(([dir, [dr, dc]]) => {
      const isCard = ['N','S','E','W'].includes(dir)
      for (let step = 1; step <= 9; step++) {
        const n = nAt(p.row + dr * step, p.col + dc * step, c)
        if (!n) break
        const base = isCard ? 46 : 34
        const w = Math.max(0.35, 1 - (step - 1) * 0.12)
        add(n, base * w, `${seed}:${dir}${step}`)
        if (isCard) { add(n - 1, base * w * 0.25, `${seed}:${dir}${step}-1`); add(n + 1, base * w * 0.25, `${seed}:${dir}${step}+1`) }
      }
    })
    add(46 - seed, 38, `${seed}:mirror`)
  })
  return [...m.values()].sort((a, b) => b.pts - a.pts || a.n - b.n)
}
function gapScore(seeds) {
  const gs = [...new Set([...gaps(seeds), ...pairGaps(seeds)].filter(g => g >= 1 && g <= 14))]
  const m = new Map()
  const add = (n, pts, why) => { if (n < 1 || n > 45) return; if (!m.has(n)) m.set(n, { n, pts: 0, why: [] }); const r = m.get(n); r.pts += pts; r.why.push(why) }
  seeds.forEach(seed => {
    gs.forEach(g => { add(wrap(seed + g), 34, `${seed}+gap${g}`); add(wrap(seed - g), 34, `${seed}-gap${g}`) })
    ;[1,2,5,10].forEach(g => { add(wrap(seed + g), g === 10 ? 58 : 42, `${seed}+${g}`); add(wrap(seed - g), g === 10 ? 58 : 42, `${seed}-${g}`) })
  })
  return [...m.values()].sort((a, b) => b.pts - a.pts || a.n - b.n)
}
function similarity(a, b) {
  let s = 0
  if (sig(a) === sig(b)) s += 42
  const as = sig(a).split('').map(Number), bs = sig(b).split('').map(Number)
  s += Math.max(0, 22 - as.reduce((x, v, i) => x + Math.abs(v - bs[i]), 0) * 4)
  s += Math.max(0, 24 - Math.abs(sumOf(a) - sumOf(b)) / 4)
  s += a.reduce((acc, n) => acc + (b.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0) * 4
  const ag = gaps(a), bg = gaps(b)
  s += Math.max(0, 12 - ag.reduce((acc, g, i) => acc + Math.min(6, Math.abs(g - (bg[i] || 0))), 0) / 2)
  return s
}
function histRows(history, current) {
  const rows = []
  for (let i = 0; i < history.length - 1; i++) {
    const sim = similarity(history[i], current)
    if (sim < 34) continue
    rows.push({ prev: history[i], next: history[i + 1], sim, w: sim * (0.6 + (i / history.length) * 0.85) })
  }
  return rows
}
function rankDist(rows, pickFn) {
  const m = new Map()
  for (const r of rows) for (const v of pickFn(r)) { if (!m.has(v)) m.set(v, { n: v, pts: 0 }); m.get(v).pts += r.w }
  return [...m.values()].sort((a, b) => b.pts - a.pts)
}

const before = draws.slice(0, -1)
const prev = before.at(-1)
const beforeAgent = computeFormulaAgent(before)
const beforeHybrid = computeHybridPrediction(before)
const cardBefore = cardinalScore(prev).filter(r => !prev.includes(r.n))
const gapBefore = gapScore(prev)
const rowsBefore = histRows(before, prev)
const histBefore = rankDist(rowsBefore, r => r.next)
const shapeBefore = rankDist(rowsBefore, r => [sig(r.next)])

function rankOf(arr, n, key = 'number') { const idx = arr.findIndex(r => r[key] === n || r.n === n); return idx >= 0 ? idx + 1 : '-' }

console.log('\n================ PREVIOUS -> ACTUAL ================')
console.log('Prev:', prev.join(','), 'sig', sig(prev), 'sum', sumOf(prev), 'gaps', gaps(prev).join('-'))
console.log('Actual:', actual.join(','), 'sig', sig(actual), 'sum', sumOf(actual), 'gaps', gaps(actual).join('-'))
console.log('Agent before primary:', beforeAgent.primary.map(r => r.number).join(','), 'shape', beforeAgent.selectedShape)
console.log('Shape pressure before:', shapeBefore.slice(0, 10).map(r => `${r.n}:${r.pts.toFixed(0)}`).join(', '))
console.log('\nActual ranks before:')
for (const n of actual) {
  console.log(`${String(n).padStart(2)} card#${rankOf(cardBefore,n,'n')} gap#${rankOf(gapBefore,n,'n')} hist#${rankOf(histBefore,n,'n')} agent#${rankOf(beforeAgent.ranked,n)} laser#${rankOf(beforeAgent.laser,n)} spider#${rankOf(beforeAgent.spider,n)} hybrid#${rankOf(beforeHybrid.results,n)}`)
  console.log('   card:', (cardBefore.find(r => r.n === n)?.why || []).slice(0, 8).join(' | '))
  console.log('   gap :', (gapBefore.find(r => r.n === n)?.why || []).slice(0, 8).join(' | '))
}

const latest = draws.at(-1)
const agent = computeFormulaAgent(draws)
const hybrid = computeHybridPrediction(draws)
const card = cardinalScore(latest).filter(r => !latest.includes(r.n))
const gap = gapScore(latest)
const rows = histRows(draws, latest)
const hist = rankDist(rows, r => r.next)
const shape = rankDist(rows, r => [sig(r.next)])
const combined = new Map()
const addC = (n, pts, why) => { if (!combined.has(n)) combined.set(n, { n, pts: 0, why: [] }); const r = combined.get(n); r.pts += pts; r.why.push(why) }
card.slice(0, 35).forEach((r, i) => addC(r.n, Math.max(0, 125 - i * 3.2), `card#${i+1}`))
gap.slice(0, 35).forEach((r, i) => addC(r.n, Math.max(0, 105 - i * 2.6), `gap#${i+1}`))
hist.slice(0, 35).forEach((r, i) => addC(r.n, Math.max(0, 115 - i * 3), `hist#${i+1}`))
agent.ranked.slice(0, 35).forEach((r, i) => addC(r.number, Math.max(0, 110 - i * 3), `agent#${i+1}:L${r.laserRank||'-'}:S${r.spiderRank||'-'}`))
hybrid.results.slice(0, 35).forEach((r, i) => addC(r.number, Math.max(0, 70 - i * 2), `hybrid#${i+1}`))
const final = [...combined.values()].sort((a, b) => b.pts - a.pts || a.n - b.n)
function line(shapeSig) {
  const counts = shapeSig.split('').map(Number)
  const used = new Set(), out = []
  counts.forEach((cnt, zi) => {
    final.filter(r => zoneOf(r.n) === zi && !used.has(r.n)).slice(0, cnt).forEach(r => { out.push(r.n); used.add(r.n) })
  })
  for (const r of final) if (out.length < 5 && !used.has(r.n)) { out.push(r.n); used.add(r.n) }
  return out.sort((a,b)=>a-b)
}
console.log('\n================ NEXT FROM NEW ACTUAL ================')
console.log('Latest:', latest.join(','), 'sig', sig(latest), 'sum', sumOf(latest), 'gaps', gaps(latest).join('-'))
console.log('Agent primary:', agent.primary.map(r => r.number).join(','), 'shape', agent.selectedShape)
console.log('Cardinal top:', card.slice(0, 20).map((r,i)=>`${i+1}.${r.n}`).join(' '))
console.log('Gap top:', gap.slice(0, 20).map((r,i)=>`${i+1}.${r.n}`).join(' '))
console.log('History top:', hist.slice(0, 20).map((r,i)=>`${i+1}.${r.n}`).join(' '))
console.log('Shape pressure:', shape.slice(0, 10).map(r => `${r.n}:${r.pts.toFixed(0)}`).join(', '))
console.log('\nFinal rank:')
final.slice(0, 30).forEach((r,i)=>console.log(`${i+1}. ${r.n} ${r.pts.toFixed(0)} ${r.why.slice(0,5).join(' | ')}`))
console.log('\nLines:')
;[shape[0]?.n, shape[1]?.n, agent.selectedShape, '11111', '12110', '11210', '20201', '21110'].filter(Boolean).forEach(s => { const l = line(s); console.log(`${s}: ${l.join(',')} sum=${sumOf(l)} sig=${sig(l)}`) })
