// ─── FULL PREDICTION ENGINE ────────────────────────────────────────────────
// All lottery analysis algorithms used across the app

export const TOTAL_NUMBERS = 45

// ── Build transition matrix: number → what followed it next draw ──────────────
export function buildTransitionMatrix(draws) {
  const matrix = {}
  for (let i = 1; i < draws.length; i++) {
    const prev = draws[i - 1].numbers
    const curr = draws[i].numbers
    prev.forEach(n => {
      if (!matrix[n]) matrix[n] = {}
      curr.forEach(m => { matrix[n][m] = (matrix[n][m] || 0) + 1 })
    })
  }
  return matrix
}

// ── Build co-occurrence: same-draw pair bonds ─────────────────────────────────
export function buildCoOccurrence(draws) {
  const co = {}
  draws.forEach(d => {
    const nums = d.numbers
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = nums[i], b = nums[j]
        const key = `${Math.min(a,b)}-${Math.max(a,b)}`
        co[key] = (co[key] || 0) + 1
      }
    }
  })
  return co
}

// ── Get co-occurrence count between two numbers ───────────────────────────────
export function getCoOcc(co, a, b) {
  const key = `${Math.min(a,b)}-${Math.max(a,b)}`
  return co[key] || 0
}

// ── Build gap map: draws since each number last appeared ──────────────────────
export function buildGapMap(draws) {
  const gaps = {}
  for (let n = 1; n <= TOTAL_NUMBERS; n++) gaps[n] = draws.length
  draws.forEach((d, i) => {
    d.numbers.forEach(n => { gaps[n] = draws.length - 1 - i })
  })
  return gaps
}

// ── Get sorted appearances of a number ───────────────────────────────────────
export function getAppearances(draws, number) {
  return draws
    .map((d, i) => ({ drawIdx: i, drawNum: d.id, numbers: d.numbers }))
    .filter(d => d.numbers.includes(number))
}

// ── Position frequency ────────────────────────────────────────────────────────
export function buildPositionFreq(draws) {
  const pf = {}
  for (let n = 1; n <= TOTAL_NUMBERS; n++) pf[n] = [0, 0, 0, 0, 0]
  draws.forEach(d => {
    d.numbers.forEach((n, pos) => { pf[n][pos]++ })
  })
  return pf
}

// ── Frequency map ─────────────────────────────────────────────────────────────
export function buildFreqMap(draws) {
  const freq = {}
  draws.forEach(d => d.numbers.forEach(n => { freq[n] = (freq[n] || 0) + 1 }))
  return freq
}

// ── Prev/Next column frequency ────────────────────────────────────────────────
export function getPrevNextFrequency(draws, number) {
  const prev = {}, next = {}
  const appearances = getAppearances(draws, number)
  appearances.forEach(({ drawIdx }) => {
    if (drawIdx > 0) {
      draws[drawIdx - 1].numbers.forEach(n => { prev[n] = (prev[n] || 0) + 1 })
    }
    if (drawIdx < draws.length - 1) {
      draws[drawIdx + 1].numbers.forEach(n => { next[n] = (next[n] || 0) + 1 })
    }
  })
  const sort = obj => Object.entries(obj)
    .map(([n, c]) => ({ number: +n, count: c }))
    .sort((a, b) => b.count - a.count)
  return { prev: sort(prev), next: sort(next) }
}

// ── Get senders (numbers that transitioned TO target) ─────────────────────────
export function getSenders(matrix, target) {
  const senders = []
  Object.entries(matrix).forEach(([from, toMap]) => {
    if (toMap[target]) senders.push({ number: +from, count: toMap[target] })
  })
  return senders.sort((a, b) => b.count - a.count)
}

// ── Get receivers (numbers target transitioned TO) ────────────────────────────
export function getReceivers(matrix, source) {
  const toMap = matrix[source] || {}
  return Object.entries(toMap)
    .map(([n, c]) => ({ number: +n, count: c }))
    .sort((a, b) => b.count - a.count)
}

