import { readFileSync } from 'fs'
const draws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
const WIN = 100, MAXN = 45
const win = draws.slice(-WIN)
const lastDraw = draws[draws.length-1]
const colIdx = win.length-1
const drawSets = win.map(d=>new Set(d))

console.log('Last draw:', lastDraw.join(', '))
console.log()

for(const seed of lastDraw){
  const rowIdx=seed-1
  let NW=0,NW_app=0,SW=0,SW_app=0,NE=0,NE_app=0,SE=0,SE_app=0
  for(const [dir,dc,dr] of [['NW',-1,-1],['NE',1,-1],['SW',-1,1],['SE',1,1]]){
    let step=1
    while(true){
      const ci=colIdx+dc*step, ri=rowIdx+dr*step
      if(ci<0||ci>=win.length||ri<0||ri>=MAXN) break
      const n=ri+1
      if(dir==='NW'){NW++;if(drawSets[ci]?.has(n))NW_app++}
      if(dir==='SW'){SW++;if(drawSets[ci]?.has(n))SW_app++}
      if(dir==='NE'){NE++;if(drawSets[ci]?.has(n))NE_app++}
      if(dir==='SE'){SE++;if(drawSets[ci]?.has(n))SE_app++}
      const adjRi=dr<0?ri-1:ri+1
      if(adjRi>=0&&adjRi<MAXN){
        const adjN=adjRi+1
        if(dir==='NW'){NW++;if(drawSets[ci]?.has(adjN))NW_app++}
        if(dir==='SW'){SW++;if(drawSets[ci]?.has(adjN))SW_app++}
        if(dir==='NE'){NE++;if(drawSets[ci]?.has(adjN))NE_app++}
        if(dir==='SE'){SE++;if(drawSets[ci]?.has(adjN))SE_app++}
      }
      step++
    }
  }
  const ctTotal=NW_app+SW_app+NE_app+SE_app
  const NW_miss=NW-NW_app, SW_miss=SW-SW_app

  console.log(`seed=${seed}  NW=${NW} NW_app=${NW_app} NW_miss=${NW_miss}  SW=${SW} SW_app=${SW_app} SW_miss=${SW_miss}  ctTotal=${ctTotal}`)
  const fmls = [
    ['seed-NW_miss',   seed-NW_miss,   14.89],
    ['seed+NW_miss',   seed+NW_miss,   null],
    ['NW%seed',        NW%seed,        13.02],
    ['NW*NW_app/ct',   ctTotal>0?Math.round(NW*NW_app/ctTotal):-1, 12.61],
    ['NW-ctTotal',     NW-ctTotal,     12.75],
    ['NW-seed',        NW-seed,        13.09],
    ['seed-SW_app',    seed-SW_app,    12.57],
    ['seed+NW_app',    seed+NW_app,    11.79],
    ['seed-NW_app',    seed-NW_app,    11.80],
    ['seed-ctTotal',   seed-ctTotal,   null],
    ['seed+ctTotal',   seed+ctTotal,   null],
    ['SW-ctTotal',     SW-ctTotal,     12.70],
    ['SW%seed',        SW%seed,        12.72],
    ['SW-seed',        SW-seed,        null],
    ['seed-SW_miss',   seed-SW_miss,   12.75],
    ['seed+SW_miss',   seed+SW_miss,   null],
  ]
  for(const [name,val,rate] of fmls){
    const inRange=val>=1&&val<=MAXN
    const rateStr=rate?`[${rate}%]`:''
    if(inRange) console.log(`  ✓ ${name.padEnd(18)}= ${val}  ${rateStr}`)
    else        console.log(`  ✗ ${name.padEnd(18)}= ${val}  (OOR)`)
  }
  console.log()
}
