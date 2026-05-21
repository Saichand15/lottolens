// ─── POWERBALL PREDICTION ENGINE ─────────────────────────────────────────────
// Powerball: 5 white balls from 1–69 + 1 red Powerball from 1–26

export const PB_MAIN_MAX = 69
export const PB_BALL_MAX = 26

// ── Frequency map for main numbers ───────────────────────────────────────────
export function pbBuildFreqMap(draws) {
  const freq = {}
  draws.forEach(d => d.numbers.forEach(n => { freq[n] = (freq[n] || 0) + 1 }))
  return freq
}

// ── Frequency map for Powerball ───────────────────────────────────────────────
export function pbBuildPBFreqMap(draws) {
  const freq = {}
  draws.forEach(d => { if (d.pb) freq[d.pb] = (freq[d.pb] || 0) + 1 })
  return freq
}

// ── Gap map: draws since last appearance ─────────────────────────────────────
export function pbBuildGapMap(draws) {
  const gaps = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) gaps[n] = draws.length
  draws.forEach((d, i) => {
    d.numbers.forEach(n => { gaps[n] = draws.length - 1 - i })
  })
  return gaps
}

export function pbBuildPBGapMap(draws) {
  const gaps = {}
  for (let n = 1; n <= PB_BALL_MAX; n++) gaps[n] = draws.length
  draws.forEach((d, i) => {
    if (d.pb) gaps[d.pb] = draws.length - 1 - i
  })
  return gaps
}