// ── FULL PREDICTION: score every number based on last draw seeds ──────────────
export function predictNextDraw(draws, seedNumbers) {
  const matrix = buildTransitionMatrix(draws)
  const co = buildCoOccurrence(draws)
  const gaps = buildGapMap(draws)
  const freq = buildFreqMap(draws)

  const scores = {}
  for (let n = 1; n <= TOTAL_NUMBERS; n++) scores[n] = 0

  // Transition bonds from each seed
  seedNumbers.forEach(seed => {
    const receivers = getReceivers(matrix, seed)
    receivers.forEach(({ number, count }) => {
      scores[number] += count * 2
    })
  })

  // Gap bonus: overdue numbers get a boost
  Object.entries(gaps).forEach(([n, gap]) => {
    if (gap > 20) scores[+n] += Math.min(gap, 40)
    else if (gap > 10) scores[+n] += gap * 0.5
  })

  // Co-occurrence among seeds boosts numbers that pair well with seeds
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    seedNumbers.forEach(seed => {
      scores[n] += getCoOcc(co, n, seed) * 1.5
    })
  }

  // Exclude seed numbers themselves
  seedNumbers.forEach(s => { scores[s] = 0 })

  return Object.entries(scores)
    .map(([n, s]) => ({ number: +n, score: Math.round(s), gap: gaps[+n] }))
    .sort((a, b) => b.score - a.score)
}

// ── POSITION ANALYSIS: best candidates for a specific position ────────────────
export function analyzePosition(draws, pos, lockedNumbers = []) {
  const pf = buildPositionFreq(draws)
  const co = buildCoOccurrence(draws)
  const gaps = buildGapMap(draws)

  const results = []
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    if (lockedNumbers.includes(n)) continue
    const posFreq = pf[n][pos]
    const coScore = lockedNumbers.reduce((sum, locked) => sum + getCoOcc(co, n, locked), 0)
    const gap = gaps[n]
    const gapBonus = gap > 15 ? gap * 0.8 : 0
    const score = posFreq * 3 + coScore * 2 + gapBonus
    results.push({ number: n, posFreq, coScore, gap, score: Math.round(score) })
  }
  return results.sort((a, b) => b.score - a.score)
}

