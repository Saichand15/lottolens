/**
 * NE / SE LASER RE-ENGINEERING — Last 100 Draws
 *
 * Grid layout:
 *   rows = numbers 1..45 (row index = number - 1)
 *   cols = draws (col index = draw index)
 *
 * NE laser from seed S at draw D:  hits number S-k in draw D+k
 * SE laser from seed S at draw D:  hits number S+k in draw D+k
 *
 * Re-engineering: for each "current" draw D (last 100 draws as seed source),
 * trace NE and SE for k=1,2,3,4,5 draws ahead and check actual results.
 *
 * Key pattern: "NUMBER FORMING FLOW" — how each actual result was foreshadowed
 * by NE/SE lasers from 1, 2, 3, 4, 5 draws BEFORE it appeared.
 */

import { readFileSync } from 'fs'

const draws = JSON.parse(readFileSync('public/all_draws.json', 'utf-8'))
const TOTAL = draws.length
const MAX_N = 45

// ── Helper: given seed s in draw at index dIdx, what does NE/SE hit in dIdx+k?
function neHit(s, k) { return s - k }
function seHit(s, k) { return s + k }

// ── For a single draw, get all NE and SE projections for 5 future draws
function getProjections(dIdx) {
  const seeds = draws[dIdx]
  const result = { dIdx, seeds, ne: {}, se: {} }
  for (let k = 1; k <= 5; k++) {
    result.ne[k] = seeds.map(s => neHit(s, k)).filter(n => n >= 1 && n <= MAX_N)
    result.se[k] = seeds.map(s => seHit(s, k)).filter(n => n >= 1 && n <= MAX_N)
  }
  return result
}

// ── Check hits: which NE/SE projections actually appeared in the future draw
function checkHits(projections, futureDrawIdx) {
  if (futureDrawIdx >= TOTAL) return null
  const future = new Set(draws[futureDrawIdx])
  const k = futureDrawIdx - projections.dIdx
  const neHits = (projections.ne[k] || []).filter(n => future.has(n))
  const seHits = (projections.se[k] || []).filter(n => future.has(n))
  const combined = [...new Set([...neHits, ...seHits])]
  const neOnly = neHits.filter(n => !seHits.includes(n))
  const seOnly = seHits.filter(n => !neHits.includes(n))
  const both   = neHits.filter(n => seHits.includes(n))  // NE and SE both hit same number
  return { k, future: draws[futureDrawIdx], neHits, seHits, neOnly, seOnly, both, combined }
}

// ──────────────────────────────────────────────────────────────────────────────
// ANALYSIS 1: Accuracy table — how many NE/SE hits per draw-ahead distance
// ──────────────────────────────────────────────────────────────────────────────
console.log('═'.repeat(72))
console.log('  NE / SE LASER — RE-ENGINEERING LAST 100 DRAWS')
console.log('  NE (cyan ↗): seed S → hits S-k in D+k')
console.log('  SE (orange ↘): seed S → hits S+k in D+k')
console.log('═'.repeat(72))

const START = Math.max(0, TOTAL - 100)
const statsNE = { 1:[], 2:[], 3:[], 4:[], 5:[] }
const statsSE = { 1:[], 2:[], 3:[], 4:[], 5:[] }
const statsBoth = { 1:[], 2:[], 3:[], 4:[], 5:[] }
const statsAny  = { 1:[], 2:[], 3:[], 4:[], 5:[] }

for (let dIdx = START; dIdx < TOTAL; dIdx++) {
  const proj = getProjections(dIdx)
  for (let k = 1; k <= 5; k++) {
    const futIdx = dIdx + k
    if (futIdx >= TOTAL) continue
    const h = checkHits(proj, futIdx)
    statsNE[k].push(h.neHits.length)
    statsSE[k].push(h.seHits.length)
    statsBoth[k].push(h.both.length)
    statsAny[k].push(h.combined.length)
  }
}

console.log('\n📊 ACCURACY: avg hits per draw (5 seeds projected, 5 result numbers to hit)\n')
console.log('  D+k │  NE avg  │  SE avg  │  BOTH(NE+SE same) │  COMBINED any')
console.log('  ────┼──────────┼──────────┼───────────────────┼──────────────')
for (let k = 1; k <= 5; k++) {
  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : '─'
  const pct = arr => arr.length ? Math.round(arr.filter(v=>v>0).length/arr.length*100)+'%' : '─'
  console.log(`  D+${k} │  ${avg(statsNE[k])} (${pct(statsNE[k])}) │  ${avg(statsSE[k])} (${pct(statsSE[k])}) │  ${avg(statsBoth[k])} (${pct(statsBoth[k])})        │  ${avg(statsAny[k])} (${pct(statsAny[k])})`)
}

