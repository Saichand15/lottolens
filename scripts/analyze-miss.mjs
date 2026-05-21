import { readFileSync } from 'fs'

const rawDraws = JSON.parse(readFileSync('public/all_draws.json', 'utf8'))
const SEED_DRAW  = [5, 14, 17, 29, 37]
const ACTUAL_NEXT = [12, 21, 27, 28, 44]
const MAX_NUM = 45

// Append seed draw to history if not present (manually added draw scenario)
let seedIdx = rawDraws.findIndex(d => SEED_DRAW.every(n => d.includes(n)) && d.length === 5)
const draws = seedIdx === -1 ? [...rawDraws, SEED_DRAW] : rawDraws
if (seedIdx === -1) { seedIdx = draws.length - 1; console.log(`[${SEED_DRAW}] not in DB — simulated as D#${seedIdx + 1}`) }
else console.log(`Draw found at D#${seedIdx + 1}`)
console.log(`Actual next draw: [${ACTUAL_NEXT}]\n`)

// ── Touch-math engine (mirrors FriendshipPanel) ────────────────────────────
const BP_DIRS = { NW: { dc: -1, dr: -1 }, NE: { dc: +1, dr: -1 }, SW: { dc: -1, dr: +1 }, SE: { dc: +1, dr: +1 } }

function bpGetTouches(slice, ci, seed, dir) {
  const { dc, dr } = BP_DIRS[dir]
  const path = [], corner = []
  for (let step = 1; step <= slice.length; step++) {
    const c2 = ci + dc * step, n = seed + dr * step
    if (c2 < 0 || c2 >= slice.length || n < 1 || n > MAX_NUM) break
    if (slice[c2].includes(n)) path.push(n)
    if (n - 1 >= 1 && slice[c2].includes(n - 1)) corner.push(n - 1)
    if (n + 1 <= MAX_NUM && slice[c2].includes(n + 1)) corner.push(n + 1)
  }
  return { path: [...new Set(path)], corner: [...new Set(corner)] }
}

function computeTouchMath(slice, ci, seed) {
  const beamNums = {}
  const allNums = new Set([seed])
  for (const dir of Object.keys(BP_DIRS)) {
    const { path, corner } = bpGetTouches(slice, ci, seed, dir)
    beamNums[dir] = { path, corner }
    path.forEach(n => allNums.add(n))
    corner.forEach(n => allNums.add(n))
  }
  const nums = [...allNums].filter(n => n >= 1 && n <= MAX_NUM)
  const resultMap = {}
  const addR = (result, expr, w = 1) => {
    if (result < 6 || result > MAX_NUM) return  // skip tiny-diff noise
    if (!resultMap[result]) resultMap[result] = { exprs: [], weight: 0 }
    if (!resultMap[result].exprs.includes(expr)) { resultMap[result].exprs.push(expr); resultMap[result].weight += w }
  }
  for (let i = 0; i < nums.length; i++) {
    for (let j = i; j < nums.length; j++) {
      const a = nums[i], b = nums[j]
      const gap = Math.abs(a - b)
      const w = gap > 3 ? 2 : 1
      if (a !== b) { addR(a + b, `${a}+${b}`, w); addR(gap, `${Math.max(a,b)}-${Math.min(a,b)}`, w) }
      else addR(a + b, `${a}+${b}`, w)
    }
  }
  const ranked = Object.entries(resultMap)
    .map(([n, { exprs, weight }]) => ({ n: +n, count: exprs.length, weight, exprs }))
    .sort((a, b) => b.weight - a.weight || b.count - a.count || a.n - b.n)
  return { ranked, beamNums, nums }
}

const slice = draws.slice(Math.max(0, seedIdx - 99), seedIdx + 1)
const ci = slice.length - 1

// ── Per-seed analysis ──────────────────────────────────────────────────────
const globalMap = {}
const addG = (n, exprs, weight, s) => {
  if (!globalMap[n]) globalMap[n] = { totalVotes: 0, exprs: [], seeds: [] }
  globalMap[n].totalVotes += weight
  exprs.forEach(e => { if (!globalMap[n].exprs.includes(e)) globalMap[n].exprs.push(e) })
  if (!globalMap[n].seeds.includes(s)) globalMap[n].seeds.push(s)
}

const SEP = '='.repeat(70)
console.log(SEP)
console.log(`SEED DRAW D#${seedIdx + 1}: [${SEED_DRAW}]  ->  ACTUAL D#${seedIdx + 2}: [${ACTUAL_NEXT}]`)
console.log(SEP)

for (const s of SEED_DRAW) {
  const { ranked, beamNums, nums } = computeTouchMath(slice, ci, s)
  console.log(`\n-- Seed #${s} --`)
  for (const [dir, { path, corner }] of Object.entries(beamNums)) {
    if (path.length || corner.length)
      console.log(`  ${dir}: path=[${path.join(',')}]  corner=[${corner.join(',')}]`)
  }
  console.log(`  Touch pool (${nums.length} nums): [${nums.slice().sort((a, b) => a - b).join(', ')}]`)
  console.log(`  Top-15 arithmetic results:`)
  ranked.slice(0, 15).forEach(({ n, count, weight, exprs }) => {
    const hit = ACTUAL_NEXT.includes(n) ? ' <== HIT' : ''
    const pm1 = !hit && ACTUAL_NEXT.some(a => Math.abs(a - n) === 1) ? ' (~+/-1)' : ''
    const pm2 = !hit && !pm1 && ACTUAL_NEXT.some(a => Math.abs(a - n) === 2) ? ' (~+/-2)' : ''
    console.log(`    #${String(n).padStart(2)} (${String(count).padStart(2)}v w=${weight})  ${exprs.slice(0, 5).join(' | ')}${hit}${pm1}${pm2}`)
    ranked.slice(0, 15).find(r => r.n === n) && addG(n, exprs, weight, s)
  })
}

