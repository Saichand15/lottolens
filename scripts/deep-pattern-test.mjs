/**
 * Deep Pattern Test — Last 10 Lotto Draws
 * Tests: friendship numbers + corner-touch + path numbers
 * Arithmetic: a+b, a-b on all signal types
 * Checks D+1 AND D+2 hits
 * Goal: find which combination gives exact/near-exact predictions
 */
import { readFileSync } from 'fs'

const rawDraws = JSON.parse(readFileSync('public/all_draws.json', 'utf8'))
const MAX_NUM = 45
const LAST_N = 10

const SEP  = '='.repeat(72)
const SEP2 = '-'.repeat(72)

// ── Engine helpers ─────────────────────────────────────────────────────────
const BP_DIRS = { NW:{dc:-1,dr:-1}, NE:{dc:+1,dr:-1}, SW:{dc:-1,dr:+1}, SE:{dc:+1,dr:+1} }

function getBeamTouches(slice, ci, seed) {
  const result = { path: [], corner: [], byDir: {} }
  for (const [dir, { dc, dr }] of Object.entries(BP_DIRS)) {
    const path = [], corner = []
    for (let step = 1; step <= slice.length; step++) {
      const c2 = ci + dc * step, n = seed + dr * step
      if (c2 < 0 || c2 >= slice.length || n < 1 || n > MAX_NUM) break
      if (slice[c2].includes(n))            path.push(n)
      if (n-1>=1       && slice[c2].includes(n-1)) corner.push(n-1)
      if (n+1<=MAX_NUM && slice[c2].includes(n+1)) corner.push(n+1)
    }
    const p = [...new Set(path)], c = [...new Set(corner)]
    result.byDir[dir] = { path: p, corner: c }
    p.forEach(n => result.path.push(n))
    c.forEach(n => result.corner.push(n))
  }
  result.path   = [...new Set(result.path)]
  result.corner = [...new Set(result.corner)]
  return result
}

function buildCoOccurrence(draws) {
  const coOccur = {}, appearances = {}
  draws.forEach(draw => {
    draw.forEach(n => { appearances[n] = (appearances[n]||0)+1 })
    for (let i=0;i<draw.length;i++) for (let j=i+1;j<draw.length;j++) {
      const a=draw[i], b=draw[j]
      coOccur[a] = coOccur[a]||{}; coOccur[b] = coOccur[b]||{}
      coOccur[a][b]=(coOccur[a][b]||0)+1; coOccur[b][a]=(coOccur[b][a]||0)+1
    }
  })
  const friends = {}
  for (let n=1;n<=MAX_NUM;n++) {
    friends[n] = Object.entries(coOccur[n]||{})
      .map(([m,cnt])=>({num:+m,cnt,rate:+(cnt/(appearances[n]||1)*100).toFixed(1)}))
      .sort((a,b)=>b.cnt-a.cnt).slice(0,8)
  }
  return { friends, appearances }
}

function buildTransitionRates(draws) {
  const trans = {}, cnt = {}
  for (let i=0;i<draws.length-1;i++) {
    draws[i].forEach(from => {
      cnt[from]=(cnt[from]||0)+1
      draws[i+1].forEach(to => {
        trans[from]=trans[from]||{}
        trans[from][to]=(trans[from][to]||0)+1
      })
    })
  }
  const rates = {}
  for (const [from, tos] of Object.entries(trans)) {
    rates[+from]={}
    for (const [to, c] of Object.entries(tos))
      rates[+from][+to]=+(c/cnt[+from]*100).toFixed(1)
  }
  return rates
}