// ──────────────────────────────────────────────────────────────────────────────
// ANALYSIS 2: REVERSE — for each result number, HOW MANY draws back did
//              NE or SE laser foreshadow it?
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n═'.repeat(72))
console.log('  REVERSE RE-ENGINEERING: for each result number, trace back which')
console.log('  PAST draw\'s NE/SE laser predicted it (up to 5 draws back)')
console.log('═'.repeat(72))

// For each draw D, for each number in D, check if any draw D-k (k=1..5) had
// NE/SE projecting exactly that number
let totalNumbers = 0
let neForeshadowed = 0, seForeshadowed = 0, bothForeshadowed = 0, anyForeshadowed = 0
const foreshadowDepth = { ne:{1:0,2:0,3:0,4:0,5:0}, se:{1:0,2:0,3:0,4:0,5:0} }

// Collect per-draw foreshadow info for verbose output
const drawAnalysis = []

for (let dIdx = START + 1; dIdx < TOTAL; dIdx++) {
  const result = draws[dIdx]
  const resultSet = new Set(result)
  const drawNum = dIdx + 1

  const foreshadowed = { ne: {}, se: {}, both: {} }

  for (let k = 1; k <= 5; k++) {
    const pastIdx = dIdx - k
    if (pastIdx < 0) continue
    const pastSeeds = draws[pastIdx]

    // NE laser from past draw: seed S hits S-k in current draw
    const neProjected = pastSeeds.map(s => s - k).filter(n => n >= 1 && n <= MAX_N)
    // SE laser from past draw: seed S hits S+k in current draw
    const seProjected = pastSeeds.map(s => s + k).filter(n => n >= 1 && n <= MAX_N)

    neProjected.forEach(n => {
      if (resultSet.has(n)) {
        if (!foreshadowed.ne[n]) foreshadowed.ne[n] = { k, pastDraw: pastIdx+1, seeds: pastSeeds }
        foreshadowDepth.ne[k]++
      }
    })
    seProjected.forEach(n => {
      if (resultSet.has(n)) {
        if (!foreshadowed.se[n]) foreshadowed.se[n] = { k, pastDraw: pastIdx+1, seeds: pastSeeds }
        foreshadowDepth.se[k]++
      }
    })
  }

  for (const n of result) {
    totalNumbers++
    const byNE = !!foreshadowed.ne[n]
    const bySE = !!foreshadowed.se[n]
    if (byNE) neForeshadowed++
    if (bySE) seForeshadowed++
    if (byNE && bySE) bothForeshadowed++
    if (byNE || bySE) anyForeshadowed++
  }

  drawAnalysis.push({ dIdx, drawNum, result, foreshadowed })
}

console.log(`\n  Numbers analyzed: ${totalNumbers}  (${Math.round(START)} draws × 5)`)
console.log(`  Foreshadowed by NE:   ${neForeshadowed} (${Math.round(neForeshadowed/totalNumbers*100)}%)`)
console.log(`  Foreshadowed by SE:   ${seForeshadowed} (${Math.round(seForeshadowed/totalNumbers*100)}%)`)
console.log(`  Foreshadowed by BOTH: ${bothForeshadowed} (${Math.round(bothForeshadowed/totalNumbers*100)}%)`)
console.log(`  Foreshadowed by ANY:  ${anyForeshadowed} (${Math.round(anyForeshadowed/totalNumbers*100)}%) ← how many results were visible in a laser!`)

console.log('\n  Depth breakdown — at which D-k distance was foreshadowing seen FIRST:')
console.log('  D-k │ NE count │ SE count │ combined')
console.log('  ────┼──────────┼──────────┼──────────')
for (let k = 1; k <= 5; k++) {
  console.log(`  D-${k} │  ${String(foreshadowDepth.ne[k]).padStart(6)}  │  ${String(foreshadowDepth.se[k]).padStart(6)}  │  ${foreshadowDepth.ne[k]+foreshadowDepth.se[k]}`)
}

// ──────────────────────────────────────────────────────────────────────────────
// ANALYSIS 3: FLOW PATTERN — show last 20 draws with full NE/SE trace
//              "how the number FORMED" via laser lineage
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log('  FLOW PATTERN — LAST 20 DRAWS: number formation via NE↗/SE↘ lasers')
console.log('  Each result number shows: which past draw\'s laser pointed here')
console.log('═'.repeat(72))