// ── AFTER-HIGH ANALYSIS: pos1 swing prediction ───────────────────────────────
export function analyzePos1AfterHigh(draws, prevPos1) {
  const pos1History = draws.map(d => d.numbers[0])
  const swings = []
  for (let i = 1; i < pos1History.length; i++) {
    const diff = pos1History[i] - pos1History[i - 1]
    swings.push({ prev: pos1History[i - 1], curr: pos1History[i], diff, drawId: draws[i].id })
  }
  // After numbers similar to prevPos1 (±5), what came next?
  const similar = swings.filter(s => Math.abs(s.prev - prevPos1) <= 5)
  const nextCounts = {}
  similar.forEach(s => { nextCounts[s.curr] = (nextCounts[s.curr] || 0) + 1 })
  return Object.entries(nextCounts)
    .map(([n, c]) => ({ number: +n, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

// ── LEGENDARY CHAINS: longest consecutive draw chains ────────────────────────
export function findLegendaryChains(draws) {
  const chains = {}
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    let maxChain = 0, currChain = 0
    draws.forEach(d => {
      if (d.numbers.includes(n)) { currChain++; maxChain = Math.max(maxChain, currChain) }
      else currChain = 0
    })
    chains[n] = maxChain
  }
  return Object.entries(chains)
    .map(([n, c]) => ({ number: +n, chain: c }))
    .sort((a, b) => b.chain - a.chain)
}

// ── ZONE ANALYSIS: 1-9, 10-19, 20-29, 30-39, 40-45 ──────────────────────────
export function analyzeZones(draws) {
  const zones = [
    { label: '1-9',   min: 1,  max: 9  },
    { label: '10-19', min: 10, max: 19 },
    { label: '20-29', min: 20, max: 29 },
    { label: '30-39', min: 30, max: 39 },
    { label: '40-45', min: 40, max: 45 }
  ]
  const last20 = draws.slice(-20)
  return zones.map(z => {
    const count = last20.reduce((sum, d) =>
      sum + d.numbers.filter(n => n >= z.min && n <= z.max).length, 0)
    return { ...z, count, avg: +(count / 20).toFixed(2) }
  })
}

// ── ODD/EVEN DISTRIBUTION ────────────────────────────────────────────────────
export function analyzeOddEven(draws) {
  return draws.map(d => {
    const odd = d.numbers.filter(n => n % 2 !== 0).length
    return { id: d.id, odd, even: 5 - odd }
  })
}

// ── HOT/COLD NUMBERS (last N draws) ──────────────────────────────────────────
export function getHotCold(draws, lastN = 30) {
  const recent = draws.slice(-lastN)
  const freq = buildFreqMap(recent)
  const all = []
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    all.push({ number: n, count: freq[n] || 0 })
  }
  all.sort((a, b) => b.count - a.count)
  return { hot: all.slice(0, 10), cold: all.slice(-10).reverse() }
}

// ── COMPUTE FULL PREDICTION from last draw (plain number[][] format) ─────────
// This is the main daily prediction engine:
// 1. Fires NE/SE diagonal beams from each seed in the last draw into future draws
// 2. Scores each candidate number by: laser beams + corner touches + transition + gap
// Returns ranked list of all non-seed numbers with full breakdown.
export function computeFullPrediction(draws, windowSize = 50) {
  if (!draws || draws.length < 2) return null
  const N = draws.length
  const seeds = (Array.isArray(draws[N - 1]) ? draws[N - 1] : draws[N - 1].numbers).slice().sort((a, b) => a - b)
  const seedSet = new Set(seeds)
  const nextDrawNum = N + 1

  // Build all-time transition matrix (plain arrays)
  const trans = {}, seedCount = {}
  for (let i = 0; i < N - 1; i++) {
    const prev = Array.isArray(draws[i]) ? draws[i] : draws[i].numbers
    const curr = Array.isArray(draws[i + 1]) ? draws[i + 1] : draws[i + 1].numbers
    prev.forEach(from => {
      if (!trans[from]) trans[from] = {}
      seedCount[from] = (seedCount[from] || 0) + 1
      curr.forEach(to => { trans[from][to] = (trans[from][to] || 0) + 1 })
    })
  }

  // W50 transition matrix
  const wStart = Math.max(0, N - windowSize - 1)
  const t50 = {}, sc50 = {}
  for (let i = wStart; i < N - 1; i++) {
    const prev = Array.isArray(draws[i]) ? draws[i] : draws[i].numbers
    const curr = Array.isArray(draws[i + 1]) ? draws[i + 1] : draws[i + 1].numbers
    prev.forEach(from => {
      if (!t50[from]) t50[from] = {}
      sc50[from] = (sc50[from] || 0) + 1
      curr.forEach(to => { t50[from][to] = (t50[from][to] || 0) + 1 })
    })
  }

  // Appearance frequency and gap
  const appear = {}
  const lastSeen = {}
  for (let n = 1; n <= 45; n++) { appear[n] = 0; lastSeen[n] = -1 }
  draws.forEach((d, i) => {
    const nums = Array.isArray(d) ? d : d.numbers
    nums.forEach(n => { appear[n]++; lastSeen[n] = i })
  })
  const gap = {}
  for (let n = 1; n <= 45; n++) gap[n] = N - 1 - lastSeen[n]

  // Laser scoring: fire NE/SE beams from each seed, step 1-15
  // NE: row decreases by step (number = seed - step)
  // SE: row increases by step (number = seed + step)
  // Corner-adjacent: ±1 row from exact beam path
  const laserDirect = {}    // number → count of direct beam hits
  const laserCorner = {}    // number → count of corner-graze hits
  const laserBeamSources = {} // number → { direct: [], corner: [] }
  for (let n = 1; n <= 45; n++) { laserDirect[n] = 0; laserCorner[n] = 0; laserBeamSources[n] = { direct: [], corner: [] } }

  seeds.forEach(seed => {
    for (let step = 1; step <= 15; step++) {
      // NE beam
      const neN = seed - step
      if (neN >= 1) {
        laserDirect[neN]++
        laserBeamSources[neN].direct.push({ seed, dir: 'NE', step })
        // corner: neN-1 and neN+1
        if (neN - 1 >= 1) { laserCorner[neN - 1]++; laserBeamSources[neN - 1].corner.push({ seed, dir: 'NE', step, via: neN }) }
        if (neN + 1 <= 45) { laserCorner[neN + 1]++; laserBeamSources[neN + 1].corner.push({ seed, dir: 'NE', step, via: neN }) }
      }
      // SE beam
      const seN = seed + step
      if (seN <= 45) {
        laserDirect[seN]++
        laserBeamSources[seN].direct.push({ seed, dir: 'SE', step })
        if (seN - 1 >= 1) { laserCorner[seN - 1]++; laserBeamSources[seN - 1].corner.push({ seed, dir: 'SE', step, via: seN }) }
        if (seN + 1 <= 45) { laserCorner[seN + 1]++; laserBeamSources[seN + 1].corner.push({ seed, dir: 'SE', step, via: seN }) }
      }
    }
  })

  // Transition scores from seeds
  const transScore = {}, w50Score = {}
  for (let n = 1; n <= 45; n++) { transScore[n] = 0; w50Score[n] = 0 }
  seeds.forEach(seed => {
    const sc = seedCount[seed] || 1
    Object.entries(trans[seed] || {}).forEach(([to, cnt]) => {
      transScore[+to] += cnt / sc * 100
    })
    const sc5 = sc50[seed] || 1
    Object.entries(t50[seed] || {}).forEach(([to, cnt]) => {
      w50Score[+to] += cnt / sc5 * 100
    })
  })

  // Normalize scores to 0-100
  const maxLaserD = Math.max(...Object.values(laserDirect), 1)
  const maxLaserC = Math.max(...Object.values(laserCorner), 1)
  const maxTrans  = Math.max(...Object.values(transScore), 1)
  const maxW50    = Math.max(...Object.values(w50Score), 1)
  const maxFreq   = Math.max(...Object.values(appear), 1)
  const maxGap    = Math.min(Math.max(...Object.values(gap), 1), 50)

  // Weights: laser is our primary signal
  const W_LASER  = 0.30
  const W_CORNER = 0.15
  const W_TRANS  = 0.25
  const W_W50    = 0.20
  const W_GAP    = 0.07
  const W_FREQ   = 0.03

  const results = []
  for (let n = 1; n <= 45; n++) {
    if (seedSet.has(n)) continue
    const lD  = laserDirect[n] / maxLaserD * 100
    const lC  = laserCorner[n] / maxLaserC * 100
    const tr  = transScore[n]  / maxTrans  * 100
    const w5  = w50Score[n]    / maxW50    * 100
    const fr  = appear[n]      / maxFreq   * 100
    const gp  = Math.min(gap[n], 50) / maxGap * 100
    const final = +(W_LASER * lD + W_CORNER * lC + W_TRANS * tr + W_W50 * w5 + W_GAP * gp + W_FREQ * fr).toFixed(1)

    // Unique beam sources (deduped by seed+dir)
    const directSeeds = [...new Set(laserBeamSources[n].direct.map(b => b.seed))]
    const cornerSeeds = [...new Set(laserBeamSources[n].corner.map(b => b.seed))]

    results.push({
      number: n,
      score: final,
      laserDirect: laserDirect[n],
      laserCorner: laserCorner[n],
      directSeeds,
      cornerSeeds,
      transScore: +tr.toFixed(1),
      w50Score: +w5.toFixed(1),
      freq: +(appear[n] / N * 100).toFixed(1),
      gap: gap[n],
      // Tier: assigned after sort
    })
  }
  results.sort((a, b) => b.score - a.score)

  const maxScore = results[0]?.score || 1
  results.forEach(r => {
    if (r.score >= maxScore * 0.80) r.tier = 'hot'
    else if (r.score >= maxScore * 0.60) r.tier = 'warm'
    else r.tier = 'cold'
  })

  return {
    results,
    seeds,
    nextDrawNum,
    drawNum: N,
    generatedAt: new Date().toISOString()
  }
}

// ── COMPUTE LASER HITS for a selected cell (live) ────────────────────────────
// displayDraws: number[][] (sorted arrays), colIdx, rowNum: 1-45
export function computeLaserHits(displayDraws, colIdx, rowNum) {
  const rowIdx = rowNum - 1  // 0-indexed (number 1 = row 0)
  const numCols = displayDraws.length
  const drawSets = displayDraws.map(d => new Set(Array.isArray(d) ? d : d.numbers))
  console.log('[LaserHits] colIdx=', colIdx, 'rowNum=', rowNum, 'numCols=', numCols)
  // Debug: check step 7 NW and SW
  const nwci = colIdx - 7, nwn = rowNum - 7
  const swci = colIdx - 7, swn = rowNum + 7
  console.log('[LaserHits] NW step7: ci=', nwci, 'n=', nwn, 'draw=', displayDraws[nwci]?.slice ? displayDraws[nwci] : displayDraws[nwci]?.numbers, 'has?', drawSets[nwci]?.has(nwn))
  console.log('[LaserHits] SW step7: ci=', swci, 'n=', swn, 'has?', drawSets[swci]?.has(swn))
  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 }
  }
  const hits = { NE: [], NW: [], SE: [], SW: [] }
  // cornerTouch: every number whose box corner the laser passes through (appeared or not)
  const cornerTouch = { NE: [], NW: [], SE: [], SW: [] }

  Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
    let step = 1
    while (true) {
      const ci = colIdx + dc * step
      const ri = rowIdx + dr * step
      if (ci < 0 || ci >= numCols || ri < 0 || ri >= 45) break
      const n = ri + 1  // number on the diagonal path

      const appeared = drawSets[ci]?.has(n) || false
      // ALL diagonal cells get corner-touch recorded
      cornerTouch[dir].push({ number: n, colIdx: ci, step, appeared, isCornerAdj: false })
      if (appeared) hits[dir].push({ number: n, colIdx: ci, step })

      // The beam corner is SHARED with an adjacent cell (one row outward).
      // For up-going beams (dr=-1): corner also grazes the cell ONE ROW ABOVE (ri-1 → number ri)
      // For down-going beams (dr=+1): corner also grazes the cell ONE ROW BELOW (ri+1 → number ri+2)
      const adjRi = dr < 0 ? ri - 1 : ri + 1
      const adjN  = adjRi + 1  // number at that row
      if (adjRi >= 0 && adjRi < 45) {
        const adjAppeared = drawSets[ci]?.has(adjN) || false
        cornerTouch[dir].push({ number: adjN, colIdx: ci, step, appeared: adjAppeared, isCornerAdj: true })
        if (adjAppeared) hits[dir].push({ number: adjN, colIdx: ci, step })
      }

      step++
    }
  })

  // Which APPEARED numbers show in multiple directions?
  const numDirMap = {}
  Object.entries(hits).forEach(([dir, arr]) => {
    arr.forEach(({ number }) => {
      if (!numDirMap[number]) numDirMap[number] = []
      numDirMap[number].push(dir)
    })
  })

  const multiDir = Object.entries(numDirMap)
    .map(([n, dirs]) => ({ number: +n, dirs, count: dirs.length }))
    .sort((a, b) => b.count - a.count)

  const allHitNumbers = new Set(Object.keys(numDirMap).map(Number))

  return { hits, multiDir, numDirMap, allHitNumbers, cornerTouch }
}

