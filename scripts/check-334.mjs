import { readFileSync } from 'fs'
const draws = JSON.parse(readFileSync('public/all_draws.json','utf8'))
const MAX = 45
const BP_DIRS = { NW:{dc:-1,dr:-1}, NE:{dc:+1,dr:-1}, SW:{dc:-1,dr:+1}, SE:{dc:+1,dr:+1} }

function getBeam(slice, ci, seed) {
  const path=new Set(), corner=new Set(), byDir={}
  for (const [dir,{dc,dr}] of Object.entries(BP_DIRS)) {
    const p=[],c=[]
    for (let s=1;s<=slice.length;s++) {
      const c2=ci+dc*s, n=seed+dr*s
      if(c2<0||c2>=slice.length||n<1||n>MAX) break
      if(slice[c2].includes(n)){p.push(n);path.add(n)}
      if(n-1>=1&&slice[c2].includes(n-1)){c.push(n-1);corner.add(n-1)}
      if(n+1<=MAX&&slice[c2].includes(n+1)){c.push(n+1);corner.add(n+1)}
    }
    byDir[dir]={path:[...new Set(p)],corner:[...new Set(c)]}
  }
  return {path:[...path],corner:[...corner],byDir}
}

const thisDraw=[15,23,26,32,45]
const actual=[10,17,26,28,45]
const slice=draws.slice(-100), ci=slice.length-1

console.log('=== SEED: [15,23,26,32,45] → ACTUAL NEXT: [10,17,26,28,45] ===\n')

const allPath=new Set(), allCorner=new Set()
thisDraw.forEach(seed => {
  const b=getBeam(slice,ci,seed)
  console.log('Seed '+seed+':')
  for(const [dir,{path,corner}] of Object.entries(b.byDir)) {
    if(path.length||corner.length) console.log('   '+dir+' path='+JSON.stringify(path)+' corner='+JSON.stringify(corner))
  }
  b.path.forEach(n=>allPath.add(n))
  b.corner.forEach(n=>allCorner.add(n))
})

console.log('\nAll beam PATH  : '+[...allPath].sort((a,b)=>a-b).join(', '))
console.log('All beam CORNER: '+[...allCorner].sort((a,b)=>a-b).join(', '))
console.log()

// Check each actual number
actual.forEach(n => {
  const inPath=allPath.has(n), inCorner=allCorner.has(n)
  const p1=allPath.has(n-1), p2=allPath.has(n+1)
  const c1=allCorner.has(n-1), c2x=allCorner.has(n+1)
  let tag = inPath ? '✅ IS PATH' : inCorner ? '✅ IS CORNER' : (p1||p2) ? '🟡 PATH±1' : (c1||c2x) ? '🟡 CORNER±1' : '❌ NOT IN BEAM'
  let extra = []
  if(p1) extra.push('path has '+(n-1))
  if(p2) extra.push('path has '+(n+1))
  if(c1) extra.push('corner has '+(n-1))
  if(c2x) extra.push('corner has '+(n+1))
  console.log('Actual '+String(n).padStart(2)+' '+tag+(extra.length?' ('+extra.join(', ')+')':''))
})

// Arithmetic check for each actual
console.log('\n=== MATH CHECK: which formulas produce each actual number? ===')
const allNums=[...new Set([...thisDraw,...allPath,...allCorner])].sort((a,b)=>a-b)
console.log('Full pool ('+allNums.length+' nums): '+allNums.join(', '))

