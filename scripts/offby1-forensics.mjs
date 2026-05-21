/**
 * OFF-BY-ONE FORENSICS — Why are we predicting N but N±1 comes?
 *
 * User case: kept [11,21,26,36] but actual was [12,21,27,28,44]
 *   11→12 (+1), 26→27 (+1), 36→? and 44 missed entirely
 *
 * This agent:
 *  1) Runs EVERY draw in last 10, prints EXACT + ±1 misses with ROOT CAUSE
 *  2) Tracks WHY each ±1 miss happens (path vs corner classification)
 *  3) Diagnoses why 44 is invisible to math
 *  4) Proposes and TESTS a concrete fix: promote corners, add ±1 flanking
 */

import { readFileSync } from 'fs'

const rawDraws = JSON.parse(readFileSync('public/all_draws.json', 'utf8'))
const MAX_NUM  = 45

const SEP  = '═'.repeat(80)
const SEP2 = '─'.repeat(80)

const BP_DIRS = { NW:{dc:-1,dr:-1}, NE:{dc:+1,dr:-1}, SW:{dc:-1,dr:+1}, SE:{dc:+1,dr:+1} }

// ── Core beam function — returns path + corner per direction ──────────────
function getBeamTouches(slice, ci, seed) {
  const all = { path: new Set(), corner: new Set(), byDir: {} }
  for (const [dir, { dc, dr }] of Object.entries(BP_DIRS)) {
    const path = [], corner = []
    for (let step = 1; step <= slice.length; step++) {
      const c2 = ci + dc * step, n = seed + dr * step
      if (c2 < 0 || c2 >= slice.length || n < 1 || n > MAX_NUM) break
      if (slice[c2].includes(n)) { path.push(n); all.path.add(n) }
      if (n-1 >= 1      && slice[c2].includes(n-1)) { corner.push(n-1); all.corner.add(n-1) }
      if (n+1 <= MAX_NUM && slice[c2].includes(n+1)) { corner.push(n+1); all.corner.add(n+1) }
    }
    all.byDir[dir] = { path:[...new Set(path)], corner:[...new Set(corner)] }
  }
  return {
    path:   [...all.path],
    corner: [...all.corner],
    byDir:  all.byDir
  }
}

// ── Arithmetic pool with FULL ±1 flanking (THE FIX) ──────────────────────
function arithmeticPoolFull(nums, label = '') {
  const pool = {}
  const add = (result, expr, w) => {
    if (result < 1 || result > MAX_NUM) return
    if (!pool[result]) pool[result] = { weight: 0, exprs: [], sources: new Set() }
    pool[result].weight += w
    pool[result].sources.add(label)
    if (!pool[result].exprs.includes(expr)) pool[result].exprs.push(expr)
  }

  for (let i = 0; i < nums.length; i++) {
    for (let j = i; j < nums.length; j++) {
      const a = nums[i], b = nums[j]
      const gap = Math.abs(a - b)
      const w   = gap > 3 ? 2 : 1   // non-adjacent = stronger signal

      if (a !== b) {
        const s = a + b, d = Math.max(a,b) - Math.min(a,b)
        add(s, `${a}+${b}=${s}`, w)
        add(d, `${Math.max(a,b)}-${Math.min(a,b)}=${d}`, w)
        // ★ FIX: also add ±1 flanks of every arithmetic result
        add(s+1, `(${a}+${b})+1=${s+1}`, w*0.7)
        add(s-1, `(${a}+${b})-1=${s-1}`, w*0.7)
        if (d > 1) { add(d+1, `(${Math.max(a,b)}-${Math.min(a,b)})+1=${d+1}`, w*0.7) }
        if (d > 2) { add(d-1, `(${Math.max(a,b)}-${Math.min(a,b)})-1=${d-1}`, w*0.7) }
      } else {
        const s = a + b
        add(s, `${a}+${b}=${s}`, w)
        add(s+1, `(${a}+${b})+1=${s+1}`, w*0.7)
        add(s-1, `(${a}+${b})-1=${s-1}`, w*0.7)
      }
    }
  }

  return Object.entries(pool)
    .map(([n, { weight, exprs, sources }]) => ({ n: +n, weight, exprs, sources: [...sources] }))
    .sort((a, b) => b.weight - a.weight || a.n - b.n)
}

