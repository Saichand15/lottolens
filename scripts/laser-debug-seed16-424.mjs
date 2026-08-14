// Score the user's seed-16 laser debug contacts and combine with seed-3 contacts.
// Uses formula projection recomputed from the user's exact beam stats.
const formulaTop = new Map([
  [32, 143], [19, 127], [17, 122], [18, 112], [30, 105], [21, 103],
  [20, 88], [37, 88], [3, 86], [9, 83], [2, 80], [11, 80],
  [34, 79], [44, 79], [13, 78], [28, 76], [43, 70], [39, 70],
  [22, 69], [15, 69], [4, 68], [14, 66], [31, 64], [10, 63], [33, 61],
  [1, 35], [16, 52]
])

function rankContacts(label, contacts) {
  const score = new Map()
  const why = new Map()
  const add = (n, pts, reason) => {
    score.set(n, (score.get(n) || 0) + pts)
    if (!why.has(n)) why.set(n, [])
    why.get(n).push(reason)
  }

  contacts.path.forEach((n, i) => add(n, 120 - i * 12, `${label} path hit #${i + 1}`))
  contacts.firstPath.forEach(n => add(n, 55, `${label} first path contact`))
  contacts.corner.forEach((n, i) => add(n, 62 - Math.min(i, 8) * 4, `${label} corner graze`))
  contacts.nwCorner.forEach(n => add(n, 48, `${label} NW corner`))
  for (const n of contacts.path) {
    if (contacts.corner.includes(n) || contacts.nwCorner.includes(n)) add(n, 60, `${label} path+corner resonance`)
  }
  for (const [n, pts] of formulaTop) add(n, pts * 0.72, 'exact formula support')

  return [...score.entries()]
    .map(([n, pts]) => ({ n, pts, why: why.get(n) || [] }))
    .sort((a, b) => b.pts - a.pts || a.n - b.n)
}

const seed3 = {
  path: [16, 20, 32, 42],
  firstPath: [16],
  corner: [1, 15, 20, 24, 28, 30, 31, 32, 33, 37, 42, 44],
  nwCorner: [1],
}

const seed16 = {
  path: [37],
  firstPath: [37],
  corner: [18, 30],
  nwCorner: [13, 1],
}

function combineRankings(rankings) {
  const score = new Map()
  const why = new Map()
  const add = (n, pts, reasons) => {
    score.set(n, (score.get(n) || 0) + pts)
    if (!why.has(n)) why.set(n, [])
    why.get(n).push(...reasons)
  }
  rankings.forEach((ranked, sourceIdx) => {
    ranked.forEach((r, i) => {
      const rankBoost = Math.max(0, 80 - i * 4)
      add(r.n, r.pts * 0.5 + rankBoost, r.why.map(w => `S${sourceIdx === 0 ? 3 : 16}:${w}`))
    })
  })
  return [...score.entries()]
    .map(([n, pts]) => ({ n, pts, why: why.get(n) || [] }))
    .sort((a, b) => b.pts - a.pts || a.n - b.n)
}

const r3 = rankContacts('seed3', seed3)
const r16 = rankContacts('seed16', seed16)
const combined = combineRankings([r3, r16])

console.log('=== SEED 16 LASER DECISION ===')
r16.slice(0, 14).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${String(r.n).padStart(2)}  ${r.pts.toFixed(1)}  ${r.why.slice(0, 5).join(' | ')}`))

console.log('\n=== COMBINED SEED 3 + SEED 16 LASER DECISION ===')
combined.slice(0, 18).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${String(r.n).padStart(2)}  ${r.pts.toFixed(1)}  ${r.why.slice(0, 6).join(' | ')}`))

console.log('\nSeat meaning:')
console.log('Low opener candidates: 1,2,3,4,13; formula/history still favors 2/3 over 1/13.')
console.log('Second/teen candidates: 18,19,17; seed16 pushes 18, formula pushes 19/17.')
console.log('Middle/high path candidates: 30,32,37,44; seed3 decides 32, seed16 decides 37 and confirms 30.')
console.log('Final laser-informed line should keep 32 and add 30/37 as high-seat backups.')
