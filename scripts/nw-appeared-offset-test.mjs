/**
 * NW_APPEARED OFFSET INVESTIGATION
 *
 * The debug shows: for each seed number at ci=99 (last draw),
 * the NW laser beam looks BACKWARD through history. It records:
 *   NW_steps = total cornerTouch entries in NW direction (2*rowIdx - 1)
 *   NW_appeared = how many of those historical positions actually had a drawn number
 *
 * USER HYPOTHESIS: NW_appeared acts as a dynamic offset.
 *   seed ± NW_appeared → predicts next draw numbers
 *
 * This script backtests EVERY direction (NW/NE/SE/SW), EVERY offset type,
 * and finds which combination actually beats random.
 */
import { readFileSync } from 'fs'

const draws = JSON.parse(readFileSync('public/all_draws.json', 'utf-8'))
const TOTAL = draws.length
const MAX_N = 45
const WIN = 100  // use 100-draw window (matches display)

// ── Replicate computeLaserHits for a given seed at last column of window ──
const DIRS = {
  NE: { dc: +1, dr: -1 },
  NW: { dc: -1, dr: -1 },
  SE: { dc: +1, dr: +1 },
  SW: { dc: -1, dr: +1 }
}

function getLaserStats(window, seed) {
  const colIdx = window.length - 1
  const rowIdx = seed - 1
  const drawSets = window.map(d => new Set(d))
  const stats = {}

  for (const [dir, { dc, dr }] of Object.entries(DIRS)) {
    let totalSteps = 0, appeared = 0
    const appearedAt = []  // {step, number} where appeared
    let step = 1
    while (true) {
      const ci = colIdx + dc * step
      const ri = rowIdx + dr * step
      if (ci < 0 || ci >= window.length || ri < 0 || ri >= MAX_N) break
      const n = ri + 1
      const hit = drawSets[ci]?.has(n) || false
      totalSteps++
      if (hit) { appeared++; appearedAt.push({ step, number: n }) }
      // adjacent
      const adjRi = dr < 0 ? ri - 1 : ri + 1
      if (adjRi >= 0 && adjRi < MAX_N) {
        const adjN = adjRi + 1
        const adjHit = drawSets[ci]?.has(adjN) || false
        totalSteps++
        if (adjHit) { appeared++; appearedAt.push({ step, number: adjN, isAdj: true }) }
      }
      step++
    }
    stats[dir] = { totalSteps, appeared, appearedAt, maxStep: step - 1 }
  }
  return stats
}

// ── Score generator: for each seed, gen candidate numbers using appeared offsets ──
function genCandidates(seed, stats) {
  const candidates = {}
  const add = (n, reason, weight) => {
    if (n < 1 || n > MAX_N) return
    if (!candidates[n]) candidates[n] = { score: 0, reasons: [] }
    candidates[n].score += weight
    candidates[n].reasons.push(reason)
  }

  for (const dir of ['NW', 'NE', 'SE', 'SW']) {
    const { appeared, totalSteps, appearedAt } = stats[dir]
    if (appeared === 0) continue

    // Hypothesis 1: seed + appeared as offset
    add(seed + appeared, `${dir}+app`, appeared)
    add(seed - appeared, `${dir}-app`, appeared)

    // Hypothesis 2: seed + each appeared_step (the actual step where a hit occurred)
    for (const { step } of appearedAt) {
      add(seed + step, `${dir}+step${step}`, 2)
      add(seed - step, `${dir}-step${step}`, 2)
    }

    // Hypothesis 3: appeared number itself (where the laser hit)
    for (const { number } of appearedAt) {
      add(number, `${dir}_hit`, 3)
    }

    // Hypothesis 4: appeared as % of totalSteps * MAX_N → position
    const ratio = appeared / totalSteps
    const posN = Math.round(ratio * MAX_N)
    if (posN >= 1 && posN <= MAX_N) add(posN, `${dir}_ratioPos`, 1)
  }
  return candidates
}

// ── BACKTEST ──
const lookback = Math.min(WIN * 5, TOTAL - 1)  // test on 500 draws
let h5 = 0, h10 = 0, h15 = 0, h20 = 0, exactTotal = 0

// Track per-hypothesis hits
const hypHits = {}
const hypTotal = {}

for (let dIdx = TOTAL - lookback; dIdx < TOTAL - 1; dIdx++) {
  const window = draws.slice(Math.max(0, dIdx - WIN + 1), dIdx + 1)
  const seeds = draws[dIdx]
  const next = new Set(draws[dIdx + 1])

  // Score all candidates
  const totalScore = {}
  const totalReasons = {}
  for (const seed of seeds) {
    const stats = getLaserStats(window, seed)
    const cands = genCandidates(seed, stats)
    for (const [n, { score, reasons }] of Object.entries(cands)) {
      totalScore[+n] = (totalScore[+n] || 0) + score
      if (!totalReasons[+n]) totalReasons[+n] = []
      totalReasons[+n].push(...reasons)
    }
  }

  const ranked = Object.entries(totalScore)
    .map(([n, s]) => ({ n: +n, s }))
    .sort((a, b) => b.s - a.s)

  const top5 = ranked.slice(0, 5).map(r => r.n)
  const top10 = ranked.slice(0, 10).map(r => r.n)
  const top15 = ranked.slice(0, 15).map(r => r.n)
  const top20 = ranked.slice(0, 20).map(r => r.n)
  exactTotal += 5
  for (const n of next) {
    if (top5.includes(n)) h5++
    if (top10.includes(n)) h10++
    if (top15.includes(n)) h15++
    if (top20.includes(n)) h20++
  }

  // Track per-hypothesis hits
  for (const [n, reasons] of Object.entries(totalReasons)) {
    const inNext = next.has(+n)
    for (const r of reasons) {
      const hyp = r.replace(/\d+$/, '*').replace(/step\d+/, 'stepN')
      hypTotal[hyp] = (hypTotal[hyp] || 0) + 1
      if (inNext) hypHits[hyp] = (hypHits[hyp] || 0) + 1
    }
  }
}

