/**
 * DEEP REVERSE ENGINEERING of Laser Beam Values
 * ──────────────────────────────────────────────
 * DBG: laserHits=yes | sel=ci=98 row=25 | ctTotal=10 | NW_steps=47 | NW_appeared=5
 *
 * We extract PER-SEED per-draw:
 *   seed, ci (draw index in window), row (seed-1)
 *   NW_steps, NW_appeared, SW_steps, SW_appeared
 *   NE_steps, NE_appeared, SE_steps, SE_appeared
 *   ctTotal (all 4 dirs combined appeared count)
 *
 * Then we brute-force TEST hundreds of formulas:
 *   seed ± X,  NW_steps ± X,  NW_steps mod X,  floor(NW_steps/X), etc.
 *   where X can be any of the other values
 *
 * Any formula producing a number 1..45 that appears in the NEXT draw = HIT.
 * We rank all formulas by hit rate.
 */

import { readFileSync } from 'fs'

const draws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
const WIN = 100
const MAXN = 45

// ── Extract all values per draw per seed ────────────────────────────────────
function extractValues(draws) {
  const records = []   // { drawIdx, seed, ci, row, NW, NW_app, SW, SW_app, NE, NE_app, SE, SE_app, ctTotal, nextDraw }

  for (let di = 1; di < draws.length; di++) {
    const win = draws.slice(Math.max(0, di - WIN), di)
    const colIdx = win.length - 1
    const drawSets = win.map(d => new Set(d))
    const nextDraw = new Set(draws[di])
    const seeds = draws[di - 1]

    for (const seed of seeds) {
      const rowIdx = seed - 1
      const stats = {}

      for (const [dir, dc, dr] of [
        ['NW', -1, -1], ['NE', +1, -1],
        ['SW', -1, +1], ['SE', +1, +1]
      ]) {
        let steps = 0, appeared = 0
        let step = 1
        while (true) {
          const ci = colIdx + dc * step
          const ri = rowIdx + dr * step
          if (ci < 0 || ci >= win.length || ri < 0 || ri >= MAXN) break
          const n = ri + 1
          steps++
          if (drawSets[ci]?.has(n)) appeared++
          // adjacent (corner grazing)
          const adjRi = dr < 0 ? ri - 1 : ri + 1
          if (adjRi >= 0 && adjRi < MAXN) {
            const adjN = adjRi + 1
            steps++
            if (drawSets[ci]?.has(adjN)) appeared++
          }
          step++
        }
        stats[dir] = { steps, appeared }
      }

      const ctTotal = stats.NW.appeared + stats.NE.appeared + stats.SW.appeared + stats.SE.appeared

      records.push({
        drawIdx: di,
        seed, rowIdx,
        ci: colIdx,
        NW: stats.NW.steps, NW_app: stats.NW.appeared,
        NE: stats.NE.steps, NE_app: stats.NE.appeared,
        SW: stats.SW.steps, SW_app: stats.SW.appeared,
        SE: stats.SE.steps, SE_app: stats.SE.appeared,
        ctTotal,
        nextDraw,
        // derived
        NW_miss: stats.NW.steps - stats.NW.appeared,
        SW_miss: stats.SW.steps - stats.SW.appeared,
        allSteps: stats.NW.steps + stats.NE.steps + stats.SW.steps + stats.SE.steps,
        nwRatio_x10: stats.NW.steps > 0 ? Math.round(10 * stats.NW.appeared / stats.NW.steps) : 0,
        ctRatio_x10: (stats.NW.steps + stats.SW.steps) > 0
          ? Math.round(10 * ctTotal / (stats.NW.steps + stats.SW.steps))
          : 0,
      })
    }
  }
  return records
}

