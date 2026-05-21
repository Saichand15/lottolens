/**
 * MUTUAL BEAM FREQUENCY TEST — Last 100 Draws
 *
 * User observation: "when 10 came, blue beam hits 12. When I click 12, it hits 10 back"
 * → Build HISTORICAL FREQUENCY: how many times has A appeared in B's beam path across all history?
 * → HIGH mutual frequency = strongest signal
 *
 * Fixed approach:
 *  - freq[A][B] = count of draws where B was in A's beam path (A was seed, B on diagonal)
 *  - mutualScore[A][B] = freq[A][B] + freq[B][A]  ← both directions confirmed historically
 *  - For current seeds → rank candidates by mutualScore
 *  - Tiebreak by: connected to MORE seeds + recency + co-occurrence
 */

import { readFileSync } from 'fs'

const rawDraws = JSON.parse(readFileSync('public/all_draws.json', 'utf8'))
const MAX  = 45
const SEP  = '═'.repeat(80)
const SEP2 = '─'.repeat(80)
const BP_DIRS = { NW:{dc:-1,dr:-1}, NE:{dc:+1,dr:-1}, SW:{dc:-1,dr:+1}, SE:{dc:+1,dr:+1} }

// ── Core: all 4-direction beam path numbers ───────────────────────────────
function getBeamPathAll(slice, ci, seed) {
  const hits = new Set()
  for (const { dc, dr } of Object.values(BP_DIRS)) {
    for (let s = 1; s <= slice.length; s++) {
      const c2 = ci + dc * s, n = seed + dr * s
      if (c2 < 0 || c2 >= slice.length || n < 1 || n > MAX) break
      if (slice[c2].includes(n)) hits.add(n)
    }
  }
  return [...hits]
}

// ── Build global frequency table: freq[seed][candidate] ──────────────────
console.log(SEP)
console.log('  Building historical beam-frequency matrix across all ' + rawDraws.length + ' draws...')

const freq = {}   // freq[A][B] = times B appeared in A's beam when A was a seed

for (let idx = 1; idx < rawDraws.length; idx++) {
  const draw  = rawDraws[idx]
  const slice = rawDraws.slice(0, idx + 1)
  const ci    = slice.length - 1

  draw.forEach(seed => {
    const hits = getBeamPathAll(slice, ci, seed)
    if (!freq[seed]) freq[seed] = {}
    hits.forEach(h => { freq[seed][h] = (freq[seed][h] || 0) + 1 })
  })
}

const getMutual = (a, b) => (freq[a]?.[b] || 0) + (freq[b]?.[a] || 0)
console.log('  Done.\n')

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — Accuracy test: last 100 draws
// ═══════════════════════════════════════════════════════════════════════════
console.log(SEP)
console.log('  ACCURACY TEST — Last 100 draws')
console.log(SEP)

const TEST_N   = 100
const startIdx = Math.max(1, rawDraws.length - TEST_N - 1)

let totalActual = 0
let top5=0,top10=0,top15=0,top20=0
let top5pm1=0,top10pm1=0
let drawsWith3plus=0, drawsWith2=0, drawsWith1=0

const rows = []

for (let testIdx = startIdx; testIdx < rawDraws.length - 1; testIdx++) {
  const thisDraw = rawDraws[testIdx]
  const nextDraw = rawDraws[testIdx + 1]

  // Score every candidate by mutual freq with this draw's seeds
  const ranked = []
  for (let n = 1; n <= MAX; n++) {
    let totalM = 0, seedCnt = 0, topM = 0
    thisDraw.forEach(seed => {
      const m = getMutual(seed, n)
      totalM += m
      if (m > 0) seedCnt++
      if (m > topM) topM = m
    })
    if (totalM > 0) ranked.push({ n, totalM, seedCnt, topM })
  }
  ranked.sort((a,b) => b.topM-a.topM || b.seedCnt-a.seedCnt || b.totalM-a.totalM)

  const r5  = ranked.slice(0,5).map(r=>r.n)
  const r10 = ranked.slice(0,10).map(r=>r.n)
  const r15 = ranked.slice(0,15).map(r=>r.n)
  const r20 = ranked.slice(0,20).map(r=>r.n)

  let drawHits = 0
  nextDraw.forEach(actual => {
    totalActual++
    if (r5.includes(actual))  { top5++;  drawHits++ }
    if (r10.includes(actual)) top10++
    if (r15.includes(actual)) top15++
    if (r20.includes(actual)) top20++
    if (!r5.includes(actual)  && r5.some(n=>Math.abs(n-actual)===1))  top5pm1++
    if (!r10.includes(actual) && r10.some(n=>Math.abs(n-actual)===1)) top10pm1++
  })
  if (drawHits >= 3) drawsWith3plus++
  else if (drawHits === 2) drawsWith2++
  else if (drawHits === 1) drawsWith1++

  if (testIdx >= rawDraws.length - 12) rows.push({ testIdx, thisDraw, nextDraw, ranked })
}