const SHOW_LAST = 20
const flowStart = Math.max(1, drawAnalysis.length - SHOW_LAST)

for (let i = flowStart; i < drawAnalysis.length; i++) {
  const { drawNum, result, foreshadowed } = drawAnalysis[i]
  const prev = drawAnalysis[i-1]

  console.log(`\n  ─── D#${drawNum}: [${result.join(', ')}] ───`)

  for (const n of result) {
    const ne = foreshadowed.ne[n]
    const se = foreshadowed.se[n]

    let line = `    ${String(n).padStart(2)}: `
    if (ne && se) {
      line += `🟦NE↗ ← D#${ne.pastDraw}[${ne.seeds.join(',')}] at D-${ne.k} (${ne.seeds.find(s=>s-ne.k===n)}→${n})  `
      line += `🟧SE↘ ← D#${se.pastDraw}[${se.seeds.join(',')}] at D-${se.k} (${se.seeds.find(s=>s+se.k===n)}→${n})  ⚡DUAL`
    } else if (ne) {
      const src = ne.seeds.find(s => s - ne.k === n)
      line += `🟦NE↗ ← D#${ne.pastDraw} seed ${src} (${src}-${ne.k}=${n}) [D-${ne.k}]`
    } else if (se) {
      const src = se.seeds.find(s => s + se.k === n)
      line += `🟧SE↘ ← D#${se.pastDraw} seed ${src} (${src}+${se.k}=${n}) [D-${se.k}]`
    } else {
      line += `  ── no NE/SE beam in last 5 draws`
    }
    console.log(line)
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ANALYSIS 4: NE vs SE DOMINANCE PER DRAW
// Which laser type produces more hits each draw?
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log('  NE vs SE DOMINANCE — which laser leads more results?')
console.log('═'.repeat(72))

let neDom = 0, seDom = 0, tie = 0
for (const { foreshadowed } of drawAnalysis) {
  const neCount = Object.keys(foreshadowed.ne).length
  const seCount = Object.keys(foreshadowed.se).length
  if (neCount > seCount) neDom++
  else if (seCount > neCount) seDom++
  else tie++
}
console.log(`\n  NE↗ dominant draws: ${neDom}   SE↘ dominant: ${seDom}   Tie: ${tie}`)

// ──────────────────────────────────────────────────────────────────────────────
// ANALYSIS 5: CHAIN REACTION — track multi-hop laser chains
//   e.g.: D#330 seed 20 → SE+2 → 22 in D#332 → SE+1 → 23 in D#333
//   This shows "number flowing forward" across multiple draws
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log('  CHAIN REACTIONS — multi-hop laser flows (3+ draw chains)')
console.log('  A → B → C means: A formed B which formed C via NE or SE laser')
console.log('═'.repeat(72))

const chains = []

// For each draw in last 60, try to find 3+ step chains
const chainStart = Math.max(0, TOTAL - 60)
for (let dIdx = chainStart; dIdx < TOTAL - 2; dIdx++) {
  const seeds = draws[dIdx]
  for (const s of seeds) {
    // Try SE chain: s → s+1 → s+2 → s+3
    const seChain = [{ n: s, dIdx, drawNum: dIdx+1, laser: 'seed' }]
    for (let step = 1; step <= 4; step++) {
      const futIdx = dIdx + step
      if (futIdx >= TOTAL) break
      const target = s + step
      if (target > MAX_N) break
      if (draws[futIdx].includes(target)) {
        seChain.push({ n: target, dIdx: futIdx, drawNum: futIdx+1, laser: 'SE' })
      } else break
    }
    if (seChain.length >= 3) {
      chains.push({ type: 'SE↘', chain: seChain })
    }

    // Try NE chain: s → s-1 → s-2 → s-3
    const neChain = [{ n: s, dIdx, drawNum: dIdx+1, laser: 'seed' }]
    for (let step = 1; step <= 4; step++) {
      const futIdx = dIdx + step
      if (futIdx >= TOTAL) break
      const target = s - step
      if (target < 1) break
      if (draws[futIdx].includes(target)) {
        neChain.push({ n: target, dIdx: futIdx, drawNum: futIdx+1, laser: 'NE' })
      } else break
    }
    if (neChain.length >= 3) {
      chains.push({ type: 'NE↗', chain: neChain })
    }
  }
}

// Sort by chain length desc, show top 20
chains.sort((a,b) => b.chain.length - a.chain.length)
const topChains = chains.slice(0, 20)
console.log(`\n  Found ${chains.length} chains ≥3 hops in last 60 draws. Showing top 20:\n`)
for (const { type, chain } of topChains) {
  const desc = chain.map((c,i) => i===0 ? `D#${c.drawNum}:${c.n}` : `→D#${c.drawNum}:${c.n}(${type}${i})`).join(' ')
  console.log(`  ${type} ${chain.length}-hop: ${desc}`)
}

// ──────────────────────────────────────────────────────────────────────────────
// ANALYSIS 6: CURRENT PREDICTION — for latest draw, project NE+SE forward
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log('  NEXT DRAW PREDICTION — NE+SE from last draw + cross-confirmed')
console.log('═'.repeat(72))

const lastIdx = TOTAL - 1
const lastDraw = draws[lastIdx]
console.log(`\n  Last draw D#${TOTAL}: [${lastDraw.join(', ')}]`)

// Score candidates: higher weight if projected by multiple seeds or multiple distances
const score = {}
const reasons = {}

for (const s of lastDraw) {
  // D+1 NE: s-1, D+1 SE: s+1
  const candidates = [
    { n: s-1, type: 'NE', k: 1, weight: 15, src: s },
    { n: s+1, type: 'SE', k: 1, weight: 15, src: s },
    { n: s-2, type: 'NE', k: 2, weight: 8, src: s },
    { n: s+2, type: 'SE', k: 2, weight: 8, src: s },
  ]
  for (const { n, type, k, weight, src } of candidates) {
    if (n < 1 || n > MAX_N) continue
    score[n] = (score[n] || 0) + weight
    if (!reasons[n]) reasons[n] = []
    reasons[n].push(`${type}${k} from ${src}`)
  }
}

// Cross-confirm: also check what D-1 and D-2 SE/NE were projecting to D#TOTAL+1
for (let back = 1; back <= 3; back++) {
  const pastIdx = lastIdx - back
  if (pastIdx < 0) continue
  const pastSeeds = draws[pastIdx]
  const k = back + 1 // they'd be projecting to D+1 from their position
  for (const s of pastSeeds) {
    const neTarget = s - k
    const seTarget = s + k
    const w = back === 1 ? 10 : back === 2 ? 6 : 3
    if (neTarget >= 1 && neTarget <= MAX_N) {
      score[neTarget] = (score[neTarget] || 0) + w
      if (!reasons[neTarget]) reasons[neTarget] = []
      reasons[neTarget].push(`NE from D-${back}:${s}`)
    }
    if (seTarget >= 1 && seTarget <= MAX_N) {
      score[seTarget] = (score[seTarget] || 0) + w
      if (!reasons[seTarget]) reasons[seTarget] = []
      reasons[seTarget].push(`SE from D-${back}:${s}`)
    }
  }
}

const ranked = Object.entries(score)
  .map(([n, sc]) => ({ n: +n, sc, reasons: reasons[n] }))
  .sort((a, b) => b.sc - a.sc)

console.log('\n  🎯 D+1 PREDICTIONS (NE+SE combined, cross-confirmed from D-1,D-2):')
console.log('  Rank │  N  │ Score │ Sources')
console.log('  ─────┼─────┼───────┼────────────────────────────────────────')
ranked.slice(0, 20).forEach(({ n, sc, reasons }, i) => {
  console.log(`  #${String(i+1).padStart(2)}  │  ${String(n).padStart(2)} │  ${String(sc).padStart(4)} │ ${reasons.slice(0,4).join(' · ')}`)
})

// Find numbers confirmed by BOTH NE and SE (strongest signal)
const dualSignal = ranked.filter(({ reasons }) => {
  const hasNE = reasons.some(r => r.startsWith('NE'))
  const hasSE = reasons.some(r => r.startsWith('SE'))
  return hasNE && hasSE
})
console.log(`\n  ⚡ DUAL (NE+SE both point here): ${dualSignal.slice(0,8).map(x=>x.n).join(', ')}`)
console.log(`  🟦 NE-only top-5: ${ranked.filter(r=>r.reasons.some(x=>x.startsWith('NE'))&&!r.reasons.some(x=>x.startsWith('SE'))).slice(0,5).map(x=>x.n).join(', ')}`)
console.log(`  🟧 SE-only top-5: ${ranked.filter(r=>r.reasons.some(x=>x.startsWith('SE'))&&!r.reasons.some(x=>x.startsWith('NE'))).slice(0,5).map(x=>x.n).join(', ')}`)

console.log('\n' + '═'.repeat(72))
console.log('  RE-ENGINEERING COMPLETE')
console.log('═'.repeat(72))