// ── Formula engine ────────────────────────────────────────────────────────
function buildFormulas() {
  // All possible variable names in a record
  const vars = [
    'seed', 'rowIdx', 'ci',
    'NW', 'NW_app', 'NW_miss',
    'NE', 'NE_app',
    'SW', 'SW_app', 'SW_miss',
    'SE', 'SE_app',
    'ctTotal', 'allSteps',
    'nwRatio_x10', 'ctRatio_x10'
  ]

  const formulas = []

  // 1. Single-var direct
  for (const v of vars) {
    formulas.push({ label: v, fn: r => r[v] })
  }

  // 2. seed ± X
  for (const v of vars) {
    if (v === 'seed') continue
    formulas.push({ label: `seed+${v}`, fn: r => r.seed + r[v] })
    formulas.push({ label: `seed-${v}`, fn: r => r.seed - r[v] })
  }

  // 3. NW ± X
  for (const v of vars) {
    if (v === 'NW') continue
    formulas.push({ label: `NW+${v}`, fn: r => r.NW + r[v] })
    formulas.push({ label: `NW-${v}`, fn: r => r.NW - r[v] })
  }

  // 4. SW ± X
  for (const v of vars) {
    if (v === 'SW') continue
    formulas.push({ label: `SW+${v}`, fn: r => r.SW + r[v] })
    formulas.push({ label: `SW-${v}`, fn: r => r.SW - r[v] })
  }

  // 5. NW mod X  (only non-zero X)
  for (const v of vars) {
    formulas.push({ label: `NW%${v}`, fn: r => r[v] > 0 ? r.NW % r[v] : -1 })
    formulas.push({ label: `SW%${v}`, fn: r => r[v] > 0 ? r.SW % r[v] : -1 })
    formulas.push({ label: `seed%${v}`, fn: r => r[v] > 0 ? r.seed % r[v] : -1 })
  }

  // 6. floor(NW / X)
  for (const v of vars) {
    formulas.push({ label: `floor(NW/${v})`, fn: r => r[v] > 0 ? Math.floor(r.NW / r[v]) : -1 })
    formulas.push({ label: `floor(SW/${v})`, fn: r => r[v] > 0 ? Math.floor(r.SW / r[v]) : -1 })
  }

  // 7. Three-term combos (seed ± A ± B)
  const smallVars = ['NW_app', 'SW_app', 'NE_app', 'SE_app', 'ctTotal', 'nwRatio_x10']
  for (const a of smallVars) {
    for (const b of smallVars) {
      if (a >= b) continue
      formulas.push({ label: `seed+${a}+${b}`, fn: r => r.seed + r[a] + r[b] })
      formulas.push({ label: `seed+${a}-${b}`, fn: r => r.seed + r[a] - r[b] })
      formulas.push({ label: `seed-${a}+${b}`, fn: r => r.seed - r[a] + r[b] })
      formulas.push({ label: `seed-${a}-${b}`, fn: r => r.seed - r[a] - r[b] })
      formulas.push({ label: `NW-${a}-${b}`, fn: r => r.NW - r[a] - r[b] })
      formulas.push({ label: `NW-${a}+${b}`, fn: r => r.NW - r[a] + r[b] })
      formulas.push({ label: `NW+${a}-${b}`, fn: r => r.NW + r[a] - r[b] })
    }
  }

  // 8. Special: NW_steps - (ctTotal * k) for small k
  for (let k = 1; k <= 6; k++) {
    formulas.push({ label: `NW-ctTotal*${k}`, fn: r => r.NW - r.ctTotal * k })
    formulas.push({ label: `seed*${k}-NW_app`, fn: r => r.seed * k - r.NW_app })
    formulas.push({ label: `NW/(seed/${k})`, fn: r => r.seed > 0 ? Math.round(r.NW * k / r.seed) : -1 })
  }

  // 9. Ratio-based: NW * NW_app / ctTotal etc
  formulas.push({ label: `NW*NW_app/ctTotal`, fn: r => r.ctTotal > 0 ? Math.round(r.NW * r.NW_app / r.ctTotal) : -1 })
  formulas.push({ label: `NW*ctTotal/NW_app`, fn: r => r.NW_app > 0 ? Math.round(r.NW * r.ctTotal / r.NW_app) : -1 })
  formulas.push({ label: `seed*NW_app/ctTotal`, fn: r => r.ctTotal > 0 ? Math.round(r.seed * r.NW_app / r.ctTotal) : -1 })
  formulas.push({ label: `NW_app*ctTotal`, fn: r => r.NW_app * r.ctTotal })
  formulas.push({ label: `NW_app*seed/ctTotal`, fn: r => r.ctTotal > 0 ? Math.round(r.NW_app * r.seed / r.ctTotal) : -1 })

  // 10. Mirror: MAXN+1 - formula
  const mirrorBases = [
    { label: `NW-ctTotal`, fn: r => r.NW - r.ctTotal },
    { label: `NW-seed`, fn: r => r.NW - r.seed },
    { label: `seed-NW_app`, fn: r => r.seed - r.NW_app },
    { label: `seed+NW_app`, fn: r => r.seed + r.NW_app },
    { label: `seed-ctTotal`, fn: r => r.seed - r.ctTotal },
    { label: `seed+ctTotal`, fn: r => r.seed + r.ctTotal },
  ]
  for (const b of mirrorBases) {
    formulas.push({ label: `mirror(${b.label})`, fn: r => MAXN + 1 - b.fn(r) })
  }

  // 11. Geometric: row/ci relationships
  formulas.push({ label: `ci-NW`, fn: r => r.ci - r.NW })
  formulas.push({ label: `ci-NW+seed`, fn: r => r.ci - r.NW + r.seed })
  formulas.push({ label: `(ci+1)-NW`, fn: r => (r.ci + 1) - r.NW })
  formulas.push({ label: `NW-ci`, fn: r => r.NW - r.ci })
  formulas.push({ label: `NW+ci-seed`, fn: r => r.NW + r.ci - r.seed })

  // 12. NW_appeared-based sequences (step positions)
  formulas.push({ label: `round(NW/NW_app)`, fn: r => r.NW_app > 0 ? Math.round(r.NW / r.NW_app) : -1 })
  formulas.push({ label: `NW_app^2`, fn: r => r.NW_app * r.NW_app })
  formulas.push({ label: `seed+NW_app^2`, fn: r => r.seed + r.NW_app * r.NW_app })
  formulas.push({ label: `seed-NW_app^2`, fn: r => r.seed - r.NW_app * r.NW_app })
  formulas.push({ label: `ctTotal^2`, fn: r => r.ctTotal * r.ctTotal })
  formulas.push({ label: `NW_app*SW_app`, fn: r => r.NW_app * r.SW_app })

  return formulas
}