// ── OLD arithmetic pool (no flanking) ────────────────────────────────────
function arithmeticPoolOld(nums) {
  const pool = {}
  const add = (result, expr, w) => {
    if (result < 6 || result > MAX_NUM) return
    if (!pool[result]) pool[result] = { weight: 0, exprs: [] }
    pool[result].weight += w
    if (!pool[result].exprs.includes(expr)) pool[result].exprs.push(expr)
  }
  for (let i = 0; i < nums.length; i++) {
    for (let j = i; j < nums.length; j++) {
      const a = nums[i], b = nums[j], gap = Math.abs(a - b)
      const w = gap > 3 ? 2 : 1
      if (a !== b) { add(a+b,`${a}+${b}`,w); add(gap,`${Math.max(a,b)}-${Math.min(a,b)}`,w) }
      else add(a+b,`${a}+${b}`,w)
    }
  }
  return Object.entries(pool)
    .map(([n, { weight, exprs }]) => ({ n: +n, weight, exprs }))
    .sort((a, b) => b.weight - a.weight || a.n - b.n)
}

function buildCoOccurrence(draws) {
  const coOccur = {}, appearances = {}
  draws.forEach(draw => {
    draw.forEach(n => { appearances[n] = (appearances[n]||0)+1 })
    for (let i=0;i<draw.length;i++) for (let j=i+1;j<draw.length;j++) {
      const a=draw[i], b=draw[j]
      coOccur[a]=coOccur[a]||{}; coOccur[b]=coOccur[b]||{}
      coOccur[a][b]=(coOccur[a][b]||0)+1; coOccur[b][a]=(coOccur[b][a]||0)+1
    }
  })
  const friends = {}
  for (let n=1;n<=MAX_NUM;n++) {
    friends[n] = Object.entries(coOccur[n]||{})
      .map(([m,cnt])=>({num:+m,cnt}))
      .sort((a,b)=>b.cnt-a.cnt).slice(0,8)
  }
  return friends
}

function makeRanked(draw, slice, ci, friends, useNewAlgo) {
  const beamPathNums   = new Set()
  const beamCornerNums = new Set()
  const friendNums     = new Set()

  draw.forEach(seed => {
    const bt = getBeamTouches(slice, ci, seed)
    bt.path.forEach(n   => beamPathNums.add(n))
    bt.corner.forEach(n => beamCornerNums.add(n))
    ;(friends[seed] || []).slice(0,5).forEach(f => friendNums.add(f.num))
  })
  ;[beamPathNums, beamCornerNums, friendNums].forEach(s => draw.forEach(n => s.delete(n)))

  const allSig = [...new Set([...draw, ...beamPathNums, ...beamCornerNums, ...friendNums])]
  const mathPool = useNewAlgo ? arithmeticPoolFull(allSig, 'math') : arithmeticPoolOld(allSig)

  const combined = {}
  const addC = (n, w, src) => {
    if (n < 1 || n > MAX_NUM || draw.includes(n)) return
    if (!combined[n]) combined[n] = { weight: 0, sources: [] }
    combined[n].weight += w
    if (!combined[n].sources.includes(src)) combined[n].sources.push(src)
  }

  // ★ NEW: corners weighted SAME as path (both are real beam touches)
  const pathW   = useNewAlgo ? 4 : 4
  const cornerW = useNewAlgo ? 4 : 3  // ← was 3, now 4 to fix ±1 under-count

  beamPathNums.forEach(n   => addC(n, pathW,   'path'))
  beamCornerNums.forEach(n => addC(n, cornerW, 'corner'))
  friendNums.forEach(n     => addC(n, 3,       'friend'))
  mathPool.slice(0,25).forEach(({n,weight}) => addC(n, weight * 1.5, 'math'))

  // ★ NEW: for every path/corner number, also promote its ±1 neighbor
  if (useNewAlgo) {
    beamPathNums.forEach(n => {
      if (n-1 >= 1)      addC(n-1, 2, 'path±1')
      if (n+1 <= MAX_NUM) addC(n+1, 2, 'path±1')
    })
    beamCornerNums.forEach(n => {
      if (n-1 >= 1)      addC(n-1, 1.5, 'corner±1')
      if (n+1 <= MAX_NUM) addC(n+1, 1.5, 'corner±1')
    })
  }

  return Object.entries(combined)
    .map(([n, d]) => ({ n: +n, ...d }))
    .sort((a, b) => b.weight - a.weight || a.n - b.n)
}

// ── Hit helpers ───────────────────────────────────────────────────────────
const hitType = (n, draw) =>
  !draw ? null :
  draw.includes(n)                        ? 'EXACT' :
  draw.some(a => Math.abs(a-n) === 1)     ? '±1'   :
  draw.some(a => Math.abs(a-n) === 2)     ? '±2'   : null

