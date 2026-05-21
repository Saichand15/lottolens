/**
 * ITERATIVE MATRIX BEAM — backtest
 * 
 * Idea: previous draw → tier-1 candidates → re-seed top-K → tier-2 → ...
 * This catches CHAINS within a draw (e.g. 3→8→14→19 walking south).
 * 
 * Compare: single-pass vs 2-pass vs 3-pass.
 */
import { readFileSync } from 'fs'

const draws = JSON.parse(readFileSync('public/all_draws.json', 'utf-8'))
const TOTAL = draws.length
const W = 5, H = 9

const nToPos = n => ({ row: Math.floor((n-1)/W), col: (n-1) % W })
const posToN = (r,c) => (r<0||r>=H||c<0||c>=W) ? null : r*W + c + 1
const mirror = n => 46 - n

const DIRS = {
  NW: { dr:-1, dc:-1 }, NE: { dr:-1, dc:+1 },
  SW: { dr:+1, dc:-1 }, SE: { dr:+1, dc:+1 },
}

function getBeamPath(base, dir, maxSteps = 4) {
  const { row, col } = nToPos(base)
  const { dr, dc } = DIRS[dir]
  const path = []
  for (let s = 1; s <= maxSteps; s++) {
    const n = posToN(row + dr*s, col + dc*s)
    if (n === null) break
    path.push({ n, step: s })
  }
  return path
}

function getAllReach(seed, depth = 4) {
  const meta = {}
  const add = (n, type, step) => {
    if (n < 1 || n > 45) return
    if (!meta[n]) meta[n] = []
    meta[n].push({ type, step })
  }
  for (const dir of ['NW','NE','SE','SW']) {
    getBeamPath(seed, dir, depth).forEach(({n,step}) => add(n, dir, step))
  }
  add(mirror(seed), 'mirror', 0)
  for (let s = 1; s <= depth; s++) {
    add(seed - 5*s, 'N', s)
    add(seed + 5*s, 'S', s)
  }
  const { row } = nToPos(seed)
  for (let s = 1; s <= 4; s++) {
    if (seed - s >= 1 && nToPos(seed - s).row === row) add(seed - s, 'W', s)
    if (seed + s <= 45 && nToPos(seed + s).row === row) add(seed + s, 'E', s)
  }
  return meta
}

// Score candidates from a seed list, with optional weight multiplier
function scoreFromSeeds(seeds, weightMul = 1.0, depth = 4) {
  const score = {}
  const seedsHit = {}
  for (const seed of seeds) {
    const meta = getAllReach(seed, depth)
    for (const n in meta) {
      const reasons = meta[n]
      let w = 0
      reasons.forEach(({type, step}) => {
        w += type === 'mirror' ? 4 : Math.max(1, 5 - step)
      })
      score[n] = (score[n] || 0) + w * weightMul
      if (!seedsHit[n]) seedsHit[n] = new Set()
      seedsHit[n].add(seed)
    }
  }
  return { score, seedsHit }
}

// Iterative: pass1 from prevDraw, pass2 from top-K of pass1, etc.
// Each pass adds with decaying weight.
function iterativePredict(prevDraw, passes = 2, topKReseed = 5, decay = 0.5) {
  const totalScore = {}
  const totalSeedsHit = {}
  
  let currentSeeds = prevDraw
  let weight = 1.0
  
  for (let p = 0; p < passes; p++) {
    const { score, seedsHit } = scoreFromSeeds(currentSeeds, weight, 4)
    for (const n in score) {
      totalScore[n] = (totalScore[n] || 0) + score[n]
      if (!totalSeedsHit[n]) totalSeedsHit[n] = new Set()
      seedsHit[n].forEach(s => totalSeedsHit[n].add(s))
    }
    // Pick top-K from THIS pass to re-seed (excluding prevDraw seeds)
    const ranked = Object.entries(score)
      .map(([n,s]) => ({ n: +n, s }))
      .filter(r => !prevDraw.includes(r.n))
      .sort((a,b) => b.s - a.s)
    currentSeeds = ranked.slice(0, topKReseed).map(r => r.n)
    weight *= decay
    if (currentSeeds.length === 0) break
  }
  
  // Confluence bonus
  return Object.entries(totalScore).map(([nStr, sc]) => {
    const n = +nStr
    const sh = totalSeedsHit[n].size
    const finalScore = sh >= 3 ? sc * 1.3 : sc
    return { n, score: finalScore, seedsHit: sh }
  }).sort((a,b) => b.score - a.score || b.seedsHit - a.seedsHit)
}