/** Weighted arithmetic pool from a set of numbers */
function arithmeticPool(nums) {
  const pool = {}
  const add = (result, expr, w) => {
    if (result < 6 || result > MAX_NUM) return
    if (!pool[result]) pool[result] = { weight: 0, exprs: [] }
    pool[result].weight += w
    if (!pool[result].exprs.includes(expr)) pool[result].exprs.push(expr)
  }
  for (let i=0;i<nums.length;i++) {
    for (let j=i;j<nums.length;j++) {
      const a=nums[i], b=nums[j], gap=Math.abs(a-b)
      const w = gap > 3 ? 2 : 1
      if (a!==b) { add(a+b,`${a}+${b}`,w); add(gap,`${Math.max(a,b)}-${Math.min(a,b)}`,w) }
      else       { add(a+b,`${a}+${b}`,w) }
    }
  }
  return Object.entries(pool)
    .map(([n,{weight,exprs}])=>({n:+n,weight,exprs}))
    .sort((a,b)=>b.weight-a.weight||a.n-b.n)
}

function checkHit(n, draw)  { return draw?.includes(n) ? 'EXACT' : draw?.some(a=>Math.abs(a-n)===1) ? '±1' : draw?.some(a=>Math.abs(a-n)===2) ? '±2' : null }
function hitLabel(type)     { return type==='EXACT'?'✅':type==='±1'?'🟡':type==='±2'?'🟠':'' }

// ── Main analysis ──────────────────────────────────────────────────────────
const draws = rawDraws
const startIdx = draws.length - LAST_N - 2  // need 2 draws after last test draw

// Stats accumulators
const stats = { d1_exact:0, d1_pm1:0, d1_pm2:0, d2_exact:0, d2_pm1:0, d2_pm2:0, totalActual:0 }
// Per-signal-type accumulators
const sigStats = {
  beam_path:   { d1:0, d2:0 }, beam_corner: { d1:0, d2:0 },
  friends:     { d1:0, d2:0 }, transition:  { d1:0, d2:0 },
  arithmetic:  { d1:0, d2:0 }
}

const resultRows = []