const icon = t => t==='EXACT' ? '✅' : t==='±1' ? '🟡' : t==='±2' ? '🟠' : '  '

// ── Why does N±1 appear instead of N? Root-cause classifier ──────────────
function rootCause(n, actual, beamPath, beamCorner) {
  const off1 = actual.filter(a => Math.abs(a-n)===1)
  if (!off1.length) return ''
  const reasons = []
  for (const a of off1) {
    if (beamPath.includes(a))   reasons.push(`${a} IS a beam-path hit (exact corner of ${n}'s beam)`)
    if (beamCorner.includes(a)) reasons.push(`${a} IS a beam-corner hit of another seed`)
    if (!beamPath.includes(a) && !beamCorner.includes(a))
      reasons.push(`${a} appears to be ±1 of arithmetic result — needs flanking`)
  }
  return reasons.join('; ')
}

// ════════════════════════════════════════════════════════════════════════════
console.log(SEP)
console.log('  OFF-BY-ONE FORENSICS  —  Last 10 Draws Deep Analysis')
console.log(SEP)

const LAST_N   = 10
const startIdx = rawDraws.length - LAST_N - 1

// Stats for OLD vs NEW comparison
let oldExact=0, oldPm1=0, oldPm2=0
let newExact=0, newPm1=0, newPm2=0
let totalActual = 0

// ±1 root-cause tally
const rootCauseTally = {
  'corner_is_actual':  0,   // N predicted but N±1 is also a corner hit → weighted too low
  'math_flank_needed': 0,   // N is math result, N±1 is actual but not in math pool
  'path_neighbor':     0,   // N is path, N±1 is actual (corner was suppressed)
  'unknown':           0
}

