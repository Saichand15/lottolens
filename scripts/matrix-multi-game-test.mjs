/**
 * MULTI-GAME MATRIX BEAM BACKTEST
 * Verifies the generic matrix-beam predictor across:
 *   - LottoLens   1-45 (5×9)
 *   - Powerball   1-69 (7×10)
 *   - MegaMillions 1-70 (7×10)
 */
import { readFileSync } from 'fs'
import {
  getMatrixConfig,
  predictNextFromMatrix,
  predictIterativeMatrix,
  getDirs,
  mirror,
  getBeamPath,
} from '../src/utils/matrixBeam.js'

function loadDraws(file, key = 'numbers') {
  const raw = JSON.parse(readFileSync(file, 'utf-8'))
  // LottoLens stores number[][] directly; PB/MM store {numbers,...}
  return raw.map(d => Array.isArray(d) ? d : d[key]).map(arr => arr.slice().sort((a, b) => a - b))
}

const games = [
  { name: 'LottoLens 1-45', file: 'public/all_draws.json',    maxN: 45 },
  { name: 'Powerball 1-69', file: 'public/all_pb_draws.json', maxN: 69 },
  { name: 'MegaMillions 1-70', file: 'public/all_mm_draws.json', maxN: 70 },
]

console.log('═'.repeat(78))
console.log('  GENERIC MATRIX BEAM — MULTI-GAME BACKTEST (last 100 draws each)')
console.log('═'.repeat(78))

for (const g of games) {
  const cfg = getMatrixConfig(g.maxN)
  const draws = loadDraws(g.file)
  const TOTAL = draws.length
  const dirs = getDirs(cfg)

  console.log('\n' + '─'.repeat(78))
  console.log(`  ${g.name}  (grid ${cfg.cols}×${cfg.rows} = ${cfg.cols * cfg.rows} cells, maxN=${cfg.maxN})`)
  console.log(`  Direction deltas: NW=${dirs.NW.delta} NE=${dirs.NE.delta} SE=${dirs.SE.delta} SW=${dirs.SW.delta} N=${-cfg.cols} S=${cfg.cols}`)
  console.log(`  Mirror sample: mirror(10) = ${mirror(10, cfg)}`)
  // sanity: NW beam from middle
  const mid = Math.floor(cfg.maxN / 2)
  console.log(`  NW beam from ${mid}: ${getBeamPath(mid, 'NW', cfg).map(p => p.n).join(' → ') || '(at edge)'}`)
  console.log(`  Total draws: ${TOTAL}`)

  const lookback = Math.min(100, TOTAL - 1)
  const exactTotal = lookback * 5
  let sP = { h5: 0, h10: 0, h15: 0, h20: 0 }
  let iP = { h5: 0, h10: 0, h15: 0, h20: 0 }

  for (let dIdx = TOTAL - lookback; dIdx < TOTAL - 1; dIdx++) {
    const seeds = draws[dIdx]
    const next = new Set(draws[dIdx + 1])
    const single = predictNextFromMatrix(seeds, cfg, 4)
    const iter = predictIterativeMatrix(seeds, cfg, { passes: 2, topKReseed: 5, decay: 0.5, depth: 4 })
    const sTop = [5, 10, 15, 20].map(k => single.slice(0, k).map(r => r.n))
    const iTop = [5, 10, 15, 20].map(k => iter.slice(0, k).map(r => r.n))
    for (const n of next) {
      if (sTop[0].includes(n)) sP.h5++
      if (sTop[1].includes(n)) sP.h10++
      if (sTop[2].includes(n)) sP.h15++
      if (sTop[3].includes(n)) sP.h20++
      if (iTop[0].includes(n)) iP.h5++
      if (iTop[1].includes(n)) iP.h10++
      if (iTop[2].includes(n)) iP.h15++
      if (iTop[3].includes(n)) iP.h20++
    }
  }
  const fmt = h => `${(h / exactTotal * 100).toFixed(1)}%`.padStart(5)
  // Random baseline = K/maxN
  const r = k => `${(k / cfg.maxN * 100).toFixed(1)}%`.padStart(5)
  console.log(`\n  Mode                │  top5 │ top10 │ top15 │ top20`)
  console.log(`  Single-pass         │ ${fmt(sP.h5)} │ ${fmt(sP.h10)} │ ${fmt(sP.h15)} │ ${fmt(sP.h20)}`)
  console.log(`  Iterative 2-pass    │ ${fmt(iP.h5)} │ ${fmt(iP.h10)} │ ${fmt(iP.h15)} │ ${fmt(iP.h20)}`)
  console.log(`  Random baseline     │ ${r(5)} │ ${r(10)} │ ${r(15)} │ ${r(20)}`)

  // Show next prediction
  const last = draws[TOTAL - 1]
  const pred = predictIterativeMatrix(last, cfg, { passes: 2, topKReseed: 5, decay: 0.5, depth: 4 }).slice(0, 12)
  console.log(`\n  Last draw: [${last.join(', ')}]`)
  console.log(`  Top 12 (iterative):`)
  console.log(`    ${pred.map(p => `${p.n}(${p.score.toFixed(0)})`).join(' ')}`)
}