// ── Transition matrix: what followed each number in the next draw ─────────────
export function pbBuildTransitionMatrix(draws) {
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

// ── Co-occurrence: same draw pairs ───────────────────────────────────────────
export function pbBuildCoOccurrence(draws) {
  const co = {}
  draws.forEach(d => {
    const nums = d.numbers
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${Math.min(nums[i], nums[j])}-${Math.max(nums[i], nums[j])}`
        co[key] = (co[key] || 0) + 1
      }
    }
  })
  return co
}

export function pbGetCoOcc(co, a, b) {
  return co[`${Math.min(a, b)}-${Math.max(a, b)}`] || 0
}

// ── Hot/Cold analysis ─────────────────────────────────────────────────────────
export function pbGetHotCold(draws, lastN = 20) {
  const recent = draws.slice(-lastN)
  const freq = pbBuildFreqMap(recent)
  const all = []
  for (let n = 1; n <= PB_MAIN_MAX; n++) all.push({ number: n, count: freq[n] || 0 })
  all.sort((a, b) => b.count - a.count)
  return { hot: all.slice(0, 10), cold: all.slice(-10).reverse() }
}

export function pbGetHotColdPB(draws, lastN = 20) {
  const recent = draws.slice(-lastN)
  const freq = pbBuildPBFreqMap(recent)
  const all = []
  for (let n = 1; n <= PB_BALL_MAX; n++) all.push({ number: n, count: freq[n] || 0 })
  all.sort((a, b) => b.count - a.count)
  return { hot: all.slice(0, 5), cold: all.slice(-5).reverse() }
}

// ── Zone analysis for main balls ──────────────────────────────────────────────
export function pbAnalyzeZones(draws) {
  const zones = [
    { label: '1–9',   min: 1,  max: 9  },
    { label: '10–19', min: 10, max: 19 },
    { label: '20–29', min: 20, max: 29 },
    { label: '30–39', min: 30, max: 39 },
    { label: '40–49', min: 40, max: 49 },
    { label: '50–59', min: 50, max: 59 },
    { label: '60–69', min: 60, max: 69 }
  ]
  const last20 = draws.slice(-20)
  return zones.map(z => {
    const count = last20.reduce((sum, d) =>
      sum + d.numbers.filter(n => n >= z.min && n <= z.max).length, 0)
    return { ...z, count, avg: +(count / 20).toFixed(2) }
  })
}

// ── Position frequency ────────────────────────────────────────────────────────
export function pbBuildPositionFreq(draws) {
  const pf = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) pf[n] = [0, 0, 0, 0, 0]
  draws.forEach(d => {
    d.numbers.forEach((n, pos) => { pf[n][pos]++ })
  })
  return pf
}

// ── getSenders: numbers that transitioned TO target in the next draw ──────────
export function pbGetSenders(draws, targetDrawIdx, targetNumber, matrix) {
  if (!matrix) {
    matrix = pbBuildTransitionMatrix(draws)
  }
  const senders = []
  Object.entries(matrix).forEach(([from, toMap]) => {
    if (toMap[targetNumber]) senders.push({ number: +from, count: toMap[targetNumber] })
  })
  return senders.sort((a, b) => b.count - a.count)
}

// ── getReceivers: numbers target transitioned TO ──────────────────────────────
export function pbGetReceivers(draws, targetDrawIdx, targetNumber, matrix) {
  if (!matrix) {
    matrix = pbBuildTransitionMatrix(draws)
  }
  const toMap = matrix[targetNumber] || {}
  return Object.entries(toMap)
    .map(([n, c]) => ({ number: +n, count: c }))
    .sort((a, b) => b.count - a.count)
}

// ── Get all appearances of a number ──────────────────────────────────────────
export function pbGetNumberAppearances(draws, number) {
  return draws
    .map((d, i) => ({ drawIdx: i, drawNum: d.id, numbers: d.numbers, pb: d.pb }))
    .filter(d => d.numbers.includes(number))
}

// ── findLegendaryChains: longest consecutive streaks ─────────────────────────
export function pbFindLegendaryChains(draws) {
  const chains = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) {
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

// ── checkTripleCoOcc: draws where all 3 numbers appeared together ─────────────
export function pbCheckTripleCoOcc(draws, a, b, c) {
  return draws.filter(d => d.numbers.includes(a) && d.numbers.includes(b) && d.numbers.includes(c)).length
}

// ── postMortem: how many seed→result bonds fired ──────────────────────────────
export function pbPostMortem(draws, prevDraw, resultDraw) {
  const matrix = pbBuildTransitionMatrix(draws)
  const bonds = []
  prevDraw.numbers.forEach(seed => {
    resultDraw.numbers.forEach(result => {
      const count = (matrix[seed] && matrix[seed][result]) || 0
      if (count > 0) bonds.push({ seed, result, count })
    })
  })
  bonds.sort((a, b) => b.count - a.count)
  return { fired: bonds.length, total: 25, bonds }
}

// ── computeLaserHits: all 4-direction beams from a selected cell ──────────────
// displayDraws: number[][] (sorted arrays), colIdx = selected column, rowNum = 1-maxNumber
export function pbComputeLaserHits(displayDraws, colIdx, rowNum, maxNumber = PB_MAIN_MAX) {
  const rowIdx = rowNum - 1
  const numCols = displayDraws.length
  const drawSets = displayDraws.map(d => new Set(Array.isArray(d) ? d : d.numbers))

  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 }
  }
  const hits = { NE: [], NW: [], SE: [], SW: [] }
  const cornerTouch = { NE: [], NW: [], SE: [], SW: [] }

  Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
    let step = 1
    while (true) {
      const ci = colIdx + dc * step
      const ri = rowIdx + dr * step
      if (ci < 0 || ci >= numCols || ri < 0 || ri >= maxNumber) break
      const n = ri + 1
      const appeared = drawSets[ci]?.has(n) || false
      cornerTouch[dir].push({ number: n, colIdx: ci, step, appeared, isCornerAdj: false })
      if (appeared) hits[dir].push({ number: n, colIdx: ci, step })
      const adjRi = dr < 0 ? ri - 1 : ri + 1
      const adjN  = adjRi + 1
      if (adjRi >= 0 && adjRi < maxNumber) {
        const adjAppeared = drawSets[ci]?.has(adjN) || false
        cornerTouch[dir].push({ number: adjN, colIdx: ci, step, appeared: adjAppeared, isCornerAdj: true })
        if (adjAppeared) hits[dir].push({ number: adjN, colIdx: ci, step })
      }
      step++
    }
  })

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

// ── computeLaserReport: historical laser analysis for one number ──────────────
export function pbComputeLaserReport(draws, targetNumber) {
  const rowIdx = targetNumber - 1
  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 }
  }
  const hitCounts = {}
  let totalAppearances = 0

  draws.forEach((draw, ci) => {
    const nums = draw.numbers
    if (!nums.includes(targetNumber)) return
    totalAppearances++
    Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
      let step = 1
      while (true) {
        const newCol = ci + dc * step
        const newRow = rowIdx + dr * step
        if (newCol < 0 || newCol >= draws.length || newRow < 0 || newRow >= PB_MAIN_MAX) break
        const n = newRow + 1
        if (draws[newCol].numbers.includes(n)) {
          if (!hitCounts[n]) hitCounts[n] = { NE: 0, NW: 0, SE: 0, SW: 0, total: 0 }
          hitCounts[n][dir]++
          hitCounts[n].total++
          break
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

// ── computeFusion: laser × friendship fusion ──────────────────────────────────
export function pbComputeFusion(allDraws, displayDraws, colIdx, rowNum) {
  const rowIdx = rowNum - 1
  const numCols = displayDraws.length
  const drawSets = displayDraws.map(d => new Set(Array.isArray(d) ? d : d.numbers))

  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 }
  }

  const touchedMap = {}
  Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
    let step = 1
    while (true) {
      const ci = colIdx + dc * step
      const ri = rowIdx + dr * step
      if (ci < 0 || ci >= numCols || ri < 0 || ri >= PB_MAIN_MAX) break
      const n = ri + 1
      const appeared = drawSets[ci]?.has(n) || false
      if (!touchedMap[n]) touchedMap[n] = { dirs: new Set(), appeared: false }
      touchedMap[n].dirs.add(dir)
      if (appeared) touchedMap[n].appeared = true
      step++
    }
  })

  const sameCount = {}, prevCount = {}, nextCount = {}
  let totalApp = 0
  allDraws.forEach((draw, i) => {
    if (!draw.numbers.includes(rowNum)) return
    totalApp++
    draw.numbers.forEach(n => { if (n !== rowNum) sameCount[n] = (sameCount[n] || 0) + 1 })
    if (i > 0) allDraws[i - 1].numbers.forEach(n => { prevCount[n] = (prevCount[n] || 0) + 1 })
    if (i < allDraws.length - 1) allDraws[i + 1].numbers.forEach(n => { nextCount[n] = (nextCount[n] || 0) + 1 })
  })

  const results = Object.entries(touchedMap).map(([nStr, info]) => {
    const n = +nStr
    const same = sameCount[n] || 0
    const prev = prevCount[n] || 0
    const next = nextCount[n] || 0
    const sameRate = totalApp ? +(same / totalApp * 100).toFixed(1) : 0
    const prevRate = totalApp ? +(prev / totalApp * 100).toFixed(1) : 0
    const nextRate = totalApp ? +(next / totalApp * 100).toFixed(1) : 0
    const dims = (same > 0 ? 1 : 0) + (prev > 0 ? 1 : 0) + (next > 0 ? 1 : 0)
    const laserDirCount = info.dirs.size
    const score = same * 3 + prev * 2 + next * 2 + laserDirCount * 5 + (info.appeared ? 10 : 0)
    return {
      number: n, same, prev, next, sameRate, prevRate, nextRate,
      dims, laserDirs: [...info.dirs], laserDirCount,
      appeared: info.appeared, score, isStrong: dims >= 2
    }
  }).sort((a, b) => b.score - a.score)

  return { results, totalApp, seedNumber: rowNum }
}

// ── FULL PREDICTION: score every main ball ────────────────────────────────────
export function pbComputeFullPrediction(draws, windowSize = 50) {
  if (!draws || draws.length < 2) return null
  const N = draws.length
  const seeds = draws[N - 1].numbers.slice().sort((a, b) => a - b)
  const seedSet = new Set(seeds)

  // All-time transition
  const trans = {}, seedCount = {}
  for (let i = 0; i < N - 1; i++) {
    draws[i].numbers.forEach(from => {
      if (!trans[from]) trans[from] = {}
      seedCount[from] = (seedCount[from] || 0) + 1
      draws[i + 1].numbers.forEach(to => { trans[from][to] = (trans[from][to] || 0) + 1 })
    })
  }

  // Window-50 transition
  const wStart = Math.max(0, N - windowSize - 1)
  const t50 = {}, sc50 = {}
  for (let i = wStart; i < N - 1; i++) {
    draws[i].numbers.forEach(from => {
      if (!t50[from]) t50[from] = {}
      sc50[from] = (sc50[from] || 0) + 1
      draws[i + 1].numbers.forEach(to => { t50[from][to] = (t50[from][to] || 0) + 1 })
    })
  }

  // Appearance & gap
  const appear = {}, lastSeen = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) { appear[n] = 0; lastSeen[n] = -1 }
  draws.forEach((d, i) => d.numbers.forEach(n => { appear[n]++; lastSeen[n] = i }))
  const gap = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) gap[n] = N - 1 - lastSeen[n]

  // Co-occurrence from seeds (same as lotto engine)
  const co = pbBuildCoOccurrence(draws)

  // Laser beams NE+SE from each seed (step 1-20, wider for 1-69 range)
  const laserDirect = {}, laserCorner = {}, laserBeamSources = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) {
    laserDirect[n] = 0; laserCorner[n] = 0
    laserBeamSources[n] = { direct: [], corner: [] }
  }
  seeds.forEach(seed => {
    for (let step = 1; step <= 20; step++) {
      const ne = seed - step
      if (ne >= 1) {
        laserDirect[ne]++
        laserBeamSources[ne].direct.push({ seed, dir: 'NE', step })
        if (ne - 1 >= 1) { laserCorner[ne - 1]++; laserBeamSources[ne - 1].corner.push({ seed, dir: 'NE', step, via: ne }) }
        if (ne + 1 <= PB_MAIN_MAX) { laserCorner[ne + 1]++; laserBeamSources[ne + 1].corner.push({ seed, dir: 'NE', step, via: ne }) }
      }
      const se = seed + step
      if (se <= PB_MAIN_MAX) {
        laserDirect[se]++
        laserBeamSources[se].direct.push({ seed, dir: 'SE', step })
        if (se - 1 >= 1) { laserCorner[se - 1]++; laserBeamSources[se - 1].corner.push({ seed, dir: 'SE', step, via: se }) }
        if (se + 1 <= PB_MAIN_MAX) { laserCorner[se + 1]++; laserBeamSources[se + 1].corner.push({ seed, dir: 'SE', step, via: se }) }
      }
    }
  })

  // Transition scores
  const transScore = {}, w50Score = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) { transScore[n] = 0; w50Score[n] = 0 }
  seeds.forEach(seed => {
    const sc = seedCount[seed] || 1
    Object.entries(trans[seed] || {}).forEach(([to, cnt]) => { transScore[+to] += cnt / sc * 100 })
    const sc5 = sc50[seed] || 1
    Object.entries(t50[seed] || {}).forEach(([to, cnt]) => { w50Score[+to] += cnt / sc5 * 100 })
  })

  // Co-occurrence score: how often does each candidate appear with the seeds
  const coScore = {}
  for (let n = 1; n <= PB_MAIN_MAX; n++) {
    coScore[n] = seeds.reduce((sum, seed) => sum + pbGetCoOcc(co, n, seed), 0)
  }

  const maxLaserD = Math.max(...Object.values(laserDirect), 1)
  const maxLaserC = Math.max(...Object.values(laserCorner), 1)
  const maxTrans  = Math.max(...Object.values(transScore), 1)
  const maxW50    = Math.max(...Object.values(w50Score), 1)
  const maxFreq   = Math.max(...Object.values(appear), 1)
  const maxGap    = Math.min(Math.max(...Object.values(gap), 1), 80)
  const maxCo     = Math.max(...Object.values(coScore), 1)

  // Same weights as lotto engine + co-occurrence
  const W_LASER = 0.28, W_CORNER = 0.14, W_TRANS = 0.23, W_W50 = 0.18, W_GAP = 0.07, W_FREQ = 0.03, W_CO = 0.07

  const results = []
  for (let n = 1; n <= PB_MAIN_MAX; n++) {
    if (seedSet.has(n)) continue
    const lD = laserDirect[n] / maxLaserD * 100
    const lC = laserCorner[n] / maxLaserC * 100
    const tr = transScore[n]  / maxTrans  * 100
    const w5 = w50Score[n]    / maxW50    * 100
    const fr = appear[n]      / maxFreq   * 100
    const gp = Math.min(gap[n], 80) / maxGap * 100
    const co_ = coScore[n]    / maxCo     * 100
    const final = +(W_LASER * lD + W_CORNER * lC + W_TRANS * tr + W_W50 * w5 + W_GAP * gp + W_FREQ * fr + W_CO * co_).toFixed(1)

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
      coScore: coScore[n],
      freq: +(appear[n] / N * 100).toFixed(1),
      gap: gap[n],
    })
  }
  results.sort((a, b) => b.score - a.score)
  const maxScore = results[0]?.score || 1
  results.forEach(r => {
    r.tier = r.score >= maxScore * 0.80 ? 'hot' : r.score >= maxScore * 0.60 ? 'warm' : 'cold'
  })

  return { results, seeds, nextDrawNum: N + 1, drawNum: N, generatedAt: new Date().toISOString() }
}

// ── POWERBALL prediction: score each PB number 1–26 ──────────────────────────
export function pbPredictPowerball(draws) {
  if (!draws || draws.length < 2) return []
  const N = draws.length
  const pbFreq = {}, pbLastSeen = {}
  for (let n = 1; n <= PB_BALL_MAX; n++) { pbFreq[n] = 0; pbLastSeen[n] = -1 }
  draws.forEach((d, i) => {
    if (d.pb) { pbFreq[d.pb]++; pbLastSeen[d.pb] = i }
  })
  const pbGap = {}
  for (let n = 1; n <= PB_BALL_MAX; n++) pbGap[n] = N - 1 - pbLastSeen[n]

  // PB transition: what PB followed after prev PB
  const pbTrans = {}
  for (let i = 1; i < N; i++) {
    const from = draws[i - 1].pb, to = draws[i].pb
    if (from && to) {
      if (!pbTrans[from]) pbTrans[from] = {}
      pbTrans[from][to] = (pbTrans[from][to] || 0) + 1
    }
  }

  const lastPB = draws[N - 1].pb
  const scores = []
  for (let n = 1; n <= PB_BALL_MAX; n++) {
    const transScore = lastPB ? (pbTrans[lastPB]?.[n] || 0) * 3 : 0
    const gapBonus = pbGap[n] > 10 ? pbGap[n] * 1.5 : pbGap[n] > 5 ? pbGap[n] : 0
    const freqScore = pbFreq[n]
    scores.push({ number: n, score: +(transScore + gapBonus + freqScore).toFixed(1), gap: pbGap[n], freq: pbFreq[n] })
  }
  return scores.sort((a, b) => b.score - a.score)
}

// ── Odd/Even distribution ─────────────────────────────────────────────────────
export function pbAnalyzeOddEven(draws) {
  return draws.slice(-30).map(d => {
    const odd = d.numbers.filter(n => n % 2 !== 0).length
    return { id: d.id, odd, even: 5 - odd }
  })
}

// ── Sum range analysis ────────────────────────────────────────────────────────
export function pbAnalyzeSums(draws) {
  const sums = draws.map(d => d.numbers.reduce((a, b) => a + b, 0))
  const avg = Math.round(sums.reduce((a, b) => a + b, 0) / sums.length)
  const min = Math.min(...sums)
  const max = Math.max(...sums)
  return { sums, avg, min, max }
}
