import fs from 'fs'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8')).map(d => d.map(Number).sort((a, b) => a - b))
const latest = draws.at(-1)
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const sum = d => d.reduce((a, b) => a + b, 0)

function cfg(max = 45) {
  if (max === 45) return { cols: 5, rows: 9, max }
  if (max === 69 || max === 70) return { cols: 7, rows: 10, max }
  if (max === 26) return { cols: 5, rows: 6, max }
  return { cols: 5, rows: Math.ceil(max / 5), max }
}
function pos(n, c) { return { row: Math.floor((n - 1) / c.cols), col: (n - 1) % c.cols } }
function nAt(row, col, c) { const n = row * c.cols + col + 1; return row >= 0 && row < c.rows && col >= 0 && col < c.cols && n <= c.max ? n : null }
function cardinal(seed, max = 45, depth = 6) {
  const c = cfg(max), p = pos(seed, c)
  const dirs = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1], NW: [-1, -1], NE: [-1, 1], SW: [1, -1], SE: [1, 1] }
  const out = []
  for (const [dir, [dr, dc]] of Object.entries(dirs)) {
    for (let step = 1; step <= depth; step++) {
      const n = nAt(p.row + dr * step, p.col + dc * step, c)
      if (!n) break
      out.push({ n, dir, step, seed })
    }
  }
  const mirror = c.max + 1 - seed
  if (mirror >= 1 && mirror <= c.max) out.push({ n: mirror, dir: 'MIRROR', step: 0, seed })
  return out
}
function scoreCardinal(seeds, max = 45) {
  const m = new Map()
  const add = (n, pts, why) => {
    if (!m.has(n)) m.set(n, { n, pts: 0, why: [] })
    const r = m.get(n); r.pts += pts; r.why.push(why)
  }
  seeds.forEach(seed => {
    cardinal(seed, max, 7).forEach(c => {
      const base = c.dir === 'MIRROR' ? 38 : ['N','S','E','W'].includes(c.dir) ? 46 : 34
      const stepW = Math.max(0.35, 1 - (c.step - 1) * 0.12)
      add(c.n, base * stepW, `${seed}:${c.dir}${c.step}`)
      if (['N','S','E','W'].includes(c.dir)) {
        add(c.n - 1, base * stepW * 0.25, `${seed}:${c.dir}${c.step}-1`)
        add(c.n + 1, base * stepW * 0.25, `${seed}:${c.dir}${c.step}+1`)
      }
    })
  })
  return [...m.values()].sort((a, b) => b.pts - a.pts || a.n - b.n)
}

function backtest(start = Math.max(25, draws.length - 220)) {
  const buckets = { top5: 0, top10: 0, top15: 0, totalHitsTop15: 0, cases: 0 }
  const examples = []
  for (let i = start; i < draws.length - 1; i++) {
    const prev = draws[i], next = draws[i + 1]
    const ranked = scoreCardinal(prev).filter(r => !prev.includes(r.n))
    const top5 = new Set(ranked.slice(0, 5).map(r => r.n))
    const top10 = new Set(ranked.slice(0, 10).map(r => r.n))
    const top15 = new Set(ranked.slice(0, 15).map(r => r.n))
    const h5 = next.filter(n => top5.has(n))
    const h10 = next.filter(n => top10.has(n))
    const h15 = next.filter(n => top15.has(n))
    buckets.cases++
    if (h5.length) buckets.top5++
    if (h10.length) buckets.top10++
    if (h15.length) buckets.top15++
    buckets.totalHitsTop15 += h15.length
    if (h15.length >= 3) examples.push({ i, prev, next, hits: h15, top: ranked.slice(0, 12).map(r => r.n) })
  }
  return { buckets, examples: examples.slice(-12) }
}

console.log('Latest', latest.join(','), 'sig', sig(latest), 'sum', sum(latest))
const current = scoreCardinal(latest).filter(r => !latest.includes(r.n))
console.log('\nCURRENT CARDINAL/MATRIX LASER TOP:')
current.slice(0, 30).forEach((r, i) => console.log(`${i + 1}. ${r.n} ${r.pts.toFixed(1)} ${r.why.slice(0, 8).join(' | ')}`))
const bt = backtest()
console.log('\nBACKTEST last', bt.buckets.cases, 'transitions')
console.log(`Any hit: top5 ${(bt.buckets.top5 / bt.buckets.cases * 100).toFixed(1)}% top10 ${(bt.buckets.top10 / bt.buckets.cases * 100).toFixed(1)}% top15 ${(bt.buckets.top15 / bt.buckets.cases * 100).toFixed(1)}%`)
console.log(`Avg top15 hits per draw: ${(bt.buckets.totalHitsTop15 / bt.buckets.cases).toFixed(2)}`)
console.log('\nRecent strong examples:')
bt.examples.forEach(e => console.log(`D${e.i + 1} ${e.prev.join(',')} -> ${e.next.join(',')} hits ${e.hits.join(',')} top ${e.top.join(',')}`))