// ── HISTORICAL LASER REPORT for a number across all its appearances ───────────
// For each time `targetNumber` appeared, fire all 4 lasers and record first hit
// per direction. Aggregates: which numbers are most often diagonally adjacent.
export function computeLaserReport(draws, targetNumber) {
  const rowIdx = targetNumber - 1
  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 }
  }
  const hitCounts = {}  // number → { NE, NW, SE, SW, total }
  let totalAppearances = 0

  draws.forEach((draw, ci) => {
    const nums = Array.isArray(draw) ? draw : draw.numbers
    if (!nums.includes(targetNumber)) return
    totalAppearances++

    Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
      let step = 1
      while (true) {
        const newCol = ci + dc * step
        const newRow = rowIdx + dr * step
        if (newCol < 0 || newCol >= draws.length || newRow < 0 || newRow >= 45) break
        const n = newRow + 1
        const colNums = Array.isArray(draws[newCol]) ? draws[newCol] : draws[newCol].numbers
        if (colNums.includes(n)) {
          if (!hitCounts[n]) hitCounts[n] = { NE: 0, NW: 0, SE: 0, SW: 0, total: 0 }
          hitCounts[n][dir]++
          hitCounts[n].total++
          break  // only first hit per direction per appearance
        }
        step++
      }
    })
  })

  const results = Object.entries(hitCounts).map(([n, c]) => ({
    number: +n,
    NE: c.NE, NW: c.NW, SE: c.SE, SW: c.SW,
    total: c.total,
    hitRate: totalAppearances ? +(c.total / totalAppearances * 100).toFixed(1) : 0,
    dirCount: ['NE','NW','SE','SW'].filter(d => c[d] > 0).length
  })).sort((a, b) => b.total - a.total)

  return { results, totalAppearances }
}

