import fs from 'fs'

const baseDraws = JSON.parse(fs.readFileSync('public/all_draws.json', 'utf8'))
  .map(d => d.map(Number).sort((a, b) => a - b))
const manual = [
  [2, 9, 15, 21, 25],
  [1, 3, 15, 20, 27],
  [10, 18, 19, 21, 40],
  [22, 27, 32, 34, 39],
  [3, 4, 11, 17, 20],
  [3, 16, 27, 29, 39],
]
const history = [...baseDraws, ...manual]
const MAX = 45
const DIRS = { NW: [-1, -1], NE: [1, -1], SW: [-1, 1], SE: [1, 1] }

// EXACT copy of formulaAgent.beamStats
function beamStats(history, seed, maxNum = MAX) {
  const win = history.slice(-100)
  const ci = win.length - 1
  const sets = win.map(d => new Set(d))
  const rowIdx = seed - 1
  const out = { S: seed, NW: 0, NW_app: 0, SW: 0, SW_app: 0, NE_app: 0, SE_app: 0 }
  for (const [dir, [dc, dr]] of Object.entries(DIRS)) {
    let step = 1
    while (true) {
      const c = ci + dc * step
      const r = rowIdx + dr * step
      if (c < 0 || c >= win.length || r < 0 || r >= maxNum) break
      const n = r + 1
      const hit = sets[c]?.has(n) || false
      if (dir === 'NW') { out.NW++; if (hit) out.NW_app++ }
      if (dir === 'SW') { out.SW++; if (hit) out.SW_app++ }
      if (dir === 'NE' && hit) out.NE_app++
      if (dir === 'SE' && hit) out.SE_app++
      const adjR = dr < 0 ? r - 1 : r + 1
      if (adjR >= 0 && adjR < maxNum) {
        const adjN = adjR + 1
        const adjHit = sets[c]?.has(adjN) || false
        if (dir === 'NW') { out.NW++; if (adjHit) out.NW_app++ }
        if (dir === 'SW') { out.SW++; if (adjHit) out.SW_app++ }
        if (dir === 'NE' && adjHit) out.NE_app++
        if (dir === 'SE' && adjHit) out.SE_app++
      }
      step++
    }
  }
  out.NW_miss = out.NW - out.NW_app
  out.SW_miss = out.SW - out.SW_app
  out.ctTotal = out.NW_app + out.SW_app + out.NE_app + out.SE_app
  return out
}

// User-supplied ACTUAL values from the app
const expected = {
  3:  { NW: 3,  NW_app: 1,  NW_miss: 2,  SW: 83, SW_app: 15, SW_miss: 68, ctTotal: 16 },
  16: { NW: 29, NW_app: 2,  NW_miss: 27, SW: 57, SW_app: 3,  SW_miss: 54, ctTotal: 5 },
  27: { NW: 51, NW_app: 7,  NW_miss: 44, SW: 35, SW_app: 3,  SW_miss: 32, ctTotal: 10 },
  29: { NW: 55, NW_app: 11, NW_miss: 44, SW: 31, SW_app: 4,  SW_miss: 27, ctTotal: 15 },
  39: { NW: 75, NW_app: 9,  NW_miss: 66, SW: 11, SW_app: 0,  SW_miss: 11, ctTotal: 9 },
}

console.log('History length used (last 100):', Math.min(history.length, 100), '\n')
const keys = ['NW', 'NW_app', 'NW_miss', 'SW', 'SW_app', 'SW_miss', 'ctTotal']
for (const seed of [3, 16, 27, 29, 39]) {
  const got = beamStats(history, seed)
  const exp = expected[seed]
  console.log(`SEED ${seed}`)
  let allMatch = true
  for (const k of keys) {
    const match = got[k] === exp[k]
    if (!match) allMatch = false
    console.log(`   ${k.padEnd(8)} mine=${String(got[k]).padStart(3)}  app=${String(exp[k]).padStart(3)}  ${match ? 'OK' : 'MISMATCH (diff ' + (got[k] - exp[k]) + ')'}`)
  }
  console.log(`   ==> ${allMatch ? 'FULL MATCH' : 'DIFFERS'}\n`)
}
