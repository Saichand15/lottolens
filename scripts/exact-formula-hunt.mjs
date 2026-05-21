/**
 * DEEPEST REVERSE ENGINEERING
 * Goal: Find the EXACT consistent formula the system uses
 * 
 * Approach:
 * 1. For every draw D, compute ALL formulas for all seeds
 * 2. For each next-draw number that was HIT, record which formula(s) predicted it
 * 3. Find: is there ONE formula that ALWAYS works? Or does it rotate?
 * 4. Check: does the same seed always use the same formula?
 * 5. Check: is there a CHAIN — does formula output become next seed?
 * 6. Check: are there hidden modular / cyclic patterns?
 */
import { readFileSync } from 'fs'

const draws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
const WIN = 100, MAXN = 45

// ── Core beam stats extractor ────────────────────────────────────────────
function getStats(win, colIdx, seed) {
  const drawSets = win.map(d => new Set(d))
  const rowIdx = seed - 1
  let nwSteps=0, nwApp=0, swSteps=0, swApp=0, neApp=0, seApp=0

  for (const [dir,dc,dr] of [['NW',-1,-1],['NE',1,-1],['SW',-1,1],['SE',1,1]]) {
    let step = 1
    while (true) {
      const ci = colIdx + dc * step
      const ri = rowIdx + dr * step
      if (ci<0||ci>=win.length||ri<0||ri>=MAXN) break
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
  const nwMiss=nwSteps-nwApp, swMiss=swSteps-swApp
  return { nwSteps, nwApp, nwMiss, swSteps, swApp, swMiss, neApp, seApp, ctTotal }
}

function getFormulas(seed, s) {
  const {nwSteps:NW,nwApp,nwMiss,swSteps:SW,swApp,swMiss,ctTotal} = s
  return [
    { id:'NW-seed',     v: NW-seed },
    { id:'NW-ct',       v: NW-ctTotal },
    { id:'SW-ct',       v: SW-ctTotal },
    { id:'SW%seed',     v: SW>0?SW%seed:-1 },
    { id:'S-nwMiss',    v: seed-nwMiss },
    { id:'S+nwMiss',    v: seed+nwMiss },
    { id:'S-swMiss',    v: seed-swMiss },
    { id:'S+swMiss',    v: seed+swMiss },
    { id:'S-ct',        v: seed-ctTotal },
    { id:'S+ct',        v: seed+ctTotal },
    { id:'S-swApp',     v: seed-swApp },
    { id:'S+swApp',     v: seed+swApp },
    { id:'S-nwApp',     v: seed-nwApp },
    { id:'S+nwApp',     v: seed+nwApp },
    { id:'NW*nwA/ct',   v: ctTotal>0?Math.round(NW*nwApp/ctTotal):-1 },
    { id:'S+SW',        v: seed+SW },
    { id:'S-NW',        v: seed-NW },
    { id:'NW+nwA-swA',  v: NW+nwApp-swApp },
    { id:'SW-nwApp',    v: SW-nwApp },
    { id:'NW%ct',       v: ctTotal>0?NW%ctTotal:-1 },
    { id:'SW%ct',       v: ctTotal>0?SW%ctTotal:-1 },
    { id:'S*2-NW',      v: seed*2-NW },
    { id:'S*2-SW',      v: seed*2-SW },
    { id:'(NW+SW)/2',   v: Math.round((NW+SW)/2) },
    { id:'NW-swApp',    v: NW-swApp },
    { id:'SW-nwMiss',   v: SW-nwMiss },
    { id:'NW+swApp-ct', v: NW+swApp-ctTotal },
    { id:'ct^2',        v: ctTotal*ctTotal },
    { id:'nwA*ct',      v: nwApp*ctTotal },
    { id:'nwA+swA',     v: nwApp+swApp },
    { id:'S-(nwA+swA)', v: seed-(nwApp+swApp) },
    { id:'S+(nwA+swA)', v: seed+(nwApp+swApp) },
  ].filter(f => f.v>=1 && f.v<=MAXN)
}

// ── Analysis 1: For each next-draw hit, which formula predicted it? ──────
console.log('Analyzing 300 draws for exact formula-to-hit mapping...\n')

const formulaHitMap = {} // formulaId → { hitDraws: [{drawIdx, seed, val}], total }
const drawHitLog = []    // per-draw: which formulas hit which numbers

for (let di = 1; di < draws.length; di++) {
  const win = draws.slice(Math.max(0, di - WIN), di)
  const colIdx = win.length - 1
  const seeds = draws[di-1]
  const nextSet = new Set(draws[di])
  const drawHits = []

  for (const seed of seeds) {
    const s = getStats(win, colIdx, seed)
    const fmls = getFormulas(seed, s)
    for (const f of fmls) {
      if (!formulaHitMap[f.id]) formulaHitMap[f.id] = { hits:0, total:0 }
      formulaHitMap[f.id].total++
      if (nextSet.has(f.v)) {
        formulaHitMap[f.id].hits++
        drawHits.push({ seed, formulaId: f.id, val: f.v, ...s })
      }
    }
  }
  drawHitLog.push({ drawIdx: di, seeds, next: [...nextSet], hits: drawHits })
}

// ── Analysis 2: Is there ONE formula that hits in EVERY draw? ────────────
console.log('═'.repeat(70))
console.log('FORMULA CONSISTENCY — how many draws does each formula hit in?')
const formulaDrawCoverage = {}
for (const { drawIdx, hits } of drawHitLog) {
  const seenFormulas = new Set(hits.map(h => h.formulaId))
  for (const fid of seenFormulas) {
    if (!formulaDrawCoverage[fid]) formulaDrawCoverage[fid] = 0
    formulaDrawCoverage[fid]++
  }
}
const totalDraws = drawHitLog.length
const ranked = Object.entries(formulaDrawCoverage)
  .sort((a,b)=>b[1]-a[1])
  .slice(0,20)
console.log(`Total draws analyzed: ${totalDraws}`)
for (const [fid, drawCount] of ranked) {
  const fh = formulaHitMap[fid]
  console.log(`  ${fid.padEnd(16)}: hits in ${drawCount}/${totalDraws} draws (${(drawCount/totalDraws*100).toFixed(1)}%)  total hits: ${fh.hits}/${fh.total} = ${(fh.hits/fh.total*100).toFixed(1)}%`)
}

// ── Analysis 3: Per-draw, how many of the 5 next numbers are covered? ───
console.log('\n' + '═'.repeat(70))
console.log('PER-DRAW COVERAGE — how many of 5 next numbers are predicted by ANY formula?')
const coverageDist = {}
for (const { next, hits } of drawHitLog) {
  const predictedSet = new Set(hits.map(h => h.val))
  const covered = next.filter(n => predictedSet.has(n)).length
  coverageDist[covered] = (coverageDist[covered]||0) + 1
}
for (let k=0; k<=5; k++) {
  const cnt = coverageDist[k]||0
  const bar = '█'.repeat(Math.round(cnt/2))
  console.log(`  ${k}/5 numbers predicted: ${cnt} draws (${(cnt/totalDraws*100).toFixed(1)}%) ${bar}`)
}

// ── Analysis 4: Chain analysis — does output become seed? ────────────────
console.log('\n' + '═'.repeat(70))
console.log('CHAIN ANALYSIS: formula output → becomes seed next draw → formula hits again?')
let chainHits = 0, chainTotal = 0
for (let i = 0; i < drawHitLog.length - 1; i++) {
  const { drawIdx, hits } = drawHitLog[i]
  for (const h of hits) {
    // h.val appeared in next draw, and is now a SEED in that next draw
    const nextDrawLog = drawHitLog[i+1]
    if (nextDrawLog && nextDrawLog.seeds.includes(h.val)) {
      chainTotal++
      // Does h.val as seed also produce a hit in ITS next draw?
      const chainHit = nextDrawLog.hits.some(h2 => h2.seed === h.val)
      if (chainHit) chainHits++
    }
  }
}
console.log(`  Chains found: ${chainTotal} (predicted value became a seed)`)
console.log(`  Of those, chain seed ALSO hit: ${chainHits}/${chainTotal} = ${chainTotal>0?(chainHits/chainTotal*100).toFixed(1):'N/A'}%`)
console.log(`  vs random: 11.1%`)

// ── Analysis 5: Is there a formula that hits ALL 5 in some draws? ────────
console.log('\n' + '═'.repeat(70))
console.log('PERFECT DRAWS — draws where a single formula predicted 3+ next numbers:')
let perfectCount = 0
for (const { drawIdx, seeds, next, hits } of drawHitLog) {
  const byFormula = {}
  for (const h of hits) {
    if (!byFormula[h.formulaId]) byFormula[h.formulaId] = new Set()
    byFormula[h.formulaId].add(h.val)
  }
  for (const [fid, vals] of Object.entries(byFormula)) {
    if (vals.size >= 3) {
      console.log(`  D${drawIdx}: formula ${fid} predicted ${[...vals].sort((a,b)=>a-b).join(',')} from ${next.sort((a,b)=>a-b).join(',')}`)
      perfectCount++
    }
  }
}
if (perfectCount === 0) console.log('  None found (no single formula predicts 3+ in one draw)')

// ── Analysis 6: SEED-FORMULA AFFINITY — does each seed "prefer" a formula?
console.log('\n' + '═'.repeat(70))
console.log('SEED-FORMULA AFFINITY — for each seed value, which formula hits most often?')
const seedFormula = {} // seed → { formulaId → hitCount }
for (const { hits } of drawHitLog) {
  for (const h of hits) {
    if (!seedFormula[h.seed]) seedFormula[h.seed] = {}
    seedFormula[h.seed][h.formulaId] = (seedFormula[h.seed][h.formulaId]||0) + 1
  }
}
// Show top formula per seed for seeds 1-45
console.log('Seed → best formula (by historical hits)')
for (let s = 1; s <= MAXN; s++) {
  const fmap = seedFormula[s]
  if (!fmap) continue
  const best = Object.entries(fmap).sort((a,b)=>b[1]-a[1])[0]
  const total = Object.values(fmap).reduce((a,b)=>a+b,0)
  console.log(`  ${String(s).padStart(2)}: ${best[0].padEnd(16)} hits=${best[1]}/${total}`)
}

// ── Analysis 7: ctTotal value → which formula works? ────────────────────
console.log('\n' + '═'.repeat(70))
console.log('ctTotal VALUE → which formula hits? (does hot neighborhood prefer certain formula?)')
const ctFormulaHits = {} // ctTotal → { formulaId → hits }
for (const { hits } of drawHitLog) {
  for (const h of hits) {
    const ct = h.ctTotal
    if (!ctFormulaHits[ct]) ctFormulaHits[ct] = {}
    ctFormulaHits[ct][h.formulaId] = (ctFormulaHits[ct][h.formulaId]||0) + 1
  }
}
for (const ct of [4,5,6,7,8,9,10,11,12,13,14,15]) {
  const fmap = ctFormulaHits[ct]
  if (!fmap) continue
  const best = Object.entries(fmap).sort((a,b)=>b[1]-a[1]).slice(0,3)
  console.log(`  ct=${String(ct).padStart(2)}: ${best.map(([f,n])=>`${f}(${n})`).join(' | ')}`)
}

// ── Analysis 8: What % of next-draw numbers are predicted by SOME formula? 
console.log('\n' + '═'.repeat(70))
console.log('PREDICTABILITY: what fraction of all next-draw numbers are predicted by at least one formula?')
let totalNextNums = 0, predictedNums = 0
for (const { next, hits } of drawHitLog) {
  const predictedSet = new Set(hits.map(h => h.val))
  totalNextNums += next.length
  predictedNums += next.filter(n => predictedSet.has(n)).length
}
console.log(`  ${predictedNums}/${totalNextNums} next numbers predicted (${(predictedNums/totalNextNums*100).toFixed(1)}%)`)
console.log(`  Random: 5 formulas × 5 seeds × 11.1% = ${(1-(1-0.111)**25*100).toFixed(1)}% coverage`)

// ── Analysis 9: THE KEY — find minimum formula set that covers most draws ─
console.log('\n' + '═'.repeat(70))
console.log('MINIMUM FORMULA SET — which 5 formulas together cover the most draws?')
// Greedy coverage: pick formula that covers most uncovered draws, repeat
const drawCoveredBy = drawHitLog.map(({ hits }) => new Set(hits.map(h => h.formulaId)))
const allFormulaIds = [...new Set(drawHitLog.flatMap(({ hits }) => hits.map(h => h.formulaId)))]

let remaining = new Set(drawHitLog.map((_, i) => i))
const chosen = []
for (let round = 0; round < 8; round++) {
  let bestF = null, bestCount = 0
  for (const fid of allFormulaIds) {
    if (chosen.includes(fid)) continue
    const count = [...remaining].filter(i => drawCoveredBy[i].has(fid)).length
    if (count > bestCount) { bestCount = count; bestF = fid }
  }
  if (!bestF) break
  const covered = [...remaining].filter(i => drawCoveredBy[i].has(bestF))
  for (const i of covered) remaining.delete(i)
  chosen.push(bestF)
  console.log(`  Pick ${round+1}: ${bestF.padEnd(16)} covers ${bestCount} more draws → ${totalDraws - remaining.size}/${totalDraws} total (${((totalDraws-remaining.size)/totalDraws*100).toFixed(1)}%)`)
}
console.log(`  Still uncovered: ${remaining.size} draws`)
if (remaining.size <= 20) {
  for (const i of remaining) {
    console.log(`    D${drawHitLog[i].drawIdx}: seeds=${drawHitLog[i].seeds.sort((a,b)=>a-b).join(',')} next=${drawHitLog[i].next.sort((a,b)=>a-b).join(',')}`)
  }
}

// ── Analysis 10: TIME PATTERN — does formula rotate by draw number? ──────
console.log('\n' + '═'.repeat(70))
console.log('TIME PATTERN — does the dominant formula change by draw number mod N?')
for (const mod of [2, 3, 4, 5]) {
  console.log(`  mod ${mod}:`)
  for (let r = 0; r < mod; r++) {
    const subset = drawHitLog.filter(({ drawIdx }) => drawIdx % mod === r)
    const fcount = {}
    for (const { hits } of subset) {
      for (const h of hits) fcount[h.formulaId] = (fcount[h.formulaId]||0) + 1
    }
    const top = Object.entries(fcount).sort((a,b)=>b[1]-a[1]).slice(0,3)
    console.log(`    r=${r}: ${top.map(([f,n])=>`${f}(${n})`).join(' | ')}`)
  }
}
