/**
 * DEEP DRAW-TO-DRAW DNA ANALYSIS
 * Examines what mathematical connections form between consecutive draws.
 * Focuses on draws 419-491 (the new ones added from lotteryextreme).
 */

import { readFileSync } from 'fs'

const allDraws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

// Analyze last 73 draws (the newly added ones) + 5 before for context
const recent = allDraws.slice(-78)
const zones = [[1,9,'LO'],[10,19,'ML'],[20,29,'MH'],[30,39,'HI'],[40,45,'XH']]

function zone(n) { return zones.find(([a,b])=>n>=a&&n<=b)?.[2]||'?' }
function sig(d)   { return zones.map(([a,b])=>d.filter(n=>n>=a&&n<=b).length).join('') }
function sum(d)   { return d.reduce((s,n)=>s+n,0) }
function avg(d)   { return (sum(d)/d.length).toFixed(1) }
function spread(d){ return d[d.length-1]-d[0] }
function gaps(d)  { return d.slice(1).map((n,i)=>n-d[i]) }

// ── 1. TRANSITION PATTERNS: which numbers from draw D appear in D+1 or D+2 ──
console.log('═'.repeat(70))
console.log('SECTION 1: CARRY-OVER CHAINS (numbers that persist or echo draw-to-draw)')
console.log('═'.repeat(70))
let carryCount = 0, echoCount = 0, total = 0
const carryFreq = {}, echoFreq = {}

for (let i = 1; i < recent.length; i++) {
  const prev = new Set(recent[i-1])
  const curr = new Set(recent[i])
  const next = i+1 < recent.length ? new Set(recent[i+1]) : null

  // Numbers that carry directly into next draw
  const carried = [...prev].filter(n => curr.has(n))
  // Numbers from prev that skip one draw and appear in D+2
  const echoed = next ? [...prev].filter(n => !curr.has(n) && next.has(n)) : []

  carryCount += carried.length
  echoCount  += echoed.length
  total++

  carried.forEach(n => carryFreq[n] = (carryFreq[n]||0)+1)
  echoed.forEach(n  => echoFreq[n]  = (echoFreq[n] ||0)+1)
}

console.log(`Avg carry-over (D→D+1): ${(carryCount/total).toFixed(2)} numbers/draw`)
console.log(`Avg skip-echo  (D→D+2): ${(echoCount/total).toFixed(2)} numbers/draw`)

const topCarry = Object.entries(carryFreq).sort((a,b)=>b[1]-a[1]).slice(0,10)
const topEcho  = Object.entries(echoFreq ).sort((a,b)=>b[1]-a[1]).slice(0,10)
console.log(`\nTop carry-over numbers: ${topCarry.map(([n,c])=>`${n}(${c}x)`).join(' ')}`)
console.log(`Top skip-echo  numbers: ${topEcho .map(([n,c])=>`${n}(${c}x)`).join(' ')}`)

// ── 2. ARITHMETIC BRIDGES: seed ± k = next draw number ──────────────────────
console.log('\n' + '═'.repeat(70))
console.log('SECTION 2: ARITHMETIC BRIDGES (prev number ± offset → next draw number)')
console.log('═'.repeat(70))

const offsetHits = {}  // offset → count
const offsetPairs = {} // offset → example pairs

for (let i = 0; i < recent.length - 1; i++) {
  const prev = recent[i]
  const next = recent[i+1]
  const nextSet = new Set(next)

  for (const p of prev) {
    for (const n of next) {
      const off = n - p
      offsetHits[off] = (offsetHits[off]||0) + 1
      if (!offsetPairs[off]) offsetPairs[off] = []
      if (offsetPairs[off].length < 3) offsetPairs[off].push(`${p}→${n}`)
    }
  }
}

// The "random" baseline would be 5*5/44 hits per offset ≈ 0.568 per draw
const baseline = (5*5) / 44
console.log(`Baseline (random) hits per offset per draw: ${baseline.toFixed(2)}`)
console.log(`\nTop offset bridges (sorted by frequency):`)
const topOffsets = Object.entries(offsetHits)
  .sort((a,b)=>b[1]-a[1])
  .slice(0,20)
  .map(([off,cnt]) => ({ off:+off, cnt, rate:(cnt/recent.length).toFixed(2), ex:offsetPairs[off].join(' ') }))

