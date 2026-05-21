/**
 * Verify: seeds=[26,30,32,33,41] → next=[13,23,24,27,44]
 * Run ALL formulas, show which ones HIT, and find the pattern
 */
import { readFileSync } from 'fs'
const draws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
const WIN = 100, MAXN = 45

// Find the draw index where seeds=[26,30,32,33,41]
let targetIdx = -1
for (let i = 0; i < draws.length - 1; i++) {
  const d = [...draws[i]].sort((a,b)=>a-b).join(',')
  if (d === '26,30,32,33,41') { targetIdx = i; break }
}
if (targetIdx === -1) {
  // Try to find by next draw
  for (let i = 0; i < draws.length - 1; i++) {
    const next = [...draws[i+1]].sort((a,b)=>a-b).join(',')
    if (next === '13,23,24,27,44') { targetIdx = i; break }
  }
}

if (targetIdx === -1) {
  console.log('Draw not found in history — using provided values directly as a one-off calc')
  // Use draw index = draws.length (simulate as if it's right after the last recorded draw)
  targetIdx = draws.length - 1
}

console.log(`\nFound at draw index: ${targetIdx}`)
console.log(`Seeds draw: ${draws[targetIdx]?.sort((a,b)=>a-b).join(', ')}`)
const nextDraw = draws[targetIdx + 1]
const nextSet = new Set(nextDraw || [13,23,24,27,44])
console.log(`Next draw:  ${[...nextSet].sort((a,b)=>a-b).join(', ')}`)

const win = draws.slice(Math.max(0, targetIdx + 1 - WIN), targetIdx + 1)
const colIdx = win.length - 1
const drawSets = win.map(d => new Set(d))
const seeds = draws[targetIdx]

console.log(`\nWindow: last ${win.length} draws, colIdx=${colIdx}`)
console.log('═'.repeat(70))

const allHits = {}  // formula name → hits count

for (const seed of [...seeds].sort((a,b)=>a-b)) {
  const rowIdx = seed - 1
  let nwSteps=0, nwApp=0, swSteps=0, swApp=0
  let neApp=0, seApp=0

  for (const [dir, dc, dr] of [['NW',-1,-1],['NE',1,-1],['SW',-1,1],['SE',1,1]]) {
    let step = 1
    while (true) {
      const ci = colIdx + dc * step
      const ri = rowIdx + dr * step
      if (ci<0||ci>=win.length||ri<0||ri>=MAXN) break
      const n = ri+1, hit = drawSets[ci]?.has(n)||false
      if (dir==='NW'){nwSteps++;if(hit)nwApp++}
      if (dir==='SW'){swSteps++;if(hit)swApp++}
      if (dir==='NE'&&hit) neApp++
      if (dir==='SE'&&hit) seApp++
      const adjRi=dr<0?ri-1:ri+1
      if (adjRi>=0&&adjRi<MAXN){
        const adjN=adjRi+1, adjHit=drawSets[ci]?.has(adjN)||false
        if (dir==='NW'){nwSteps++;if(adjHit)nwApp++}
        if (dir==='SW'){swSteps++;if(adjHit)swApp++}
        if (dir==='NE'&&adjHit) neApp++
        if (dir==='SE'&&adjHit) seApp++
      }
      step++
    }
  }
  const ctTotal = nwApp+swApp+neApp+seApp
  const nwMiss = nwSteps-nwApp, swMiss = swSteps-swApp

  console.log(`\nSeed ${String(seed).padStart(2)}  NW=${nwSteps} nwApp=${nwApp} nwMiss=${nwMiss}  SW=${swSteps} swApp=${swApp} swMiss=${swMiss}  ctTotal=${ctTotal}`)

  const fmls = [
    // GROUP A — step-based
    ['A', 'NW−ctTotal',   nwSteps-ctTotal,   12.75],
    ['A', 'SW−ctTotal',   swSteps-ctTotal,   12.70],
    ['A', 'NW−seed',      nwSteps-seed,      13.09],
    ['A', 'SW%seed',      swSteps>0?swSteps%seed:-1, 12.72],
    // GROUP B — miss-based (STRONGEST)
    ['B', 'S−NW_miss',   seed-nwMiss,       14.89],
    ['B', 'S+NW_miss',   seed+nwMiss,       null],
    ['B', 'S−SW_miss',   seed-swMiss,       12.75],
    ['B', 'S+SW_miss',   seed+swMiss,       null],
    // GROUP C — appeared count
    ['C', 'S−swApp',     seed-swApp,        12.57],
    ['C', 'S+nwApp',     seed+nwApp,        11.79],
    ['C', 'S−nwApp',     seed-nwApp,        11.80],
    ['C', 'S+swApp',     seed+swApp,        10.84],
    ['C', 'S−ctTotal',   seed-ctTotal,      null],
    ['C', 'S+ctTotal',   seed+ctTotal,      null],
    // GROUP D — ratio
    ['D', 'NW×nwA/ct',  ctTotal>0?Math.round(nwSteps*nwApp/ctTotal):-1, 12.61],
    // EXTRA: interesting combos from brute-force
    ['X', 'S+SW',        seed+swSteps,      14.17],
    ['X', 'S−NW',        seed-nwSteps,      13.53],
    ['X', 'SW−NW_app',   swSteps-nwApp,     12.01],
    ['X', 'ci−NW+seed',  colIdx-nwSteps+seed, 12.54],
    ['X', 'NW+NW_app−SW_app', nwSteps+nwApp-swApp, 12.45],
  ]

  for (const [grp, name, val, rate] of fmls) {
    const inRange = val >= 1 && val <= MAXN
    const hit = inRange && nextSet.has(val)
    if (!allHits[name]) allHits[name] = { hits:0, inRange:0, grp }
    if (inRange) allHits[name].inRange++
    if (hit) allHits[name].hits++
    const marker = hit ? ` ✅ HIT → ${val}` : (inRange ? '' : ' (OOR)')
    if (hit || inRange)
      console.log(`  [${grp}] ${name.padEnd(20)} = ${String(val).padStart(3)}${marker}`)
  }
}

