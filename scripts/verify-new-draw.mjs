/**
 * User's NEW draw data:
 *   Seeds (last draw): [26, 30, 32, 33, 41]
 *   Next draw (actual): [13, 23, 24, 27, 44]
 * 
 * We simulate: append [26,30,32,33,41] to history, compute laser values, check against [13,23,24,27,44]
 */
import { readFileSync } from 'fs'
const draws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
const WIN = 100, MAXN = 45

// The "seeds" draw is NEW — treat as if appended to history
// So the window is draws[-99..] + [26,30,32,33,41]
const seeds = [26, 30, 32, 33, 41]
const nextDraw = new Set([13, 23, 24, 27, 44])

// Build window: last 99 recorded draws + seeds draw = 100 draws
const win = [...draws.slice(-99), seeds]
const colIdx = win.length - 1  // = 99
const drawSets = win.map(d => new Set(d))

console.log(`Seeds: [${seeds.join(', ')}]`)
console.log(`Next:  [${[...nextDraw].sort((a,b)=>a-b).join(', ')}]`)
console.log(`Window length: ${win.length}, colIdx: ${colIdx}`)
console.log('═'.repeat(70))

// Compute all values per seed
const allResults = []
for (const seed of seeds) {
  const rowIdx = seed - 1
  let nwSteps=0, nwApp=0, swSteps=0, swApp=0, neApp=0, seApp=0

  for (const [dir, dc, dr] of [['NW',-1,-1],['NE',1,-1],['SW',-1,1],['SE',1,1]]) {
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

  // Key insight: NW_steps = 2*(seed-1) always (grid geometry)
  const theoretical_NW = 2*(seed-1)
  
  console.log(`\nSeed ${seed}  [row=${rowIdx}]`)
  console.log(`  NW_steps=${nwSteps} (theory:${theoretical_NW}) nwApp=${nwApp} nwMiss=${nwMiss}`)
  console.log(`  SW_steps=${swSteps}  swApp=${swApp} swMiss=${swMiss}`)
  console.log(`  neApp=${neApp}  seApp=${seApp}  ctTotal=${ctTotal}`)

  const fmls = [
    // GROUP A — geometry-corrected
    { g:'A', n:'NW−ctTotal',    v: nwSteps-ctTotal,   r:12.75 },
    { g:'A', n:'SW−ctTotal',    v: swSteps-ctTotal,   r:12.70 },
    { g:'A', n:'NW−seed',       v: nwSteps-seed,      r:13.09 },
    { g:'A', n:'SW%seed',       v: swSteps>0?swSteps%seed:-1,  r:12.72 },
    // GROUP B — miss-based (strongest)
    { g:'B', n:'S−NW_miss',     v: seed-nwMiss,       r:14.89 },
    { g:'B', n:'S+NW_miss',     v: seed+nwMiss,       r:null  },
    { g:'B', n:'S−SW_miss',     v: seed-swMiss,       r:12.75 },
    { g:'B', n:'S+SW_miss',     v: seed+swMiss,       r:null  },
    // GROUP C — appeared-count
    { g:'C', n:'S−swApp',       v: seed-swApp,        r:12.57 },
    { g:'C', n:'S+nwApp',       v: seed+nwApp,        r:11.79 },
    { g:'C', n:'S−nwApp',       v: seed-nwApp,        r:11.80 },
    { g:'C', n:'S+swApp',       v: seed+swApp,        r:10.84 },
    { g:'C', n:'S−ctTotal',     v: seed-ctTotal,      r:null  },
    { g:'C', n:'S+ctTotal',     v: seed+ctTotal,      r:null  },
    // GROUP D — ratio
    { g:'D', n:'NW×nwA/ct',     v: ctTotal>0?Math.round(nwSteps*nwApp/ctTotal):-1, r:12.61 },
    // GROUP X — extra strong from brute-force
    { g:'X', n:'S+SW',          v: seed+swSteps,      r:14.17 },
    { g:'X', n:'S−NW',          v: seed-nwSteps,      r:13.53 },
    { g:'X', n:'NW+nwA−swA',    v: nwSteps+nwApp-swApp, r:12.45 },
    { g:'X', n:'SW−nwApp',      v: swSteps-nwApp,     r:12.01 },
  ]

  for (const f of fmls) {
    const inRange = f.v>=1&&f.v<=MAXN
    const hit = inRange && nextDraw.has(f.v)
    const rStr = f.r ? `[${f.r}%]` : ''
    if (hit) console.log(`  ✅[${f.g}] ${f.n.padEnd(15)} = ${f.v}  HIT!  ${rStr}`)
    else if (inRange) console.log(`  ○ [${f.g}] ${f.n.padEnd(15)} = ${f.v}  ${rStr}`)
  }

  allResults.push({ seed, nwSteps, nwApp, nwMiss, swSteps, swApp, swMiss, neApp, seApp, ctTotal, fmls })
}

// Confluence
console.log('\n' + '═'.repeat(70))
console.log('CONFLUENCE TABLE — all candidates ranked by seed+formula agreement:')
const conf = {}
for (const { seed, fmls } of allResults) {
  for (const f of fmls) {
    if (f.v<1||f.v>MAXN) continue
    if (!conf[f.v]) conf[f.v] = { seeds:new Set(), formulas:[], groups:new Set(), hit:nextDraw.has(f.v) }
    conf[f.v].seeds.add(seed)
    conf[f.v].formulas.push(`${seed}:${f.n}`)
    conf[f.v].groups.add(f.g)
  }
}
const ranked = Object.entries(conf)
  .sort((a,b) => {
    const [,av]=a, [,bv]=b
    return bv.groups.size-av.groups.size||bv.seeds.size-av.seeds.size||bv.formulas.length-av.formulas.length
  })

console.log('\nRank  N    Hit?  Groups  Seeds  Formulas')
for (const [n, {seeds:ss, formulas:fs, groups:gs, hit}] of ranked.slice(0,25)) {
  const seedStr=[...ss].sort((a,b)=>a-b).join(',')
  const grpStr=[...gs].sort().join('')
  console.log(`      ${String(n).padStart(2)}    ${hit?'✅HIT':'     '}  [${grpStr}]  [${seedStr}]  (${fs.length} formulas)`)
}

// Which next numbers were predicted and by what?
console.log('\n' + '═'.repeat(70))
console.log('WHICH NEXT NUMBERS WERE PREDICTED (and by what)?')
for (const n of [...nextDraw].sort((a,b)=>a-b)) {
  const c = conf[n]
  if (!c) {
    console.log(`  ${n}: ❌ NOT predicted by any formula`)
  } else {
    console.log(`  ${n}: ✅ seeds=[${[...c.seeds].sort((a,b)=>a-b).join(',')}] groups=[${[...c.groups].sort().join('')}]`)
    for (const f of c.formulas) console.log(`       ${f}`)
  }
}

// Pattern analysis: what's consistent across all 5 hits?
console.log('\n' + '═'.repeat(70))
console.log('PATTERN: checking each formula for hits specifically on this draw:')
const formulaHits = {}
for (const { seed, fmls } of allResults) {
  for (const f of fmls) {
    if (!formulaHits[f.n]) formulaHits[f.n] = { hits:0, total:0 }
    if (f.v>=1&&f.v<=MAXN) {
      formulaHits[f.n].total++
      if (nextDraw.has(f.v)) formulaHits[f.n].hits++
    }
  }
}
const formulaRanked = Object.entries(formulaHits)
  .filter(([,v])=>v.hits>0)
  .sort((a,b)=>b[1].hits-a[1].hits||a[1].total-b[1].total)
for (const [name, {hits,total}] of formulaRanked) {
  console.log(`  ${name.padEnd(16)}: ${hits}/${total} in-range predictions were HITS`)
}

// Deep: which specific value each formula produced
console.log('\nFormulas that produced MISSED next numbers (13,24,27,44):')
const missed = [13,24,27,44]
for (const m of missed) {
  const c = conf[m]
  if (c) {
    console.log(`  ${m}: predicted by ${c.formulas.join(', ')}`)
  } else {
    // Check if any formula almost hit
    console.log(`  ${m}: NOT predicted — nearest predictions:`)
    const near = Object.entries(conf)
      .filter(([n])=>Math.abs(n-m)<=2)
      .map(([n,v])=>`n=${n}(${[...v.seeds]})`)
    console.log(`       near: ${near.join(' | ')}`)
  }
}