for (const {off, cnt, rate, ex} of topOffsets) {
  const arrow = +rate > baseline ? '★' : ' '
  console.log(`  ${arrow} offset ${String(off).padStart(3)}: ${cnt} hits (${rate}/draw)  e.g. ${ex}`)
}

// Show distribution of offsets
console.log('\nOffset distribution (hot zones):')
const negOffsets = Object.entries(offsetHits).filter(([k])=>+k<0&&+k>=-9).sort((a,b)=>b[1]-a[1])
const posOffsets = Object.entries(offsetHits).filter(([k])=>+k>0&&+k<=9 ).sort((a,b)=>b[1]-a[1])
console.log(`  Short negative (−1 to −9):  ${negOffsets.map(([o,c])=>`${o}(${c})`).join('  ')}`)
console.log(`  Short positive (+1 to +9):  ${posOffsets.map(([o,c])=>`${o}(${c})`).join('  ')}`)

// ── 3. SUM & ZONE SIGNATURE TRENDS ──────────────────────────────────────────
console.log('\n' + '═'.repeat(70))
console.log('SECTION 3: SUM & ZONE SIGNATURES (structural fingerprint)')
console.log('═'.repeat(70))

const sigFreq = {}, sumBuckets = {}
for (const d of recent) {
  const s = sig(d)
  const sm = sum(d)
  sigFreq[s] = (sigFreq[s]||0)+1
  const bucket = Math.floor(sm/10)*10
  sumBuckets[bucket] = (sumBuckets[bucket]||0)+1
}

console.log('\nTop zone signatures (LO/ML/MH/HI/XH counts per draw):')
Object.entries(sigFreq).sort((a,b)=>b[1]-a[1]).slice(0,8)
  .forEach(([s,c]) => console.log(`  ${s}: ${c}x (${(c/recent.length*100).toFixed(1)}%)`))

console.log('\nSum distribution:')
Object.entries(sumBuckets).sort((a,b)=>+a[0]-+b[0])
  .forEach(([b,c]) => console.log(`  ${b}-${+b+9}: ${'█'.repeat(c)} ${c}`))

// ── 4. DELTA FINGERPRINT: internal gap patterns ───────────────────────────────
console.log('\n' + '═'.repeat(70))
console.log('SECTION 4: INTERNAL GAP PATTERNS (spacing between draw\'s own numbers)')
console.log('═'.repeat(70))

const gapPatterns = {}
for (const d of recent) {
  const g = gaps(d)
  // classify each gap as S(mall 1-5), M(edium 6-12), L(arge 13+)
  const pat = g.map(x => x<=5?'S':x<=12?'M':'L').join('')
  gapPatterns[pat] = (gapPatterns[pat]||0)+1
}

console.log('Gap patterns (S=1-5, M=6-12, L=13+):')
Object.entries(gapPatterns).sort((a,b)=>b[1]-a[1]).slice(0,10)
  .forEach(([p,c]) => console.log(`  ${p}: ${c}x`))

// ── 5. TWIN DRAW: midday → evening same day patterns ─────────────────────────
console.log('\n' + '═'.repeat(70))
console.log('SECTION 5: MIDDAY→EVENING SAME-DAY RESONANCE')
console.log('═'.repeat(70))

// The new draws alternate midday/evening. Every 2 consecutive draws = same day.
// Look at pairs (D418+1, D418+2) etc. In new data: index offset by starting draw
const pairs = []
// We'll analyze pairs from the newly added portion
const newDraws = allDraws.slice(-73)  // 73 new draws
for (let i = 0; i < newDraws.length - 1; i += 2) {
  const mid = newDraws[i]
  const eve = newDraws[i+1]
  const midSet = new Set(mid)
  const shared = eve.filter(n => midSet.has(n))
  const sumDiff = sum(eve) - sum(mid)
  const midBridge = []
  for (const m of mid) {
    for (const e of eve) {
      const off = e - m
      if (off !== 0 && Math.abs(off) <= 10) midBridge.push(off)
    }
  }
  pairs.push({ mid, eve, shared, sumDiff, midBridge })
}

const avgShared = pairs.reduce((s,p)=>s+p.shared.length,0)/pairs.length
const commonBridges = {}
pairs.forEach(p => p.midBridge.forEach(o => commonBridges[o]=(commonBridges[o]||0)+1))
const topBridges = Object.entries(commonBridges).sort((a,b)=>b[1]-a[1]).slice(0,8)