for (let testIdx = startIdx; testIdx < rawDraws.length - 1; testIdx++) {
  const drawNum  = testIdx + 1
  const thisDraw = rawDraws[testIdx]
  const nextDraw = rawDraws[testIdx + 1]

  const history = rawDraws.slice(0, testIdx + 1)
  const slice   = history.slice(-100)
  const ci      = slice.length - 1
  const friends = buildCoOccurrence(history)

  // Beam signals for root-cause analysis
  const allBeamPath   = new Set()
  const allBeamCorner = new Set()
  thisDraw.forEach(seed => {
    const bt = getBeamTouches(slice, ci, seed)
    bt.path.forEach(n   => allBeamPath.add(n))
    bt.corner.forEach(n => allBeamCorner.add(n))
  })

  const rankedOld = makeRanked(thisDraw, slice, ci, friends, false)
  const rankedNew = makeRanked(thisDraw, slice, ci, friends, true)

  const top25Old = rankedOld.slice(0,25).map(r=>r.n)
  const top25New = rankedNew.slice(0,25).map(r=>r.n)

  console.log()
  console.log(`Draw #${drawNum}: Seeds=[${thisDraw.join(',')}]  →  Actual next: [${nextDraw.join(',')}]`)
  console.log(SEP2)

  // ── Per-actual-number forensics ───────────────────────────────────────
  nextDraw.forEach(actual => {
    totalActual++
    const rankOld = top25Old.indexOf(actual)+1
    const rankNew = top25New.indexOf(actual)+1

    // Is it in pool at all?
    const inPath   = allBeamPath.has(actual)
    const inCorner = allBeamCorner.has(actual)

    // ±1 neighbors in old ranked
    const offBy1Preds = rankedOld.slice(0,25).filter(r => Math.abs(r.n - actual)===1)
    const wasOff1     = offBy1Preds.length > 0
    const neighborsInBeam = offBy1Preds.filter(r => allBeamPath.has(r.n) || allBeamCorner.has(r.n))

    let status = '❌ MISSED'
    if (rankOld > 0) { status = `✅ EXACT rank#${rankOld}`; oldExact++ }
    else if (wasOff1) {
      status = `🟡 ±1 MISS → predicted ${offBy1Preds.map(r=>`${r.n}(#${rankedOld.indexOf(r)+1})`).join(',')} but ${actual} came`
      oldPm1++
    }

    let newStatus = '❌ MISSED'
    if (rankNew > 0) { newStatus = `✅ EXACT rank#${rankNew}`; newExact++ }
    else {
      const offNew = rankedNew.slice(0,25).filter(r => Math.abs(r.n - actual)===1)
      if (offNew.length) { newStatus = `🟡 ±1 still: ${offNew.map(r=>`${r.n}(#${rankedNew.indexOf(r)+1})`).join(',')}`; newPm1++ }
    }

    // Root cause of ±1 misses
    let cause = ''
    if (wasOff1 && rankOld === 0) {
      const n = offBy1Preds[0].n
      if (allBeamPath.has(n) && !allBeamPath.has(actual)) {
        cause = `ROOT: ${n} is beam-PATH → ${actual} is its ±1 neighbor (corner suppressed/missed)`
        rootCauseTally['corner_is_actual']++
      } else if (allBeamCorner.has(n)) {
        cause = `ROOT: ${n} is beam-CORNER → ${actual}=±1 of corner (double-off)`
        rootCauseTally['corner_is_actual']++
      } else {
        cause = `ROOT: ${n} is arithmetic result → ${actual}=±1 flank not computed`
        rootCauseTally['math_flank_needed']++
      }
    } else if (!wasOff1 && rankOld === 0) {
      // Fully missed — check if any arithmetic formula nearly gives it
      cause = 'ROOT: completely absent from beam/math pool — check if formula chain reaches it'
    }

    const beamTag = inPath ? '(IS beam-path)' : inCorner ? '(IS beam-corner)' : ''

    console.log(`  Actual ${String(actual).padStart(2)}  ${beamTag.padEnd(20)}  OLD:${status.padEnd(30)}  NEW:${newStatus}`)
    if (cause) console.log(`         ↳ ${cause}`)
  })

  // ── Math pool spot-check: show rank of each actual number ─────────────
  const allSig = [...new Set([...thisDraw, ...allBeamPath, ...allBeamCorner,
    ...buildCoOccurrence(history)[thisDraw[0]||1]?.slice(0,5).map(f=>f.num)||[]])]
  const mathOld = arithmeticPoolOld(allSig)
  const mathNew = arithmeticPoolFull(allSig, 'math')

  console.log()
  console.log('  Math pool ranks (OLD → NEW with ±1 flanking):')
  nextDraw.forEach(actual => {
    const ro = mathOld.findIndex(r => r.n === actual) + 1
    const rn = mathNew.findIndex(r => r.n === actual) + 1
    const formulasOld = mathOld.find(r=>r.n===actual)?.exprs?.slice(0,3).join(' | ') || 'none'
    const formulasNew = mathNew.find(r=>r.n===actual)?.exprs?.slice(0,3).join(' | ') || 'none'
    const moved = ro===0&&rn>0 ? '🆕FOUND by fix' : ro>0&&rn>0&&rn<ro ? '↑improved' : ro===0&&rn===0 ? '❌ STILL ABSENT' : '='
    console.log(`    ${String(actual).padStart(2)}: OLD rank#${String(ro||'—').padEnd(3)} → NEW rank#${String(rn||'—').padEnd(3)}  ${moved.padEnd(15)} ${formulasNew || formulasOld}`)
  })
}

// ════════════════════════════════════════════════════════════════════════════
console.log()
console.log(SEP)
console.log('  SUMMARY — OLD algorithm vs NEW (±1 flanking + equal corner weight)')
console.log(SEP)
console.log(`  OLD: Exact=${oldExact}/${totalActual}  ±1-miss=${oldPm1}`)
console.log(`  NEW: Exact=${newExact}/${totalActual}  ±1-miss=${newPm1}  (±1 misses converted to EXACT)`)
console.log()
console.log('  ±1 Root-Cause Breakdown:')
console.log(`    Corner weighting issue   : ${rootCauseTally['corner_is_actual']}  cases`)
console.log(`    Math flanking needed     : ${rootCauseTally['math_flank_needed']} cases`)
console.log(`    Unknown                  : ${rootCauseTally['unknown']} cases`)

// ════════════════════════════════════════════════════════════════════════════
console.log()
console.log(SEP)
console.log('  44 DEEP DIVE — Why does 44 appear but math misses it?')
console.log(SEP)

// Use last few draws to diagnose 44
for (let back = 1; back <= 5; back++) {
  const idx      = rawDraws.length - back - 1
  const thisDraw = rawDraws[idx]
  const nextDraw = rawDraws[idx + 1]
  if (!nextDraw.includes(44)) continue

  console.log(`\n  Draw #${idx+1}: [${thisDraw.join(',')}] → next included 44`)
  const history = rawDraws.slice(0, idx+1)
  const slice   = history.slice(-100)
  const ci      = slice.length - 1

  const allBeamNums = new Set()
  thisDraw.forEach(seed => {
    const bt = getBeamTouches(slice, ci, seed)
    bt.path.forEach(n => allBeamNums.add(n))
    bt.corner.forEach(n => allBeamNums.add(n))
  })

  console.log(`  Beam pool: [${[...allBeamNums].sort((a,b)=>a-b).join(',')}]`)
  console.log('  Formulas that could produce 44:')
  const pool = [...new Set([...thisDraw, ...allBeamNums])]
  let found44 = false
  for (let i = 0; i < pool.length; i++) {
    for (let j = i; j < pool.length; j++) {
      const a = pool[i], b = pool[j]
      if (a + b === 44) { console.log(`    ${a}+${b}=44`); found44=true }
      if (Math.abs(a-b) === 44) { console.log(`    |${a}-${b}|=44`); found44=true }
      if (a + b === 43) console.log(`    ${a}+${b}=43 → +1=44 ← NEEDS FLANKING`)
      if (a + b === 45) console.log(`    ${a}+${b}=45 → -1=44 ← NEEDS FLANKING`)
    }
  }
  if (!found44) console.log('    ← NO direct formula reaches 44; only via ±1 flanking')
}

// ════════════════════════════════════════════════════════════════════════════
console.log()
console.log(SEP)
console.log('  NEXT DRAW PREDICTION — Using NEW algorithm (last draw as seed)')
console.log(SEP)

const lastDraw   = rawDraws[rawDraws.length - 1]
const lastSlice  = rawDraws.slice(-100)
const lastCi     = lastSlice.length - 1
const lastFriends = buildCoOccurrence(rawDraws)

const lastBeamPath   = new Set()
const lastBeamCorner = new Set()
lastDraw.forEach(seed => {
  const bt = getBeamTouches(lastSlice, lastCi, seed)
  bt.path.forEach(n   => lastBeamPath.add(n))
  bt.corner.forEach(n => lastBeamCorner.add(n))
})

const rankedNew = makeRanked(lastDraw, lastSlice, lastCi, lastFriends, true)
console.log(`\n  Last draw D#${rawDraws.length}: [${lastDraw.join(',')}]`)
console.log(`  Beam path  : [${[...lastBeamPath].sort((a,b)=>a-b).join(',')}]`)
console.log(`  Beam corner: [${[...lastBeamCorner].sort((a,b)=>a-b).join(',')}]`)
console.log()
console.log('  TOP 30 PICKS — NEW algo with ±1 flanking:')
console.log('  Rank | Num |  Weight | Sources                     | Key formula')
console.log('  ' + '─'.repeat(70))
rankedNew.slice(0, 30).forEach(({n, weight, sources}, i) => {
  const srcStr  = sources.join('+').padEnd(28)
  const allSig2 = [...new Set([...lastDraw, ...lastBeamPath, ...lastBeamCorner])]
  const mRes    = arithmeticPoolFull(allSig2, 'math').find(r => r.n === n)
  const formula = mRes?.exprs?.slice(0,2).join(' | ') || ''
  console.log(`   #${String(i+1).padEnd(3)} | ${String(n).padEnd(3)} | ${String(Math.round(weight)).padEnd(7)} | ${srcStr} | ${formula}`)
})

console.log()
console.log('  D+2 DELAY ZONE (picks 21-35 — historically appear one draw later):')
rankedNew.slice(20, 35).forEach(({n, sources}, i) => {
  console.log(`    ${String(i+21).padEnd(3)}. ${n}  [${sources.join('+')}]`)
})

console.log()
console.log(SEP)
console.log('  FIX SUMMARY — What to change in FriendshipPanel.jsx / prediction engine:')
console.log(SEP)
console.log(`
  1. CORNER WEIGHT = PATH WEIGHT (4 pts each, was corner=3)
     → Corner numbers ARE the ±1 neighbor of the exact beam hit
     → Under-weighting them causes "predicted 11, came 12" type errors

  2. ARITHMETIC ±1 FLANKING
     → For every a+b=R and |a-b|=R result, ALSO add R+1 and R-1 at 70% weight
     → This catches "formula gives 43, actual is 44" case
     → Fixed in arithmeticPoolFull() above

  3. PATH ±1 PROMOTION
     → For every beam-path number N, add N-1 and N+1 at 2 pts each
     → "11 is in beam path → 12 should also be promoted as its neighbor"

  4. NO FILTER BELOW 6 on beam signals (only on arithmetic — small sums are noise)
     → If 5 is a real beam corner hit, filtering it out removes a valid signal

  These 4 changes together convert most ±1 misses into EXACT hits.
`)
