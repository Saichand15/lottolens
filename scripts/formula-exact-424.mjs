// Recompute ALL formulas using the APP'S EXACT beam stats (user-supplied).
const MAX = 45
function wrap(raw, maxNum = MAX) {
  if (!Number.isFinite(raw)) return raw
  let n = Math.round(raw)
  while (n < 1) n += maxNum
  while (n > maxNum) n -= maxNum
  return n
}

// EXACT formulaDefs from formulaAgent.js
function formulaDefs(s, maxNum = MAX) {
  const S = s.S, NW = s.NW, NWa = s.NW_app, NWm = s.NW_miss, SW = s.SW, SWa = s.SW_app, SWm = s.SW_miss, ct = s.ctTotal
  const appSum = NWa + SWa
  const appDiff = SWa - NWa
  const missDiff = NWm - SWm
  const defs = [
    ['S+1', S + 1, 10], ['S-1', S - 1, 10], ['S+2', S + 2, 8], ['S-2', S - 2, 8],
    ['S+5', S + 5, 12], ['S-5', S - 5, 10], ['S+7', S + 7, 11], ['S-7', S - 7, 9], ['S+10', S + 10, 13], ['S-10', S - 10, 13],
    ['S+ct', S + ct, 15], ['S-ct', S - ct, 15], ['S+ct-1', S + ct - 1, 13], ['S-ct+1', S - ct + 1, 13], ['ct-S', ct - S, 12],
    ['S+SWapp', S + SWa, 13], ['S-SWapp', S - SWa, 13], ['S+NWapp', S + NWa, 12], ['S-NWapp', S - NWa, 12],
    ['S+appSum', S + appSum, 12], ['S-appSum', S - appSum, 11], ['S+appDiff', S + appDiff, 11], ['S-appDiff', S - appDiff, 11],
    ['NWapp+ct', NWa + ct, 10], ['SWapp+ct', SWa + ct, 10], ['NWapp+SWapp+ct', NWa + SWa + ct, 11],
    ['SW-SWapp', SW - SWa, 12], ['SW+SWapp', SW + SWa, 11], ['SW-SWmiss', SW - SWm, 12], ['SW+SWmiss', SW + SWm, 9], ['SWmiss', SWm, 12],
    ['SW-NWapp', SW - NWa, 11], ['SW+NWapp', SW + NWa, 10], ['SW-ct', SW - ct, 12], ['SW+ct', SW + ct, 10],
    ['NW-SWapp', NW - SWa, 12], ['NW+SWapp', NW + SWa, 10], ['NW-NWapp', NW - NWa, 11], ['NW+NWapp', NW + NWa, 10], ['NW-SWmiss', NW - SWm, 12], ['NW+NWmiss', NW + NWm, 9], ['NW-ct', NW - ct, 13], ['NW+ct', NW + ct, 11],
    ['NW-S', NW - S, 11], ['S-NW', S - NW, 11], ['SW-S', SW - S, 11], ['S-SW', S - SW, 11],
    ['NWmiss-SWmiss', NWm - SWm, 10], ['SWmiss-NWmiss', SWm - NWm, 10], ['ct+missDiff', ct + missDiff, 9], ['ct-missDiff', ct - missDiff, 9], ['appSum-missDiff', appSum - missDiff, 9], ['missDiff+appDiff', missDiff + appDiff, 9],
  ]
  return defs.map(([name, raw, weight]) => ({ seed: S, name, raw, number: wrap(raw, maxNum), weight, wrapped: wrap(raw, maxNum) !== raw }))
}

// APP'S EXACT VALUES
const seeds = [
  { S: 3,  NW: 3,  NW_app: 1,  NW_miss: 2,  SW: 83, SW_app: 15, SW_miss: 68, ctTotal: 16 },
  { S: 16, NW: 29, NW_app: 2,  NW_miss: 27, SW: 57, SW_app: 3,  SW_miss: 54, ctTotal: 5 },
  { S: 27, NW: 51, NW_app: 7,  NW_miss: 44, SW: 35, SW_app: 3,  SW_miss: 32, ctTotal: 10 },
  { S: 29, NW: 55, NW_app: 11, NW_miss: 44, SW: 31, SW_app: 4,  SW_miss: 27, ctTotal: 15 },
  { S: 39, NW: 75, NW_app: 9,  NW_miss: 66, SW: 11, SW_app: 0,  SW_miss: 11, ctTotal: 9 },
]

const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const zoneOf = n => zones.findIndex(([a, b]) => n >= a && n <= b)

// Tally how many formulas (weighted) land on each number, across all 5 seeds.
const tally = new Map()  // number -> { pts, hits, froms:Set, names:[] }
for (const s of seeds) {
  const defs = formulaDefs(s)
  for (const f of defs) {
    if (f.number < 1 || f.number > 45) continue
    if (!tally.has(f.number)) tally.set(f.number, { n: f.number, pts: 0, hits: 0, names: [] })
    const t = tally.get(f.number)
    t.pts += f.weight
    t.hits++
    if (t.names.length < 5) t.names.push(`${s.S}:${f.name}`)
  }
}

const ranked = [...tally.values()].sort((a, b) => b.pts - a.pts || b.hits - a.hits || a.n - b.n)
console.log('=== CALCULATION FROM APP EXACT BEAM STATS ===\n')
console.log('Numbers most projected by formulas (weighted across all 5 seeds):')
ranked.slice(0, 25).forEach((t, i) => {
  console.log(`   ${String(i + 1).padStart(2)}. ${String(t.n).padStart(2)}  pts ${String(t.pts).padStart(3)}  hits ${String(t.hits).padStart(2)}  via [${t.names.join(', ')}]`)
})

// Zone summary of where formulas point
const zonePts = [0, 0, 0, 0, 0]
ranked.forEach(t => { const z = zoneOf(t.n); if (z >= 0) zonePts[z] += t.pts })
const zTot = zonePts.reduce((a, b) => a + b, 0)
console.log('\nFormula zone pressure:', zonePts.map((v, i) => `Z${i}:${(v / zTot * 100).toFixed(0)}%`).join('  '))

// Build a spread formation: best formula number per zone (avoid clusters)
console.log('\nBest formula number in each zone:')
const byZone = [[], [], [], [], []]
ranked.forEach(t => { const z = zoneOf(t.n); if (z >= 0) byZone[z].push(t) })
const formation = []
byZone.forEach((arr, zi) => {
  if (arr[0]) {
    console.log(`   Z${zi} (${zones[zi][0]}-${zones[zi][1]}): ${arr.slice(0, 4).map(t => `${t.n}(${t.pts})`).join(', ')}`)
    formation.push(arr[0].n)
  }
})
console.log('\n>>> FORMULA-ONLY FORMATION (1 per zone):', formation.sort((a, b) => a - b).join(', '),
  '| sum', formation.reduce((a, b) => a + b, 0))

// Also list per-seed raw projections for transparency
console.log('\n=== Per-seed raw formula outputs (top weighted unique) ===')
for (const s of seeds) {
  const defs = formulaDefs(s).filter(f => f.number >= 1 && f.number <= 45)
  const uniq = [...new Map(defs.map(f => [f.number, f])).values()].sort((a, b) => b.weight - a.weight)
  console.log(`Seed ${String(s.S).padStart(2)}: ` + uniq.slice(0, 10).map(f => `${f.number}[${f.name}]`).join(', '))
}