for (let testIdx = startIdx; testIdx < draws.length - 1; testIdx++) {
  const drawNum  = testIdx + 1
  const thisDraw = draws[testIdx]
  const nextDraw = draws[testIdx + 1]
  const d2Draw   = draws[testIdx + 2] || null

  // History up to and including this draw
  const history = draws.slice(0, testIdx + 1)
  const slice   = history.slice(-100)
  const ci      = slice.length - 1

  const coOccur = buildCoOccurrence(history)
  const transRates = buildTransitionRates(history)

  // ── Collect all signal numbers ─────────────────────────────────────────
  const beamPathNums   = new Set()
  const beamCornerNums = new Set()
  const friendNums     = new Set()
  const transNums      = new Set()

  thisDraw.forEach(seed => {
    // Beam signals
    const bt = getBeamTouches(slice, ci, seed)
    bt.path.forEach(n   => beamPathNums.add(n))
    bt.corner.forEach(n => beamCornerNums.add(n))

    // Friendship (top 5 co-occurring)
    coOccur.friends[seed]?.slice(0,5).forEach(f => friendNums.add(f.num))

    // Transition (top 5 most likely to follow)
    const tr = transRates[seed] || {}
    Object.entries(tr).sort((a,b)=>b[1]-a[1]).slice(0,5)
      .forEach(([n]) => transNums.add(+n))
  })

  // Remove numbers already in this draw from all sets
  ;[beamPathNums, beamCornerNums, friendNums, transNums].forEach(s =>
    thisDraw.forEach(n => s.delete(n)))

  // ── Arithmetic pools ──────────────────────────────────────────────────
  const allSignalNums = [...new Set([
    ...thisDraw,
    ...beamPathNums, ...beamCornerNums,
    ...friendNums
  ])]

  const mathPool = arithmeticPool(allSignalNums)
  const top20Math = mathPool.slice(0, 20).map(r => r.n)

  // Combined weighted map: signal nums + math results
  const combined = {}
  const addC = (n, w, source) => {
    if (n < 1 || n > MAX_NUM || thisDraw.includes(n)) return
    if (!combined[n]) combined[n] = { weight: 0, sources: [] }
    combined[n].weight += w
    if (!combined[n].sources.includes(source)) combined[n].sources.push(source)
  }

  beamPathNums.forEach(n   => addC(n, 4, 'beam-path'))
  beamCornerNums.forEach(n => addC(n, 3, 'beam-corner'))
  friendNums.forEach(n     => addC(n, 3, 'friend'))
  transNums.forEach(n      => addC(n, 2, 'transition'))
  mathPool.slice(0,20).forEach(({n,weight}) => addC(n, weight * 1.5, 'arithmetic'))

  const ranked = Object.entries(combined)
    .map(([n,d])=>({n:+n,...d}))
    .sort((a,b)=>b.weight-a.weight||a.n-b.n)

  const top15 = ranked.slice(0, 15).map(r => r.n)
  const top25 = ranked.slice(0, 25).map(r => r.n)

  // ── Hit checking ──────────────────────────────────────────────────────
  const d1Hits = {}, d2Hits = {}
  top25.forEach(n => {
    const h1 = checkHit(n, nextDraw)
    const h2 = checkHit(n, d2Draw)
    if (h1) d1Hits[n] = h1
    if (h2) d2Hits[n] = h2
  })

  // Per-signal stats
  ;[...beamPathNums].forEach(n => {
    if (checkHit(n,nextDraw)==='EXACT') sigStats.beam_path.d1++
    if (checkHit(n,d2Draw)==='EXACT')  sigStats.beam_path.d2++
  })
  ;[...beamCornerNums].forEach(n => {
    if (checkHit(n,nextDraw)==='EXACT') sigStats.beam_corner.d1++
    if (checkHit(n,d2Draw)==='EXACT')  sigStats.beam_corner.d2++
  })
  ;[...friendNums].forEach(n => {
    if (checkHit(n,nextDraw)==='EXACT') sigStats.friends.d1++
    if (checkHit(n,d2Draw)==='EXACT')  sigStats.friends.d2++
  })
  top20Math.forEach(n => {
    if (checkHit(n,nextDraw)==='EXACT') sigStats.arithmetic.d1++
    if (checkHit(n,d2Draw)==='EXACT')  sigStats.arithmetic.d2++
  })

  // Exact hits from top-25
  const exactD1 = nextDraw.filter(n => top25.includes(n))
  const exactD2 = d2Draw?.filter(n => top25.includes(n)) || []
  stats.d1_exact  += exactD1.length
  stats.d2_exact  += exactD2.length
  stats.totalActual += 5

  resultRows.push({
    drawNum, thisDraw, nextDraw, d2Draw,
    beamPath: [...beamPathNums], beamCorner: [...beamCornerNums],
    friends: [...friendNums], mathPool: mathPool.slice(0,15),
    ranked, top15, top25,
    d1Hits, d2Hits, exactD1, exactD2
  })
}

// ── Print results ──────────────────────────────────────────────────────────
console.log(SEP)
console.log('DEEP PATTERN TEST — Last 10 Lotto Draws')
console.log('Signals: beam-path(4pt) + beam-corner(3pt) + friends(3pt) + arithmetic(×1.5)')
console.log('Checking D+1 and D+2 hits from top-25 predictions')
console.log(SEP)

