import fs from 'fs'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const MAX = 45
const WINDOW = 100
const DIRS = { NW: [-1, -1], NE: [1, -1], SW: [-1, 1], SE: [1, 1] }
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const targetPrevStats = [
  { S: 1, NW: 0, NW_app: 0, NW_miss: 0, SW: 87, SW_app: 14, SW_miss: 73, ctTotal: 14 },
  { S: 23, NW: 43, NW_app: 3, NW_miss: 40, SW: 43, SW_app: 6, SW_miss: 37, ctTotal: 9 },
  { S: 34, NW: 65, NW_app: 5, NW_miss: 60, SW: 21, SW_app: 1, SW_miss: 20, ctTotal: 6 },
  { S: 36, NW: 69, NW_app: 4, NW_miss: 65, SW: 17, SW_app: 2, SW_miss: 15, ctTotal: 6 },
  { S: 40, NW: 77, NW_app: 8, NW_miss: 69, SW: 9, SW_app: 2, SW_miss: 7, ctTotal: 10 },
]
const targetActual = [11, 16, 30, 37, 38]

const wrap = n => {
  if (!Number.isFinite(n)) return NaN
  let v = Math.round(n)
  while (v < 1) v += MAX
  while (v > MAX) v -= MAX
  return v
}
const zoneSig = draw => zones.map(([lo, hi]) => draw.filter(n => n >= lo && n <= hi).length).join('')
const fmt = d => `[${d.join(',')}]`
const overlap = (a, b) => a.filter(n => b.includes(n)).length
const distToSet = (n, arr) => Math.min(...arr.map(x => Math.abs(x - n)))

function beamStats(history, seed) {
  const win = history.slice(-WINDOW)
  const ci = win.length - 1
  const sets = win.map(d => new Set(d))
  const rowIdx = seed - 1
  const out = { S: seed, NW: 0, NW_app: 0, SW: 0, SW_app: 0, NE_app: 0, SE_app: 0 }

  for (const [dir, [dc, dr]] of Object.entries(DIRS)) {
    let step = 1
    while (true) {
      const c = ci + dc * step
      const r = rowIdx + dr * step
      if (c < 0 || c >= win.length || r < 0 || r >= MAX) break
      const n = r + 1
      const hit = sets[c]?.has(n) || false
      if (dir === 'NW') { out.NW++; if (hit) out.NW_app++ }
      if (dir === 'SW') { out.SW++; if (hit) out.SW_app++ }
      if (dir === 'NE' && hit) out.NE_app++
      if (dir === 'SE' && hit) out.SE_app++

      // Same corner-touch model used by the hybrid engine.
      const adjR = dr < 0 ? r - 1 : r + 1
      if (adjR >= 0 && adjR < MAX) {
        const adjN = adjR + 1
        const adjHit = sets[c]?.has(adjN) || false
        if (dir === 'NW') { out.NW++; if (adjHit) out.NW_app++ }
        if (dir === 'SW') { out.SW++; if (adjHit) out.SW_app++ }
        if (dir === 'NE' && adjHit) out.NE_app++
        if (dir === 'SE' && adjHit) out.SE_app++
      }
      step++
    }
  }
  out.NW_miss = out.NW - out.NW_app
  out.SW_miss = out.SW - out.SW_app
  out.ctTotal = out.NW_app + out.SW_app + out.NE_app + out.SE_app
  return out
}

function formulaList(s) {
  const S = s.S, NW = s.NW, NWa = s.NW_app, NWm = s.NW_miss, SW = s.SW, SWa = s.SW_app, SWm = s.SW_miss, ct = s.ctTotal
  const appSum = NWa + SWa
  const appDiff = SWa - NWa
  const missDiff = NWm - SWm
  const defs = [
    ['S+1', S + 1, 'neighbor'], ['S-1', S - 1, 'neighbor'],
    ['S+2', S + 2, 'neighbor'], ['S-2', S - 2, 'neighbor'],
    ['S+10', S + 10, 'edge'], ['S-10', S - 10, 'edge'],
    ['S-ct', S - ct, 'ct'], ['S+ct', S + ct, 'ct'], ['ct-S', ct - S, 'ct'],
    ['S+SWapp', S + SWa, 'app'], ['S-SWapp', S - SWa, 'app'], ['S+NWapp', S + NWa, 'app'], ['S-NWapp', S - NWa, 'app'],
    ['NWapp+ct', NWa + ct, 'appct'], ['NWapp-ct', NWa - ct, 'appct'], ['ct-NWapp', ct - NWa, 'appct'],
    ['SWapp+ct', SWa + ct, 'appct'], ['SWapp-ct', SWa - ct, 'appct'], ['ct-SWapp', ct - SWa, 'appct'],
    ['SW-SWapp', SW - SWa, 'miss'], ['SW+SWapp', SW + SWa, 'miss'], ['SW+ct', SW + ct, 'miss'], ['SW-ct', SW - ct, 'miss'],
    ['SW-NWapp', SW - NWa, 'miss'], ['SW+SWmiss', SW + SWm, 'miss'], ['SW-SWmiss', SW - SWm, 'miss'], ['SWmiss', SWm, 'miss'],
    ['NW-SWapp', NW - SWa, 'miss'], ['NW+SWapp', NW + SWa, 'miss'], ['NW+NWmiss', NW + NWm, 'miss'], ['NW-SWmiss', NW - SWm, 'miss'],
    ['SW-NWmiss', SW - NWm, 'miss'], ['S-NWmiss', S - NWm, 'miss'], ['S-SWmiss', S - SWm, 'miss'],
    ['NW-S', NW - S, 'reach'], ['S-NW', S - NW, 'reach'], ['SW-S', SW - S, 'reach'], ['S-SW', S - SW, 'reach'],
    ['S+appDiff', S + appDiff, 'balance'], ['S-appDiff', S - appDiff, 'balance'],
    ['SWm+appDiff', SWm + appDiff, 'balance'], ['NW+appDiff', NW + appDiff, 'balance'], ['NWm+SWapp', NWm + SWa, 'balance'],
    ['ct+missDiff', ct + missDiff, 'balance'], ['ct-missDiff', ct - missDiff, 'balance'],
    ['missDiff+appDiff', missDiff + appDiff, 'balance'], ['appSum-missDiff', appSum - missDiff, 'balance'],
  ]
  return defs.map(([name, raw, group]) => ({ seed: S, name, raw, n: wrap(raw), group, wrapped: raw !== wrap(raw) }))
}

