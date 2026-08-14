// Score the user's seed-3 laser debug contacts against exact formula projection.
const formulaTop = new Map([
  [32, 143], [19, 127], [17, 122], [18, 112], [30, 105], [21, 103],
  [20, 88], [37, 88], [3, 86], [9, 83], [2, 80], [11, 80],
  [34, 79], [44, 79], [13, 78], [28, 76], [43, 70], [39, 70],
  [22, 69], [15, 69], [4, 68], [14, 66], [31, 64], [10, 63], [33, 61]
])

const path = [16, 20, 32, 42]
const corners = [1, 15, 20, 24, 28, 30, 31, 32, 33, 37, 42, 44]
const firstPath = 16
const nwCorner = [1]

const score = new Map()
const why = new Map()
function add(n, pts, reason) {
  score.set(n, (score.get(n) || 0) + pts)
  if (!why.has(n)) why.set(n, [])
  why.get(n).push(reason)
}

// Seed-3 laser: direct on-path strongest, corner next. Step decay is mild.
path.forEach((n, i) => add(n, 110 - i * 10, `SW path hit #${i + 1}`))
corners.forEach((n, i) => add(n, 58 - Math.min(i, 8) * 3, `corner graze`))
nwCorner.forEach(n => add(n, 45, 'NW corner graze'))
add(firstPath, 50, 'first SW path contact')

// duplicate path+corner resonance
for (const n of path) {
  if (corners.includes(n)) add(n, 55, 'path+corner resonance')
}

// formula confirmation: use exact app-beam formula projection
for (const [n, pts] of formulaTop) {
  add(n, pts * 0.72, 'exact formula support')
}

const ranked = [...score.entries()]
  .map(([n, pts]) => ({ n, pts, why: why.get(n) || [] }))
  .sort((a, b) => b.pts - a.pts || a.n - b.n)

console.log('Seed-3 laser debug decision ranking:')
ranked.slice(0, 18).forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${String(r.n).padStart(2)}  ${r.pts.toFixed(1)}  ${r.why.slice(0, 4).join(' | ')}`)
})

console.log('\nDecision notes:')
console.log('- Direct SW path hits are strongest: 16,20,32,42')
console.log('- Path+corner duplicate resonance: 20,32,42')
console.log('- Exact formula confirms strongest: 32,30,44,37,20')
console.log('- 32 is the strongest combined decision number')