// === BACKTEST all modes ===
const lookback = Math.min(100, TOTAL - 1)
const modes = [
  { name: '1-pass (current)',     fn: prev => iterativePredict(prev, 1, 5, 0.5) },
  { name: '2-pass topK=3 dec=0.5', fn: prev => iterativePredict(prev, 2, 3, 0.5) },
  { name: '2-pass topK=5 dec=0.5', fn: prev => iterativePredict(prev, 2, 5, 0.5) },
  { name: '2-pass topK=5 dec=0.7', fn: prev => iterativePredict(prev, 2, 5, 0.7) },
  { name: '2-pass topK=8 dec=0.5', fn: prev => iterativePredict(prev, 2, 8, 0.5) },
  { name: '3-pass topK=5 dec=0.5', fn: prev => iterativePredict(prev, 3, 5, 0.5) },
  { name: '3-pass topK=3 dec=0.6', fn: prev => iterativePredict(prev, 3, 3, 0.6) },
]

console.log('═'.repeat(70))
console.log(`  ITERATIVE MATRIX BACKTEST — last ${lookback} draws`)
console.log('═'.repeat(70))
console.log(`  ${'mode'.padEnd(28)} │  top5 │ top10 │ top15 │ top20`)
console.log(`  ${'─'.repeat(28)} ┼───────┼───────┼───────┼──────`)

const exactTotal = lookback * 5

for (const mode of modes) {
  let h5=0, h10=0, h15=0, h20=0
  for (let dIdx = TOTAL - lookback; dIdx < TOTAL - 1; dIdx++) {
    const ranked = mode.fn(draws[dIdx])
    const next = new Set(draws[dIdx + 1])
    const t5 = ranked.slice(0,5).map(r=>r.n)
    const t10 = ranked.slice(0,10).map(r=>r.n)
    const t15 = ranked.slice(0,15).map(r=>r.n)
    const t20 = ranked.slice(0,20).map(r=>r.n)
    for (const n of next) {
      if (t5.includes(n)) h5++
      if (t10.includes(n)) h10++
      if (t15.includes(n)) h15++
      if (t20.includes(n)) h20++
    }
  }
  const fmt = (h) => `${(h/exactTotal*100).toFixed(1)}%`.padStart(5)
  console.log(`  ${mode.name.padEnd(28)} │ ${fmt(h5)} │ ${fmt(h10)} │ ${fmt(h15)} │ ${fmt(h20)}`)
}

console.log(`\n  Random baseline:  top5=11.1%  top10=22.2%  top15=33.3%  top20=44.4%`)

// === Show iterative prediction for last draw ===
console.log('\n' + '═'.repeat(70))
console.log('  ITERATIVE PREDICTION for next draw')
console.log('═'.repeat(70))
const lastDraw = draws[TOTAL-1]
console.log(`  Last draw: [${lastDraw.join(', ')}]`)

const itPred = iterativePredict(lastDraw, 2, 5, 0.5)
console.log('\n  Top 12 (2-pass, topK=5, decay=0.5):')
itPred.slice(0,12).forEach((r,i) => {
  console.log(`    #${String(i+1).padStart(2)}  N=${String(r.n).padStart(2)}  score=${r.score.toFixed(1).padStart(6)}  seeds=${r.seedsHit}`)
})

// === Test against the example user gave: 3 8 14 19 36 ===
console.log('\n' + '═'.repeat(70))
console.log('  TEST CASE: user said 1-pass gave [3,6,11,18,31] when actual was [3,8,14,19,36]')
console.log('═'.repeat(70))
// Find which draw resulted in [3,8,14,19,36]
let targetIdx = -1
for (let i = 0; i < TOTAL; i++) {
  const d = draws[i].slice().sort((a,b)=>a-b)
  if (d[0]===3 && d[1]===8 && d[2]===14 && d[3]===19 && d[4]===36) {
    targetIdx = i; break
  }
}
if (targetIdx > 0) {
  const prev = draws[targetIdx - 1]
  console.log(`  Found: D#${targetIdx+1} = [3,8,14,19,36], previous D#${targetIdx} = [${prev.join(', ')}]`)
  for (const mode of modes) {
    const r = mode.fn(prev)
    const top12 = r.slice(0,12).map(x=>x.n)
    const hit = [3,8,14,19,36].filter(n => top12.includes(n))
    const top20 = r.slice(0,20).map(x=>x.n)
    const hit20 = [3,8,14,19,36].filter(n => top20.includes(n))
    console.log(`    ${mode.name.padEnd(28)}: top12=[${top12.join(',')}] hits=${hit.length} (top20 hits=${hit20.length})`)
  }
} else {
  console.log('  Draw not found in dataset.')
}