console.log(`Avg numbers shared midday↔evening (same day): ${avgShared.toFixed(2)}`)
console.log(`Top midday→evening arithmetic bridges: ${topBridges.map(([o,c])=>`${+o>0?'+':''}${o}(${c}x)`).join('  ')}`)

// Show a few examples
console.log('\nRecent midday→evening pairs:')
pairs.slice(-6).forEach(({mid,eve,shared,sumDiff}) => {
  console.log(`  Midday: [${mid.join(',')}] sig=${sig(mid)} sum=${sum(mid)}`)
  console.log(`  Evening:[${eve.join(',')}] sig=${sig(eve)} sum=${sum(eve)}  shared=${shared.join(',')||'none'}  Δsum=${sumDiff>0?'+':''}${sumDiff}`)
  console.log()
})

// ── 6. CONSECUTIVE DRAW DELTAS: how big are the changes ──────────────────────
console.log('═'.repeat(70))
console.log('SECTION 6: TOTAL NUMBER CHANGE D→D+1 (overlap + new numbers)')
console.log('═'.repeat(70))

let totalSumChanges = []
for (let i = 1; i < recent.length; i++) {
  const prev = new Set(recent[i-1])
  const curr = recent[i]
  const kept = curr.filter(n => prev.has(n)).length
  const changed = 5 - kept
  totalSumChanges.push({ kept, changed, dSum: sum(recent[i]) - sum(recent[i-1]) })
}

const changeDist = {0:0,1:0,2:0,3:0,4:0,5:0}
totalSumChanges.forEach(({changed}) => changeDist[changed]++)

console.log('How many numbers change draw-to-draw:')
for (let k = 0; k <= 5; k++) {
  const c = changeDist[k]
  console.log(`  ${k} new numbers: ${c}x (${(c/totalSumChanges.length*100).toFixed(1)}%)  ${'█'.repeat(Math.round(c/2))}`)
}

const avgDSum = totalSumChanges.reduce((s,x)=>s+Math.abs(x.dSum),0)/totalSumChanges.length
console.log(`\nAvg absolute sum change draw-to-draw: ${avgDSum.toFixed(1)}`)

// ── 7. PREDICTIVE SIGNAL: from seeds, what offsets consistently hit next draw ─
console.log('\n' + '═'.repeat(70))
console.log('SECTION 7: STRONGEST PREDICTIVE OFFSETS (seed+offset=next draw number)')
console.log('═'.repeat(70))

const hitByOffset = {}
const totalByOffset = {}

for (let i = 0; i < recent.length - 1; i++) {
  const prevSet = recent[i]
  const nextSet = new Set(recent[i+1])

  for (const seed of prevSet) {
    for (let off = -15; off <= 15; off++) {
      if (off === 0) continue
      const candidate = seed + off
      if (candidate < 1 || candidate > 45) continue
      if (prevSet.includes(candidate)) continue  // candidate must not be in prev draw
      totalByOffset[off] = (totalByOffset[off]||0) + 1
      if (nextSet.has(candidate)) hitByOffset[off] = (hitByOffset[off]||0) + 1
    }
  }
}

console.log('Offset | Hits | Total | HitRate | Expected | Signal')
const offEntries = Object.entries(hitByOffset).sort((a,b)=>b[1]/totalByOffset[b[0]] - a[1]/totalByOffset[a[0]])
const expectedRate = 5/45
for (const [off, hits] of offEntries.slice(0,15)) {
  const tot = totalByOffset[off]
  const rate = hits/tot
  const signal = rate/expectedRate
  const bar = '▓'.repeat(Math.round(signal*3))
  console.log(`  ${String(+off).padStart(3)}   | ${String(hits).padStart(4)} | ${String(tot).padStart(5)} | ${(rate*100).toFixed(1)}%    | ${(expectedRate*100).toFixed(1)}%     | ${signal.toFixed(2)}x ${bar}`)
}

// ── 8. ZONE TRANSITION: where do numbers migrate between draws ───────────────
console.log('\n' + '═'.repeat(70))
console.log('SECTION 8: ZONE MIGRATION (which zones feed into which next draw)')
console.log('═'.repeat(70))

const zoneTrans = {}
for (let i = 0; i < recent.length - 1; i++) {
  for (const p of recent[i]) {
    for (const n of recent[i+1]) {
      const key = `${zone(p)}→${zone(n)}`
      zoneTrans[key] = (zoneTrans[key]||0)+1
    }
  }
}