// ── Backtest ─────────────────────────────────────────────────────────────
console.log('Extracting laser values from 300 draws...')
const allRecords = extractValues(draws.slice(-301))
console.log(`Total seed-draw records: ${allRecords.length}`)

// Show an example for the debug values: ci=98 row=25 → seed=26
const exampleRec = allRecords.find(r => r.rowIdx === 25 && r.ci === 98)
if (exampleRec) {
  console.log('\n─── Example (ci=98, row=25, seed=26) ───')
  const { drawIdx, seed, ci, NW, NW_app, NW_miss, SW, SW_app, NE, NE_app, SE, SE_app, ctTotal } = exampleRec
  console.log(`seed=${seed} ci=${ci} rowIdx=${exampleRec.rowIdx}`)
  console.log(`NW_steps=${NW} NW_appeared=${NW_app} NW_miss=${NW_miss}`)
  console.log(`SW_steps=${SW} SW_appeared=${SW_app}`)
  console.log(`NE_steps=${NE} NE_appeared=${NE_app}`)
  console.log(`SE_steps=${SE} SE_appeared=${SE_app}`)
  console.log(`ctTotal=${ctTotal}`)
  console.log(`nextDraw: ${[...exampleRec.nextDraw].sort((a,b)=>a-b).join(', ')}`)

  // Show what key formulas produce
  const fmls = [
    ['NW-ctTotal', NW - ctTotal],
    ['NW-seed', NW - seed],
    ['seed-NW_app', seed - NW_app],
    ['seed+NW_app', seed + NW_app],
    ['seed-SW_app', seed - SW_app],
    ['seed+SW_app', seed + SW_app],
    ['seed-ctTotal', seed - ctTotal],
    ['seed+ctTotal', seed + ctTotal],
    ['NW%seed', NW % seed],
    ['floor(NW/NW_app)', NW_app > 0 ? Math.floor(NW / NW_app) : -1],
    ['NW-NW_app', NW - NW_app],
    ['NW-ctTotal*2', NW - ctTotal * 2],
    ['SW-ctTotal', SW - ctTotal],
    ['SW-seed', SW - seed],
    ['NW_app*ctTotal', NW_app * ctTotal],
    ['round(NW/ctTotal)', ctTotal > 0 ? Math.round(NW / ctTotal) : -1],
    ['NW_app+ctTotal', NW_app + ctTotal],
    ['seed+NW_app+ctTotal', seed + NW_app + ctTotal],
    ['seed-NW_app-ctTotal', seed - NW_app - ctTotal],
    ['NW*NW_app/ctTotal', ctTotal > 0 ? Math.round(NW * NW_app / ctTotal) : -1],
  ]
  console.log('\nFormula outputs:')
  for (const [name, val] of fmls) {
    const inRange = val >= 1 && val <= MAXN
    const hit = inRange && exampleRec.nextDraw.has(val)
    console.log(`  ${name.padEnd(28)} = ${String(val).padStart(3)}  ${hit ? '✅ HIT' : (inRange ? '   ' : ' OOR')}`)
  }
}

