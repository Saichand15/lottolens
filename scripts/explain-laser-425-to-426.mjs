// Explain how 2,19,22,25,31 formed from the laser/debug state 6,8,12,17,37.
const prev = [6, 8, 12, 17, 37]
const actual = [2, 19, 22, 25, 31]
const zones = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]
const sig = d => zones.map(([a, b]) => d.filter(n => n >= a && n <= b).length).join('')
const sum = d => d.reduce((a, b) => a + b, 0)
const wrap = n => { while (n < 1) n += 45; while (n > 45) n -= 45; return n }
const gaps = d => d.slice(1).map((n, i) => n - d[i])
const pairGaps = d => [...new Set(d.flatMap((a, i) => d.slice(i + 1).map(b => Math.abs(b - a))))].sort((a, b) => a - b)

const laser = {
  6:  { path: [10, 25, 31, 43, 45], first: [10], corner: [13, 26, 32, 44] },
  8:  { path: [14, 23, 29, 32], first: [14], corner: [4, 11, 12, 18, 25, 29, 34, 35] },
  12: { path: [21], first: [21], corner: [4, 1, 20, 26, 35, 44] },
  17: { path: [16, 22, 27], first: [16, 22], corner: [13, 1, 35, 45, 19] },
  37: { path: [27, 20, 41], first: [27, 41], corner: [25, 18, 15, 12, 39] },
}

const score = new Map()
const why = new Map()
function add(n, pts, reason) {
  score.set(n, (score.get(n) || 0) + pts)
  if (!why.has(n)) why.set(n, [])
  why.get(n).push(reason)
}

for (const [seed, data] of Object.entries(laser)) {
  data.path.forEach((n, i) => add(n, Math.max(45, 125 - i * 10), `S${seed} path#${i + 1}`))
  data.first.forEach(n => add(n, 65, `S${seed} first contact`))
  data.corner.forEach((n, i) => add(n, Math.max(30, 62 - i * 4), `S${seed} corner`))
  data.path.forEach(n => {
    if (data.corner.includes(n)) add(n, 70, `S${seed} path+corner resonance`)
  })
}

// Formula/gap grammar from 6,8,12,17,37.
const internalGaps = [...new Set([...gaps(prev), ...pairGaps(prev)].filter(g => g >= 1 && g <= 12))]
for (const seed of prev) {
  for (const g of internalGaps) {
    add(wrap(seed + g), 34, `${seed}+gap${g}`)
    add(wrap(seed - g), 34, `${seed}-gap${g}`)
  }
  add(wrap(seed + 10), 58, `${seed}+10 zone-up`)
  add(wrap(seed - 10), 58, `${seed}-10 zone-down`)
  add(wrap(seed + 1), 42, `${seed}+1`) ; add(wrap(seed - 1), 42, `${seed}-1`)
  add(wrap(seed + 2), 40, `${seed}+2`) ; add(wrap(seed - 2), 40, `${seed}-2`)
  add(wrap(seed + 5), 46, `${seed}+5`) ; add(wrap(seed - 5), 46, `${seed}-5`)
}

const ranked = [...score.entries()].map(([n, pts]) => ({ n, pts, why: why.get(n) })).sort((a, b) => b.pts - a.pts || a.n - b.n)
console.log('Prev:', prev.join(','), 'sig', sig(prev), 'sum', sum(prev), 'gaps', gaps(prev).join('-'), 'pairGaps', pairGaps(prev).join(','))
console.log('Actual next:', actual.join(','), 'sig', sig(actual), 'sum', sum(actual))
console.log('\nActual formation evidence:')
for (const n of actual) {
  const r = ranked.find(x => x.n === n)
  console.log(`${String(n).padStart(2)} rank#${ranked.findIndex(x => x.n === n) + 1} score=${r?.pts.toFixed(1)} :: ${r?.why.slice(0, 10).join(' | ')}`)
}
console.log('\nTop 25 combined laser+gap:')
ranked.slice(0, 25).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${String(r.n).padStart(2)} ${r.pts.toFixed(1)} ${r.why.slice(0, 5).join(' | ')}`))
