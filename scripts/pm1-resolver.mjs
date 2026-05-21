/**
 * ±1 OFFSET RESOLVER
 * When formula gives X but actual is X±1, what decides the exact direction?
 * 
 * Check: nwApp parity, swApp parity, ctTotal odd/even, seed odd/even,
 *        NW_steps parity, SW_steps parity, (NW+SW) parity, etc.
 */
import { readFileSync } from 'fs'
const draws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
const WIN = 100, MAXN = 45

function getStats(win, colIdx, seed) {
  const drawSets = win.map(d => new Set(d))
  const rowIdx = seed - 1
  let nwSteps=0, nwApp=0, swSteps=0, swApp=0, neApp=0, seApp=0
  for (const [dir,dc,dr] of [['NW',-1,-1],['NE',1,-1],['SW',-1,1],['SE',1,1]]) {
    let step=1
    while(true){
      const ci=colIdx+dc*step, ri=rowIdx+dr*step
      if(ci<0||ci>=win.length||ri<0||ri>=MAXN) break
      const n=ri+1, hit=drawSets[ci]?.has(n)||false
      if(dir==='NW'){nwSteps++;if(hit)nwApp++}
      if(dir==='SW'){swSteps++;if(hit)swApp++}
      if(dir==='NE'&&hit)neApp++
      if(dir==='SE'&&hit)seApp++
      const adjRi=dr<0?ri-1:ri+1
      if(adjRi>=0&&adjRi<MAXN){
        const adjN=adjRi+1,adjHit=drawSets[ci]?.has(adjN)||false
        if(dir==='NW'){nwSteps++;if(adjHit)nwApp++}
        if(dir==='SW'){swSteps++;if(adjHit)swApp++}
        if(dir==='NE'&&adjHit)neApp++
        if(dir==='SE'&&adjHit)seApp++
      }
      step++
    }
  }
  const ctTotal=nwApp+swApp+neApp+seApp
  return { NW:nwSteps, nwApp, nwMiss:nwSteps-nwApp, SW:swSteps, swApp, swMiss:swSteps-swApp, neApp, seApp, ctTotal }
}

function allFormulas(seed, s) {
  const {NW,nwApp,nwMiss,SW,swApp,swMiss,ctTotal} = s
  return [
    ['NW-seed',   NW-seed],
    ['NW-ct',     NW-ctTotal],
    ['SW-ct',     SW-ctTotal],
    ['SW%seed',   SW>0?SW%seed:-1],
    ['S-nwMiss',  seed-nwMiss],
    ['S-swMiss',  seed-swMiss],
    ['S-ct',      seed-ctTotal],
    ['S+ct',      seed+ctTotal],
    ['S-swApp',   seed-swApp],
    ['S+swApp',   seed+swApp],
    ['S-nwApp',   seed-nwApp],
    ['S+nwApp',   seed+nwApp],
    ['NW*nwA/ct', ctTotal>0?Math.round(NW*nwApp/ctTotal):-1],
    ['nwA+swA',   nwApp+swApp],
    ['S-(nwA+swA)', seed-(nwApp+swApp)],
    ['S+(nwA+swA)', seed+(nwApp+swApp)],
    ['(NW+SW)/2', Math.round((NW+SW)/2)],
    ['NW%ct',     ctTotal>0?NW%ctTotal:-1],
    ['SW%ct',     ctTotal>0?SW%ctTotal:-1],
    ['NW+nwA-swA',NW+nwApp-swApp],
    ['SW-nwApp',  SW-nwApp],
    ['nwA*ct',    nwApp*ctTotal],
  ].filter(([,v]) => v>=1&&v<=MAXN).map(([id,v])=>({id,v}))
}

// ── Collect all ±1 near-miss events ─────────────────────────────────────
// Case: formula gives X, actual was X+1 → offset = +1
//       formula gives X, actual was X-1 → offset = -1
//       formula gives X, actual was X   → EXACT HIT (offset = 0)

const events = []  // { seed, formulaId, predicted, actual, offset, ...all stats }

for (let di = 1; di < draws.length; di++) {
  const win = draws.slice(Math.max(0,di-WIN), di)
  const colIdx = win.length-1
  const seeds = draws[di-1]
  const nextArr = draws[di]
  const nextSet = new Set(nextArr)

  for (const seed of seeds) {
    const s = getStats(win, colIdx, seed)
    const fmls = allFormulas(seed, s)
    for (const f of fmls) {
      // Exact hit
      if (nextSet.has(f.v)) {
        events.push({ seed, fid:f.id, predicted:f.v, actual:f.v, offset:0, ...s, drawIdx:di })
      }
      // +1 near miss
      if (f.v+1 <= MAXN && nextSet.has(f.v+1)) {
        events.push({ seed, fid:f.id, predicted:f.v, actual:f.v+1, offset:+1, ...s, drawIdx:di })
      }
      // -1 near miss
      if (f.v-1 >= 1 && nextSet.has(f.v-1)) {
        events.push({ seed, fid:f.id, predicted:f.v, actual:f.v-1, offset:-1, ...s, drawIdx:di })
      }
    }
  }
}

