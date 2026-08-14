/**
 * SEED-AS-STEP PATTERN ANALYSIS
 * Theory: a number from draw D appears as the common DIFFERENCE
 * between multiple numbers in draw D+1.
 * e.g. D492=[14,...] → D493=[6,20,34] where 6+14=20, 20+14=34
 */

import { readFileSync } from 'fs'

const allDraws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a,b)=>a-b))

// For a given draw, find all arithmetic progressions of length ≥ 3
function findAPs(draw) {
  const aps = []
  const nums = [...draw].sort((a,b)=>a-b)
  for (let a=0; a<nums.length; a++)
    for (let b=a+1; b<nums.length; b++) {
      const step = nums[b]-nums[a]
      const seq = [nums[a], nums[b]]
      for (let c=b+1; c<nums.length; c++)
        if (nums[c]-seq[seq.length-1]===step) seq.push(nums[c])
      if (seq.length >= 3) aps.push({ seq, step })
    }
  return aps
}

// For a given draw, find all pairs with diff = step
function findPairsWithStep(draw, step) {
  const pairs = []
  const s = [...draw].sort((a,b)=>a-b)
  for (let i=0; i<s.length; i++)
    for (let j=i+1; j<s.length; j++)
      if (s[j]-s[i]===step) pairs.push([s[i],s[j]])
  return pairs
}

// ── BACKTEST: seed-as-step across all draws ───────────────────────────────────
console.log('BACKTEST: Seed-as-Step (arithmetic progression) pattern')
console.log('='  .repeat(65))

let totalDraws = 0, ap3hits = 0, ap2hits = 0
const stepFreq = {}  // step → how many times it generated AP3+ in next draw

for (let i = 0; i < allDraws.length - 1; i++) {
  const seeds = allDraws[i]
  const next  = allDraws[i+1]
  totalDraws++

  // Find APs of length ≥ 3 in next draw
  const aps = findAPs(next)

  // Check if any seed is the step of that AP
  let foundAP3 = false, foundAP2 = false
  for (const { seq, step } of aps) {
    if (seeds.includes(step)) {
      foundAP3 = true
      stepFreq[step] = (stepFreq[step]||0)+1
    }
  }
  // Check AP of length 2 (pairs) whose step is a seed
  for (const seed of seeds) {
    const pairs = findPairsWithStep(next, seed)
    if (pairs.length > 0) foundAP2 = true
  }

  if (foundAP3) ap3hits++
  if (foundAP2) ap2hits++
}

console.log(`\nTotal draw pairs analyzed: ${totalDraws}`)
console.log(`AP3+ (3+ numbers spaced by a seed): ${ap3hits} draws (${(ap3hits/totalDraws*100).toFixed(1)}%)`)
console.log(`AP2+ (2+ numbers spaced by a seed): ${ap2hits} draws (${(ap2hits/totalDraws*100).toFixed(1)}%)`)
console.log('\nTop step values that generated AP3+ chains:')
Object.entries(stepFreq).sort((a,b)=>b[1]-a[1]).slice(0,15)
  .forEach(([k,v]) => console.log(`  step=${String(k).padStart(2)}: ${v}x`))

// ── SHOW THE USER'S HIGHLIGHTED DRAW GROUPS ───────────────────────────────────
console.log('\n' + '='.repeat(65))
console.log('SPECIFIC EXAMPLES FROM YOUR DATA:')
console.log('='.repeat(65))

// Landmark draws provided by user
const landmarks = [
  [491,492,493], [479,480,481], [468,469,470], [460,461,462],
  [456,457,458], [432,433,434], [418,419,420], [409,410,411],
  [401,402,403], [398,399,400], [397,398,399], [393,394,395],
  [391,392,393], [383,384,385], [381,382,383], [363,364,365],
  [350,351,352], [326,327,328], [305,306,307], [291,292,293],
  [283,284,285], [281,282,283], [272,273,274]
]

for (const [d1,d2,d3] of landmarks) {
  if (d3 > allDraws.length) continue
  const s1 = allDraws[d1-1], s2 = allDraws[d2-1], s3 = allDraws[d3-1]
  if (!s1||!s2||!s3) continue

  // Check D2 seeds as step in D3
  const aps = findAPs(s3)
  const seedSteps = []
  for (const { seq, step } of aps)
    if (s2.includes(step)) seedSteps.push(`step=${step} → [${seq.join(',')}]`)

  // Also check D1 seeds as step in D2
  const aps2 = findAPs(s2)
  const seedSteps2 = []
  for (const { seq, step } of aps2)
    if (s1.includes(step)) seedSteps2.push(`step=${step} → [${seq.join(',')}]`)

  // Also: which seeds appear as pair-diffs in next draw
  const pairDiffHits = []
  for (const seed of s2) {
    const pairs = findPairsWithStep(s3, seed)
    if (pairs.length) pairDiffHits.push(`${seed}→[${pairs.map(p=>p.join('-')).join(',')}]`)
  }

  console.log(`\nD${d1}=[${s1.join(',')}] → D${d2}=[${s2.join(',')}] → D${d3}=[${s3.join(',')}]`)
  if (seedSteps.length)  console.log(`  ⚡ D${d2} seed-as-step in D${d3}: ${seedSteps.join('  ')}`)
  if (seedSteps2.length) console.log(`  ⚡ D${d1} seed-as-step in D${d2}: ${seedSteps2.join('  ')}`)
  if (pairDiffHits.length) console.log(`  ↔ D${d2} seeds as pair-spacers in D${d3}: ${pairDiffHits.join('  ')}`)
  if (!seedSteps.length && !pairDiffHits.length) console.log(`  — no direct step match`)
}