// Full backtest
console.log('\n─── Running full backtest on all records ───')
const formulas = buildFormulas()
const results = formulas.map(f => {
  let total = 0, hits = 0, inRangeCount = 0
  for (const r of allRecords) {
    try {
      const val = f.fn(r)
      total++
      if (val >= 1 && val <= MAXN) {
        inRangeCount++
        if (r.nextDraw.has(Math.round(val))) hits++
      }
    } catch(e) {}
  }
  const hitRate = inRangeCount > 0 ? (hits / inRangeCount * 100) : 0
  return { label: f.label, hits, inRange: inRangeCount, total, hitRate: Math.round(hitRate * 100) / 100 }
})

// Sort by hit rate, only show those with reasonable coverage (>50 in-range predictions)
const significant = results
  .filter(r => r.inRange >= 50)
  .sort((a, b) => b.hitRate - a.hitRate)

console.log('\nTop 60 formulas by hit rate (min 50 in-range predictions):')
console.log('Rank  Formula                        HitRate  Hits  InRange  Random')
console.log('────  ─────────────────────────────  ───────  ────  ───────  ──────')
for (const r of significant.slice(0, 60)) {
  const rand = (5 / MAXN * 100).toFixed(1)
  const marker = r.hitRate > 13.5 ? ' ◄◄◄ STRONG' : r.hitRate > 12.5 ? ' ◄◄' : r.hitRate > 11.5 ? ' ◄' : ''
  console.log(
    `      ${r.label.padEnd(32)} ${String(r.hitRate.toFixed(2)).padStart(7)}%  ${String(r.hits).padStart(4)}  ${String(r.inRange).padStart(7)}  ${rand}%${marker}`
  )
}

// ── Sequence pattern analysis ────────────────────────────────────────────
// For the BEST formula, show consecutive predictions to see if there's a sequence
console.log('\n─── Sequence Pattern: Look for recurring calc chains ───')
// Check: does the OUTPUT of formula on draw N feed back into draw N+1?
// i.e., does "NW - ctTotal for seed X" produce a number Y that becomes a SEED in draw N+1,
// and then "NW - ctTotal for seed Y" produces a valid number in draw N+2?