const exact  = events.filter(e=>e.offset===0)
const plus1  = events.filter(e=>e.offset===+1)
const minus1 = events.filter(e=>e.offset===-1)
console.log(`Total ±1 events: ${events.length}`)
console.log(`  Exact (offset=0): ${exact.length}`)
console.log(`  Off by +1:        ${plus1.length}`)
console.log(`  Off by -1:        ${minus1.length}`)

// ── For each ±1 event, what DECIDES the direction? ──────────────────────
// Test every binary feature: is X even/odd, is nwApp even/odd, etc.
// For each feature, measure: when feature=true, is offset more likely +1 or -1?

const features = [
  ['seed_odd',         e => e.seed % 2 === 1],
  ['pred_odd',         e => e.predicted % 2 === 1],
  ['nwApp_odd',        e => e.nwApp % 2 === 1],
  ['swApp_odd',        e => e.swApp % 2 === 1],
  ['ctTotal_odd',      e => e.ctTotal % 2 === 1],
  ['NW_odd',           e => e.NW % 2 === 1],
  ['SW_odd',           e => e.SW % 2 === 1],
  ['nwApp_gt_swApp',   e => e.nwApp > e.swApp],
  ['swApp_gt_nwApp',   e => e.swApp > e.nwApp],
  ['ctTotal_gt_10',    e => e.ctTotal > 10],
  ['ctTotal_lt_8',     e => e.ctTotal < 8],
  ['nwApp_0',          e => e.nwApp === 0],
  ['swApp_0',          e => e.swApp === 0],
  ['seed_gt_22',       e => e.seed > 22],
  ['seed_le_22',       e => e.seed <= 22],
  ['pred_gt_seed',     e => e.predicted > e.seed],
  ['pred_lt_seed',     e => e.predicted < e.seed],
  ['NW_gt_SW',         e => e.NW > e.SW],
  ['SW_gt_NW',         e => e.SW > e.NW],
  ['(NW+nwApp)_odd',   e => (e.NW+e.nwApp) % 2 === 1],
  ['(SW+swApp)_odd',   e => (e.SW+e.swApp) % 2 === 1],
  ['(seed+ct)_odd',    e => (e.seed+e.ctTotal) % 2 === 1],
  ['nwApp%2==swApp%2', e => e.nwApp%2 === e.swApp%2],
  ['nwMiss_odd',       e => e.nwMiss % 2 === 1],
  ['swMiss_odd',       e => e.swMiss % 2 === 1],
  ['(nwApp+ct)_odd',   e => (e.nwApp+e.ctTotal) % 2 === 1],
  ['(nwApp*ct)_odd',   e => (e.nwApp*e.ctTotal) % 2 === 1],
  ['ct%3==0',          e => e.ctTotal % 3 === 0],
  ['ct%3==1',          e => e.ctTotal % 3 === 1],
  ['ct%3==2',          e => e.ctTotal % 3 === 2],
  ['nwApp%3==0',       e => e.nwApp % 3 === 0],
  ['swApp%3==0',       e => e.swApp % 3 === 0],
  ['seed%3==0',        e => e.seed % 3 === 0],
  ['seed%4==0',        e => e.seed % 4 === 0],
  ['nwApp==swApp',     e => e.nwApp === e.swApp],
  ['nwApp-swApp_odd',  e => Math.abs(e.nwApp-e.swApp) % 2 === 1],
]

console.log('\n' + '═'.repeat(70))
console.log('FEATURE ANALYSIS: which feature best predicts +1 vs -1 offset?')
console.log('Format: feature | when TRUE: %+1 %0 %-1 | when FALSE: %+1 %0 %-1 | GAIN')
console.log()

// Only use the near-miss events (offset ≠ 0) to find the separator
const nearMiss = events.filter(e=>e.offset!==0)
const results = []

for (const [name, fn] of features) {
  const trueEvt  = nearMiss.filter(fn)
  const falseEvt = nearMiss.filter(e=>!fn(e))
  if (trueEvt.length < 20 || falseEvt.length < 20) continue

  const tPlus  = trueEvt.filter(e=>e.offset===+1).length / trueEvt.length
  const tMinus = trueEvt.filter(e=>e.offset===-1).length / trueEvt.length
  const fPlus  = falseEvt.filter(e=>e.offset===+1).length / falseEvt.length
  const fMinus = falseEvt.filter(e=>e.offset===-1).length / falseEvt.length

  // Gain: how much does this feature shift us from 50/50?
  const tBias = Math.abs(tPlus - 0.5)
  const fBias = Math.abs(fPlus - 0.5)
  const gain = (tBias + fBias) / 2

  results.push({ name, tPlus, tMinus, fPlus, fMinus, gain, tN:trueEvt.length, fN:falseEvt.length })
}

