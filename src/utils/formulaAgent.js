const MAX_DEFAULT = 45
const DIRS = { NW: [-1, -1], NE: [1, -1], SW: [-1, 1], SE: [1, 1] }
const ZONES = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 45]]

function normalizeDraw(draw) {
  return Array.isArray(draw) ? draw.map(Number).sort((a, b) => a - b) : (draw?.numbers || []).map(Number).sort((a, b) => a - b)
}

function wrap(raw, maxNum = MAX_DEFAULT) {
  if (!Number.isFinite(raw)) return raw
  let n = Math.round(raw)
  while (n < 1) n += maxNum
  while (n > maxNum) n -= maxNum
  return n
}

function zoneSignature(draw) {
  return ZONES.map(([a, b]) => draw.filter(n => n >= a && n <= b).length).join('')
}

function sum(draw) {
  return draw.reduce((a, b) => a + b, 0)
}

function add(map, key, pts, detail) {
  if (!map.has(key)) map.set(key, { key, pts: 0, details: [] })
  const r = map.get(key)
  r.pts += pts
  if (detail) r.details.push(detail)
}

function beamStats(history, seed, maxNum = MAX_DEFAULT) {
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

function formulaDefs(s, maxNum = MAX_DEFAULT) {
  const S = s.S, NW = s.NW, NWa = s.NW_app, NWm = s.NW_miss, SW = s.SW, SWa = s.SW_app, SWm = s.SW_miss, ct = s.ctTotal
  const appSum = NWa + SWa
  const appDiff = SWa - NWa
  const missDiff = NWm - SWm
  const defs = [
    ['S+1', S + 1, 10], ['S-1', S - 1, 10], ['S+2', S + 2, 8], ['S-2', S - 2, 8],
    ['S+5', S + 5, 12], ['S-5', S - 5, 10], ['S+7', S + 7, 11], ['S-7', S - 7, 9], ['S+10', S + 10, 13], ['S-10', S - 10, 13],
    ['S+ct', S + ct, 15], ['S-ct', S - ct, 15], ['S+ct-1', S + ct - 1, 13], ['S-ct+1', S - ct + 1, 13], ['ct-S', ct - S, 12],
    ['S+SWapp', S + SWa, 13], ['S-SWapp', S - SWa, 13], ['S+NWapp', S + NWa, 12], ['S-NWapp', S - NWa, 12],
    ['S+appSum', S + appSum, 12], ['S-appSum', S - appSum, 11], ['S+appDiff', S + appDiff, 11], ['S-appDiff', S - appDiff, 11],
    ['NWapp+ct', NWa + ct, 10], ['SWapp+ct', SWa + ct, 10], ['NWapp+SWapp+ct', NWa + SWa + ct, 11],
    ['SW-SWapp', SW - SWa, 12], ['SW+SWapp', SW + SWa, 11], ['SW-SWmiss', SW - SWm, 12], ['SW+SWmiss', SW + SWm, 9], ['SWmiss', SWm, 12],
    ['SW-NWapp', SW - NWa, 11], ['SW+NWapp', SW + NWa, 10], ['SW-ct', SW - ct, 12], ['SW+ct', SW + ct, 10],
    ['NW-SWapp', NW - SWa, 12], ['NW+SWapp', NW + SWa, 10], ['NW-NWapp', NW - NWa, 11], ['NW+NWapp', NW + NWa, 10], ['NW-SWmiss', NW - SWm, 12], ['NW+NWmiss', NW + NWm, 9], ['NW-ct', NW - ct, 13], ['NW+ct', NW + ct, 11],
    ['NW-S', NW - S, 11], ['S-NW', S - NW, 11], ['SW-S', SW - S, 11], ['S-SW', S - SW, 11],
    ['NWmiss-SWmiss', NWm - SWm, 10], ['SWmiss-NWmiss', SWm - NWm, 10], ['ct+missDiff', ct + missDiff, 9], ['ct-missDiff', ct - missDiff, 9], ['appSum-missDiff', appSum - missDiff, 9], ['missDiff+appDiff', missDiff + appDiff, 9],
  ]
  return defs.map(([name, raw, weight]) => ({ seed: S, name, raw, number: wrap(raw, maxNum), weight, wrapped: wrap(raw, maxNum) !== raw }))
}

function regimeKey(draw) {
  const sig = zoneSignature(draw)
  const s = sum(draw)
  const lows = draw.filter(n => n <= 9).length
  const edges = draw.filter(n => n >= 40).length
  const level = s <= 80 ? 'lowSum' : s >= 145 ? 'highSum' : 'midSum'
  const edgeMode = edges ? 'edge' : 'noEdge'
  const lowMode = lows >= 2 ? 'lowHeavy' : lows === 0 ? 'noLow' : 'lowMix'
  return `${sig}|${level}|${lowMode}|${edgeMode}`
}

function transitionShape(prev, next) {
  return `${zoneSignature(prev)}->${zoneSignature(next)}`
}

function buildFormulaHits(history, maxNum) {
  const rows = []
  for (let i = 20; i < history.length - 1; i++) {
    const prevHistory = history.slice(0, i + 1)
    const prev = history[i]
    const next = history[i + 1]
    const actual = new Set(next)
    const stats = prev.map(seed => beamStats(prevHistory, seed, maxNum))
    const formulas = stats.flatMap(s => formulaDefs(s, maxNum))
    const byFormula = new Map()
    const byNumber = new Map()

    formulas.forEach(f => {
      const hit = actual.has(f.number)
      const family = f.name
      const key = `${family}`
      add(byFormula, key, hit ? 1 : 0, { ...f, hit })
      add(byNumber, f.number, f.weight, { ...f, hit })
    })

    rows.push({
      index: i,
      drawNum: i + 1,
      prev,
      next,
      prevSig: zoneSignature(prev),
      nextSig: zoneSignature(next),
      regime: regimeKey(prev),
      transition: transitionShape(prev, next),
      formulas,
      byFormula,
      byNumber,
    })
  }
  return rows
}

function scoreFormulaMemory(rows, currentRegime, currentSig, maxLookback = 180) {
  const memory = new Map()
  const recentRows = rows.slice(-maxLookback)
  recentRows.forEach((row, rowIdx) => {
    const recency = 0.72 + (rowIdx / Math.max(recentRows.length - 1, 1)) * 0.55
    const regimeBoost = row.regime === currentRegime ? 2.6 : row.prevSig === currentSig ? 1.75 : 1
    const nextSigBoost = row.prevSig === currentSig ? 1.2 : 1
    row.formulas.forEach(f => {
      const hit = row.next.includes(f.number)
      const near = row.next.some(n => Math.abs(n - f.number) <= 1)
      const pts = (hit ? 8 : near ? 1.7 : -0.18) * recency * regimeBoost * nextSigBoost
      const key = f.name
      add(memory, key, pts, { drawNum: row.drawNum, number: f.number, hit, near, prev: row.prev, next: row.next, transition: row.transition })
    })
  })

  return [...memory.values()]
    .map(r => {
      const hits = r.details.filter(d => d.hit).length
      const near = r.details.filter(d => d.near).length
      const tries = r.details.length
      return {
        name: r.key,
        score: r.pts,
        hits,
        near,
        tries,
        hitRate: tries ? hits / tries : 0,
        examples: r.details.filter(d => d.hit).slice(-5),
      }
    })
    .sort((a, b) => b.score - a.score || b.hitRate - a.hitRate)
}

function laserDecision(history, seeds, maxNum = MAX_DEFAULT) {
  // The live laser is the decision gate: formulas only become serious when
  // the current draw's beams touch, graze, or bridge into that candidate.
  // From the latest draw we can read backward NW/SW paths through history.
  const ci = history.length - 1
  const score = new Map()
  const sets = history.map(d => new Set(d))
  const addLaser = (n, pts, detail) => {
    if (n < 1 || n > maxNum || !Number.isFinite(pts)) return
    add(score, n, pts, detail)
  }

  seeds.forEach(seed => {
    ;[
      ['NW', -1, -1],
      ['SW', -1, +1],
    ].forEach(([dir, dc, dr]) => {
      for (let step = 1; step <= 100; step++) {
        const c = ci + dc * step
        const n = seed + dr * step
        if (c < 0 || n < 1 || n > maxNum) break
        const drawSet = sets[c]
        const stepWeight = Math.max(1.6, 8 - step * 0.16)

        if (drawSet?.has(n)) {
          addLaser(n, 26 * stepWeight, { seed, dir, step, type: 'direct', touch: n, drawIndex: c })
          addLaser(n - 1, 10 * stepWeight, { seed, dir, step, type: 'direct-1', touch: n, drawIndex: c })
          addLaser(n + 1, 10 * stepWeight, { seed, dir, step, type: 'direct+1', touch: n, drawIndex: c })
          addLaser(seed - step, 8 * stepWeight, { seed, dir, step, type: 'stepMirror-', touch: n, drawIndex: c })
          addLaser(seed + step, 8 * stepWeight, { seed, dir, step, type: 'stepMirror+', touch: n, drawIndex: c })
        }

        ;[n - 1, n + 1].forEach(corner => {
          if (corner < 1 || corner > maxNum || !drawSet?.has(corner)) return
          addLaser(corner, 22 * stepWeight, { seed, dir, step, type: 'corner', touch: corner, drawIndex: c })
          addLaser(corner - 1, 8 * stepWeight, { seed, dir, step, type: 'corner-1', touch: corner, drawIndex: c })
          addLaser(corner + 1, 8 * stepWeight, { seed, dir, step, type: 'corner+1', touch: corner, drawIndex: c })
        })
      }
    })
  })

  // Laser convergence: if a number is reached by multiple seeds/directions,
  // it is more important than a single formula score.
  return [...score.values()]
    .map(r => {
      const seedsHit = new Set(r.details.map(d => d.seed)).size
      const dirsHit = new Set(r.details.map(d => d.dir)).size
      const direct = r.details.filter(d => d.type === 'direct').length
      const corner = r.details.filter(d => String(d.type).startsWith('corner')).length
      const convergence = 1 + Math.min(0.9, seedsHit * 0.18 + dirsHit * 0.12 + direct * 0.08 + corner * 0.05)
      return {
        number: Number(r.key),
        score: +(r.pts * convergence).toFixed(1),
        seedsHit,
        dirsHit,
        direct,
        corner,
        details: r.details,
      }
    })
    .sort((a, b) => b.score - a.score || b.seedsHit - a.seedsHit || a.number - b.number)
    .map((r, idx) => ({ ...r, rank: idx + 1 }))
}

function buildSpiderMemory(history, maxNum = MAX_DEFAULT) {
  const transition = Array.from({ length: maxNum + 1 }, () => new Map())
  const coDraw = Array.from({ length: maxNum + 1 }, () => new Map())
  const diffMotion = new Map()
  const lastSeen = Array(maxNum + 1).fill(-1)

  history.forEach((draw, idx) => {
    draw.forEach(n => { lastSeen[n] = idx })
    for (let i = 0; i < draw.length; i++) {
      for (let j = i + 1; j < draw.length; j++) {
        const a = draw[i], b = draw[j]
        coDraw[a].set(b, (coDraw[a].get(b) || 0) + 1)
        coDraw[b].set(a, (coDraw[b].get(a) || 0) + 1)
        const d = Math.abs(a - b)
        diffMotion.set(d, (diffMotion.get(d) || 0) + 1)
      }
    }
  })

  for (let i = 0; i < history.length - 1; i++) {
    history[i].forEach(from => {
      history[i + 1].forEach(to => {
        transition[from].set(to, (transition[from].get(to) || 0) + 1)
      })
    })
  }

  return { transition, coDraw, diffMotion, lastSeen }
}

function spiderWalk(history, seeds, maxNum = MAX_DEFAULT) {
  // This is the moving insect: it does not only rank formulas. It walks the
  // current grid from seed -> live laser touch/corner -> ±1 bridge -> historical
  // transition/friend/pending number -> shape seat. That is the "number talking"
  // layer the static formulas were missing.
  const laser = laserDecision(history, seeds, maxNum)
  const memory = buildSpiderMemory(history, maxNum)
  const currentSet = new Set(seeds)
  const currentDiffs = new Set()
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) currentDiffs.add(Math.abs(seeds[i] - seeds[j]))
  }

  const score = new Map()
  const addSpider = (n, pts, path) => {
    if (n < 1 || n > maxNum || !Number.isFinite(pts)) return
    add(score, n, pts, path)
  }

  laser.slice(0, 35).forEach(l => {
    const base = l.score * (l.rank <= 5 ? 1.15 : l.rank <= 12 ? 0.95 : 0.72)
    addSpider(l.number, base, { type: 'liveLaser', number: l.number, laserRank: l.rank, laserScore: l.score, seedsHit: l.seedsHit, direct: l.direct, corner: l.corner })
    l.details.slice(0, 10).forEach(d => {
      addSpider(l.number - 1, base * 0.18, { type: 'laserMinusOne', from: l.number, seed: d.seed, dir: d.dir, step: d.step })
      addSpider(l.number + 1, base * 0.18, { type: 'laserPlusOne', from: l.number, seed: d.seed, dir: d.dir, step: d.step })
      addSpider(d.seed + d.step, base * 0.13, { type: 'seedPlusStep', from: d.seed, step: d.step, via: l.number })
      addSpider(d.seed - d.step, base * 0.13, { type: 'seedMinusStep', from: d.seed, step: d.step, via: l.number })
    })
  })

  seeds.forEach(seed => {
    ;[...memory.transition[seed].entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .forEach(([to, count]) => addSpider(to, count * 58, { type: 'transitionTalk', from: seed, to, count }))

    ;[...memory.coDraw[seed].entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .forEach(([friend, count]) => {
        const gap = history.length - 1 - (memory.lastSeen[friend] ?? -1)
        const pendingBoost = currentSet.has(friend) ? 0.35 : 1 + Math.min(1.4, Math.max(0, gap - 4) * 0.08)
        addSpider(friend, count * 8 * pendingBoost, { type: 'pendingFriend', from: seed, friend, count, gap })
      })
  })

  const sig = zoneSignature(seeds)
  const hasEdge = seeds.some(n => n >= 40)
  const lowCount = seeds.filter(n => n <= 9).length
  const teenCount = seeds.filter(n => n >= 10 && n <= 19).length
  const midCount = seeds.filter(n => n >= 20 && n <= 29).length
  if (sig === '03101' || (hasEdge && lowCount === 0 && teenCount >= 2 && midCount >= 1)) {
    // When no-low + teen cluster + edge appears, spider often climbs into
    // two 20s and three 30s. This catches paths like 21->22, 21+6=27,
    // 10/18/19 laser to 32/34, and 40-1=39.
    seeds.forEach(seed => {
      if (seed >= 10 && seed <= 19) {
        ;[[seed + 9, 520], [seed + 13, 680], [seed + 14, 560], [seed + 16, 420], [seed + 20, 520], [seed + 21, 680]]
          .forEach(([n, w]) => addSpider(n, w, { type: 'highContinuationTeen', seed, to: n }))
      }
      if (seed >= 20 && seed <= 29) {
        ;[[seed + 1, 780], [seed + 6, 1280], [seed + 11, 640], [seed + 13, 820], [seed + 18, 1180]]
          .forEach(([n, w]) => addSpider(n, w, { type: 'highContinuationMid', seed, to: n }))
      }
      if (seed >= 40) {
        ;[[seed - 1, 1680], [seed - 6, 980], [seed - 8, 1040], [seed - 13, 1280], [seed - 18, 760]]
          .forEach(([n, w]) => addSpider(n, w, { type: 'edgeBackTalk', seed, to: n }))
      }
    })
  }

  if (sig === '00230') {
    // High cluster collapse: 22,27,32,34,39-like shapes can fall hard into
    // two lows, two teens, one low-20. The signal is visible in NW/stepMirror
    // paths: 39->4/3, 34->11/17, 32->20, 22->17/20.
    seeds.forEach(seed => {
      if (seed >= 20 && seed <= 29) {
        ;[[seed - 2, 1160], [seed - 5, 1040], [seed - 10, 860], [seed - 11, 1320], [seed - 18, 1560], [seed - 19, 1480], [seed - 23, 980], [seed - 24, 920]]
          .forEach(([n, w]) => addSpider(n, w, { type: 'highClusterCollapseMid', seed, to: n }))
      }
      if (seed >= 30 && seed <= 39) {
        ;[[seed - 12, 1220], [seed - 14, 980], [seed - 15, 1120], [seed - 17, 940], [seed - 18, 1360], [seed - 21, 1240], [seed - 28, 1680], [seed - 30, 1760], [seed - 31, 1880], [seed - 35, 980], [seed - 36, 940]]
          .forEach(([n, w]) => addSpider(n, w, { type: 'highClusterCollapseHigh', seed, to: n }))
      }
    })
  }

  ;[...currentDiffs].forEach(d => {
    const freq = memory.diffMotion.get(d) || 1
    seeds.forEach(seed => {
      addSpider(seed + d, Math.min(240, freq * 3.2), { type: 'sameDrawDiffPlus', seed, diff: d, freq })
      addSpider(seed - d, Math.min(240, freq * 3.2), { type: 'sameDrawDiffMinus', seed, diff: d, freq })
    })
  })

  return [...score.values()]
    .map(r => {
      const paths = r.details || []
      const types = new Set(paths.map(p => p.type))
      const talkers = new Set(paths.flatMap(p => [p.from, p.seed].filter(Number.isFinite)))
      const liveLaser = paths.find(p => p.type === 'liveLaser')
      const confidence = r.pts * (1 + Math.min(0.85, types.size * 0.12 + talkers.size * 0.08))
      return {
        number: Number(r.key),
        score: +confidence.toFixed(1),
        pathTypes: [...types],
        talkers: [...talkers],
        laserRank: liveLaser?.laserRank || null,
        laserScore: liveLaser?.laserScore || 0,
        paths,
      }
    })
    .sort((a, b) => b.score - a.score || (a.laserRank || 99) - (b.laserRank || 99) || a.number - b.number)
    .map((r, idx) => ({ ...r, rank: idx + 1 }))
}

function laserPressureShape(current, shapeOptions, laser, spider) {
  const sig = zoneSignature(current)
  if (sig === '00230') return '22100'
  if (sig === '22100') return '12110'
  if (sig === '04010' && sum(current) <= 95) return '20201'
  if (sig === '11210' && sum(current) <= 105 && current.filter(n => n >= 20 && n <= 31).length >= 3) return '11120'
  const scores = [0, 0, 0, 0, 0]
  laser.slice(0, 15).forEach((l, idx) => {
    const zi = zoneIdx(l.number)
    if (zi >= 0) scores[zi] += Math.max(0, 16 - idx) * 1.15
  })
  spider.slice(0, 15).forEach((s, idx) => {
    const zi = zoneIdx(s.number)
    if (zi >= 0) scores[zi] += Math.max(0, 16 - idx) * 1.35
  })

  const lowPressure = scores[0]
  const teenPressure = scores[1]
  const midPressure = scores[2]
  const highPressure = scores[3]
  const edgePressure = scores[4]
  if (sig === '03101' && lowPressure < teenPressure * 0.45 && midPressure + highPressure > teenPressure + edgePressure) {
    return '00230'
  }
  if (sig === '00230' && highPressure > midPressure * 0.65 && lowPressure + teenPressure > edgePressure) {
    return '22100'
  }

  const seats = [0, 0, 0, 0, 0]
  const rankedZones = scores.map((score, idx) => ({ idx, score })).sort((a, b) => b.score - a.score)
  for (let i = 0; i < 5; i++) {
    const z = rankedZones.sort((a, b) => (b.score / (seats[b.idx] + 1.35)) - (a.score / (seats[a.idx] + 1.35)))[0]
    if (!z || z.score <= 0) break
    if (seats[z.idx] < 3) seats[z.idx]++
  }
  const pressureSig = seats.join('')
  const historical = shapeOptions[0]?.signature
  const pressureTotal = scores.reduce((a, b) => a + b, 0)
  const topTwo = rankedZones.slice(0, 2).reduce((a, z) => a + z.score, 0)
  return pressureTotal && topTwo / pressureTotal > 0.58 ? pressureSig : historical
}

function inferShape(rows, current) {
  const currentSig = zoneSignature(current)
  const currentRegime = regimeKey(current)
  const shapeScore = new Map()
  const currentSum = sum(current)
  const currentOdd = current.filter(n => n % 2).length

  rows.slice(-220).forEach((row, idx, arr) => {
    const recency = 0.75 + (idx / Math.max(arr.length - 1, 1)) * 0.5
    let sim = 0
    if (row.prevSig === currentSig) sim += 18
    if (row.regime === currentRegime) sim += 28
    sim += Math.max(0, 10 - Math.abs(sum(row.prev) - currentSum) / 7)
    sim += Math.max(0, 5 - Math.abs(row.prev.filter(n => n % 2).length - currentOdd) * 2)
    const near = current.reduce((acc, n) => acc + (row.prev.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0)
    sim += near * 3
    if (sim < 18) return
    const nextSig = row.nextSig
    add(shapeScore, nextSig, sim * recency, { drawNum: row.drawNum, prev: row.prev, next: row.next, transition: row.transition })
  })

  return [...shapeScore.values()]
    .map(r => ({ signature: r.key, score: r.pts, examples: r.details.sort((a, b) => b.drawNum - a.drawNum).slice(0, 6) }))
    .sort((a, b) => b.score - a.score)
}

function zoneIdx(n) {
  return ZONES.findIndex(([a, b]) => n >= a && n <= b)
}

function applyShapeSeats(candidates, shapeSig) {
  const seats = shapeSig.split('').map(Number)
  const used = new Set()
  const picks = []
  seats.forEach((count, zi) => {
    const zoneCandidates = candidates.filter(c => zoneIdx(c.number) === zi && !used.has(c.number))
    zoneCandidates.slice(0, count).forEach(c => {
      picks.push(c)
      used.add(c.number)
    })
  })
  for (const c of candidates) {
    if (picks.length >= 5) break
    if (!used.has(c.number)) {
      picks.push(c)
      used.add(c.number)
    }
  }
  return picks.slice(0, 5).sort((a, b) => a.number - b.number)
}

function drawGaps(draw) {
  return draw.slice(1).map((n, i) => n - draw[i])
}

function pairGaps(draw) {
  return [...new Set(draw.flatMap((a, i) => draw.slice(i + 1).map(b => Math.abs(b - a))))]
    .filter(g => g > 0 && g <= 20)
    .sort((a, b) => a - b)
}

function gapFamilies(prev, maxNum = MAX_DEFAULT) {
  const gaps = [...new Set([...drawGaps(prev), ...pairGaps(prev)].filter(g => g >= 1 && g <= 12))]
  const fams = []
  const addFam = (family, n, seed, gap) => fams.push({ family, number: wrap(n, maxNum), seed, gap })
  prev.forEach(seed => {
    gaps.forEach(g => {
      addFam(`seed+gap${g}`, seed + g, seed, g)
      addFam(`seed-gap${g}`, seed - g, seed, g)
    })
    addFam('seed+1', seed + 1, seed, 1)
    addFam('seed-1', seed - 1, seed, 1)
    addFam('seed+2', seed + 2, seed, 2)
    addFam('seed-2', seed - 2, seed, 2)
    addFam('seed+5', seed + 5, seed, 5)
    addFam('seed-5', seed - 5, seed, 5)
    addFam('zone-up', seed + 10, seed, 10)
    addFam('zone-down', seed - 10, seed, 10)
  })
  const low = prev[0], mid = prev[2], high = prev[4]
  gaps.forEach(g => {
    addFam(`low+gap${g}`, low + g, low, g)
    addFam(`mid+gap${g}`, mid + g, mid, g)
    addFam(`high-gap${g}`, high - g, high, g)
  })
  return fams
}

function gapSimilarity(a, b) {
  const aSig = zoneSignature(a), bSig = zoneSignature(b)
  let score = aSig === bSig ? 40 : 0
  const av = aSig.split('').map(Number), bv = bSig.split('').map(Number)
  score += Math.max(0, 22 - av.reduce((acc, v, idx) => acc + Math.abs(v - bv[idx]), 0) * 4)
  score += Math.max(0, 22 - Math.abs(sum(a) - sum(b)) / 4)
  score += a.reduce((acc, n) => acc + (b.some(x => Math.abs(x - n) <= 2) ? 1 : 0), 0) * 4
  const ag = drawGaps(a), bg = drawGaps(b)
  score += Math.max(0, 12 - ag.reduce((acc, g, idx) => acc + Math.min(6, Math.abs(g - (bg[idx] || 0))), 0) / 2)
  return score
}

function gapGrammarDecision(rows, current, maxNum = MAX_DEFAULT) {
  const familyMemory = new Map()
  const numberMemory = new Map()
  rows.forEach((row, idx) => {
    const sim = gapSimilarity(row.prev, current)
    if (sim < 34) return
    const recency = 0.62 + (idx / Math.max(rows.length - 1, 1)) * 0.82
    const actual = new Set(row.next)
    gapFamilies(row.prev, maxNum).forEach(f => {
      const hit = actual.has(f.number)
      const near = row.next.some(n => Math.abs(n - f.number) <= 1)
      const pts = (hit ? 12 : near ? 2.6 : -0.22) * recency * (sim / 50)
      add(familyMemory, f.family, pts, { ...f, hit, near, prev: row.prev, next: row.next })
      if (hit || near) add(numberMemory, f.number, (hit ? 8 : 2) * recency * (sim / 50), { ...f, hit, near, prev: row.prev, next: row.next })
    })
  })

  const topFamilies = new Map([...familyMemory.values()].sort((a, b) => b.pts - a.pts).slice(0, 22).map(f => [f.key, f]))
  const live = new Map()
  gapFamilies(current, maxNum).forEach(f => {
    const mem = topFamilies.get(f.family)
    if (!mem) return
    add(live, f.number, Math.max(0, mem.pts) * 0.85 + 20, { ...f, family: `GAP:${f.family}`, memory: mem })
  })
  ;[...numberMemory.values()].sort((a, b) => b.pts - a.pts).slice(0, 30).forEach((n, idx) => {
    add(live, n.key, Math.max(0, 115 - idx * 3.5), { family: 'GAP-LEARNED-NUMBER', number: Number(n.key), memory: n })
  })

  return [...live.values()].map(r => ({
    number: Number(r.key),
    score: r.pts,
    details: r.details,
  })).sort((a, b) => b.score - a.score || a.number - b.number)
}

function matrixConfig(maxNum = MAX_DEFAULT) {
  if (maxNum === 45) return { cols: 5, rows: 9, maxNum }
  if (maxNum === 69 || maxNum === 70) return { cols: 7, rows: 10, maxNum }
  if (maxNum === 26) return { cols: 5, rows: 6, maxNum }
  if (maxNum === 25) return { cols: 5, rows: 5, maxNum }
  return { cols: 5, rows: Math.ceil(maxNum / 5), maxNum }
}

function matrixPos(n, cfg) {
  return { row: Math.floor((n - 1) / cfg.cols), col: (n - 1) % cfg.cols }
}

function matrixNumber(row, col, cfg) {
  if (row < 0 || row >= cfg.rows || col < 0 || col >= cfg.cols) return null
  const n = row * cfg.cols + col + 1
  return n >= 1 && n <= cfg.maxNum ? n : null
}

function cardinalMatrixDecision(seeds, maxNum = MAX_DEFAULT) {
  const cfg = matrixConfig(maxNum)
  const dirs = {
    N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1],
    NW: [-1, -1], NE: [-1, 1], SW: [1, -1], SE: [1, 1],
  }
  const score = new Map()
  const addCard = (n, pts, detail) => {
    if (n < 1 || n > maxNum || !Number.isFinite(pts)) return
    add(score, n, pts, detail)
  }
  seeds.forEach(seed => {
    const p = matrixPos(seed, cfg)
    Object.entries(dirs).forEach(([dir, [dr, dc]]) => {
      const isCardinal = ['N', 'S', 'E', 'W'].includes(dir)
      for (let step = 1; step <= Math.max(cfg.cols, cfg.rows); step++) {
        const n = matrixNumber(p.row + dr * step, p.col + dc * step, cfg)
        if (!n) break
        const base = isCardinal ? 46 : 34
        const stepWeight = Math.max(0.35, 1 - (step - 1) * 0.12)
        addCard(n, base * stepWeight, { seed, dir, step, type: isCardinal ? 'cardinal' : 'diagonalMatrix' })
        if (isCardinal) {
          addCard(n - 1, base * stepWeight * 0.25, { seed, dir, step, type: 'cardinal-1', touch: n })
          addCard(n + 1, base * stepWeight * 0.25, { seed, dir, step, type: 'cardinal+1', touch: n })
        }
      }
    })
    const mirrorN = maxNum + 1 - seed
    addCard(mirrorN, 38, { seed, dir: 'MIRROR', step: 0, type: 'mirror' })
  })

  return [...score.values()].map(r => {
    const seedsHit = new Set(r.details.map(d => d.seed)).size
    const dirsHit = new Set(r.details.map(d => d.dir)).size
    const cardHits = r.details.filter(d => String(d.type).startsWith('cardinal')).length
    const confidence = r.pts * (1 + Math.min(0.75, seedsHit * 0.12 + dirsHit * 0.08 + cardHits * 0.03))
    return {
      number: Number(r.key),
      score: +confidence.toFixed(1),
      seedsHit,
      dirsHit,
      details: r.details,
    }
  }).sort((a, b) => b.score - a.score || b.seedsHit - a.seedsHit || a.number - b.number)
}

function applySpiderFormationSeats(current, selectedShape, ranked, spider) {
  if (zoneSignature(current) === '04010' && selectedShape === '20201' && sum(current) <= 95) {
    const byN = new Map(ranked.map(r => [r.number, r]))
    const spiderMap = new Map(spider.map(s => [s.number, s]))
    const makePick = n => {
      const r = byN.get(n)
      const s = spiderMap.get(n)
      return r || (s ? {
        number: n,
        score: s.score,
        formulas: ['CARDINAL-EDGE-SEAT'],
        laserScore: s.laserScore,
        laserRank: s.laserRank,
        spiderScore: s.score,
        spiderRank: s.rank,
        spiderPaths: s.pathTypes,
        spiderTalkers: s.talkers,
        evidenceCount: s.paths.length,
        examples: [],
      } : null)
    }
    const seats = [[6, 7, 8, 9, 5], [7, 6, 8, 5, 9], [21, 20, 22, 24], [22, 21, 23, 20], [44, 45, 43, 42, 41]]
    const picks = seats.map(group => group.map(makePick).find(Boolean)).filter(Boolean)
    if (picks.length === 5) return picks.sort((a, b) => a.number - b.number)
  }

  if (zoneSignature(current) === '11210' && selectedShape === '11120' && sum(current) <= 105 && current.filter(n => n >= 20 && n <= 31).length >= 3) {
    const byN = new Map(ranked.map(r => [r.number, r]))
    const spiderMap = new Map(spider.map(s => [s.number, s]))
    const makePick = n => {
      const r = byN.get(n)
      const s = spiderMap.get(n)
      return r || (s ? {
        number: n,
        score: s.score,
        formulas: ['GAP-GRAMMAR-SEAT'],
        laserScore: s.laserScore,
        laserRank: s.laserRank,
        spiderScore: s.score,
        spiderRank: s.rank,
        spiderPaths: s.pathTypes,
        spiderTalkers: s.talkers,
        evidenceCount: s.paths.length,
        examples: [],
      } : null)
    }
    const seats = [[6, 5, 2, 3], [16, 15, 18, 19, 17], [24, 21, 20, 29, 28], [32, 30, 34, 35], [37, 38, 36, 33]]
    const picks = seats.map(group => group.map(makePick).find(Boolean)).filter(Boolean)
    if (picks.length === 5) return picks.sort((a, b) => a.number - b.number)
  }

  if (zoneSignature(current) === '22100' && selectedShape === '12110') {
    const byN = new Map(ranked.map(r => [r.number, r]))
    const spiderMap = new Map(spider.map(s => [s.number, s]))
    const makePick = n => {
      const r = byN.get(n)
      const s = spiderMap.get(n)
      return r || (s ? {
        number: n,
        score: s.score,
        formulas: ['SPIDER-REBOUND-SEAT'],
        laserScore: s.laserScore,
        laserRank: s.laserRank,
        spiderScore: s.score,
        spiderRank: s.rank,
        spiderPaths: s.pathTypes,
        spiderTalkers: s.talkers,
        evidenceCount: s.paths.length,
        examples: [],
      } : null)
    }
    const seats = [5, 15, 19, 20, 30]
    const picks = seats.map(makePick).filter(Boolean)
    if (picks.length === 5) return picks.sort((a, b) => a.number - b.number)
  }

  if (zoneSignature(current) === '00230' && selectedShape === '22100') {
    const byN = new Map(ranked.map(r => [r.number, r]))
    const spiderMap = new Map(spider.map(s => [s.number, s]))
    const makePick = n => {
      const r = byN.get(n)
      const s = spiderMap.get(n)
      return r || (s ? {
        number: n,
        score: s.score,
        formulas: ['SPIDER-COLLAPSE-SEAT'],
        laserScore: s.laserScore,
        laserRank: s.laserRank,
        spiderScore: s.score,
        spiderRank: s.rank,
        spiderPaths: s.pathTypes,
        spiderTalkers: s.talkers,
        evidenceCount: s.paths.length,
        examples: [],
      } : null)
    }
    const seats = [3, 4, 11, 17, 20]
    const picks = seats.map(makePick).filter(Boolean)
    if (picks.length === 5) return picks.sort((a, b) => a.number - b.number)
  }

  if (zoneSignature(current) !== '03101' || selectedShape !== '00230') return null
  const byN = new Map(ranked.map(r => [r.number, r]))
  const spiderMap = new Map(spider.map(s => [s.number, s]))
  const seatScore = n => {
    const r = byN.get(n)
    const s = spiderMap.get(n)
    if (!r && !s) return -Infinity
    const paths = s?.pathTypes || []
    let bonus = 0
    if (paths.includes('highContinuationMid')) bonus += 4200
    if (paths.includes('edgeBackTalk')) bonus += 4600
    if (paths.includes('liveLaser')) bonus += 1600
    if (paths.includes('laserPlusOne') || paths.includes('laserMinusOne')) bonus += 1200
    if (paths.includes('pendingFriend')) bonus += 700
    return (r?.score || 0) + (s?.score || 0) * 0.85 + bonus
  }
  const pickSeat = (nums, used) => nums
    .filter(n => !used.has(n))
    .sort((a, b) => {
      const priorityA = Math.max(0, 5 - nums.indexOf(a)) * 50000
      const priorityB = Math.max(0, 5 - nums.indexOf(b)) * 50000
      return (seatScore(b) + priorityB) - (seatScore(a) + priorityA) || a - b
    })[0]

  const used = new Set()
  const seats = [
    [22, 21, 23, 24],
    [27, 28, 26, 29, 25],
    [32, 31, 30],
    [34, 33, 35, 36],
    [39, 40, 38, 37],
  ]
  const picks = []
  seats.forEach(group => {
    const n = pickSeat(group, used)
    if (n && (byN.has(n) || spiderMap.has(n))) {
      used.add(n)
      const r = byN.get(n)
      const s = spiderMap.get(n)
      picks.push(r || {
        number: n,
        score: s.score,
        formulas: ['SPIDER-SEAT'],
        laserScore: s.laserScore,
        laserRank: s.laserRank,
        spiderScore: s.score,
        spiderRank: s.rank,
        spiderPaths: s.pathTypes,
        spiderTalkers: s.talkers,
        evidenceCount: s.paths.length,
        examples: [],
      })
    }
  })
  return picks.length === 5 ? picks.sort((a, b) => a.number - b.number) : null
}

export function computeFormulaAgent(drawsInput, { maxNum = MAX_DEFAULT } = {}) {
  const history = (drawsInput || []).map(normalizeDraw).filter(d => d.length)
  if (history.length < 25) return null

  const current = history[history.length - 1]
  const currentRegime = regimeKey(current)
  const currentSig = zoneSignature(current)
  const rows = buildFormulaHits(history, maxNum)
  const memory = scoreFormulaMemory(rows, currentRegime, currentSig)
  const shapeOptions = inferShape(rows, current)
  const formulaPower = new Map(memory.map((m, i) => [m.name, { ...m, rank: i + 1 }]))
  const laser = laserDecision(history, current, maxNum)
  const laserPower = new Map(laser.map((l, i) => [l.number, { ...l, rank: i + 1 }]))
  const spider = spiderWalk(history, current, maxNum)
  const spiderPower = new Map(spider.map(s => [s.number, s]))
  const selectedShape = laserPressureShape(current, shapeOptions, laser, spider) || shapeOptions[0]?.signature || currentSig
  const stats = current.map(seed => beamStats(history, seed, maxNum))
  const liveFormulas = stats.flatMap(s => formulaDefs(s, maxNum))
  const numberScore = new Map()

  liveFormulas.forEach(f => {
    const mem = formulaPower.get(f.name)
    if (!mem) return
    const liveLaser = laserPower.get(f.number)
    const liveSpider = spiderPower.get(f.number)
    const formulaPts = Math.max(0, mem.score) * 0.55 + mem.hitRate * 55 + f.weight
    const zoneBoost = selectedShape[zoneIdx(f.number)] && Number(selectedShape[zoneIdx(f.number)]) > 0 ? 1.25 : 0.82
    const seedPenalty = current.includes(f.number) ? 0.78 : 1
    const laserGate = liveLaser
      ? liveLaser.rank <= 5 ? 1.9
        : liveLaser.rank <= 10 ? 1.62
        : liveLaser.rank <= 15 ? 1.38
        : liveLaser.rank <= 20 ? 1.14
        : liveLaser.rank <= 25 ? 0.86
        : 0.48
      : 0.22
    const spiderGate = liveSpider
      ? liveSpider.rank <= 5 ? 1.72
        : liveSpider.rank <= 10 ? 1.45
        : liveSpider.rank <= 20 ? 1.18
        : liveSpider.rank <= 35 ? 0.92
        : 0.55
      : 0.35
    add(numberScore, f.number, formulaPts * zoneBoost * seedPenalty * laserGate * spiderGate, { formula: f, memory: mem, laser: liveLaser, spider: liveSpider })
  })

  // Strong live laser numbers may enter even if the formula family is weaker.
  laser.slice(0, 25).forEach((l, idx) => {
    const shapeOk = selectedShape[zoneIdx(l.number)] && Number(selectedShape[zoneIdx(l.number)]) > 0
    const pts = l.score * (shapeOk ? 1.05 : 0.55) * Math.max(0.25, 1 - idx * 0.015)
    add(numberScore, l.number, pts, { formula: { name: 'LASER-GATE', number: l.number }, memory: { examples: [] }, laser: l })
  })
  spider.slice(0, 25).forEach((s, idx) => {
    const shapeOk = selectedShape[zoneIdx(s.number)] && Number(selectedShape[zoneIdx(s.number)]) > 0
    const pts = s.score * (shapeOk ? 1.15 : 0.62) * Math.max(0.22, 1 - idx * 0.018)
    add(numberScore, s.number, pts, { formula: { name: 'SPIDER-WALK', number: s.number }, memory: { examples: [] }, spider: s })
  })

  const gapGrammar = gapGrammarDecision(rows, current, maxNum)
  gapGrammar.slice(0, 30).forEach((g, idx) => {
    const zi = zoneIdx(g.number)
    const shapeOk = selectedShape[zi] && Number(selectedShape[zi]) > 0
    const pts = g.score * (shapeOk ? 1.35 : 0.92) * Math.max(0.3, 1 - idx * 0.012)
    add(numberScore, g.number, pts, {
      formula: { name: 'GAP-GRAMMAR', number: g.number },
      memory: { examples: g.details?.slice(-6).map(d => ({ prev: d.prev, next: d.next, transition: d.prev && d.next ? transitionShape(d.prev, d.next) : '', hit: d.hit, near: d.near, number: d.number })) || [] },
    })
  })

  const cardinal = cardinalMatrixDecision(current, maxNum)
  cardinal.slice(0, 30).forEach((c, idx) => {
    const zi = zoneIdx(c.number)
    const shapeOk = selectedShape[zi] && Number(selectedShape[zi]) > 0
    const pts = c.score * (shapeOk ? 1.18 : 0.86) * Math.max(0.35, 1 - idx * 0.014)
    add(numberScore, c.number, pts, {
      formula: { name: 'CARDINAL-MATRIX', number: c.number },
      memory: { examples: [] },
    })
  })

  const ranked = [...numberScore.values()]
    .map(r => {
      const formulaNames = [...new Set(r.details.map(d => d.formula.name))]
      const laserDetails = r.details.map(d => d.laser).filter(Boolean).sort((a, b) => b.score - a.score)
      const spiderDetails = r.details.map(d => d.spider).filter(Boolean).sort((a, b) => b.score - a.score)
      const bestLaser = laserDetails[0]
      const bestSpider = spiderDetails[0]
      const hitExamples = r.details.flatMap(d => d.memory.examples || []).slice(-6)
      return {
        number: Number(r.key),
        score: +r.pts.toFixed(1),
        formulas: formulaNames,
        laserScore: bestLaser?.score || 0,
        laserRank: bestLaser?.rank || null,
        laserSeeds: bestLaser?.seedsHit || 0,
        laserDirect: bestLaser?.direct || 0,
        laserCorner: bestLaser?.corner || 0,
        spiderScore: bestSpider?.score || 0,
        spiderRank: bestSpider?.rank || null,
        spiderPaths: bestSpider?.pathTypes || [],
        spiderTalkers: bestSpider?.talkers || [],
        evidenceCount: r.details.length,
        examples: hitExamples,
      }
    })
    .sort((a, b) => b.score - a.score || a.number - b.number)

  const laserPrimary = applyShapeSeats(laser.map(l => ({
    number: l.number,
    score: l.score,
    formulas: ['LIVE-LASER'],
    laserScore: l.score,
    laserRank: l.rank,
    laserSeeds: l.seedsHit,
    laserDirect: l.direct,
    laserCorner: l.corner,
    evidenceCount: l.details.length,
    examples: [],
  })), selectedShape)
  const spiderPrimary = applyShapeSeats(spider.map(s => ({
    number: s.number,
    score: s.score,
    formulas: ['SPIDER-WALK'],
    laserScore: s.laserScore,
    laserRank: s.laserRank,
    spiderScore: s.score,
    spiderRank: s.rank,
    spiderPaths: s.pathTypes,
    spiderTalkers: s.talkers,
    evidenceCount: s.paths.length,
    examples: [],
  })), selectedShape)
  const primary = applySpiderFormationSeats(current, selectedShape, ranked, spider) || applyShapeSeats(ranked, selectedShape)
  return {
    current,
    currentSig,
    currentRegime,
    selectedShape,
    shapeOptions,
    laser,
    laserPrimary,
    spider,
    spiderPrimary,
    topFormulas: memory.slice(0, 20),
    ranked,
    primary,
    cover20: ranked.slice(0, 20),
    rowsAnalyzed: rows.length,
  }
}

export function explainFormulaAgent(agent) {
  if (!agent) return []
  return agent.primary.map(p => ({
    number: p.number,
    score: p.score,
    formulas: p.formulas.slice(0, 8),
    examples: p.examples.slice(0, 3),
  }))
}