// ── LASER × FRIENDSHIP FUSION ────────────────────────────────────────────────
// Walk all 4 laser diagonals from selectedCell in displayDraws.
// For every number the laser "touches" (whether appeared or not),
// cross-check friendship data (same-draw / prev-draw / next-draw co-occurrence)
// using the FULL draw history. Score & rank them. isStrong = matches ≥2 dimensions.
export function computeFusion(allDraws, displayDraws, colIdx, rowNum) {
  const rowIdx = rowNum - 1
  const numCols = displayDraws.length
  const drawSets = displayDraws.map(d => new Set(Array.isArray(d) ? d : d.numbers))

  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 }
  }

  // Step 1: collect every number the laser passes through (edge-touch)
  const touchedMap = {}  // num → { dirs: Set, appeared: bool }
  Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
    let step = 1
    while (true) {
      const ci = colIdx + dc * step
      const ri = rowIdx + dr * step
      if (ci < 0 || ci >= numCols || ri < 0 || ri >= 45) break
      const n = ri + 1
      const appeared = drawSets[ci]?.has(n) || false
      if (!touchedMap[n]) touchedMap[n] = { dirs: new Set(), appeared: false }
      touchedMap[n].dirs.add(dir)
      if (appeared) touchedMap[n].appeared = true
      step++
    }
  })

  // Step 2: build friendship counts for rowNum from full history
  const sameCount = {}, prevCount = {}, nextCount = {}
  let totalApp = 0
  allDraws.forEach((draw, i) => {
    const nums = Array.isArray(draw) ? draw : draw.numbers
    if (!nums.includes(rowNum)) return
    totalApp++
    // same draw companions
    nums.forEach(n => { if (n !== rowNum) sameCount[n] = (sameCount[n] || 0) + 1 })
    // prev draw
    if (i > 0) {
      const prev = Array.isArray(allDraws[i - 1]) ? allDraws[i - 1] : allDraws[i - 1].numbers
      prev.forEach(n => { prevCount[n] = (prevCount[n] || 0) + 1 })
    }
    // next draw
    if (i < allDraws.length - 1) {
      const next = Array.isArray(allDraws[i + 1]) ? allDraws[i + 1] : allDraws[i + 1].numbers
      next.forEach(n => { nextCount[n] = (nextCount[n] || 0) + 1 })
    }
  })

  // Step 3: fuse — only for laser-touched numbers
  const results = Object.entries(touchedMap).map(([nStr, info]) => {
    const n = +nStr
    const same = sameCount[n] || 0
    const prev = prevCount[n] || 0
    const next = nextCount[n] || 0
    const sameRate  = totalApp ? +(same  / totalApp * 100).toFixed(1) : 0
    const prevRate  = totalApp ? +(prev  / totalApp * 100).toFixed(1) : 0
    const nextRate  = totalApp ? +(next  / totalApp * 100).toFixed(1) : 0
    const dims = (same > 0 ? 1 : 0) + (prev > 0 ? 1 : 0) + (next > 0 ? 1 : 0)
    const laserDirCount = info.dirs.size
    const score = same * 3 + prev * 2 + next * 2 + laserDirCount * 5 + (info.appeared ? 10 : 0)
    return {
      number: n,
      same, prev, next,
      sameRate, prevRate, nextRate,
      dims,
      laserDirs: [...info.dirs],
      laserDirCount,
      appeared: info.appeared,
      score,
      isStrong: dims >= 2
    }
  }).sort((a, b) => b.score - a.score)

  return { results, totalApp, seedNumber: rowNum }
}

// ── POST-MORTEM: how many seed→result bonds fired ────────────────────────────
export function postMortem(draws, prevDraw, resultDraw) {
  const matrix = buildTransitionMatrix(draws)
  let fired = 0
  const bonds = []
  prevDraw.numbers.forEach(seed => {
    resultDraw.numbers.forEach(result => {
      const count = (matrix[seed] && matrix[seed][result]) || 0
      if (count > 0) {
        fired++
        bonds.push({ seed, result, count })
      }
    })
  })
  bonds.sort((a, b) => b.count - a.count)
  return { fired, total: 25, bonds }
}

// ── TRIPLE CO-OCCURRENCE CHECK ────────────────────────────────────────────────
export function checkTripleCoOcc(draws, a, b, c) {
  return draws.filter(d => {
    const n = d.numbers
    return n.includes(a) && n.includes(b) && n.includes(c)
  }).length
}