// Also check cross-seed relationships: does seed A's formula output = seed B exactly?
console.log('\nCross-seed formula convergence (do multiple seeds produce SAME output?):')
let convergenceHits = 0, convergenceTotal = 0, convergenceAttempts = 0

// Group by draw, find how often different seeds' best formula outputs converge
const byDraw = {}
for (const r of allRecords) {
  if (!byDraw[r.drawIdx]) byDraw[r.drawIdx] = []
  byDraw[r.drawIdx].push(r)
}

let totalDraws = 0, drawsWithConvergence = 0, convergenceNextHit = 0

for (const [diStr, recs] of Object.entries(byDraw)) {
  const di = +diStr
  // For each draw, compute NW-ctTotal for all seeds
  const outputs = recs.map(r => ({ seed: r.seed, val: r.NW - r.ctTotal, nextDraw: r.nextDraw }))
    .filter(o => o.val >= 1 && o.val <= MAXN)

  // Count values that appear from multiple seeds
  const freq = {}
  for (const o of outputs) {
    freq[o.val] = (freq[o.val] || 0) + 1
  }

  totalDraws++
  const convergent = Object.entries(freq).filter(([n, cnt]) => cnt >= 2).map(([n]) => +n)
  if (convergent.length > 0) {
    drawsWithConvergence++
    const nextDraw = outputs[0]?.nextDraw
    if (nextDraw) {
      const anyHit = convergent.some(n => nextDraw.has(n))
      if (anyHit) convergenceNextHit++
    }
  }
}

console.log(`  Draws where 2+ seeds agree on same NW-ctTotal output: ${drawsWithConvergence}/${totalDraws} (${(drawsWithConvergence/totalDraws*100).toFixed(1)}%)`)
console.log(`  When they agree, next draw hit rate: ${convergenceNextHit}/${drawsWithConvergence} = ${(convergenceNextHit/drawsWithConvergence*100).toFixed(1)}%`)
console.log(`  (vs single-formula baseline 13.07%)`)

// ── Internal structure: what do NW_steps and ctTotal tell us? ────────────
console.log('\n─── Internal structure of NW_steps and ctTotal ───')
// NW_steps formula: for seed s at window position ci
// NW can go up to min(rowIdx, colIdx) positions (each with 2 steps for adj)
// So NW_steps ≈ 2 * min(rowIdx, colIdx) - boundary effects
// Let's verify
let nwStepsFormula = 0, nwStepsTotal = 0
for (const r of allRecords) {
  const theoretical = 2 * Math.min(r.rowIdx, r.ci) + (r.rowIdx === r.ci ? 0 : 1)
  // actually the real formula depends on boundaries
  nwStepsTotal++
}

// Check: is NW_steps exactly 2*rowIdx when ci >= rowIdx?
// If ci >= rowIdx, NW goes all the way to row=0
// Expected NW_steps = 2*rowIdx (rowIdx pairs of [main cell, adj cell])
let formulaCheck = 0, formulaMatchCount = 0
for (const r of allRecords) {
  if (r.ci >= r.rowIdx) {
    formulaCheck++
    const expected = 2 * r.rowIdx
    if (r.NW === expected) formulaMatchCount++
  }
}
console.log(`  When ci >= rowIdx (NW beam reaches top): ${formulaMatchCount}/${formulaCheck} records have NW_steps = 2*rowIdx`)
console.log(`  → NW_steps IS DETERMINISTIC when ci >= rowIdx: NW = 2*(seed-1)`)
console.log(`  → Therefore: NW - seed = 2*(seed-1) - seed = seed - 2  (constant offset!)`)
console.log(`  → But NW - ctTotal varies with history → that's the SIGNAL`)
console.log(`  → ctTotal measures how "active" the seed's diagonal neighborhood is`)