const pct = h => `${(h / exactTotal * 100).toFixed(1)}%`
const rand = k => `${(k / MAX_N * 100).toFixed(1)}%`

console.log('═'.repeat(72))
console.log('  NW_APPEARED OFFSET BACKTEST — last', lookback, 'draws')
console.log('═'.repeat(72))
console.log(`  top5: ${pct(h5)}  top10: ${pct(h10)}  top15: ${pct(h15)}  top20: ${pct(h20)}`)
console.log(`  random: top5=${rand(5)}  top10=${rand(10)}  top15=${rand(15)}  top20=${rand(20)}`)

console.log('\n  Per-hypothesis hit rate (candidate appeared in next draw / total times candidate generated):')
const sorted = Object.entries(hypHits)
  .map(([h, hits]) => ({ h, hits, total: hypTotal[h], rate: hits / hypTotal[h] }))
  .sort((a, b) => b.rate - a.rate)
sorted.slice(0, 20).forEach(({ h, hits, total, rate }) => {
  const bar = '█'.repeat(Math.round(rate * 50))
  console.log(`  ${h.padEnd(18)} ${(rate * 100).toFixed(1)}%  (${hits}/${total}) ${bar}`)
})

// ── ISOLATION TEST: just seed ± NW_appeared only ──
console.log('\n' + '═'.repeat(72))
console.log('  ISOLATION: seed ± dir_appeared ONLY (each direction separately)')
console.log('═'.repeat(72))

for (const testDir of ['NW', 'NE', 'SE', 'SW']) {
  let ih5 = 0, ih10 = 0, iTotal = 0
  for (let dIdx = TOTAL - lookback; dIdx < TOTAL - 1; dIdx++) {
    const window = draws.slice(Math.max(0, dIdx - WIN + 1), dIdx + 1)
    const seeds = draws[dIdx]
    const next = new Set(draws[dIdx + 1])
    const score = {}
    for (const seed of seeds) {
      const stats = getLaserStats(window, seed)
      const { appeared } = stats[testDir]
      if (appeared === 0) continue
      const plus = seed + appeared, minus = seed - appeared
      if (plus >= 1 && plus <= MAX_N) score[plus] = (score[plus] || 0) + appeared
      if (minus >= 1 && minus <= MAX_N) score[minus] = (score[minus] || 0) + appeared
    }
    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1])
    const top5 = ranked.slice(0, 5).map(r => +r[0])
    const top10 = ranked.slice(0, 10).map(r => +r[0])
    iTotal += 5
    for (const n of next) {
      if (top5.includes(n)) ih5++
      if (top10.includes(n)) ih10++
    }
  }
  console.log(`  ${testDir}: top5=${pct(ih5).padStart(5)}  top10=${pct(ih10).padStart(5)}  (of ${iTotal} targets)`)
}

// ── SHOW WHAT THE PATTERN LOOKS LIKE FOR LAST DRAW ──
console.log('\n' + '═'.repeat(72))
console.log('  DETAILED STATS FOR LAST DRAW D#' + TOTAL)
console.log('═'.repeat(72))
const lastWindow = draws.slice(Math.max(0, TOTAL - WIN), TOTAL)
const lastSeeds = draws[TOTAL - 1]
console.log('  Seeds:', lastSeeds.join(', '))
console.log()
console.log('  Seed │ NW_app │ NE_app │ SE_app │ SW_app │ NW+off │ NW-off │ SE+off │ SE-off')
console.log('  ─────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────')
for (const seed of lastSeeds) {
  const stats = getLaserStats(lastWindow, seed)
  const nw = stats.NW.appeared, ne = stats.NE.appeared
  const se = stats.SE.appeared, sw = stats.SW.appeared
  const p = n => (n >= 1 && n <= MAX_N) ? String(n).padStart(5) : '  ---'
  console.log(`  ${String(seed).padStart(4)} │   ${String(nw).padStart(3)}  │   ${String(ne).padStart(3)}  │   ${String(se).padStart(3)}  │   ${String(sw).padStart(3)}  │  ${p(seed+nw)}  │  ${p(seed-nw)}  │  ${p(seed+se)}  │  ${p(seed-se)}`)
}

// Aggregate appeared-offset candidates for next draw
const nextScore = {}
for (const seed of lastSeeds) {
  const stats = getLaserStats(lastWindow, seed)
  const cands = genCandidates(seed, stats)
  for (const [n, { score, reasons }] of Object.entries(cands)) {
    nextScore[+n] = (nextScore[+n] || 0) + score
  }
}
const nextRanked = Object.entries(nextScore)
  .map(([n, s]) => ({ n: +n, s }))
  .sort((a, b) => b.s - a.s)
console.log('\n  Top 15 next-draw candidates (all hypotheses combined):')
nextRanked.slice(0, 15).forEach(({ n, s }, i) => {
  console.log(`    #${i + 1}: ${n} (score=${s})`)
})