const zoneNames = ['LO','ML','MH','HI','XH']
console.log('From\\To  ' + zoneNames.map(z=>z.padStart(6)).join(''))
for (const from of zoneNames) {
  const row = zoneNames.map(to => {
    const cnt = zoneTrans[`${from}→${to}`]||0
    return String(cnt).padStart(6)
  }).join('')
  console.log(`${from.padEnd(9)}${row}`)
}

// ── 9. SUM PAIRS THAT PRODUCE NEXT DRAW NUMBERS ──────────────────────────────
console.log('\n' + '═'.repeat(70))
console.log('SECTION 9: PAIR SUM / PAIR DIFF BRIDGES (a+b or a-b → next number)')
console.log('═'.repeat(70))

let pairSumHits = 0, pairDiffHits = 0, pairTotal = 0
// Track how many pair-diffs hit PER DRAW
const pairDiffHitsPerDraw = []

for (let i = 0; i < recent.length - 1; i++) {
  const prev = recent[i]
  const nextSet = new Set(recent[i+1])
  let drawDiffHits = 0
  for (let a = 0; a < prev.length; a++) {
    for (let b = a+1; b < prev.length; b++) {
      pairTotal++
      const s = prev[a] + prev[b]
      const d = prev[b] - prev[a]
      if (s >= 1 && s <= 45 && nextSet.has(s)) pairSumHits++
      if (d >= 1 && d <= 45 && nextSet.has(d)) { pairDiffHits++; drawDiffHits++ }
    }
  }
  pairDiffHitsPerDraw.push(drawDiffHits)
}

const pairBaseline = 5/44
console.log(`Pair SUM  (a+b) hits as next draw number: ${pairSumHits}/${pairTotal} = ${(pairSumHits/pairTotal*100).toFixed(2)}%  (baseline ${(pairBaseline*100).toFixed(2)}%)  signal ${(pairSumHits/pairTotal/pairBaseline).toFixed(2)}x`)
console.log(`Pair DIFF (b-a) hits as next draw number: ${pairDiffHits}/${pairTotal} = ${(pairDiffHits/pairTotal*100).toFixed(2)}%  (baseline ${(pairBaseline*100).toFixed(2)}%)  signal ${(pairDiffHits/pairTotal/pairBaseline).toFixed(2)}x`)

// Distribution: how many pair-diffs hit per draw
const diffDist = {}
pairDiffHitsPerDraw.forEach(c => diffDist[c] = (diffDist[c]||0)+1)
console.log('\nPair-diff hits distribution per draw:')
Object.entries(diffDist).sort((a,b)=>+a[0]-+b[0]).forEach(([k,v]) => {
  console.log(`  ${k} pair-diffs hit: ${v}x (${(v/pairDiffHitsPerDraw.length*100).toFixed(1)}%)  ${'█'.repeat(Math.round(v/2))}`)
})

// Show last 10 draw pair-diff analysis
console.log('\nRecent draws pair-diff analysis:')
for (let i = Math.max(0,recent.length-11); i < recent.length-1; i++) {
  const prev = recent[i]
  const nextSet = new Set(recent[i+1])
  const hits = []
  for (let a = 0; a < prev.length; a++)
    for (let b = a+1; b < prev.length; b++) {
      const d = prev[b] - prev[a]
      if (d >= 1 && d <= 45 && nextSet.has(d)) hits.push(`${prev[b]}-${prev[a]}=${d}`)
    }
  const drawNum = allDraws.length - (recent.length-1-i)
  console.log(`  D${drawNum} [${prev.join(',')}] → D${drawNum+1} [${recent[i+1].join(',')}]  diffs: ${hits.join(', ')||'none'}`)
}

// ── 10. SHOW LAST 10 DRAWS WITH FULL DNA ─────────────────────────────────────
console.log('\n' + '═'.repeat(70))
console.log('SECTION 10: LAST 10 DRAWS FULL DNA')
console.log('═'.repeat(70))