results.sort((a,b)=>b.gain-a.gain)
for (const r of results.slice(0,25)) {
  const pct = v => (v*100).toFixed(0).padStart(3)
  console.log(
    `  ${r.name.padEnd(20)} | TRUE(n=${r.tN}): +1=${pct(r.tPlus)}% -1=${pct(r.tMinus)}% | FALSE(n=${r.fN}): +1=${pct(r.fPlus)}% -1=${pct(r.fMinus)}% | gain=${(r.gain*100).toFixed(1)}%`
  )
}

// ── CHECK: does the EXACT formula's OWN parity match the actual? ─────────
console.log('\n' + '═'.repeat(70))
console.log('PARITY RULE: does actual number ALWAYS match parity of some formula output?')

// Key question: if formula gives 43 (odd) and actual is 44 (even),
// is there ANOTHER formula output that is 44 (even)?
// i.e., does a same-seed formula output the exact value?

let parityExplain = 0, parityTotal = 0
for (const e of plus1.concat(minus1)) {
  parityTotal++
  // Check: does another formula from same seed give the exact value?
  // Re-compute formulas for this event
  const win = draws.slice(Math.max(0,e.drawIdx-WIN), e.drawIdx)
  const colIdx = win.length-1
  const s = getStats(win, colIdx, e.seed)
  const fmls = allFormulas(e.seed, s)
  const exactFromSameSeed = fmls.some(f => f.v === e.actual)
  if (exactFromSameSeed) parityExplain++
}
console.log(`  Near-miss events where ANOTHER formula from SAME seed gives exact value: ${parityExplain}/${parityTotal} (${(parityExplain/parityTotal*100).toFixed(1)}%)`)

