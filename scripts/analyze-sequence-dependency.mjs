import fs from 'fs'

const draws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))

const prev = [1, 23, 34, 36, 40]
const actual = [11, 16, 30, 37, 38]
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const zoneSig = d => zones.map(([lo, hi]) => d.filter(n => n >= lo && n <= hi).length).join('')
const overlap = (a, b) => a.filter(n => b.includes(n)).length
const dist = (a, b) => Math.min(...a.map(x => Math.abs(x - b)))
const fmt = d => `[${d.join(',')}]`

function transforms(from, to) {
  const out = []
  for (const a of from) {
    for (const b of to) {
      const diff = b - a
      if (Math.abs(diff) <= 12) out.push({ a, b, diff })
    }
  }
  return out.sort((x, y) => Math.abs(x.diff) - Math.abs(y.diff) || x.a - y.a || x.b - y.b)
}

function pairRate(a, b) {
  let occ = 0, hit = 0, examples = []
  for (let i = 0; i < draws.length - 1; i++) {
    if (draws[i].includes(a)) {
      occ++
      if (draws[i + 1].includes(b)) {
        hit++
        examples.push(i + 1)
      }
    }
  }
  return { a, b, occ, hit, rate: occ ? hit / occ : 0, examples }
}

function scoreCase(i) {
  const d = draws[i]
  const next = draws[i + 1]
  if (!next) return null
  const samePrev = overlap(d, prev)
  const sameActual = overlap(next, actual)
  const sig = zoneSig(d)
  const nextSig = zoneSig(next)
  const nearPrev = prev.reduce((sum, n) => sum + (d.includes(n) ? 3 : dist(d, n) <= 2 ? 1 : 0), 0)
  const nearActual = actual.reduce((sum, n) => sum + (next.includes(n) ? 3 : dist(next, n) <= 2 ? 1 : 0), 0)
  const edge = d.includes(1) ? 2 : d.some(n => n <= 3) ? 1 : 0
  const highPair = d.filter(n => n >= 34 && n <= 40).length
  const score = samePrev * 8 + sameActual * 10 + (sig === zoneSig(prev) ? 8 : 0) + nearPrev + nearActual + edge + highPair
  return { drawNum: i + 1, d, next, sig, nextSig, samePrev, sameActual, nearPrev, nearActual, score }
}

console.log('Target previous:', fmt(prev), 'zone', zoneSig(prev))
console.log('Target next    :', fmt(actual), 'zone', zoneSig(actual))

const exactPrev = []
for (let i = 0; i < draws.length; i++) {
  if (overlap(draws[i], prev) === 5) exactPrev.push(i + 1)
}
console.log('\nExact previous occurrences:', exactPrev.length ? exactPrev.join(', ') : 'none in local history')

console.log('\nDirect dependency pair rates:')
for (const [a, b] of [[1, 11], [23, 16], [34, 30], [36, 37], [40, 38], [34, 38], [36, 38], [40, 37]]) {
  const r = pairRate(a, b)
  console.log(`${a}->${b}: ${r.hit}/${r.occ} ${(r.rate * 100).toFixed(1)}% examples D${r.examples.slice(-8).join(',D') || '-'}`)
}

console.log('\nBest historical dependency cases:')
const cases = []
for (let i = 0; i < draws.length - 1; i++) {
  const c = scoreCase(i)
  if (c) cases.push(c)
}
cases.sort((a, b) => b.score - a.score || b.sameActual - a.sameActual || b.samePrev - a.samePrev)
for (const c of cases.slice(0, 18)) {
  console.log(`D${c.drawNum} ${fmt(c.d)} z${c.sig} -> D${c.drawNum + 1} ${fmt(c.next)} z${c.nextSig} | score ${c.score} prevHit ${c.samePrev}/5 nextHit ${c.sameActual}/5 nearPrev ${c.nearPrev} nearNext ${c.nearActual}`)
  const t = transforms(c.d, c.next).filter(x => actual.some(a => Math.abs(a - x.b) <= 1)).slice(0, 10)
  if (t.length) console.log('  moves:', t.map(x => `${x.a}${x.diff >= 0 ? '+' : ''}${x.diff}=${x.b}`).join('  '))
}

console.log('\nTarget move map from previous to actual:')
for (const t of transforms(prev, actual).slice(0, 20)) {
  console.log(`${t.a}${t.diff >= 0 ? '+' : ''}${t.diff}=${t.b}`)
}

const shapeMatches = cases.filter(c => c.sig === zoneSig(prev))
const nextCounts = new Map()
for (const c of shapeMatches) {
  for (const n of c.next) nextCounts.set(n, (nextCounts.get(n) || 0) + 1)
}
console.log('\nSame zone-shape previous cases:', shapeMatches.length)
console.log('Next-number frequency after same shape:', [...nextCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 20).map(([n, c]) => `${n}:${c}`).join(' '))
