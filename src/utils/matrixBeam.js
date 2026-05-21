// ── Generic Matrix Beam Analysis (any maxN) ─────────────────────────────
// Originally built for 1-45 (5×9). Now config-driven for:
//   - LottoLens   1-45  → 5×9
//   - Powerball   1-69  → 7×10  (1 unused cell)
//   - PB Ball     1-26  → 5×6   (4 unused cells)
//   - MM Main     1-70  → 7×10  (perfect)
//   - MM Ball     1-25  → 5×5   (perfect)
//
// Direction step-deltas in any W-column grid:
//   NW = -(W+1)  NE = -(W-1)  SE = +(W+1)  SW = +(W-1)
//   N  = -W      S  = +W      E  = +1      W  = -1
//   Mirror = (maxN + 1) - N

export const MATRIX_CONFIGS = {
  45: { cols: 5, rows: 9, maxN: 45, label: 'LottoLens 1-45' },
  69: { cols: 7, rows: 10, maxN: 69, label: 'Powerball 1-69' },
  70: { cols: 7, rows: 10, maxN: 70, label: 'MegaMillions 1-70' },
  26: { cols: 5, rows: 6, maxN: 26, label: 'Powerball Ball 1-26' },
  25: { cols: 5, rows: 5, maxN: 25, label: 'MegaBall 1-25' },
}

export function getMatrixConfig(maxN = 45) {
  return MATRIX_CONFIGS[maxN] || { cols: 5, rows: Math.ceil(maxN / 5), maxN, label: `1-${maxN}` }
}

export const DIR_COLORS = {
  NW: '#a78bfa', NE: '#00d4ff', SE: '#ff6a00', SW: '#00ff88',
  N:  '#fbbf24', S:  '#fbbf24', E:  '#94a3b8', W:  '#94a3b8',
}

export function nToPos(n, cfg) {
  const W = cfg.cols
  return { row: Math.floor((n - 1) / W), col: (n - 1) % W }
}

export function posToN(row, col, cfg) {
  const { cols, rows, maxN } = cfg
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null
  const n = row * cols + col + 1
  if (n < 1 || n > maxN) return null
  return n
}

export function mirror(n, cfg) {
  const m = (cfg.maxN + 1) - n
  return (m >= 1 && m <= cfg.maxN) ? m : null
}

export function getDirs(cfg) {
  const W = cfg.cols
  return {
    NW: { dr: -1, dc: -1, delta: -(W + 1), color: DIR_COLORS.NW },
    NE: { dr: -1, dc: +1, delta: -(W - 1), color: DIR_COLORS.NE },
    SE: { dr: +1, dc: +1, delta: +(W + 1), color: DIR_COLORS.SE },
    SW: { dr: +1, dc: -1, delta: +(W - 1), color: DIR_COLORS.SW },
  }
}

export function getBeamPath(base, dir, cfg, maxSteps) {
  const { row, col } = nToPos(base, cfg)
  const DIRS = getDirs(cfg)
  const { dr, dc } = DIRS[dir]
  const limit = maxSteps ?? Math.max(cfg.cols, cfg.rows)
  const path = []
  for (let s = 1; s <= limit; s++) {
    const n = posToN(row + dr * s, col + dc * s, cfg)
    if (n === null) break
    path.push({ n, step: s })
  }
  return path
}

export function getAllBeams(base, cfg, maxSteps) {
  const out = {}
  for (const dir of ['NW', 'NE', 'SE', 'SW']) {
    out[dir] = getBeamPath(base, dir, cfg, maxSteps)
  }
  return out
}

export function getCardinalPaths(base, cfg, maxSteps = 4) {
  const { row, col } = nToPos(base, cfg)
  const N = [], S = [], E = [], W = []
  for (let s = 1; s <= maxSteps; s++) {
    const nN = posToN(row - s, col, cfg)
    const nS = posToN(row + s, col, cfg)
    const nE = posToN(row, col + s, cfg)
    const nW = posToN(row, col - s, cfg)
    if (nN !== null) N.push({ n: nN, step: s })
    if (nS !== null) S.push({ n: nS, step: s })
    if (nE !== null) E.push({ n: nE, step: s })
    if (nW !== null) W.push({ n: nW, step: s })
  }
  return { N, S, E, W }
}

export function getSeedReach(seed, cfg, depth = 4) {
  const meta = {}
  const add = (n, type, step) => {
    if (n === null || n < 1 || n > cfg.maxN) return
    if (!meta[n]) meta[n] = []
    meta[n].push({ type, step })
  }
  for (const dir of ['NW', 'NE', 'SE', 'SW']) {
    getBeamPath(seed, dir, cfg, depth).forEach(({ n, step }) => add(n, dir, step))
  }
  add(mirror(seed, cfg), 'mirror', 0)
  const card = getCardinalPaths(seed, cfg, depth)
  card.N.forEach(({ n, step }) => add(n, 'N', step))
  card.S.forEach(({ n, step }) => add(n, 'S', step))
  card.E.forEach(({ n, step }) => add(n, 'E', step))
  card.W.forEach(({ n, step }) => add(n, 'W', step))
  return { reach: Object.keys(meta).map(Number), meta }
}