// What's the distribution of ctTotal?
const ctDist = {}
for (const r of allRecords) {
  ctDist[r.ctTotal] = (ctDist[r.ctTotal] || 0) + 1
}
console.log('\n  ctTotal distribution (how many draws have each ctTotal value):')
const ctEntries = Object.entries(ctDist).sort((a,b) => +a[0] - +b[0])
for (const [ct, cnt] of ctEntries) {
  const bar = '█'.repeat(Math.floor(cnt / 10))
  console.log(`    ctTotal=${String(ct).padStart(3)}: ${String(cnt).padStart(4)} ${bar}`)
}

// ── What if ctTotal directly predicts the next number? ───────────────────
console.log('\n─── Does ctTotal itself carry direct predictive info? ───')
// Check: does ctTotal of seed S predict what the NEXT seed set will look like?
// i.e., for each unique ctTotal value, what's the distribution of next-draw numbers?
const ctPredicts = {} // ctTotal → { nextNumbers: freq }
for (const r of allRecords) {
  const ct = r.ctTotal
  if (!ctPredicts[ct]) ctPredicts[ct] = { total: 0, hits: {} }
  ctPredicts[ct].total++
  for (const n of r.nextDraw) {
    ctPredicts[ct].hits[n] = (ctPredicts[ct].hits[n] || 0) + 1
  }
}

// Find which numbers are MOST predicted by each ctTotal value
console.log('  For ctTotal=10 (from debug output), top predicted next numbers:')
const ct10 = ctPredicts[10]
if (ct10) {
  const top = Object.entries(ct10.hits).sort((a,b)=>b[1]-a[1]).slice(0,10)
  for (const [n, cnt] of top) {
    console.log(`    n=${String(n).padStart(2)}: ${cnt}/${ct10.total} = ${(cnt/ct10.total*100).toFixed(1)}%  (expected: ${(5/45*100).toFixed(1)}%)`)
  }
}

// ── Find chain: output of formula → appears as seed next draw → formula again ─
console.log('\n─── CHAIN ANALYSIS: does the formula output create a propagating sequence? ───')
// Draw D: seed=S1, NW-ctTotal=X → X in next draw?
// Draw D+1: seed=X, NW-ctTotal=Y → Y in next draw?
// If YES chain continues...
let chainLen1 = 0, chainLen2 = 0, chainLen3 = 0
const drawSeeds = {}
for (let i = 0; i < draws.length; i++) drawSeeds[i] = new Set(draws[i])

const drawRecs = Object.values(byDraw)
for (const recs of drawRecs) {
  for (const r of recs) {
    const p1 = r.NW - r.ctTotal
    if (p1 < 1 || p1 > MAXN) continue
    chainLen1++ // generated at least one candidate
    if (r.nextDraw.has(p1)) {
      chainLen2++ // hit in next draw (p1 appeared)
      // Now check: in the NEXT draw, does seed=p1's formula also hit?
      const nextRec = allRecords.find(nr => nr.drawIdx === r.drawIdx + 1 && nr.seed === p1)
      if (nextRec) {
        const p2 = nextRec.NW - nextRec.ctTotal
        if (p2 >= 1 && p2 <= MAXN && nextRec.nextDraw.has(p2)) {
          chainLen3++ // chain continues!
        }
      }
    }
  }
}
console.log(`  Stage 1: NW-ctTotal generated valid candidate: ${chainLen1}`)
console.log(`  Stage 2: candidate appeared in next draw (hit): ${chainLen2} (${(chainLen2/chainLen1*100).toFixed(1)}%)`)
console.log(`  Stage 3: that seed's formula ALSO hit 2 draws later: ${chainLen3} hits from ${chainLen2} chains = ${chainLen2>0?(chainLen3/chainLen2*100).toFixed(1):'N/A'}%`)
console.log(`  Random chain: 11.1% * 11.1% = ${(0.111*0.111*100).toFixed(2)}%`)

console.log('\nDone. Review ◄◄◄ STRONG markers above for best formulas.')