// ── BONUS: bonus-ball backtest (1-26 PB, 1-25 MM) ──
console.log('\n' + '═'.repeat(78))
console.log('  BONUS BALL MATRIX BEAM (single-number sequence, predict next bonus)')
console.log('═'.repeat(78))

const bonusGames = [
  { name: 'Powerball 1-26', file: 'public/all_pb_draws.json', maxN: 26, key: 'pb' },
  { name: 'MegaBall 1-25', file: 'public/all_mm_draws.json', maxN: 25, key: 'mb' },
]

for (const g of bonusGames) {
  const cfg = getMatrixConfig(g.maxN)
  const raw = JSON.parse(readFileSync(g.file, 'utf-8'))
  const balls = raw.map(d => d[g.key]).filter(n => n != null && n >= 1 && n <= cfg.maxN)
  const TOTAL = balls.length
  console.log(`\n  ${g.name} (grid ${cfg.cols}×${cfg.rows}, ${TOTAL} draws)`)

  const lookback = Math.min(100, TOTAL - 1)
  let h3 = 0, h5 = 0, h10 = 0
  // Use last K balls as "seeds" for matrix beam prediction of next ball
  const SEED_WIN = 3 // predict next bonus from last 3 bonus balls
  for (let i = TOTAL - lookback; i < TOTAL - 1; i++) {
    const seeds = balls.slice(Math.max(0, i - SEED_WIN + 1), i + 1)
    const next = balls[i + 1]
    const pred = predictIterativeMatrix(seeds, cfg, { passes: 2, topKReseed: 4, decay: 0.5, depth: 3 })
    const top3 = pred.slice(0, 3).map(r => r.n)
    const top5 = pred.slice(0, 5).map(r => r.n)
    const top10 = pred.slice(0, 10).map(r => r.n)
    if (top3.includes(next)) h3++
    if (top5.includes(next)) h5++
    if (top10.includes(next)) h10++
  }
  const pct = x => `${(x / lookback * 100).toFixed(1)}%`
  console.log(`  Top-3:  ${h3}/${lookback} = ${pct(h3)}  (random ${(3 / cfg.maxN * 100).toFixed(1)}%)`)
  console.log(`  Top-5:  ${h5}/${lookback} = ${pct(h5)}  (random ${(5 / cfg.maxN * 100).toFixed(1)}%)`)
  console.log(`  Top-10: ${h10}/${lookback} = ${pct(h10)}  (random ${(10 / cfg.maxN * 100).toFixed(1)}%)`)

  const last3 = balls.slice(-SEED_WIN)
  const pred = predictIterativeMatrix(last3, cfg, { passes: 2, topKReseed: 4, decay: 0.5, depth: 3 }).slice(0, 8)
  console.log(`  Last ${SEED_WIN} bonus balls: [${last3.join(', ')}]`)
  console.log(`  Next bonus prediction (top 8): ${pred.map(p => `${p.n}(${p.score.toFixed(0)})`).join(' ')}`)
}