for (const row of resultRows) {
  console.log(`\n${SEP2}`)
  console.log(`D#${row.drawNum}: [${row.thisDraw.join(', ')}]`)
  console.log(`D#${row.drawNum+1} (immediate next):  [${row.nextDraw.join(', ')}]`)
  if (row.d2Draw) console.log(`D#${row.drawNum+2} (one after next): [${row.d2Draw.join(', ')}]`)
  console.log(SEP2)

  // Signal pools
  console.log(`  Beam path:   [${row.beamPath.sort((a,b)=>a-b).join(', ')}]`)
  console.log(`  Beam corner: [${row.beamCorner.sort((a,b)=>a-b).join(', ')}]`)
  console.log(`  Friends:     [${row.friends.sort((a,b)=>a-b).join(', ')}]`)

  // Arithmetic top-10
  console.log(`  Math top-10: ${row.mathPool.slice(0,10).map(r=>`${r.n}(w${r.weight})`).join(' ')}`)

  // Combined top-25 ranked
  console.log(`\n  Combined top-25 (weight ranked):`)
  row.ranked.slice(0, 25).forEach(({ n, weight, sources }, i) => {
    const h1 = row.d1Hits[n], h2 = row.d2Hits[n]
    const srcStr = sources.join('+')
    const h1Lbl = h1 ? `  D+1:${hitLabel(h1)}${h1}` : ''
    const h2Lbl = h2 ? `  D+2:${hitLabel(h2)}${h2}` : ''
    console.log(`    #${String(i+1).padStart(2)}. n=${String(n).padStart(2)} w=${String(Math.round(weight)).padStart(3)} [${srcStr}]${h1Lbl}${h2Lbl}`)
  })

  // Summary for this draw
  const exactD1Str = row.exactD1.join(', ') || 'none'
  const exactD2Str = row.exactD2.join(', ') || 'none'
  console.log(`\n  >>> D+1 exact hits from top-25: [${exactD1Str}] (${row.exactD1.length}/5)`)
  console.log(`  >>> D+2 exact hits from top-25: [${exactD2Str}] (${row.exactD2.length}/5)`)

  // Miss analysis — which actual numbers weren't predicted and why
  const allMissed = [...row.nextDraw, ...(row.d2Draw||[])].filter(n => !row.top25.includes(n))
  if (allMissed.length) {
    console.log(`  MISSED numbers: [${[...new Set(allMissed)].join(', ')}]`)
  }
}

// ── Overall statistics ──────────────────────────────────────────────────────
console.log('\n' + SEP)
console.log('OVERALL STATISTICS (last 10 draws, top-25 predictions)')
console.log(SEP)
const d1Rate = (stats.d1_exact / stats.totalActual * 100).toFixed(1)
const d2Rate = (stats.d2_exact / stats.totalActual * 100).toFixed(1)
console.log(`  D+1 exact hits: ${stats.d1_exact}/${stats.totalActual} = ${d1Rate}%`)
console.log(`  D+2 exact hits: ${stats.d2_exact}/${stats.totalActual} = ${d2Rate}%`)
console.log(`  Avg D+1 hits per draw: ${(stats.d1_exact / LAST_N).toFixed(1)}/5`)
console.log(`  Avg D+2 hits per draw: ${(stats.d2_exact / LAST_N).toFixed(1)}/5`)
console.log()
console.log('  Per-signal-type exact hits (D+1 vs D+2):')
for (const [sig, {d1, d2}] of Object.entries(sigStats)) {
  console.log(`    ${sig.padEnd(14)}: D+1=${d1}  D+2=${d2}  (D+2 lead=${d2>d1?'YES':'no'})`)
}

// ── D+2 delay pattern analysis ──────────────────────────────────────────────
console.log('\n' + SEP)
console.log('D+2 DELAY PATTERN — numbers predicted but appeared 2 draws later')
console.log(SEP)
let delayCount = 0
for (const row of resultRows) {
  const delayed = row.top25.filter(n => !row.nextDraw.includes(n) && row.d2Draw?.includes(n))
  if (delayed.length) {
    console.log(`  D#${row.drawNum} predicted [${delayed.join(', ')}] — NOT in D#${row.drawNum+1} but YES in D#${row.drawNum+2}`)
    delayed.forEach(n => {
      const entry = row.ranked.find(r => r.n === n)
      if (entry) console.log(`    #${n}: weight=${Math.round(entry.weight)} sources=[${entry.sources.join('+')}]`)
    })
    delayCount += delayed.length
  }
}
console.log(`\n  Total delayed appearances: ${delayCount}`)
console.log(`  Average per draw: ${(delayCount/LAST_N).toFixed(1)}`)