// ── THE KEY PARITY RULE: NW_steps parity ────────────────────────────────
console.log('\n' + '═'.repeat(70))
console.log('KEY PARITY RULE TEST: NW_steps parity determines rounding direction?')
// If NW_steps is ODD → round UP (add +1 to formula)
// If NW_steps is EVEN → round DOWN (keep formula value)
let nwParityCorrect = 0, nwParityTotal = 0
for (const e of nearMiss) {
  nwParityTotal++
  const nwParity = e.NW % 2  // 0=even, 1=odd
  // Prediction: if NW odd → actual = predicted+1, if NW even → actual = predicted-1
  const predicted_direction = nwParity === 1 ? +1 : -1
  if (predicted_direction === e.offset) nwParityCorrect++
}
console.log(`  NW_odd→+1, NW_even→-1: ${nwParityCorrect}/${nwParityTotal} = ${(nwParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: ctTotal parity
let ctParityCorrect = 0
for (const e of nearMiss) {
  const ctParity = e.ctTotal % 2
  const pred = ctParity === 1 ? +1 : -1
  if (pred === e.offset) ctParityCorrect++
}
console.log(`  ct_odd→+1, ct_even→-1: ${ctParityCorrect}/${nwParityTotal} = ${(ctParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: seed parity
let sParityCorrect = 0
for (const e of nearMiss) {
  const p = e.seed % 2
  const pred = p === 1 ? +1 : -1
  if (pred === e.offset) sParityCorrect++
}
console.log(`  seed_odd→+1, seed_even→-1: ${sParityCorrect}/${nwParityTotal} = ${(sParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: (NW+SW) parity
let nwswParityCorrect = 0
for (const e of nearMiss) {
  const p = (e.NW+e.SW) % 2
  const pred = p === 1 ? +1 : -1
  if (pred === e.offset) nwswParityCorrect++
}
console.log(`  (NW+SW)_odd→+1: ${nwswParityCorrect}/${nwParityTotal} = ${(nwswParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: nwApp parity
let nwAppParityCorrect = 0
for (const e of nearMiss) {
  const p = e.nwApp % 2
  const pred = p === 1 ? +1 : -1
  if (pred === e.offset) nwAppParityCorrect++
}
console.log(`  nwApp_odd→+1: ${nwAppParityCorrect}/${nwParityTotal} = ${(nwAppParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: (nwApp+swApp) parity
let nsParityCorrect = 0
for (const e of nearMiss) {
  const p = (e.nwApp+e.swApp) % 2
  const pred = p === 1 ? +1 : -1
  if (pred === e.offset) nsParityCorrect++
}
console.log(`  (nwApp+swApp)_odd→+1: ${nsParityCorrect}/${nwParityTotal} = ${(nsParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: (seed+nwApp) parity
let snwParityCorrect = 0
for (const e of nearMiss) {
  const p = (e.seed+e.nwApp) % 2
  const pred = p === 1 ? +1 : -1
  if (pred === e.offset) snwParityCorrect++
}
console.log(`  (seed+nwApp)_odd→+1: ${snwParityCorrect}/${nwParityTotal} = ${(snwParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: (seed+swApp) parity
let sswParityCorrect = 0
for (const e of nearMiss) {
  const p = (e.seed+e.swApp) % 2
  const pred = p === 1 ? +1 : -1
  if (pred === e.offset) sswParityCorrect++
}
console.log(`  (seed+swApp)_odd→+1: ${sswParityCorrect}/${nwParityTotal} = ${(sswParityCorrect/nwParityTotal*100).toFixed(1)}%`)

// Test: (ctTotal+seed) parity
let ctSeedParity = 0
for (const e of nearMiss) {
  const p = (e.ctTotal+e.seed) % 2
  const pred = p === 1 ? +1 : -1
  if (pred === e.offset) ctSeedParity++
}
console.log(`  (ct+seed)_odd→+1: ${ctSeedParity}/${nwParityTotal} = ${(ctSeedParity/nwParityTotal*100).toFixed(1)}%`)

// ── FLOOR vs CEIL: does rounding method change for certain formulas? ─────
console.log('\n' + '═'.repeat(70))
console.log('PER-FORMULA BIAS: does each formula consistently round UP or DOWN?')
const fmlBias = {}
for (const e of nearMiss) {
  if (!fmlBias[e.fid]) fmlBias[e.fid] = { plus:0, minus:0 }
  if (e.offset===+1) fmlBias[e.fid].plus++
  else fmlBias[e.fid].minus++
}
for (const [fid, {plus,minus}] of Object.entries(fmlBias).sort((a,b)=>(b[1].plus+b[1].minus)-(a[1].plus+a[1].minus))) {
  const total=plus+minus
  const bias=plus>minus?'→ add +1':minus>plus?'→ subtract -1':'→ no bias'
  console.log(`  ${fid.padEnd(16)}: +1=${plus}(${(plus/total*100).toFixed(0)}%) -1=${minus}(${(minus/total*100).toFixed(0)}%)  ${bias}`)
}

// ── FINAL: best combined rule ────────────────────────────────────────────
console.log('\n' + '═'.repeat(70))
console.log('BEST COMBINED RULE: use TWO tiebreaker features to pick exact value')
// Strategy: when formula gives X, check both X and X+1 and X-1
// Use the tiebreaker: which of those is pointed to by ANOTHER formula?
let tiebreakCorrect=0, tiebreakTotal=0
for (const e of nearMiss) {
  tiebreakTotal++
  const win = draws.slice(Math.max(0,e.drawIdx-WIN), e.drawIdx)
  const colIdx = win.length-1
  const s = getStats(win, colIdx, e.seed)
  const fmls = allFormulas(e.seed, s)
  
  const scoreX   = fmls.filter(f=>f.v===e.predicted).length
  const scoreXp1 = fmls.filter(f=>f.v===e.predicted+1).length
  const scoreXm1 = fmls.filter(f=>f.v===e.predicted-1).length

  // Pick the value with highest formula count
  let best = e.predicted
  if (scoreXp1 > scoreX && scoreXp1 >= scoreXm1) best = e.predicted+1
  else if (scoreXm1 > scoreX && scoreXm1 > scoreXp1) best = e.predicted-1

  if (best === e.actual) tiebreakCorrect++
}
console.log(`  Tiebreaker (pick value most formulas agree on): ${tiebreakCorrect}/${tiebreakTotal} = ${(tiebreakCorrect/tiebreakTotal*100).toFixed(1)}% correct`)
console.log(`  (vs baseline: 0% since these are all misses)`)

// ── Show for current seeds what the ±1 band looks like ──────────────────
console.log('\n' + '═'.repeat(70))
console.log('CURRENT DRAW D334 seeds=[13,23,24,27,44]: ±1 CANDIDATE BANDS')
const lastWin = draws.slice(-WIN)
const lastColIdx = lastWin.length-1
for (const seed of draws[draws.length-1].sort((a,b)=>a-b)) {
  const s = getStats(lastWin, lastColIdx, seed)
  const fmls = allFormulas(seed, s)
  // Count how many formulas point to each number in range
  const freq = {}
  for (const f of fmls) {
    for (const delta of [-1, 0, +1]) {
      const n = f.v + delta
      if (n >= 1 && n <= MAXN) {
        freq[n] = (freq[n]||0) + (delta===0 ? 2 : 1)  // exact = weight 2
      }
    }
  }
  const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,6)
  console.log(`  seed=${seed}: top ±1 candidates: ${sorted.map(([n,w])=>`${n}(w=${w})`).join(' | ')}`)
}
