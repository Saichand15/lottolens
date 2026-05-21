/**
 * 1-45 MATRIX BEAM ANALYSIS — verification + backtest
 *
 * Guide says: 29 → NW → 23 → 17 → 11 → 5  (step -6 each)
 * This works ONLY if the grid is 5 cols × 9 rows:
 *   1  2  3  4  5
 *   6  7  8  9 10
 *  11 12 13 14 15
 *  16 17 18 19 20
 *  21 22 23 24 25
 *  26 27 28 29 30   ← 29 is row 5, col 3 (0-idx)
 *  31 32 33 34 35
 *  36 37 38 39 40
 *  41 42 43 44 45
 * NW from (5,3) = (4,2) = 23 ✓
 *
 * Direction step sizes in this grid:
 *   NW = -6, NE = -4, SE = +6, SW = +4
 *   N  = -5, S  = +5  (pure column move = ±5)
 *   E  = +1, W  = -1
 *   Mirror: 46 - N
 */

import { readFileSync } from 'fs'

const draws = JSON.parse(readFileSync('public/all_draws.json', 'utf-8'))
const TOTAL = draws.length
const MAX_N = 45
const W = 5, H = 9

const nToPos = n => ({ row: Math.floor((n-1)/W), col: (n-1) % W })
const posToN = (r,c) => (r<0||r>=H||c<0||c>=W) ? null : r*W + c + 1
const mirror = n => 46 - n

const DIRS = {
  NW: { dr:-1, dc:-1 },
  NE: { dr:-1, dc:+1 },
  SW: { dr:+1, dc:-1 },
  SE: { dr:+1, dc:+1 },
}

function getBeamPath(base, dir, maxSteps = 9) {
  const { row, col } = nToPos(base)
  const { dr, dc } = DIRS[dir]
  const path = []
  for (let s = 1; s <= maxSteps; s++) {
    const n = posToN(row + dr*s, col + dc*s)
    if (n === null) break
    path.push(n)
  }
  return path
}

// Collect all matrix-beam reachable numbers from a seed
function getAllReach(seed, depth = 4) {
  const reach = new Set()
  const meta = {} // n -> [reasons]
  const add = (n, reason) => {
    if (n < 1 || n > MAX_N) return
    reach.add(n)
    if (!meta[n]) meta[n] = []
    meta[n].push(reason)
  }
  // 4 diagonal beams
  for (const dir of ['NW','NE','SW','SE']) {
    const path = getBeamPath(seed, dir, depth)
    path.forEach((n, i) => add(n, `${dir}${i+1}`))
  }
  // Mirror
  add(mirror(seed), `mirror`)
  // Vertical N/S (column = ±5)
  for (let s = 1; s <= depth; s++) {
    add(seed - 5*s, `N${s}`)
    add(seed + 5*s, `S${s}`)
  }
  // Horizontal E/W (row = ±1) — but only if same row
  const { row } = nToPos(seed)
  for (let s = 1; s <= 4; s++) {
    const left = seed - s, right = seed + s
    if (left >= 1 && nToPos(left).row === row) add(left, `W${s}`)
    if (right <= MAX_N && nToPos(right).row === row) add(right, `E${s}`)
  }
  return { reach: [...reach], meta }
}

// === VERIFY GUIDE EXAMPLE ===
console.log('═'.repeat(60))
console.log('  VERIFY: NW beam from 29')
console.log('═'.repeat(60))
console.log('Expected: 29 → 23 → 17 → 11 → 5')
console.log('Got:     ', [29, ...getBeamPath(29, 'NW')].slice(0,5).join(' → '))

console.log('\nAll 4 beams from 29:')
for (const dir of ['NW','NE','SE','SW']) {
  console.log(`  ${dir}: ${getBeamPath(29, dir).join(' → ')}`)
}
console.log(`  mirror(29) = ${mirror(29)}`)

// === BACKTEST: matrix beam prediction accuracy ===
console.log('\n' + '═'.repeat(60))
console.log('  BACKTEST: matrix beam predictions on last 100 draws')
console.log('═'.repeat(60))

const lookback = Math.min(100, TOTAL - 1)
let exactHits = 0, exactTotal = 0
let top10Hits = 0, top10Total = 0
let top20Hits = 0
const dirHits = { NW:0, NE:0, SE:0, SW:0, mirror:0, N:0, S:0, E:0, W:0 }
const dirAttempts = { NW:0, NE:0, SE:0, SW:0, mirror:0, N:0, S:0, E:0, W:0 }
const stepHits = {} // by direction+step