const last10 = allDraws.slice(-10)
for (let i = 0; i < last10.length; i++) {
  const d = last10[i]
  const drawNum = allDraws.length - 10 + i + 1
  let line = `D${drawNum}: [${d.join(',')}]  sig=${sig(d)}  sum=${sum(d)}  avg=${avg(d)}  spread=${spread(d)}  gaps=[${gaps(d).join(',')}]`
  if (i > 0) {
    const prev = last10[i-1]
    const prevSet = new Set(prev)
    const carried = d.filter(n => prevSet.has(n))
    const offsets = []
    for (const p of prev) {
      for (const n of d) {
        const off = n - p
        if (off !== 0) offsets.push(`${p}${off>0?'+':''}${off}=${n}`)
      }
    }
    line += `\n       ↑carry=[${carried.join(',')||'none'}]  bridges=[${offsets.slice(0,6).join(', ')}]`
  }
  console.log(line)
  console.log()
}

// ── 11. NEXT DRAW PREDICTION USING TOP OFFSETS + PAIR DIFFS ─────────────────
console.log('═'.repeat(70))
console.log('SECTION 11: PREDICTED NEXT DRAW NUMBERS (pair-diffs PRIMARY + offsets)')
console.log('═'.repeat(70))

const seeds = allDraws[allDraws.length - 1]
console.log(`\nSeeds (last draw D${allDraws.length}): [${seeds.join(', ')}]`)
console.log(`Sig: ${sig(seeds)}  Sum: ${sum(seeds)}  Spread: ${spread(seeds)}`)

// Show ALL pair diffs of seeds
console.log('\n--- All seed pair differences (b-a) ---')
const pairDiffs = []
for (let a = 0; a < seeds.length; a++)
  for (let b = a+1; b < seeds.length; b++) {
    const d = seeds[b] - seeds[a]
    if (d >= 1 && d <= 45) pairDiffs.push({ val: d, expr: `${seeds[b]}-${seeds[a]}` })
    console.log(`  ${seeds[b]}-${seeds[a]} = ${d}`)
  }

// Use top 5 positive and top 5 negative offsets (excl. 0) by hit rate
const topPosOff = Object.entries(hitByOffset)
  .filter(([o]) => +o > 0)
  .sort((a,b) => b[1]/totalByOffset[b[0]] - a[1]/totalByOffset[a[0]])
  .slice(0,5).map(([o]) => +o)

const topNegOff = Object.entries(hitByOffset)
  .filter(([o]) => +o < 0)
  .sort((a,b) => b[1]/totalByOffset[b[0]] - a[1]/totalByOffset[a[0]])
  .slice(0,5).map(([o]) => +o)

const candidateScore = {}
const seedSet = new Set(seeds)

// PRIMARY signal: pair diffs (weighted 3x)
for (const {val} of pairDiffs) {
  if (!seedSet.has(val)) candidateScore[val] = (candidateScore[val]||0) + 3.0
}

// SECONDARY signal: seed ± top offsets
for (const off of [...topPosOff, ...topNegOff]) {
  const rate = hitByOffset[off] / totalByOffset[off]
  for (const seed of seeds) {
    const cand = seed + off
    if (cand >= 1 && cand <= 45 && !seedSet.has(cand)) {
      candidateScore[cand] = (candidateScore[cand]||0) + rate
    }
  }
}

// TERTIARY: pair sums (if in range)
for (let a = 0; a < seeds.length; a++) {
  for (let b = a+1; b < seeds.length; b++) {
    const s = seeds[a] + seeds[b]
    if (s >= 1 && s <= 45 && !seedSet.has(s)) candidateScore[s] = (candidateScore[s]||0) + 0.3
  }
}

const ranked = Object.entries(candidateScore)
  .sort((a,b) => b[1]-a[1])
  .slice(0,20)
  .map(([n,s]) => `${n}(${s.toFixed(2)})`)

console.log(`\nTop 20 candidates for next draw:`)
console.log(`  ${ranked.join('  ')}`)

// Best 5 pick
const best5 = Object.entries(candidateScore)
  .sort((a,b) => b[1]-a[1])
  .slice(0,5)
  .map(([n]) => +n)
  .sort((a,b)=>a-b)
console.log(`\n★ BEST 5 PICK: [${best5.join(', ')}]`)

// Also show pair-diff sourced top picks separately
const diffOnly = pairDiffs
  .filter(p => !seedSet.has(p.val))
  .sort((a,b)=>b.val-a.val)
console.log(`\n⚡ PAIR-DIFF SOURCED CANDIDATES: ${diffOnly.map(p=>`${p.val}(${p.expr})`).join('  ')}`)