const d = totalActual
console.log('\n  Top-5  exact: ' + top5  + '/' + d + ' = ' + (top5/d*100).toFixed(1)  + '%  (ideal=100%)')
console.log('  Top-10 exact: ' + top10 + '/' + d + ' = ' + (top10/d*100).toFixed(1) + '%')
console.log('  Top-15 exact: ' + top15 + '/' + d + ' = ' + (top15/d*100).toFixed(1) + '%')
console.log('  Top-20 exact: ' + top20 + '/' + d + ' = ' + (top20/d*100).toFixed(1) + '%')
console.log()
console.log('  Draws where ≥3 of 5 actual were in top-5 : ' + drawsWith3plus)
console.log('  Draws where   2 of 5 actual were in top-5 : ' + drawsWith2)
console.log('  Draws where   1 of 5 actual was  in top-5 : ' + drawsWith1)
console.log()
console.log('  Top-5  ±1 misses: ' + top5pm1  + ' (beam hit neighbour, off by 1)')
console.log('  Top-10 ±1 misses: ' + top10pm1)

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — Per-draw detail: last 10 draws
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + SEP)
console.log('  PER-DRAW DETAIL — Last 10 Draws (showing why cluster confusion happens)')
console.log(SEP)

rows.slice(-10).forEach(({ testIdx, thisDraw, nextDraw, ranked }) => {
  const top10r = ranked.slice(0, 10)
  console.log('\n  D#' + (testIdx+1) + ': seeds=[' + thisDraw.join(',') + ']  →  actual=[' + nextDraw.join(',') + ']')
  console.log('  #  | Num | TopM | Seeds | TotalM | Hit  | Via (seed↔mutual)')
  top10r.forEach(({ n, topM, seedCnt, totalM }, i) => {
    const hit = nextDraw.includes(n) ? '✅' : nextDraw.some(a=>Math.abs(a-n)===1) ? '🟡±1' : '    '
    const via = thisDraw.filter(s => getMutual(s,n)>0)
      .map(s => s+'↔'+getMutual(s,n)).join(' ')
    console.log('  #' + String(i+1).padEnd(2) +
      ' | ' + String(n).padStart(2) +
      '  |  ' + String(topM).padStart(3) +
      ' |   ' + seedCnt +
      '   |  ' + String(totalM).padStart(4) +
      '  | ' + hit.padEnd(4) + '| ' + via)
  })
  // Show why cluster happens: identify groups of similar topM
  const topScore = top10r[0]?.topM || 0
  const cluster = top10r.filter(r => r.topM >= topScore - 2)
  if (cluster.length > 3) {
    console.log('  ⚠ CLUSTER of ' + cluster.length + ' candidates with similar score — use seedCount/totalM to pick')
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// PART 3 — Cluster explanation + tiebreaker rules
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + SEP)
console.log('  WHY CLUSTER CONFUSION: 9, 10, 11, 12 all show similar scores')
console.log(SEP)
console.log(`
  REASON: The NW beam from seed 32 diagonally touches:
    draw[col-1] → number 31, draw[col-2] → 30, draw[col-3] → 29 ...
  Historically multiple of 28,29,30,31 have appeared on that diagonal.
  So all of them accumulate mutual-freq with seed 32 → same cluster.

  HOW TO BREAK THE TIE — 4 rules in priority order:

  Rule 1: SEED COUNT — pick the candidate connected to MOST different seeds.
    If 10 connects to seeds 32 AND 45 (2 seeds), but 11 only connects to 32 (1 seed),
    → pick 10 because 2 independent lasers confirm it.

  Rule 2: TOP MUTUAL SCORE — within same seedCount, pick highest single mutual score.
    If 10↔32=15 and 11↔32=12, pick 10 (stronger historical bond with 32).

  Rule 3: OVERDUE — if still tied, pick the one NOT seen recently (>8 draws ago).
    Numbers that appeared 15+ draws ago have stronger "return pressure".

  Rule 4: CO-OCCURRENCE — pick the one that appeared most WITH current seeds historically.
    If 10 and 32 appeared in same draw 18 times vs 11 and 32 only 12 times, pick 10.

  The ranked list below uses ALL 4 rules combined.
`)

// ═══════════════════════════════════════════════════════════════════════════
// PART 4 — NEXT DRAW PREDICTION
// ═══════════════════════════════════════════════════════════════════════════
console.log(SEP)
console.log('  NEXT DRAW PREDICTION — [' + rawDraws[rawDraws.length-1].join(', ') + ']')
console.log(SEP)

const lastDraw = rawDraws[rawDraws.length - 1]

// Build co-occurrence and lastSeen
const coMap = {}
const lastSeen = {}
rawDraws.forEach((draw, di) => {
  draw.forEach(n => { lastSeen[n] = di })
  for (let i=0;i<draw.length;i++) for (let j=i+1;j<draw.length;j++) {
    const a=draw[i],b=draw[j]
    coMap[a]=coMap[a]||{}; coMap[b]=coMap[b]||{}
    coMap[a][b]=(coMap[a][b]||0)+1; coMap[b][a]=(coMap[b][a]||0)+1
  }
})

// Show per-seed mutual top numbers
console.log('\n  Per-seed top mutual partners (historical frequency):')
lastDraw.forEach(seed => {
  const top = []
  for (let n=1;n<=MAX;n++) {
    if (lastDraw.includes(n)) continue
    const m=getMutual(seed,n)
    if(m>0) top.push({n,m,fwd:freq[seed]?.[n]||0,rev:freq[n]?.[seed]||0})
  }
  top.sort((a,b)=>b.m-a.m)
  console.log('  Seed ' + String(seed).padStart(2) + ' ↔: ' +
    top.slice(0,10).map(t=>t.n+'('+t.m+')').join('  '))
})

// Final combined ranking
const predRanked = []
for (let n=1;n<=MAX;n++) {
  let totalM=0,seedCnt=0,topM=0
  lastDraw.forEach(seed=>{
    const m=getMutual(seed,n)
    totalM+=m; if(m>0)seedCnt++; if(m>topM)topM=m
  })
  if(totalM===0) continue
  const coFreq   = lastDraw.reduce((s,seed)=>s+(coMap[n]?.[seed]||0),0)
  const daysAgo  = rawDraws.length-1-(lastSeen[n]||0)
  const overdue  = Math.max(0, daysAgo-8)*0.5
  const combined = topM*10 + seedCnt*8 + totalM*0.5 + coFreq*1.2 + overdue
  predRanked.push({n,topM,seedCnt,totalM,coFreq,daysAgo,combined})
}
predRanked.sort((a,b)=>b.combined-a.combined)

console.log('\n  FULL RANKED LIST (mutual-freq + seedCount + co-occurrence + overdue):')
console.log('  Rank | Num | TopM | Seeds↔ | TotalM | CoFreq | LastSeen | Score | Via seeds')
console.log('  ' + SEP2.slice(0,76))
predRanked.slice(0,25).forEach(({n,topM,seedCnt,totalM,coFreq,daysAgo,combined},i)=>{
  const via = lastDraw.filter(s=>getMutual(s,n)>0)
    .sort((a,b)=>getMutual(b,n)-getMutual(a,n))
    .map(s=>s+'↔'+getMutual(s,n)).join(' ')
  console.log('  #' + String(i+1).padEnd(3)+
    '| '+String(n).padStart(2)+
    '  |  '+String(topM).padStart(3)+
    ' |   '+seedCnt+
    '    |  '+String(totalM).padStart(4)+
    '  |  '+String(coFreq).padStart(3)+
    '   | '+String(daysAgo).padStart(3)+'ago  | '+String(Math.round(combined)).padStart(5)+' | '+via)
})

console.log('\n  ━━━ TOP 5 PICKS ━━━')
predRanked.slice(0,5).forEach(({n,topM,seedCnt,daysAgo,combined},i)=>{
  const via=lastDraw.filter(s=>getMutual(s,n)>0)
    .map(s=>s+'↔'+getMutual(s,n)).join(', ')
  console.log('  '+(i+1)+'. NUMBER '+String(n).padStart(2)+'   mutual:['+via+']   lastSeen:'+daysAgo+'ago   score:'+Math.round(combined))
})
console.log('\n  ─── D+2 DELAY zone (picks 11-20): ───')
predRanked.slice(10,20).forEach(({n,topM,seedCnt,daysAgo},i)=>{
  const via=lastDraw.filter(s=>getMutual(s,n)>0).map(s=>s+'↔'+getMutual(s,n)).join(', ')
  console.log('  '+(i+11)+'. '+n+'  ['+via+']  lastSeen:'+daysAgo+'ago')
})