// ── Combined ───────────────────────────────────────────────────────────────
const combined = Object.entries(globalMap)
  .map(([n, d]) => ({ n: +n, ...d }))
  .sort((a, b) => b.totalVotes - a.totalVotes || a.n - b.n)

console.log('\n' + SEP)
console.log('COMBINED PREDICTION (all 5 seeds) — Top 25')
console.log(SEP)
combined.slice(0, 25).forEach(({ n, totalVotes, exprs, seeds }, rank) => {
  const hit = ACTUAL_NEXT.includes(n) ? ' <== HIT' : ''
  const pm1 = !hit && ACTUAL_NEXT.some(a => Math.abs(a - n) === 1) ? ' (~+/-1)' : ''
  const pm2 = !hit && !pm1 && ACTUAL_NEXT.some(a => Math.abs(a - n) === 2) ? ' (~+/-2)' : ''
  console.log(`  Rank ${String(rank + 1).padStart(2)}. n=${String(n).padStart(2)} | totalVotes=${String(totalVotes).padStart(3)} | seeds=[${seeds.join(',')}] | ${exprs.slice(0, 3).join(' | ')}${hit}${pm1}${pm2}`)
})

// ── Per actual number hit/miss ─────────────────────────────────────────────
console.log('\n' + SEP)
console.log('ACTUAL NEXT DRAW — HIT / MISS BREAKDOWN')
console.log(SEP)
for (const actual of ACTUAL_NEXT) {
  const entry = globalMap[actual]
  const rank = combined.findIndex(c => c.n === actual) + 1
  if (entry) {
    console.log(`\n  PREDICTED #${actual} (rank #${rank}, ${entry.totalVotes} votes, from seeds [${entry.seeds.join(',')}])`)
    console.log(`    Formulas: ${entry.exprs.slice(0, 8).join(', ')}`)
  } else {
    console.log(`\n  MISSED #${actual} — not in top-15 of any seed`)
    console.log(`    Checking if any formula CAN produce ${actual} (just ranked too low):`)
    let found = false
    for (const s of SEED_DRAW) {
      const { nums } = computeTouchMath(slice, ci, s)
      for (let i = 0; i < nums.length; i++) {
        for (let j = i; j < nums.length; j++) {
          const a = nums[i], b = nums[j]
          if (a + b === actual) { console.log(`    * seed #${s}: ${a}+${b}=${actual} (existed but vote count too low to rank)`); found = true }
          if (a !== b && Math.abs(a - b) === actual) { console.log(`    * seed #${s}: ${Math.max(a, b)}-${Math.min(a, b)}=${actual} (existed but vote count too low)`); found = true }
        }
      }
    }
    if (!found) console.log(`    => UNREACHABLE — no a+b or a-b from any touch pool produces ${actual}`)
  }
}

// ── Root cause summary ─────────────────────────────────────────────────────
console.log('\n' + SEP)
console.log('ROOT CAUSE SUMMARY')
console.log(SEP)
const exactHits = ACTUAL_NEXT.filter(n => globalMap[n])
const unreachable = ACTUAL_NEXT.filter(actual => {
  for (const s of SEED_DRAW) {
    const { nums } = computeTouchMath(slice, ci, s)
    for (let i = 0; i < nums.length; i++) {
      for (let j = i; j < nums.length; j++) {
        const a = nums[i], b = nums[j]
        if (a + b === actual || (a !== b && Math.abs(a - b) === actual)) return false
      }
    }
  }
  return true
})
const lowRanked = ACTUAL_NEXT.filter(n => !globalMap[n] && !unreachable.includes(n))

console.log(`\n  Exact hits in top-25:      ${exactHits.join(', ')} (${exactHits.length}/5)`)
console.log(`  Ranked too low (missed):   ${lowRanked.join(', ')} (${lowRanked.length}/5)`)
console.log(`  Completely unreachable:    ${unreachable.length ? unreachable.join(', ') : 'none'} (${unreachable.length}/5)`)
console.log(`\n  MISS REASONS:`)
lowRanked.forEach(n => {
  console.log(`  #${n} — formula exists but got fewer votes than other numbers. Fix: expand pool size or lower rank cutoff.`)
})
unreachable.forEach(n => {
  console.log(`  #${n} — beams from [${SEED_DRAW}] never touch a number that sums/diffs to ${n}. This is a beam coverage gap.`)
  console.log(`    The beam didn't pass through the right diagonal path to reach this neighborhood.`)
})
if (exactHits.length === 5) console.log('  All 5 numbers were predicted! Check rank thresholds.')
