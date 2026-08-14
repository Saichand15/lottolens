/**
 * MULTI-RULE DERIVATION ENGINE
 * Rules discovered from draw-to-draw analysis:
 *   R1. Pair diff:  b − a  (where a,b are seeds)
 *   R2. Half:       seed / 2  (only if integer)
 *   R3. Double:     seed × 2  (only if ≤ 45)
 *   R4. Chain:      derived_number + seed  or  seed − derived_number
 *   R5. Seed-step:  seed used as interval → other_seed + seed, other_seed - seed
 */

import { readFileSync } from 'fs'

const allDraws = JSON.parse(readFileSync('./public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a,b)=>a-b))

function deriveRules(seeds) {
  const seedSet = new Set(seeds)
  const candidates = {}   // val → [rule descriptions]

  function add(val, rule) {
    if (val < 1 || val > 45 || seedSet.has(val)) return
    if (!candidates[val]) candidates[val] = []
    candidates[val].push(rule)
  }

  // R1: Pair diffs
  for (let a = 0; a < seeds.length; a++)
    for (let b = a+1; b < seeds.length; b++) {
      const d = seeds[b] - seeds[a]
      add(d, `R1:${seeds[b]}-${seeds[a]}`)
    }

  // R2: Half
  for (const s of seeds)
    if (s % 2 === 0) add(s/2, `R2:${s}/2`)

  // R3: Double
  for (const s of seeds)
    add(s*2, `R3:${s}*2`)

  // R4: Seed-as-step (other_seed ± seed)
  for (const step of seeds)
    for (const base of seeds)
      if (step !== base) {
        add(base + step, `R4:${base}+${step}`)
        add(base - step, `R4:${base}-${step}`)
      }

  // R5: Triple-step (seed used 3x as spacing: e.g. 6,20,34 all spaced by 14)
  for (const s of seeds) {
    add(s*3, `R5:${s}*3`)
    for (const base of seeds) if (base !== s) {
      add(base + 2*s, `R5:${base}+2*${s}`)
      add(base - 2*s, `R5:${base}-2*${s}`)
    }
  }

  return candidates
}

// ── Backtest over ALL consecutive draw pairs ──────────────────────────────────
console.log('BACKTEST: Multi-Rule Engine over all', allDraws.length, 'draws')
console.log('═'.repeat(65))

const ruleHits    = {}   // rule prefix → times it produced a hit
const ruleTotals  = {}
const perDrawHits = []   // how many of 5 actual numbers were predicted

for (let i = 0; i < allDraws.length - 1; i++) {
  const seeds  = allDraws[i]
  const actual = new Set(allDraws[i+1])
  const cands  = deriveRules(seeds)

  let hitCount = 0
  for (const [val, rules] of Object.entries(cands)) {
    const hit = actual.has(+val)
    for (const r of rules) {
      const prefix = r.split(':')[0]
      ruleTotals[prefix] = (ruleTotals[prefix]||0) + 1
      if (hit) { ruleHits[prefix] = (ruleHits[prefix]||0) + 1 }
    }
    if (hit) hitCount++
  }
  perDrawHits.push(hitCount)
}

// Coverage distribution
const dist = {0:0,1:0,2:0,3:0,4:0,5:0}
perDrawHits.forEach(h => dist[Math.min(h,5)]++)

console.log('\nCoverage per draw (how many of 5 actual numbers were derived):')
for (let k=0;k<=5;k++) {
  const c=dist[k], pct=(c/perDrawHits.length*100).toFixed(1)
  console.log(`  ${k}/5 covered: ${String(c).padStart(3)} draws (${pct}%)  ${'█'.repeat(Math.round(+pct/3))}`)
}

const avgHits = perDrawHits.reduce((a,b)=>a+b,0)/perDrawHits.length
console.log(`\n  Avg covered per draw: ${avgHits.toFixed(2)} / 5`)
console.log(`  Draws with ≥3 covered: ${perDrawHits.filter(h=>h>=3).length} (${(perDrawHits.filter(h=>h>=3).length/perDrawHits.length*100).toFixed(1)}%)`)
console.log(`  Draws with ≥2 covered: ${perDrawHits.filter(h=>h>=2).length} (${(perDrawHits.filter(h=>h>=2).length/perDrawHits.length*100).toFixed(1)}%)`)

// Per-rule signal
console.log('\nPer-rule hit rate (vs baseline 5/45=11.1%):')
const allRules = ['R1','R2','R3','R4','R5']
for (const r of allRules) {
  const hits = ruleHits[r]||0, tot = ruleTotals[r]||1
  const rate = (hits/tot*100).toFixed(1)
  const signal = (hits/tot/(5/45)).toFixed(2)
  console.log(`  ${r}: ${hits}/${tot} = ${rate}%  signal ${signal}x`)
}

// ── Recent 10 draw post-mortem ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65))
console.log('RECENT DRAWS POST-MORTEM (last 10):')
console.log('═'.repeat(65))

for (let i = allDraws.length-11; i < allDraws.length-1; i++) {
  const seeds  = allDraws[i]
  const actual = allDraws[i+1]
  const actSet = new Set(actual)
  const cands  = deriveRules(seeds)

  const hits = actual.filter(n => cands[n])
  const hitDetails = hits.map(n => `${n}←[${cands[n].join(',')}]`)
  const missed = actual.filter(n => !cands[n])

  console.log(`D${i+1}→D${i+2}: seeds=[${seeds.join(',')}] actual=[${actual.join(',')}]`)
  console.log(`  ✓ HITS(${hits.length}): ${hitDetails.join('  ') || 'none'}`)
  if (missed.length) console.log(`  ✗ MISSED: ${missed.join(', ')} — need deeper rule`)
  console.log()
}

// ── Predict next draw (D493+1 = D494) ────────────────────────────────────────
console.log('═'.repeat(65))
const lastDraw = allDraws[allDraws.length-1]
console.log(`PREDICT D${allDraws.length+1} from seeds D${allDraws.length}: [${lastDraw.join(', ')}]`)
console.log('═'.repeat(65))

const cands = deriveRules(lastDraw)

// Show all rule derivations
console.log('\nAll derived candidates:')
const sorted = Object.entries(cands)
  .map(([val, rules]) => ({ val:+val, rules, weight: rules.length + (rules.some(r=>r.startsWith('R1'))?2:0) + (rules.some(r=>r.startsWith('R2')||r.startsWith('R3'))?1:0) }))
  .sort((a,b) => b.weight - a.weight || a.val - b.val)

for (const {val, rules, weight} of sorted) {
  const strength = weight >= 4 ? '⚡⚡' : weight >= 3 ? '⚡' : '  '
  console.log(`  ${strength} ${String(val).padStart(2)}: ${rules.join('  ')}`)
}

// Top picks by rule-count (multi-rule confirmation = stronger signal)
console.log('\n--- Ranked by confirmation count ---')
const top = sorted.slice(0, 20).map(x=>`${x.val}(${x.rules.length}rules,w=${x.weight})`)
console.log(top.join('  '))

const best5 = sorted.slice(0,5).map(x=>x.val).sort((a,b)=>a-b)
console.log(`\n★ BEST 5 PICK (D${allDraws.length+1}): [${best5.join(', ')}]`)

// Show pair-diffs specifically (highest signal rule)
console.log('\n⚡ PAIR-DIFFS only:')
for (let a=0;a<lastDraw.length;a++)
  for (let b=a+1;b<lastDraw.length;b++) {
    const d = lastDraw[b]-lastDraw[a]
    if (d>=1&&d<=45&&!new Set(lastDraw).has(d))
      console.log(`   ${lastDraw[b]}-${lastDraw[a]} = ${d}`)
  }