function transitionCandidates(draw, history) {
  const counts = new Map()
  for (let i = 0; i < history.length - 1; i++) {
    for (const a of draw) {
      if (!history[i].includes(a)) continue
      for (const b of history[i + 1]) counts.set(b, (counts.get(b) || 0) + 1)
    }
  }
  return counts
}

function analyzeTransition(i) {
  const curr = draws[i]
  const next = draws[i + 1]
  const history = draws.slice(0, i + 1)
  const stats = curr.map(seed => beamStats(history, seed))
  const formulas = stats.flatMap(formulaList)
  const byN = new Map()
  for (const f of formulas) {
    if (!byN.has(f.n)) byN.set(f.n, [])
    byN.get(f.n).push(f)
  }
  const trans = transitionCandidates(curr, history)
  const rows = next.map(n => ({
    n,
    formulas: byN.get(n) || [],
    trans: trans.get(n) || 0,
    nearest: curr.map(s => ({ s, d: n - s })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0],
  }))
  const covered = rows.filter(r => r.formulas.length || Math.abs(r.nearest.d) <= 2 || r.trans).length
  return { drawNum: i + 1, curr, next, stats, rows, covered }
}

console.log('=== GLOBAL FORMULA HIT RATES ===')
const formStats = new Map()
const groupStats = new Map()
for (let i = 1; i < draws.length - 1; i++) {
  const history = draws.slice(0, i + 1)
  const nextSet = new Set(draws[i + 1])
  const formulas = draws[i].flatMap(seed => formulaList(beamStats(history, seed)))
  for (const f of formulas) {
    const k = f.name
    if (!formStats.has(k)) formStats.set(k, { name: k, group: f.group, tries: 0, hits: 0, wrappedHits: 0 })
    const s = formStats.get(k)
    s.tries++
    if (nextSet.has(f.n)) { s.hits++; if (f.wrapped) s.wrappedHits++ }
    if (!groupStats.has(f.group)) groupStats.set(f.group, { group: f.group, tries: 0, hits: 0 })
    const g = groupStats.get(f.group)
    g.tries++
    if (nextSet.has(f.n)) g.hits++
  }
}
console.log([...groupStats.values()].sort((a, b) => b.hits / b.tries - a.hits / a.tries).map(g => `${g.group}:${g.hits}/${g.tries} ${(100 * g.hits / g.tries).toFixed(2)}%`).join('\n'))
console.log('\nTop formulas:')
console.log([...formStats.values()].filter(s => s.tries > 200).sort((a, b) => b.hits / b.tries - a.hits / a.tries).slice(0, 25).map(s => `${s.name.padEnd(14)} ${s.group.padEnd(8)} ${s.hits}/${s.tries} ${(100 * s.hits / s.tries).toFixed(2)}% wrapHits:${s.wrappedHits}`).join('\n'))

console.log('\n=== RECENT HISTORY SEQUENCE BREAKDOWN (last 12 transitions) ===')
for (let i = Math.max(1, draws.length - 13); i < draws.length - 1; i++) {
  const a = analyzeTransition(i)
  console.log(`\nD${a.drawNum} ${fmt(a.curr)} z${zoneSig(a.curr)} -> D${a.drawNum + 1} ${fmt(a.next)} z${zoneSig(a.next)} coverage ${a.covered}/5`)
  for (const r of a.rows) {
    const topF = r.formulas
      .sort((x, y) => (x.wrapped === y.wrapped ? 0 : x.wrapped ? 1 : -1))
      .slice(0, 5)
      .map(f => `${f.seed}:${f.name}=${f.raw}${f.wrapped ? '→' + f.n : ''}`)
      .join(' | ')
    console.log(`  ${String(r.n).padStart(2)} from nearest ${r.nearest.s}${r.nearest.d >= 0 ? '+' : ''}${r.nearest.d} trans:${r.trans} ${topF ? 'formula: ' + topF : ''}`)
  }
}

console.log('\n=== USER PROVIDED CASE ===')
console.log('Previous stats for', fmt(targetPrevStats.map(s => s.S)), '-> actual', fmt(targetActual))
const userForms = targetPrevStats.flatMap(formulaList)
for (const n of targetActual) {
  const hits = userForms.filter(f => f.n === n)
  console.log(`\n${n}: ${hits.length} formulas`)
  for (const f of hits.slice(0, 18)) {
    console.log(`  seed ${f.seed}: ${f.name} = ${f.raw}${f.wrapped ? ' -> ' + f.n : ''} [${f.group}]`)
  }
}

console.log('\n=== DEPENDENCY MOVE SUMMARY FOR USER CASE ===')
for (const n of targetActual) {
  const moves = targetPrevStats.map(s => ({ seed: s.S, d: n - s.S })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d)).slice(0, 3)
  console.log(`${n}: ${moves.map(m => `${m.seed}${m.d >= 0 ? '+' : ''}${m.d}`).join('  ')}`)
}