// ── NEXT DRAW PREDICTION (for the draw after the very last one) ──────────────
console.log('\n' + SEP)
const predDraw  = draws[draws.length - 1]
const predDrawN = draws.length
const predHistory = draws
const predSlice = predHistory.slice(-100)
const predCi = predSlice.length - 1

const pCoOccur = buildCoOccurrence(predHistory)
const pTrans   = buildTransitionRates(predHistory)

const pBeamPath = new Set(), pBeamCorner = new Set(), pFriends = new Set(), pTrans2 = new Set()
predDraw.forEach(seed => {
  const bt = getBeamTouches(predSlice, predCi, seed)
  bt.path.forEach(n   => pBeamPath.add(n))
  bt.corner.forEach(n => pBeamCorner.add(n))
  pCoOccur.friends[seed]?.slice(0,5).forEach(f => pFriends.add(f.num))
  Object.entries(pTrans[seed]||{}).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([n])=>pTrans2.add(+n))
})
;[pBeamPath, pBeamCorner, pFriends, pTrans2].forEach(s => predDraw.forEach(n => s.delete(n)))

const pAllSig = [...new Set([...predDraw, ...pBeamPath, ...pBeamCorner, ...pFriends])]
const pMath = arithmeticPool(pAllSig)

const pCombined = {}
const addP = (n, w, src) => {
  if (n<1||n>MAX_NUM||predDraw.includes(n)) return
  if (!pCombined[n]) pCombined[n] = { weight:0, sources:[] }
  pCombined[n].weight += w
  if (!pCombined[n].sources.includes(src)) pCombined[n].sources.push(src)
}
pBeamPath.forEach(n   => addP(n, 4, 'beam-path'))
pBeamCorner.forEach(n => addP(n, 3, 'beam-corner'))
pFriends.forEach(n    => addP(n, 3, 'friend'))
pTrans2.forEach(n     => addP(n, 2, 'transition'))
pMath.slice(0,20).forEach(({n,weight}) => addP(n, weight*1.5, 'arithmetic'))

const pRanked = Object.entries(pCombined)
  .map(([n,d])=>({n:+n,...d}))
  .sort((a,b)=>b.weight-a.weight||a.n-b.n)

console.log(`NEXT DRAW PREDICTION`)
console.log(`Based on D#${predDrawN}: [${predDraw.join(', ')}]`)
console.log(SEP)
console.log(`\n  Beam path:   [${[...pBeamPath].sort((a,b)=>a-b).join(', ')}]`)
console.log(`  Beam corner: [${[...pBeamCorner].sort((a,b)=>a-b).join(', ')}]`)
console.log(`  Friends:     [${[...pFriends].sort((a,b)=>a-b).join(', ')}]`)
console.log(`  Math top-10: ${pMath.slice(0,10).map(r=>`${r.n}(w${r.weight})`).join(' ')}`)
console.log(`\n  TOP 25 PICKS for D#${predDrawN+1}:`)
pRanked.slice(0, 25).forEach(({ n, weight, sources }, i) => {
  console.log(`    #${String(i+1).padStart(2)}. n=${String(n).padStart(2)} w=${String(Math.round(weight)).padStart(3)} [${sources.join('+')}]`)
})

// D+2 picks (numbers just outside top-25 — potential "delayed" appearance)
console.log(`\n  POTENTIAL D+2 "DELAY" picks (rank 26-35):`)
pRanked.slice(25, 35).forEach(({ n, weight, sources }, i) => {
  console.log(`    #${String(i+26).padStart(2)}. n=${String(n).padStart(2)} w=${String(Math.round(weight)).padStart(3)} [${sources.join('+')}]`)
})
console.log()