// Summary of which formulas scored hits in this specific draw
console.log('\n' + '═'.repeat(70))
console.log('FORMULA HIT SUMMARY for this draw:')
const hitters = Object.entries(allHits)
  .filter(([,v]) => v.hits > 0)
  .sort((a,b) => b[1].hits - a[1].hits)
for (const [name, {hits, inRange, grp}] of hitters) {
  console.log(`  [${grp}] ${name.padEnd(20)} ${hits}/${inRange} in-range predictions were hits`)
}

// Which next numbers were NOT predicted by any formula?
console.log('\nNext draw numbers and which formulas predicted them:')
for (const n of [...nextSet].sort((a,b)=>a-b)) {
  console.log(`  ${n}: (check manually in table above)`)
}

// Final: compute confluence for these seeds
console.log('\n' + '═'.repeat(70))
console.log('CONFLUENCE: numbers predicted by multiple formulas/seeds')
const conf = {}
for (const seed of [...seeds].sort((a,b)=>a-b)) {
  const rowIdx = seed-1
  let nwSteps=0,nwApp=0,swSteps=0,swApp=0,neApp=0,seApp=0
  for (const [dir,dc,dr] of [['NW',-1,-1],['NE',1,-1],['SW',-1,1],['SE',1,1]]) {
    let step=1
    while(true){
      const ci=colIdx+dc*step, ri=rowIdx+dr*step
      if(ci<0||ci>=win.length||ri<0||ri>=MAXN) break
      const n=ri+1,hit=drawSets[ci]?.has(n)||false
      if(dir==='NW'){nwSteps++;if(hit)nwApp++}
      if(dir==='SW'){swSteps++;if(hit)swApp++}
      if(dir==='NE'&&hit)neApp++
      if(dir==='SE'&&hit)seApp++
      const adjRi=dr<0?ri-1:ri+1
      if(adjRi>=0&&adjRi<MAXN){const adjN=adjRi+1,adjHit=drawSets[ci]?.has(adjN)||false
        if(dir==='NW'){nwSteps++;if(adjHit)nwApp++}
        if(dir==='SW'){swSteps++;if(adjHit)swApp++}
        if(dir==='NE'&&adjHit)neApp++
        if(dir==='SE'&&adjHit)seApp++}
      step++
    }
  }
  const ctTotal=nwApp+swApp+neApp+seApp,nwMiss=nwSteps-nwApp,swMiss=swSteps-swApp
  const candidates = [
    nwSteps-ctTotal, swSteps-ctTotal, nwSteps-seed, swSteps>0?swSteps%seed:-1,
    seed-nwMiss, seed-swMiss, seed-swApp, seed+nwApp, seed-nwApp,
    ctTotal>0?Math.round(nwSteps*nwApp/ctTotal):-1,
    seed+swSteps, seed-nwSteps
  ].filter(v=>v>=1&&v<=MAXN)

  for (const n of candidates) {
    if (!conf[n]) conf[n] = { seeds:new Set(), count:0, hit: nextSet.has(n) }
    conf[n].seeds.add(seed)
    conf[n].count++
  }
}
const sorted = Object.entries(conf)
  .sort((a,b) => b[1].seeds.size-a[1].seeds.size || b[1].count-a[1].count)
  .slice(0,20)
for (const [n, {seeds:ss, count, hit}] of sorted) {
  const seedArr=[...ss].sort((a,b)=>a-b)
  console.log(`  n=${String(n).padStart(2)}  seeds=[${seedArr}]  count=${count}  ${hit?'✅HIT':'   '}`)
}