for (let dIdx = TOTAL - lookback; dIdx < TOTAL - 1; dIdx++) {
  const seeds = draws[dIdx]
  const next = new Set(draws[dIdx + 1])

  // Score every candidate
  const score = {}
  for (const seed of seeds) {
    const { reach, meta } = getAllReach(seed, 4)
    for (const n of reach) {
      const reasons = meta[n] || []
      let w = 0
      reasons.forEach(r => {
        // Weight by step distance
        const step = parseInt(r.match(/\d+$/)?.[0] || '1')
        w += Math.max(1, 5 - step)
      })
      score[n] = (score[n] || 0) + w
      // Track per-direction
      reasons.forEach(r => {
        const t = r.replace(/\d+$/, '') || r
        const dir = ['NW','NE','SE','SW','mirror','N','S','E','W'].find(d => r.startsWith(d)) || t
        dirAttempts[dir] = (dirAttempts[dir] || 0) + 1
        if (next.has(n)) dirHits[dir] = (dirHits[dir] || 0) + 1
      })
    }
  }

  const ranked = Object.entries(score).map(([n,s]) => ({ n:+n, s })).sort((a,b)=>b.s-a.s)
  const top10 = ranked.slice(0,10).map(r=>r.n)
  const top20 = ranked.slice(0,20).map(r=>r.n)
  exactTotal += 5
  for (const n of next) {
    if (top10.includes(n)) top10Hits++
    if (top20.includes(n)) top20Hits++
  }
  top10Total += 1
}

console.log(`\n  Top-10 picks:  ${top10Hits}/${exactTotal} = ${(top10Hits/exactTotal*100).toFixed(1)}% recall`)
console.log(`  Top-20 picks:  ${top20Hits}/${exactTotal} = ${(top20Hits/exactTotal*100).toFixed(1)}% recall`)
console.log(`  (random baseline ~22% for top-10, ~44% for top-20)`)

console.log('\n  Per-direction hit rate (any seed → next draw):')
for (const d of ['NW','NE','SE','SW','N','S','mirror','E','W']) {
  const h = dirHits[d] || 0, t = dirAttempts[d] || 0
  if (t === 0) continue
  console.log(`    ${d.padEnd(6)} ${(h/t*100).toFixed(1)}% hit (${h}/${t})`)
}

// === CURRENT NEXT DRAW PREDICTION ===
console.log('\n' + '═'.repeat(60))
console.log('  PREDICTION for next draw (after D#' + TOTAL + ')')
console.log('═'.repeat(60))

const lastDraw = draws[TOTAL-1]
console.log(`  Last draw: [${lastDraw.join(', ')}]`)

const score = {}
const reasonAll = {}
for (const seed of lastDraw) {
  const { reach, meta } = getAllReach(seed, 4)
  for (const n of reach) {
    const reasons = meta[n]
    let w = 0
    reasons.forEach(r => {
      const step = parseInt(r.match(/\d+$/)?.[0] || '1')
      w += Math.max(1, 5 - step)
    })
    score[n] = (score[n] || 0) + w
    if (!reasonAll[n]) reasonAll[n] = []
    reasonAll[n].push({ seed, reasons })
  }
}

// Confluence depth = how many seeds project here
const ranked = Object.entries(score).map(([n,s]) => {
  const seedsHit = reasonAll[+n].length
  const allReasons = reasonAll[+n].flatMap(r => r.reasons.map(x => `${r.seed}${x}`))
  return { n:+n, s, seedsHit, reasons: allReasons }
}).sort((a,b)=>b.s-a.s || b.seedsHit-a.seedsHit)

console.log('\n  Top 20 candidates (confluence ranked):')
console.log('  Rank │  N  │ Score │ Seeds │ Reasons')
console.log('  ─────┼─────┼───────┼───────┼─────────────────────────')
ranked.slice(0,20).forEach(({n,s,seedsHit,reasons},i) => {
  console.log(`  #${String(i+1).padStart(2)}  │ ${String(n).padStart(2)}  │  ${String(s).padStart(4)} │   ${seedsHit}   │ ${reasons.slice(0,5).join(' ')}`)
})