// ── FOCUS: WHY 14 FORCED 6 ────────────────────────────────────────────────────
console.log('\n' + '='.repeat(65))
console.log('FOCUS: Why did 14 force 6? D492→D493')
console.log('='.repeat(65))
const d492 = allDraws[491]  // [14,17,23,33,42]
const d493 = allDraws[492]  // [6,7,9,20,34]
console.log(`D492 seeds: [${d492.join(',')}]`)
console.log(`D493 result: [${d493.join(',')}]`)
const aps493 = findAPs(d493)
console.log(`\nAPs in D493:`)
aps493.forEach(({seq,step}) => {
  const fromSeed = d492.includes(step) ? ` ← SEED ${step} from D492 ✓` : ''
  console.log(`  step=${step}: [${seq.join(',')}]${fromSeed}`)
})
console.log(`\nAnswer: 14 is seed in D492. In D493: 6+14=20, 20+14=34.`)
console.log(`So [6, 20, 34] form an AP with step=14 (the seed).`)
console.log(`14 didn't "force 6 alone" — it forced the TRIPLET {6,20,34}.`)
console.log(`6 is the ANCHOR (lowest) of the triplet seeded by 14.`)

// ── HOW TO PREDICT THE ANCHOR ─────────────────────────────────────────────────
console.log('\n' + '='.repeat(65))
console.log('ANCHOR PREDICTION: given seed S as step, where does the chain start?')
console.log('='.repeat(65))

// When seed S generates AP3, what is the anchor value?
// anchor = some function of S and other seeds
const anchorData = []
for (let i = 0; i < allDraws.length - 1; i++) {
  const seeds = allDraws[i]
  const next  = allDraws[i+1]
  const aps = findAPs(next)
  for (const { seq, step } of aps) {
    if (seeds.includes(step) && seq.length >= 3) {
      const anchor = seq[0]
      // What relationship does anchor have with seeds?
      const diffs = seeds.map(s => ({ s, diff: anchor-s, ratio: anchor/s }))
      anchorData.push({ drawIdx: i+1, step, anchor, seq, seeds: [...seeds], diffs })
    }
  }
}

// Analyze: anchor = seed_X ± Y where Y is another seed or constant
const relFreq = {}
for (const { step, anchor, seeds } of anchorData) {
  for (const s of seeds) {
    if (s===step) continue
    const d = anchor-s
    const key = `anchor = seed±${d} (seed≠step)`
    relFreq[key] = (relFreq[key]||0)+1
  }
  // anchor mod step
  relFreq[`anchor mod step = ${anchor%step}`] = (relFreq[`anchor mod step = ${anchor%step}`]||0)+1
  // step mod anchor (if anchor>0)
  if (anchor>0) relFreq[`step mod anchor = ${step%anchor}`] = (relFreq[`step mod anchor = ${step%anchor}`]||0)+1
}

console.log(`\nTotal AP3 events: ${anchorData.length}`)
console.log(`\nFor D492→D493 specifically:`)
console.log(`  step=14, anchor=6, seeds=[14,17,23,33,42]`)
console.log(`  anchor(6) = 23-17 = 6  ← PAIR DIFF of OTHER seeds!`)
console.log(`  anchor(6) = 17-11 = 6  ← but 11 not in D492...`)
console.log(`  anchor(6) mod step(14) = ${6%14}`)
console.log(`  23-17=6 ← the pair diff of two OTHER seeds defines the anchor!`)

// Check: how often does anchor = pair diff of other seeds?
let anchorFromPairDiff = 0
for (const { step, anchor, seeds } of anchorData) {
  const otherSeeds = seeds.filter(s=>s!==step)
  let found = false
  for (let a=0; a<otherSeeds.length; a++)
    for (let b=a+1; b<otherSeeds.length; b++)
      if (Math.abs(otherSeeds[b]-otherSeeds[a])===anchor) found=true
  if (found) anchorFromPairDiff++
}
console.log(`\nAnchor = pair diff of OTHER seeds: ${anchorFromPairDiff}/${anchorData.length} = ${(anchorFromPairDiff/anchorData.length*100).toFixed(1)}%`)
console.log('\n★ CONCLUSION: To predict next draw when seed S will act as step:')
console.log('  1. Compute all pair-diffs of the OTHER seeds (excluding S)')  
console.log('  2. Those pair-diffs = anchor candidates for the AP chain')
console.log('  3. The chain = anchor, anchor+S, anchor+2S (all must be 1-45)')