export function predictNextFromMatrix(seeds, cfg, depth = 4) {
  const score = {}, sources = {}, dirCount = {}
  for (const seed of seeds) {
    const { reach, meta } = getSeedReach(seed, cfg, depth)
    for (const n of reach) {
      const reasons = meta[n]
      let w = 0
      reasons.forEach(({ type, step }) => {
        w += type === 'mirror' ? 4 : Math.max(1, 5 - step)
      })
      score[n] = (score[n] || 0) + w
      if (!sources[n]) sources[n] = []
      reasons.forEach(({ type, step }) => {
        sources[n].push({ seed, type, step })
        if (!dirCount[n]) dirCount[n] = {}
        dirCount[n][type] = (dirCount[n][type] || 0) + 1
      })
    }
  }
  return Object.entries(score).map(([nStr, sc]) => {
    const n = +nStr
    const seedsHit = new Set(sources[n].map(s => s.seed)).size
    const finalScore = seedsHit >= 3 ? Math.round(sc * 1.3) : sc
    return {
      n, score: finalScore, rawScore: sc, seedsHit,
      sources: sources[n], dirCount: dirCount[n],
      isMirrorPair: sources[n].some(s => s.type === 'mirror'),
    }
  }).sort((a, b) => b.score - a.score || b.seedsHit - a.seedsHit)
}

export function predictIterativeMatrix(seeds, cfg, { passes = 2, topKReseed = 5, decay = 0.5, depth = 4 } = {}) {
  const totalScore = {}
  const totalSources = {}
  const totalSeedsHit = {}
  const passContrib = {}
  const initialSet = new Set(seeds)

  let currentSeeds = seeds.slice()
  let weight = 1.0

  for (let p = 0; p < passes; p++) {
    if (currentSeeds.length === 0) break
    const passScore = {}
    const passSources = {}
    for (const seed of currentSeeds) {
      const { reach, meta } = getSeedReach(seed, cfg, depth)
      for (const n of reach) {
        const reasons = meta[n]
        let w = 0
        reasons.forEach(({ type, step }) => {
          w += type === 'mirror' ? 4 : Math.max(1, 5 - step)
        })
        passScore[n] = (passScore[n] || 0) + w
        if (!passSources[n]) passSources[n] = []
        reasons.forEach(r => passSources[n].push({ seed, type: r.type, step: r.step, pass: p + 1 }))
      }
    }
    for (const n in passScore) {
      const wScore = passScore[n] * weight
      totalScore[n] = (totalScore[n] || 0) + wScore
      if (!totalSources[n]) totalSources[n] = []
      totalSources[n].push(...passSources[n])
      if (!totalSeedsHit[n]) totalSeedsHit[n] = new Set()
      passSources[n].forEach(s => totalSeedsHit[n].add(s.seed))
      if (!passContrib[n]) passContrib[n] = {}
      passContrib[n][`pass${p + 1}`] = (passContrib[n][`pass${p + 1}`] || 0) + wScore
    }
    const ranked = Object.entries(passScore)
      .map(([n, s]) => ({ n: +n, s }))
      .filter(r => !initialSet.has(r.n))
      .sort((a, b) => b.s - a.s)
    currentSeeds = ranked.slice(0, topKReseed).map(r => r.n)
    weight *= decay
  }

  return Object.entries(totalScore).map(([nStr, sc]) => {
    const n = +nStr
    const seedsHit = totalSeedsHit[n].size
    const finalScore = seedsHit >= 3 ? sc * 1.3 : sc
    return {
      n,
      score: Math.round(finalScore * 10) / 10,
      rawScore: Math.round(sc * 10) / 10,
      seedsHit,
      sources: totalSources[n],
      passContrib: passContrib[n],
      fromOriginal: totalSources[n].some(s => s.pass === 1 && initialSet.has(s.seed)),
      fromChain: totalSources[n].some(s => s.pass > 1),
      isMirrorPair: totalSources[n].some(s => s.type === 'mirror'),
    }
  }).sort((a, b) => b.score - a.score || b.seedsHit - a.seedsHit)
}

// ── Legacy exports for backward compatibility (1-45 defaults) ───────────
export const MATRIX_W = 5
export const MATRIX_H = 9
export const MATRIX_DIRS = {
  NW: { dr: -1, dc: -1, color: '#a78bfa', delta: -6 },
  NE: { dr: -1, dc: +1, color: '#00d4ff', delta: -4 },
  SE: { dr: +1, dc: +1, color: '#ff6a00', delta:  6 },
  SW: { dr: +1, dc: -1, color: '#00ff88', delta:  4 },
}