actual.forEach(target => {
  console.log('\nTarget '+target+':')
  const direct=[], flanked=[]
  for(let i=0;i<allNums.length;i++) for(let j=i;j<allNums.length;j++){
    const a=allNums[i],b=allNums[j],gap=Math.abs(a-b)
    if(a+b===target)   direct.push(a+'+'+b+'='+target+' [w='+(gap>3?2:1)+']')
    if(gap===target)   direct.push(b+'-'+a+'='+target+' [w='+(gap>3?2:1)+']')
    if(a+b===target-1) flanked.push('('+a+'+'+b+')+1='+target+' [FLANK]')
    if(a+b===target+1) flanked.push('('+a+'+'+b+')-1='+target+' [FLANK]')
    if(gap===target-1&&target>1) flanked.push('('+b+'-'+a+')+1='+target+' [FLANK]')
    if(gap===target+1) flanked.push('('+b+'-'+a+')-1='+target+' [FLANK]')
  }
  if(direct.length){
    console.log('  DIRECT formulas:')
    direct.slice(0,6).forEach(f=>console.log('    '+f))
  } else {
    console.log('  ❌ NO direct formulas')
  }
  if(flanked.length){
    console.log('  ±1 FLANK formulas (NEW fix):')
    flanked.slice(0,6).forEach(f=>console.log('    '+f))
  }
})

// Combined weighted ranking — show where each actual lands
console.log('\n=== COMBINED RANKING: where do actual numbers rank? ===')
const combined={}
const addC=(n,w,src)=>{
  if(n<1||n>MAX) return  // FIXED: allow repeats — numbers CAN reappear next draw
  if(!combined[n]) combined[n]={weight:0,sources:[]}
  combined[n].weight+=w
  if(!combined[n].sources.includes(src)) combined[n].sources.push(src)
}
// Path + corner with ±1 neighbors (new algo)
allPath.forEach(n=>{
  addC(n,4,'path'); addC(n-1,2,'path±1'); addC(n+1,2,'path±1')
})
allCorner.forEach(n=>{
  addC(n,4,'corner'); addC(n-1,1.5,'corner±1'); addC(n+1,1.5,'corner±1')
})
// Arithmetic with ±1 flanking
const rmap={}
const addR=(r,expr,w)=>{
  if(r<6||r>MAX) return  // FIXED: allow repeats
  if(!rmap[r]) rmap[r]={weight:0,exprs:[]}
  rmap[r].weight+=w
  if(!rmap[r].exprs.includes(expr)) rmap[r].exprs.push(expr)
}
for(let i=0;i<allNums.length;i++) for(let j=i;j<allNums.length;j++){
  const a=allNums[i],b=allNums[j],gap=Math.abs(a-b),w=gap>3?2:1
  if(a!==b){
    const s=a+b,d=gap
    addR(s,a+'+'+b,w); addR(s+1,'('+a+'+'+b+')+1',w*0.7); addR(s-1,'('+a+'+'+b+')-1',w*0.7)
    addR(d,b+'-'+a,w)
    if(d>1) addR(d+1,'('+b+'-'+a+')+1',w*0.7)
    if(d>2) addR(d-1,'('+b+'-'+a+')-1',w*0.7)
  } else {
    const s=a+b
    addR(s,a+'+'+b,w); addR(s+1,'('+a+'+'+b+')+1',w*0.7); addR(s-1,'('+a+'+'+b+')-1',w*0.7)
  }
}
Object.entries(rmap).forEach(([n,{weight,exprs}])=>addC(+n,weight*1.5,'math'))

const ranked=Object.entries(combined)
  .map(([n,d])=>({n:+n,...d}))
  .sort((a,b)=>b.weight-a.weight||a.n-b.n)

console.log('Rank | Num | Weight | Sources')
ranked.slice(0,30).forEach(({n,weight,sources},i)=>{
  const isActual=actual.includes(n)
  console.log((isActual?'★ ':'  ')+'#'+(i+1)+' | '+String(n).padStart(2)+' | '+String(Math.round(weight)).padStart(6)+' | '+sources.join('+'))
})
console.log('\nActual numbers rank positions:')
actual.forEach(n=>{
  const ri=ranked.findIndex(r=>r.n===n)
  const entry=ranked[ri]
  console.log('  '+n+' → rank #'+(ri+1>0?ri+1:'NOT IN TOP')+(entry?' ['+entry.sources.join('+')+'] w='+Math.round(entry.weight):''))
})
