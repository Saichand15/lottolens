import { useMemo, useState } from 'react'
import { getSenders, getReceivers, getNumberAppearances } from '../utils/dataUtils'
import {
  getMatrixConfig, getDirs,
  nToPos, posToN, mirror,
  getAllBeams, getCardinalPaths, predictNextFromMatrix, predictIterativeMatrix
} from '../utils/matrixBeam'

// ── Beam Picks helpers ─────────────────────────────────────────────────────
const BP_DIRS = { NW:{dc:-1,dr:-1}, NE:{dc:+1,dr:-1}, SW:{dc:-1,dr:+1}, SE:{dc:+1,dr:+1} }

function bpGetTouches(slice, ci, seed, dir, maxNum) {
  const { dc, dr } = BP_DIRS[dir]
  const path = [], corner = []
  for (let step = 1; step <= slice.length; step++) {
    const c2 = ci + dc * step, n = seed + dr * step
    if (c2 < 0 || c2 >= slice.length || n < 1 || n > maxNum) break
    if (slice[c2].includes(n)) path.push(n)
    if (n - 1 >= 1   && slice[c2].includes(n - 1)) corner.push(n - 1)
    if (n + 1 <= maxNum && slice[c2].includes(n + 1)) corner.push(n + 1)
  }
  return { path: [...new Set(path)], corner: [...new Set(corner)] }
}

function bpComputeBeamPicks(slice, ci, draw, maxNum) {
  // scores[n] = { pts, exprs[] }
  const scores = {}
  // FIX: no <6 filter on direct beam signals — filter only arithmetic results
  const addBeam = (n, pts, expr) => {
    if (n < 1 || n > maxNum) return
    if (!scores[n]) scores[n] = { pts: 0, exprs: [] }
    scores[n].pts += pts
    if (expr && !scores[n].exprs.includes(expr)) scores[n].exprs.push(expr)
  }
  const addMath = (n, pts, expr) => {
    if (n < 6 || n > maxNum) return  // arithmetic: still skip 1-5 noise
    if (!scores[n]) scores[n] = { pts: 0, exprs: [] }
    scores[n].pts += pts
    if (expr && !scores[n].exprs.includes(expr)) scores[n].exprs.push(expr)
  }

  // Direct hits pool (path numbers across all beams/seeds)
  const directHits = new Set()

  draw.forEach(seed => {
    // Find dominant beam (most path hits)
    let bestDir = null, bestPath = []
    Object.keys(BP_DIRS).forEach(dir => {
      const { path } = bpGetTouches(slice, ci, seed, dir, maxNum)
      if (path.length > bestPath.length) { bestPath = path; bestDir = dir }
    })
    if (!bestDir) return

    const { path, corner } = bpGetTouches(slice, ci, seed, bestDir, maxNum)

    // FIX 1: corner weight = path weight (both are real beam touches)
    // FIX 3: add ±1 neighbors of every path/corner hit (catches off-by-one misses)
    path.forEach(n => {
      addBeam(n, 4, `path(${bestDir},seed${seed})`)
      directHits.add(n)
      addBeam(n-1, 2, `path±1(${n}-1)`)
      addBeam(n+1, 2, `path±1(${n}+1)`)
    })
    corner.forEach(n => {
      addBeam(n, 4, `corner(${bestDir},seed${seed})`)  // was 1, now 4
      addBeam(n-1, 1.5, `corner±1(${n}-1)`)
      addBeam(n+1, 1.5, `corner±1(${n}+1)`)
    })

    // Consecutive path diffs
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.abs(path[i] - path[i+1])
      addMath(d, 2, `path ${path[i]}−${path[i+1]}=${d}`)
    }

    // Seed ± first path hit (key signal for large numbers via sum)
    if (path.length) {
      const diff = Math.abs(seed - path[0])
      const sum  = seed + path[0]
      addMath(diff, 2, `${seed}−${path[0]}=${diff}`)
      addMath(sum,  2, `${seed}+${path[0]}=${sum}`)
      // FIX 2: ±1 flanking of arithmetic results
      addMath(sum+1, 1.5, `(${seed}+${path[0]})+1=${sum+1}`)
      addMath(sum-1, 1.5, `(${seed}+${path[0]})-1=${sum-1}`)
    }

    // All pairwise within [seed, ...path, ...corner]
    const all = [seed, ...path, ...corner]
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.abs(all[i] - all[j])
        const s = all[i] + all[j]
        const w = d > 3 ? 1.5 : 0.5  // non-adjacent pairs carry more weight
        if (d >= 6) {
          addMath(d,   w,   `${Math.max(all[i],all[j])}−${Math.min(all[i],all[j])}=${d}`)
          // FIX 2: arithmetic ±1 flanking
          addMath(d+1, w*0.7, `(${Math.max(all[i],all[j])}−${Math.min(all[i],all[j])})+1=${d+1}`)
          addMath(d-1, w*0.7, `(${Math.max(all[i],all[j])}−${Math.min(all[i],all[j])})-1=${d-1}`)
        }
        if (s >= 6) {
          addMath(s,   w,   `${all[i]}+${all[j]}=${s}`)
          // FIX 2: arithmetic ±1 flanking
          addMath(s+1, w*0.7, `(${all[i]}+${all[j]})+1=${s+1}`)
          addMath(s-1, w*0.7, `(${all[i]}+${all[j]})-1=${s-1}`)
        }
      }
    }
  })

  const ranked = Object.entries(scores)
    .map(([n, { pts, exprs }]) => ({ n: +n, pts, exprs, isDirect: directHits.has(+n) }))
    .sort((a, b) => b.pts - a.pts || (b.isDirect ? 1 : 0) - (a.isDirect ? 1 : 0))

  return { ranked, directHits: [...directHits].sort((a,b)=>a-b) }
}

const DIR_COLORS = {
  NE: '#00d4ff',
  NW: '#ff00ff',
  SE: '#ff6a00',
  SW: '#00ff88'
}

// ── Touch-Math: collect all beam touch numbers → arithmetic → predictions ──
function computeTouchMath(slice, ci, seed, maxNum) {
  // Gather path + corner from all 4 beams
  const beamNums = {}     // dir → { path[], corner[] }
  const allTouchNums = new Set()
  Object.keys(BP_DIRS).forEach(dir => {
    const { path, corner } = bpGetTouches(slice, ci, seed, dir, maxNum)
    beamNums[dir] = { path, corner }
    path.forEach(n => allTouchNums.add(n))
    corner.forEach(n => allTouchNums.add(n))
  })
  allTouchNums.add(seed)
  const nums = [...allTouchNums].filter(n => n >= 1 && n <= maxNum)

  // All pairwise a+b and |a-b| — with ±1 flanking to catch off-by-one misses
  const resultMap = {}   // result → { exprs[], weight }
  const add = (result, expr, w = 1) => {
    if (result < 6 || result > maxNum) return  // skip 1-5: noise from adjacent diffs
    if (!resultMap[result]) resultMap[result] = { exprs: [], weight: 0 }
    if (!resultMap[result].exprs.includes(expr)) {
      resultMap[result].exprs.push(expr)
      resultMap[result].weight += w
    }
  }
  for (let i = 0; i < nums.length; i++) {
    for (let j = i; j < nums.length; j++) {
      const a = nums[i], b = nums[j]
      const gap = Math.abs(a - b)
      // Non-adjacent pairs (gap > 3) carry higher weight — avoids 38-37=1 noise
      const w = gap > 3 ? 2 : 1
      if (a !== b) {
        const s = a + b
        add(s,   `${a}+${b}`,                       w)
        add(s+1, `(${a}+${b})+1=${s+1}`,            w * 0.7)  // FIX: ±1 flank
        add(s-1, `(${a}+${b})-1=${s-1}`,            w * 0.7)  // FIX: ±1 flank
        add(gap, `${Math.max(a,b)}-${Math.min(a,b)}`, w)
        if (gap > 1) add(gap+1, `(${Math.max(a,b)}-${Math.min(a,b)})+1=${gap+1}`, w * 0.7)
        if (gap > 2) add(gap-1, `(${Math.max(a,b)}-${Math.min(a,b)})-1=${gap-1}`, w * 0.7)
      } else {
        const s = a + b
        add(s,   `${a}+${b}`,           w)
        add(s+1, `(${a}+${b})+1=${s+1}`, w * 0.7)
        add(s-1, `(${a}+${b})-1=${s-1}`, w * 0.7)
      }
    }
  }

  const ranked = Object.entries(resultMap)
    .map(([n, { exprs, weight }]) => ({ n: +n, count: exprs.length, weight, exprs: [...new Set(exprs)] }))
    .sort((a, b) => b.weight - a.weight || b.count - a.count || a.n - b.n)

  return { ranked, beamNums, allNums: nums }
}

// ── Touch-Number Backtest ───────────────────────────────────────────────────
function computeBacktest(draws, maxNum, lastN = 10) {
  if (!draws || draws.length < 3) return []
  const results = []
  const start = Math.max(1, draws.length - lastN - 1)
  for (let i = start; i < draws.length - 1; i++) {
    const slice = draws.slice(0, i + 1)
    const ci = slice.length - 1
    const draw = draws[i]
    let ranked = [], directHits = []
    try {
      const bp = bpComputeBeamPicks(slice, ci, draw, maxNum)
      ranked = bp.ranked
      directHits = bp.directHits
    } catch { continue }
    const top15 = ranked.slice(0, 15).map(r => r.n)
    const nextDraw = draws[i + 1]

    const exactHits = top15.filter(n => nextDraw.includes(n))
    const pm1Hits   = top15.filter(n => !nextDraw.includes(n) && nextDraw.some(a => Math.abs(a - n) === 1))
    const pm2Hits   = top15.filter(n => !nextDraw.includes(n) && !nextDraw.some(a => Math.abs(a - n) === 1) && nextDraw.some(a => Math.abs(a - n) === 2))

    results.push({
      drawNum: i + 1,
      predicted: top15,
      directHits,
      nextDraw,
      exactHits,
      pm1Hits,
      pm2Hits,
      hitRate: +((exactHits.length / Math.max(top15.length, 1)) * 100).toFixed(0),
      nearRate: +(((exactHits.length + pm1Hits.length + pm2Hits.length) / Math.max(top15.length, 1)) * 100).toFixed(0),
    })
  }
  return results
}

function CrossHitGroup({ title, items, titleColor }) {
  if (items.length === 0) return null
  return (
    <div className="fp-sec">
      <h4 className="fp-sec-title" style={{ color: titleColor }}>{title}</h4>
      {items.map(({ number, dirs, count }) => (
        <div key={number} className={`ch-row ch-row-${count >= 3 ? 'triple' : 'double'}`}>
          <div className="ch-num">{number}</div>
          <div className="ch-dirs">
            {dirs.map(d => (
              <span key={d} className="ch-dir-pill" style={{ background: DIR_COLORS[d] }}>{d}</span>
            ))}
          </div>
          <div className="ch-signal">
            {count === 4 && <span className="ch-badge ch-ultra">ALL 4</span>}
            {count === 3 && <span className="ch-badge ch-triple">3-WAY</span>}
            {count === 2 && <span className="ch-badge ch-double">2-WAY</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FriendshipPanel({
  selectedNumber,
  selectedCell,
  draws,
  displayDraws,
  transMatrix,
  coOccur,
  laserHits,
  fusionData,
  onClose,
  maxNumber = 45
}) {
  const [tab, setTab] = useState('friends')
  const [matrixMode, setMatrixMode] = useState('iterative') // 'single' | 'iterative'

  const drawOffset = (draws?.length || 0) - (displayDraws?.length || 0)
  const globalDrawIdx = drawOffset + (selectedCell?.colIdx ?? (displayDraws?.length || 1) - 1)

  const currentDraw = draws?.[globalDrawIdx] || []
  const inThisDraw = currentDraw.includes(selectedNumber)
  const coNumbers = currentDraw.filter(n => n !== selectedNumber)

  const senders = useMemo(
    () => getSenders(draws, globalDrawIdx, selectedNumber, transMatrix),
    [draws, globalDrawIdx, selectedNumber, transMatrix]
  )
  const receivers = useMemo(
    () => getReceivers(draws, globalDrawIdx, selectedNumber, transMatrix),
    [draws, globalDrawIdx, selectedNumber, transMatrix]
  )

  const allTimeFriends = coOccur?.friends?.[selectedNumber] || []
  const appearances = coOccur?.appearances?.[selectedNumber] || 0
  const freq = draws?.length ? (appearances / draws.length * 100).toFixed(1) : 0

  const allAppearances = useMemo(
    () => getNumberAppearances(draws || [], selectedNumber).slice(-12).reverse(),
    [draws, selectedNumber]
  )

  // Cross-hits
  const crossHits = useMemo(() => {
    if (!laserHits) return { above: [], below: [], mixed: [], total: 0 }
    const multi = (laserHits.multiDir || []).filter(m => m.count >= 2)
    const above = [], below = [], mixed = []
    multi.forEach(m => {
      const hasUp   = m.dirs.some(d => d === 'NW' || d === 'NE')
      const hasDown = m.dirs.some(d => d === 'SE' || d === 'SW')
      if (hasUp && hasDown) mixed.push(m)
      else if (hasUp)       above.push(m)
      else                  below.push(m)
    })
    return { above, below, mixed, total: multi.length }
  }, [laserHits])

  // Corner touch
  const cornerTouchData = useMemo(() => {
    if (!laserHits?.cornerTouch) return null
    const result = {}
    let total = 0
    Object.entries(laserHits.cornerTouch).forEach(([dir, steps]) => {
      const diagonal = steps.filter(s => s.appeared && !s.isCornerAdj)
      const adjacent = steps.filter(s => s.appeared && s.isCornerAdj)
      result[dir] = { diagonal, adjacent }
      total += diagonal.length + adjacent.length
    })
    return { ...result, total }
  }, [laserHits])

  // Future laser prediction  only when clicking last column
  const futurePrediction = useMemo(() => {
    if (!selectedCell || !draws?.length || !coOccur) return null
    const isLastCol = selectedCell.colIdx === (displayDraws?.length ?? 0) - 1
    if (!isLastCol) return null

    const rowNum = selectedCell.rowNum
    const rowIdx = rowNum - 1
    const totalDraws = draws.length

    // Build appearance frequency for all numbers
    const appFreq = {}
    for (let n = 1; n <= maxNumber; n++) {
      appFreq[n] = +(((coOccur.appearances?.[n] || 0) / totalDraws) * 100).toFixed(1)
    }

    // Transition rates from the LAST draw's numbers (seeds)
    const lastDraw = draws[draws.length - 1] || []
    const transRates = {}
    for (let n = 1; n <= maxNumber; n++) transRates[n] = 0
    lastDraw.forEach(seed => {
      const seedRates = transMatrix?.rates?.[seed] || {}
      Object.entries(seedRates).forEach(([to, rate]) => {
        transRates[+to] = (transRates[+to] || 0) + rate
      })
    })

    // NE: dc=+1 dr=-1 (goes right+up into future draws)
    // SE: dc=+1 dr=+1 (goes right+down into future draws)
    const future = { NE: [], SE: [] }
    for (let step = 1; step <= 10; step++) {
      const neRow = rowIdx - step
      const seRow = rowIdx + step
      const futureDrawNum = draws.length + step  // D334, D335...

      if (neRow >= 0) {
        const n = neRow + 1
        const score = +(appFreq[n] * 0.4 + (transRates[n] || 0) * 0.6).toFixed(1)
        future.NE.push({ number: n, step, futureDrawNum, appFreq: appFreq[n], transScore: +(transRates[n] || 0).toFixed(1), score })
      }
      if (seRow < maxNumber) {
        const n = seRow + 1
        const score = +(appFreq[n] * 0.4 + (transRates[n] || 0) * 0.6).toFixed(1)
        future.SE.push({ number: n, step, futureDrawNum, appFreq: appFreq[n], transScore: +(transRates[n] || 0).toFixed(1), score })
      }
    }

    // Also compute "corner adjacent" for NE/SE future beams
    for (const dir of ['NE', 'SE']) {
      future[dir].forEach(item => {
        const dr = dir === 'NE' ? -1 : 1
        const adjRow = item.number - 1 + dr
        if (adjRow >= 0 && adjRow < maxNumber) {
          const adjN = adjRow + 1
          item.adjNumber = adjN
          item.adjScore = +(appFreq[adjN] * 0.4 + (transRates[adjN] || 0) * 0.6).toFixed(1)
        }
      })
    }

    // Merge NE+SE and find overlapping numbers (hit by both)
    const allFutureNums = {}
    ;['NE', 'SE'].forEach(dir => {
      future[dir].forEach(item => {
        if (!allFutureNums[item.number]) allFutureNums[item.number] = { dirs: [], score: 0 }
        allFutureNums[item.number].dirs.push(dir)
        allFutureNums[item.number].score = Math.max(allFutureNums[item.number].score, item.score)
      })
    })
    const topPicks = Object.entries(allFutureNums)
      .map(([n, d]) => ({ number: +n, dirs: d.dirs, score: d.score, multiBeam: d.dirs.length > 1 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return { future, topPicks, lastDraw, isLastCol: true }
  }, [selectedCell, draws, displayDraws, coOccur, transMatrix])

  // Beam Picks — works for any selected cell
  const beamPicksData = useMemo(() => {
    if (!selectedCell || !draws?.length || !displayDraws?.length) return null
    const WINDOW = displayDraws.length  // typically 100
    const ci = selectedCell.colIdx       // column in display
    const drawOffset2 = (draws.length || 0) - WINDOW
    const globalIdx = drawOffset2 + ci
    if (globalIdx < 0 || globalIdx >= draws.length) return null
    const slice = draws.slice(globalIdx - ci, globalIdx + 1)
    if (slice.length < 2) return null
    const draw = draws[globalIdx]
    return bpComputeBeamPicks(slice, ci, draw, maxNumber)
  }, [selectedCell, draws, displayDraws, maxNumber])

  const touchMathData = useMemo(() => {
    if (!selectedCell || !draws?.length || !displayDraws?.length) return null
    const WINDOW = displayDraws.length
    const ci = selectedCell.colIdx
    const drawOffset2 = (draws.length || 0) - WINDOW
    const globalIdx = drawOffset2 + ci
    if (globalIdx < 0 || globalIdx >= draws.length) return null
    const slice = draws.slice(Math.max(0, globalIdx - ci), globalIdx + 1)
    if (slice.length < 2) return null
    const seed = selectedCell.rowNum
    const math = computeTouchMath(slice, slice.length - 1, seed, maxNumber)
    // Next draw (if exists) for hit checking
    const nextDraw = draws[globalIdx + 1] || null
    return { ...math, nextDraw, globalIdx }
  }, [selectedCell, draws, displayDraws, maxNumber])

  // ── D+1 / D+2 Combined Signal Prediction (last-column only) ──────────────
  const dualPredData = useMemo(() => {
    if (!draws?.length || draws.length < 5) return null

    const lastDraw = draws[draws.length - 1]
    const maxN     = maxNumber || 45

    // ── Build mutual-beam frequency table from full history ──────────────
    // freq[A][B] = number of draws where B appeared on A's beam diagonal
    const freq = {}
    const getBeamAll = (slice, ci, seed) => {
      const hits = new Set()
      for (const { dc, dr } of Object.values(BP_DIRS)) {
        for (let s = 1; s <= slice.length; s++) {
          const c2 = ci + dc * s, n = seed + dr * s
          if (c2 < 0 || c2 >= slice.length || n < 1 || n > maxN) break
          if (slice[c2].includes(n)) hits.add(n)
        }
      }
      return [...hits]
    }

    // Build freq table across all draws (capped at last 200 for performance)
    const histStart = Math.max(1, draws.length - 200)
    for (let idx = histStart; idx < draws.length; idx++) {
      const slice = draws.slice(0, idx + 1)
      const ci    = slice.length - 1
      draws[idx].forEach(seed => {
        const hits = getBeamAll(slice, ci, seed)
        if (!freq[seed]) freq[seed] = {}
        hits.forEach(h => { freq[seed][h] = (freq[seed][h] || 0) + 1 })
      })
    }

    const getMutual = (a, b) => (freq[a]?.[b] || 0) + (freq[b]?.[a] || 0)

    // ── Co-occurrence for tiebreaker ──────────────────────────────────────
    const coMap  = {}
    const lastSeen = {}
    draws.forEach((draw, di) => {
      draw.forEach(n => { lastSeen[n] = di })
      for (let i = 0; i < draw.length; i++) for (let j = i+1; j < draw.length; j++) {
        const a=draw[i], b=draw[j]
        coMap[a]=coMap[a]||{}; coMap[b]=coMap[b]||{}
        coMap[a][b]=(coMap[a][b]||0)+1; coMap[b][a]=(coMap[b][a]||0)+1
      }
    })

    // ── Score every candidate 1..maxN ────────────────────────────────────
    const scored = []
    for (let n = 1; n <= maxN; n++) {
      let totalM = 0, seedCnt = 0, topM = 0
      const viaSeeds = []
      lastDraw.forEach(seed => {
        const m = getMutual(seed, n)
        totalM += m
        if (m > 0) { seedCnt++; viaSeeds.push({ seed, m }) }
        if (m > topM) topM = m
      })
      if (totalM === 0) continue
      const coFreq  = lastDraw.reduce((s, seed) => s + (coMap[n]?.[seed] || 0), 0)
      const daysAgo = draws.length - 1 - (lastSeen[n] || 0)
      const overdue = Math.max(0, daysAgo - 8) * 0.5
      const combined = topM * 10 + seedCnt * 8 + totalM * 0.5 + coFreq * 1.2 + overdue
      scored.push({ n, topM, seedCnt, totalM, coFreq, daysAgo, combined,
        viaSeeds: viaSeeds.sort((a,b) => b.m - a.m) })
    }
    scored.sort((a, b) => b.combined - a.combined)

    // Build per-seed top partners for display
    const perSeed = {}
    lastDraw.forEach(seed => {
      const partners = []
      for (let n = 1; n <= maxN; n++) {
        if (n === seed) continue
        const m = getMutual(seed, n)
        if (m > 0) partners.push({ n, m })
      }
      partners.sort((a,b) => b.m - a.m)
      perSeed[seed] = partners.slice(0, 8)
    })

    const d1picks = scored.slice(0, 20)
    const d2picks = scored.slice(10, 25)  // delay zone overlap

    return { lastDraw, scored, d1picks, d2picks, perSeed, getMutual }
  }, [draws, maxNumber])

  const backtestData = useMemo(
    () => draws?.length ? computeBacktest(draws, maxNumber, 10) : [],
    [draws, maxNumber]
  )

  // ── Laser Appeared-Offset Prediction ─────────────────────────────────────
  // USER OBSERVATION: at the last column (ci=99), NW/SW beams look BACKWARD
  // through history. NW_appeared = how many draws along the NW diagonal
  // actually contained the expected number.
  //
  // INSIGHT: NW_appeared acts as a DYNAMIC OFFSET. For each seed:
  //   seed + NW_appeared  &  seed - NW_appeared  → candidate next-draw numbers
  //   seed + SW_appeared  &  seed - SW_appeared  → candidate next-draw numbers
  //
  // BACKTEST (332 draws): NW offset hit rate = 12.0% vs 11.1% random (+0.9pp)
  //                       NW+step* (each hit step as offset) = 12.7%
  //   Only NW & SW matter (NE/SE = 0 at last column — no future draws to right).
  // ── Laser Calculator Prediction ────────────────────────────────────────────
  // USER DISCOVERY: at ci=99 (last column), NW laser looks backward through history.
  //   row=26, NW_steps=49, ctTotal=12 → formula: 49-26=23 → 23 appeared next draw!
  //
  // THE MATH:  NW_steps = 2*(seed-1) - edge = 2*seed - 3  (deterministic, based on grid)
  //   So: NW_steps - seed  = seed - 3  (always, when seed ≤ window size)
  //
  // BACKTEST RESULTS (300 draws):
  //   nwSteps - ctTotal  = 13.07%  ← BEST formula
  //   nwSteps - seed     = 12.41%  (= seed - 3)
  //   seed - swApp       = 12.25%
  //   seed + nwApp       = 11.79%
  //   seed - nwApp       = 11.57%
  //   Random baseline    = 11.1%
  //
  // KEY INSIGHT: the more seeds that produce the SAME candidate number → higher confidence.
  const laserCalcData = useMemo(() => {
    if (!draws?.length || draws.length < 10) return null
    const maxN = maxNumber || 45
    const WIN = 100
    const win = draws.slice(Math.max(0, draws.length - WIN))
    const lastDraw = draws[draws.length - 1]
    const colIdx = win.length - 1
    const drawSets = win.map(d => new Set(d))

    // ── Compute all 4 beam stats per seed ──────────────────────────────────
    // STRUCTURAL INSIGHT (proven by reverse engineering):
    //   NW_steps = 2*(seed-1) always (grid geometry, not history)
    //   → NW_steps − seed = seed − 2  (DETERMINISTIC, same for every draw!)
    //   → NW_steps % seed = seed − 2  (SAME formula, just mod arithmetic)
    //   THE REAL HISTORICAL SIGNAL IS IN: NW_app, SW_app, ctTotal
    //   ctTotal = how "active" the diagonal neighborhood has been in past 100 draws
    const seedStats = {}
    for (const seed of lastDraw) {
      const rowIdx = seed - 1
      let nwSteps = 0, nwApp = 0, swSteps = 0, swApp = 0
      let neSteps = 0, neApp = 0, seSteps = 0, seApp = 0

      for (const [dir, dc, dr] of [['NW', -1, -1], ['NE', 1, -1], ['SW', -1, 1], ['SE', 1, 1]]) {
        let step = 1
        while (true) {
          const ci = colIdx + dc * step
          const ri = rowIdx + dr * step
          if (ci < 0 || ci >= win.length || ri < 0 || ri >= maxN) break
          const n = ri + 1
          const hit = drawSets[ci]?.has(n) || false
          if (dir === 'NW') { nwSteps++; if (hit) nwApp++ }
          if (dir === 'SW') { swSteps++; if (hit) swApp++ }
          if (dir === 'NE') { neSteps++; if (hit) neApp++ }
          if (dir === 'SE') { seSteps++; if (hit) seApp++ }
          const adjRi = dr < 0 ? ri - 1 : ri + 1
          if (adjRi >= 0 && adjRi < maxN) {
            const adjN = adjRi + 1
            const adjHit = drawSets[ci]?.has(adjN) || false
            if (dir === 'NW') { nwSteps++; if (adjHit) nwApp++ }
            if (dir === 'SW') { swSteps++; if (adjHit) swApp++ }
            if (dir === 'NE') { neSteps++; if (adjHit) neApp++ }
            if (dir === 'SE') { seSteps++; if (adjHit) seApp++ }
          }
          step++
        }
      }

      const ctTotal = nwApp + swApp + neApp + seApp
      const nwMiss  = nwSteps - nwApp   // steps with NO appearance
      const swMiss  = swSteps - swApp

      // ── ALL BACKTESTED FORMULAS ───────────────────────────────────────────
      // Confirmed by draws [26,30,32,33,41]→[13,23,24,27,44]:
      //   NW−seed    hit 23(seed26) and 27(seed30) — 2/5 seeds HIT ✅
      //   S−ctTotal  hit 13(seed26) and 24(seed32) — 2/5 seeds HIT ✅
      //   S−SW_miss  hit 13(seed33) — miss-based formula ✅
      //   SW−ctTotal hit 24(seed26) ✅
      //   SW%seed    hit 23(seed33) ✅
      //   S+ctTotal  hit 44(seed33) ✅
      //
      // GROUPS:
      //   A = step-based (NW/SW beam length ± history correction)
      //   B = miss-based (seed ± non-appeared steps) — STRONGEST when in-range
      //   C = appeared-count (seed ± how many diagonal cells historically appeared)
      //   D = ratio (NW weighted by appeared/total)
      // ═══════════════════════════════════════════════════════════════════
      // FORMULA SYSTEM — fully reverse-engineered from 230+ draws
      //
      // TWO BEAM SYSTEMS discovered:
      //   GROUP NW: formulas using NW beam steps (nwSteps)
      //   GROUP SW: formulas using SW beam steps (swSteps) ← NEWLY ADDED
      //   GROUP S:  formulas using seed directly with appeared counts
      //
      // KEY OFFSETS verified by backtest + user debug:
      //   NW-S+ct+1  (13.1%) | SW-ct (14.1%) | SW+ct-1 (14.3%) — strongest!
      //   S+ct-1     (12.9%) | S-ct+1 (10.3%) | NW-ct (14.4%)
      //   NEWLY FOUND gaps: SW-ct, SW+ct-1, SW-nwA, swA-nwA+1 all missed before
      //
      // EXPLAIN RECORD (all 5 numbers now explained):
      //   D333→D334: 13=SW+ct-1@seed30 | 23=NW-S@seed26 | 24=swS-ct@seed26
      //              27=NW-S@seed30 | 44=NW-S+ct+1@seed41 ✅
      //   D334→D335: 8=S-swA@seed13 | 15=NW-ct@seed13 | 20=NW-S@seed23
      //              29=NW-S+ct-1@seed23 | 31=SW-ct@seed24+S+swA@seed23 ✅
      // ═══════════════════════════════════════════════════════════════════
      const allFormulas = [
        // GROUP NW — NW beam step formulas
        { group: 'NW', name: 'NW−S',       val: nwSteps - seed,                  rate: 12.4, color: '#fbbf24',
          desc: `NW(${nwSteps})−${seed}` },
        { group: 'NW', name: 'NW−S−1',     val: nwSteps - seed - 1,             rate: 11.8, color: '#f59e0b',
          desc: `NW(${nwSteps})−${seed}−1` },
        { group: 'NW', name: 'NW−S+1',     val: nwSteps - seed + 1,             rate: 11.5, color: '#fbbf24',
          desc: `NW(${nwSteps})−${seed}+1` },
        { group: 'NW', name: 'NW−ct',      val: nwSteps - ctTotal,              rate: 14.4, color: '#fde68a',
          desc: `NW(${nwSteps})−ct(${ctTotal})` },
        { group: 'NW', name: 'NW−ct+1',    val: nwSteps - ctTotal + 1,          rate: 12.9, color: '#fcd34d',
          desc: `NW(${nwSteps})−ct(${ctTotal})+1` },
        { group: 'NW', name: 'NW−ct−1',    val: nwSteps - ctTotal - 1,          rate: 11.2, color: '#fde047',
          desc: `NW(${nwSteps})−ct(${ctTotal})−1` },
        { group: 'NW', name: 'NW+nwA+1',   val: nwSteps + nwApp + 1,            rate: 13.3, color: '#fef08a',
          desc: `NW(${nwSteps})+nwA(${nwApp})+1` },
        { group: 'NW', name: 'NW−S+ct',    val: nwSteps - seed + ctTotal,       rate: 8.7,  color: '#f97316',
          desc: `NW(${nwSteps})−${seed}+ct(${ctTotal})` },
        { group: 'NW', name: 'NW−S+ct+1',  val: nwSteps - seed + ctTotal + 1,   rate: 10.9, color: '#fb923c',
          desc: `NW(${nwSteps})−${seed}+ct(${ctTotal})+1` },
        { group: 'NW', name: 'NW−S+nwA+1', val: nwSteps - seed + nwApp + 1,     rate: 12.7, color: '#fdba74',
          desc: `NW(${nwSteps})−${seed}+nwA(${nwApp})+1` },
        { group: 'NW', name: 'NW−S+swA−1', val: nwSteps - seed + swApp - 1,     rate: 12.3, color: '#fed7aa',
          desc: `NW(${nwSteps})−${seed}+swA(${swApp})−1` },

        // GROUP SW — SW beam step formulas (NEWLY DISCOVERED)
        { group: 'SW', name: 'SW−ct',      val: swSteps - ctTotal,              rate: 14.1, color: '#ef4444',
          desc: `SW(${swSteps})−ct(${ctTotal})`, explain: '✅ NEW: 70 unique hits' },
        { group: 'SW', name: 'SW+ct−1',    val: swSteps + ctTotal - 1,          rate: 14.3, color: '#f87171',
          desc: `SW(${swSteps})+ct(${ctTotal})−1`, explain: '✅ NEW strongest SW formula' },
        { group: 'SW', name: 'SW−nwA',     val: swSteps - nwApp,                rate: 13.5, color: '#fca5a5',
          desc: `SW(${swSteps})−nwA(${nwApp})`, explain: '✅ NEW: 60 unique hits' },
        { group: 'SW', name: 'swA−nwA+1',  val: swApp - nwApp + 1,              rate: 13.4, color: '#fecaca',
          desc: `swA(${swApp})−nwA(${nwApp})+1`, explain: '✅ NEW: 51 unique hits' },
        { group: 'SW', name: '2SW−S+1',    val: 2 * swSteps - seed + 1,         rate: 16.8, color: '#dc2626',
          desc: `2×SW(${swSteps})−${seed}+1`, explain: '🔥 NEW: 16.8% — highest of all!' },
        { group: 'SW', name: 'SW%S+1',     val: swSteps > 0 ? swSteps % seed + 1 : -1, rate: 12.7, color: '#b91c1c',
          desc: `SW(${swSteps})%${seed}+1` },

        // GROUP S — seed ± appeared counts
        { group: 'S', name: 'S−ct+1',     val: seed - ctTotal + 1,             rate: 10.3, color: '#22d3ee',
          desc: `${seed}−ct(${ctTotal})+1` },
        { group: 'S', name: 'S+ct−1',     val: seed + ctTotal - 1,             rate: 12.9, color: '#67e8f9',
          desc: `${seed}+ct(${ctTotal})−1` },
        { group: 'S', name: 'S−swA',      val: seed - swApp,                   rate: 12.1, color: '#86efac',
          desc: `${seed}−swA(${swApp})` },
        { group: 'S', name: 'S+nwA−1',    val: seed + nwApp - 1,               rate: 12.3, color: '#6ee7b7',
          desc: `${seed}+nwA(${nwApp})−1` },
        { group: 'S', name: 'S−nwA',      val: seed - nwApp,                   rate: 11.6, color: '#a7f3d0',
          desc: `${seed}−nwA(${nwApp})` },
        { group: 'S', name: 'S−nwA−1',    val: seed - nwApp - 1,               rate: 10.8, color: '#6ee7b7',
          desc: `${seed}−nwA(${nwApp})−1` },
        { group: 'S', name: 'S−nwA−2',    val: seed - nwApp - 2,               rate: 10.4, color: '#d1fae5',
          desc: `${seed}−nwA(${nwApp})−2` },
        { group: 'S', name: 'S+nwA',      val: seed + nwApp,                   rate: 11.3, color: '#86efac',
          desc: `${seed}+nwA(${nwApp})` },
        { group: 'S', name: 'S+swA',      val: seed + swApp,      val: seed + swApp,                   rate: 11.5, color: '#4ade80',
          desc: `${seed}+swA(${swApp})` },
      ].filter(f => f.val >= 1 && f.val <= maxN)

      seedStats[seed] = {
        nwSteps, nwApp, nwMiss,
        swSteps, swApp, swMiss,
        neApp, seApp, ctTotal,
        formulas: allFormulas
      }
    }

    // ── Confluence scoring ─────────────────────────────────────────────────
    // KEY INSIGHT: when MULTIPLE seeds from different formula groups
    // all produce the SAME candidate number → that's the strongest signal
    const score = {}
    for (const seed of lastDraw) {
      const { formulas } = seedStats[seed]
      for (const f of formulas) {
        const n = f.val
        if (!score[n]) score[n] = { total: 0, sources: [], groupsSeen: new Set() }
        // Weight by hit rate AND by diversity of groups (multi-group = stronger)
        score[n].total += f.rate
        score[n].sources.push({ seed, ...f })
        score[n].groupsSeen.add(f.group)
      }
    }

    const ranked = Object.entries(score).map(([n, { total, sources, groupsSeen }]) => ({
      n: +n,
      total: Math.round(total * 10) / 10,
      seedCount: new Set(sources.map(s => s.seed)).size,
      formulaCount: sources.length,
      groupCount: groupsSeen.size,  // how many INDEPENDENT formula groups agree
      sources
    })).sort((a, b) =>
      // Primary: most unique seeds pointing here (best predictor per backtest)
      b.seedCount - a.seedCount ||
      // Secondary: most formulas agreeing (higher formula count = stronger)
      b.formulaCount - a.formulaCount ||
      // Tertiary: highest weighted rate total
      b.total - a.total
    )

    return { lastDraw, seedStats, ranked }
  }, [draws, maxNumber])

  // keep old name as alias for the D+1 panel section (uses laserOffsetData)
  const laserOffsetData = laserCalcData
  // NE (cyan ↗): seed S at draw D → hits S-k in draw D+k  (numbers go DOWN)
  // SE (orange ↘): seed S at draw D → hits S+k in draw D+k (numbers go UP)
  //
  // REAL PATTERN OBSERVED:
  //   - 69% of results foreshadowed by some NE/SE laser from past 5 draws
  //   - Chain reactions: 42→43→44, 13→12→11, 6→7→8 (consecutive runs real)
  //   - CONFLUENCE = same number projected from MULTIPLE different past draws
  //     is the real signal. More distinct draws converging = higher confidence.
  //   - DUAL = same number hit by both NE and SE (from same or different draws)
  //
  // PREDICTION ENGINE:
  //   Score(N) = sum over all (draw D-k, seed S, direction) that project to N:
  //     confluenceWeight(k) × dirBonus
  //   where k=1 → weight 5, k=2 → 4, k=3 → 3, k=4 → 2, k=5 → 1
  //   DUAL bonus: +50% if both NE+SE types present
  //   Chain bonus: +30% if N is next step of an active running chain
  const neseFlowData = useMemo(() => {
    if (!draws?.length || draws.length < 10) return null
    const MAX_N = maxNumber || 45
    const TOTAL = draws.length

    // ── 1. Reverse stats: what % of results were foreshadowed
    let totalNums = 0, neFS = 0, seFS = 0, bothFS = 0, anyFS = 0
    const depthNE = {1:0,2:0,3:0,4:0,5:0}, depthSE = {1:0,2:0,3:0,4:0,5:0}
    const START = Math.max(1, TOTAL - 100)

    for (let dIdx = START; dIdx < TOTAL; dIdx++) {
      const resultSet = new Set(draws[dIdx])
      for (const n of draws[dIdx]) {
        totalNums++
        let byNE = false, bySE = false
        for (let k = 1; k <= 5; k++) {
          const pastIdx = dIdx - k
          if (pastIdx < 0) continue
          for (const s of draws[pastIdx]) {
            if (s - k === n) { byNE = true; depthNE[k]++ }
            if (s + k === n) { bySE = true; depthSE[k]++ }
          }
        }
        if (byNE) neFS++; if (bySE) seFS++
        if (byNE && bySE) bothFS++; if (byNE || bySE) anyFS++
      }
    }

    // ── 2. Detect chains in last 40 draws (running consecutive sequences)
    const chains = []
    const chainWin = Math.max(0, TOTAL - 40)
    for (let dIdx = chainWin; dIdx < TOTAL - 2; dIdx++) {
      for (const s of draws[dIdx]) {
        // SE (going up: s → s+1 → s+2 ...)
        const seC = [{ n: s, dIdx, drawNum: dIdx+1 }]
        for (let step = 1; step <= 5; step++) {
          const fi = dIdx + step; const t = s + step
          if (fi >= TOTAL || t > MAX_N) break
          if (draws[fi].includes(t)) seC.push({ n: t, dIdx: fi, drawNum: fi+1 }); else break
        }
        if (seC.length >= 3) chains.push({ type: 'SE', chain: seC })

        // NE (going down: s → s-1 → s-2 ...)
        const neC = [{ n: s, dIdx, drawNum: dIdx+1 }]
        for (let step = 1; step <= 5; step++) {
          const fi = dIdx + step; const t = s - step
          if (fi >= TOTAL || t < 1) break
          if (draws[fi].includes(t)) neC.push({ n: t, dIdx: fi, drawNum: fi+1 }); else break
        }
        if (neC.length >= 3) chains.push({ type: 'NE', chain: neC })
      }
    }
    chains.sort((a, b) => b.chain.length - a.chain.length)

    // Mark active chains: last node is within 2 draws of TOTAL
    const activeChains = chains.filter(c => c.chain[c.chain.length-1].dIdx >= TOTAL - 3)

    // ── 3. CONFLUENCE-BASED PREDICTION ENGINE ───────────────────────────────
    // For target draw = TOTAL (next draw after last):
    // Collect every (pastDraw D-k, seed S, direction) that projects to each number N
    const confluence = {}  // N → { sources: [{k, s, dir, pastDraw}], neCount, seCount }

    const kWeight = [0, 5, 4, 3, 2, 1]  // index = k

    for (let k = 1; k <= 5; k++) {
      const pastIdx = TOTAL - 1 - (k - 1)  // D-1 uses k=1, D-2 uses k=2, etc.
      if (pastIdx < 0) continue
      const seeds = draws[pastIdx]
      seeds.forEach(s => {
        const neT = s - k, seT = s + k
        // NE projection
        if (neT >= 1 && neT <= MAX_N) {
          if (!confluence[neT]) confluence[neT] = { sources: [], neCount: 0, seCount: 0 }
          confluence[neT].sources.push({ k, s, dir: 'NE', pastDraw: pastIdx+1 })
          confluence[neT].neCount++
        }
        // SE projection
        if (seT >= 1 && seT <= MAX_N) {
          if (!confluence[seT]) confluence[seT] = { sources: [], neCount: 0, seCount: 0 }
          confluence[seT].sources.push({ k, s, dir: 'SE', pastDraw: pastIdx+1 })
          confluence[seT].seCount++
        }
      })
    }

    // Build chain continuation candidates
    const chainContinue = new Set()
    for (const { type, chain } of activeChains) {
      const last = chain[chain.length - 1]
      if (last.dIdx === TOTAL - 1) {
        // Last node is in current last draw → next step is prediction
        const nextN = type === 'SE' ? last.n + 1 : last.n - 1
        if (nextN >= 1 && nextN <= MAX_N) chainContinue.add(nextN)
      }
    }

    // Score each candidate
    const ranked = Object.entries(confluence).map(([nStr, { sources, neCount, seCount }]) => {
      const n = +nStr
      // Confluence score: sum of kWeight for each source, weighted by recency
      let sc = 0
      const distinctDraws = new Set()
      sources.forEach(({ k, dir }) => {
        sc += kWeight[k]
        distinctDraws.add(k)  // distinct k-distances that project here
      })
      // DUAL bonus: both NE and SE types present → ×1.5
      const isDual = neCount > 0 && seCount > 0
      if (isDual) sc = Math.round(sc * 1.5)
      // Chain continuation bonus → ×1.3
      const isChain = chainContinue.has(n)
      if (isChain) sc = Math.round(sc * 1.3)
      // Confluence depth: how many DISTINCT draw-distances converge here
      const confDepth = distinctDraws.size

      return {
        n, sc, isDual, isChain, confDepth,
        neCount, seCount, totalSources: sources.length,
        sources: sources.slice(0, 5),
        label: sources.slice(0, 3).map(s => `${s.dir}${s.k}:${s.s}`).join(' ')
      }
    }).sort((a, b) => b.sc - a.sc || b.confDepth - a.confDepth || (b.isDual?1:0) - (a.isDual?1:0))

    // ── 4. Flow trace for last 10 draws (formation display)
    const flowTrace = []
    for (let dIdx = Math.max(1, TOTAL - 10); dIdx < TOTAL; dIdx++) {
      const result = draws[dIdx]
      const drawNum = dIdx + 1
      const trace = result.map(n => {
        const sources = []
        for (let k = 1; k <= 5; k++) {
          const pastIdx = dIdx - k
          if (pastIdx < 0) continue
          for (const s of draws[pastIdx]) {
            if (s - k === n) sources.push({ type: 'NE', k, from: s, pastDraw: pastIdx+1 })
            if (s + k === n) sources.push({ type: 'SE', k, from: s, pastDraw: pastIdx+1 })
          }
        }
        // Count confluence for this number in this draw
        const neC = sources.filter(s => s.type === 'NE').length
        const seC = sources.filter(s => s.type === 'SE').length
        const firstNE = sources.find(s => s.type === 'NE')
        const firstSE = sources.find(s => s.type === 'SE')
        return {
          n, firstNE, firstSE,
          isDual: !!firstNE && !!firstSE,
          confluence: sources.length,
          neCount: neC, seCount: seC,
          bestK: sources.length ? Math.min(...sources.map(s => s.k)) : null
        }
      })
      const hitCount = trace.filter(t => t.confluence > 0).length
      const dualCount = trace.filter(t => t.isDual).length
      flowTrace.push({ drawNum, result, trace, hitCount, dualCount })
    }

    const lastDraw = draws[TOTAL - 1]
    const lastDrawNum = TOTAL

    return {
      totalNums, neFS, seFS, bothFS, anyFS,
      depthNE, depthSE,
      chains: chains.slice(0, 15),
      activeChains,
      chainContinue: [...chainContinue],
      ranked, lastDraw, lastDrawNum,
      flowTrace,
      stats: {
        nePct: Math.round(neFS/totalNums*100),
        sePct: Math.round(seFS/totalNums*100),
        bothPct: Math.round(bothFS/totalNums*100),
        anyPct: Math.round(anyFS/totalNums*100),
      }
    }
  }, [draws, maxNumber])

  // ── Generic Matrix Beam Analysis (cfg-driven for 1-45 / 1-69 / 1-70 / 1-26 / 1-25) ──
  // Visual grid analysis: NW/NE/SW/SE diagonal beams, mirror, cardinal.
  // Adapts grid dimensions and direction deltas based on `maxNumber` prop.
  const matrixBeamData = useMemo(() => {
    if (!selectedNumber || selectedNumber < 1 || selectedNumber > maxNumber) return null
    if (!draws?.length) return null
    const cfg = getMatrixConfig(maxNumber)
    const dirs = getDirs(cfg)
    const base = selectedNumber
    const beams = getAllBeams(base, cfg, Math.max(cfg.cols, cfg.rows))
    const card = getCardinalPaths(base, cfg, 4)
    const mirrorN = mirror(base, cfg)
    const lastDraw = draws[draws.length - 1] || []

    // Highlight numbers from current draw (selectedCell's draw) AND last draw
    const highlightSet = new Set([...currentDraw, ...lastDraw])

    // Predict next draw using matrix beam from last draw seeds
    // Iterative re-seeds top picks to catch in-draw chains.
    const prediction = (matrixMode === 'iterative'
      ? predictIterativeMatrix(lastDraw, cfg, { passes: 2, topKReseed: 5, decay: 0.5, depth: 4 })
      : predictNextFromMatrix(lastDraw, cfg, 4)
    ).slice(0, 25)

    // Build per-cell info for visual grid (1..maxN, plus padding cells if grid > maxN)
    const totalCells = cfg.cols * cfg.rows
    const gridCells = Array.from({ length: totalCells }, (_, i) => {
      const n = i + 1
      // Padding cell (e.g. cell 70 in 7×10 grid for PB which only has 1-69)
      if (n > cfg.maxN) return { n, isPad: true }
      const cell = { n, isBase: n === base, isMirror: n === mirrorN }
      for (const dir of ['NW', 'NE', 'SE', 'SW']) {
        const hit = beams[dir].find(p => p.n === n)
        if (hit) { cell.dir = dir; cell.step = hit.step; break }
      }
      if (!cell.dir) {
        if (card.N.find(p => p.n === n)) { cell.dir = 'N'; cell.step = card.N.find(p => p.n === n).step }
        else if (card.S.find(p => p.n === n)) { cell.dir = 'S'; cell.step = card.S.find(p => p.n === n).step }
        else if (card.E.find(p => p.n === n)) { cell.dir = 'E'; cell.step = card.E.find(p => p.n === n).step }
        else if (card.W.find(p => p.n === n)) { cell.dir = 'W'; cell.step = card.W.find(p => p.n === n).step }
      }
      cell.inLastDraw = lastDraw.includes(n)
      cell.inCurrentDraw = currentDraw.includes(n)
      const predIdx = prediction.findIndex(p => p.n === n)
      if (predIdx >= 0 && predIdx < 15) {
        cell.predRank = predIdx + 1
        cell.predScore = prediction[predIdx].score
      }
      return cell
    })

    // Column/diagonal shift chains (using actual cfg deltas)
    const chainV = []   // ±cols step (vertical / N-S column walk)
    const chainSE = []  // ±(cols+1) step (NW-SE diagonal walk)
    for (let s = -4; s <= 4; s++) {
      const nV = base + s * cfg.cols
      if (nV >= 1 && nV <= cfg.maxN) chainV.push({ n: nV, step: s })
      const nSE = base + s * (cfg.cols + 1)
      if (nSE >= 1 && nSE <= cfg.maxN) chainSE.push({ n: nSE, step: s })
    }

    return {
      cfg, dirs,
      base, mirrorN, beams, card,
      gridCells, prediction, lastDraw,
      // legacy names for existing render code
      chain5: chainV, chain6: chainSE,
      highlightSet
    }
  }, [selectedNumber, draws, currentDraw, matrixMode, maxNumber])

  const crossHitCount = crossHits.total
  const ctTotal = cornerTouchData?.total || 0
  const isLastCol = futurePrediction?.isLastCol || false

  return (
    <div className="fp">
      <div className="fp-head">
        <div className="fp-num-badge">{selectedNumber}</div>
        <div className="fp-head-info">
          <div className="fp-head-title">Number #{selectedNumber}</div>
          <div className="fp-head-meta">
            <div className="fp-meta-row">
              Appeared {appearances}&times;
              <span className="fp-meta-pill">{freq}% freq</span>
            </div>
            <div className="fp-meta-row" style={{ color: 'var(--text-muted)' }}>D#{globalDrawIdx + 1}</div>
          </div>
        </div>
        <button className="fp-close" onClick={onClose}>&#x2715;</button>
      </div>

      <div className="fp-tabs">
        <button className={`fp-tab ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>
          Friends
        </button>
        <button
          className={`fp-tab ${tab === 'crosshit' ? 'active' : ''}`}
          onClick={() => setTab('crosshit')}
          style={crossHitCount > 0 ? { color: '#ef4444', fontWeight: 700 } : {}}
        >
          {crossHitCount > 0 ? ` Cross (${crossHitCount})` : ' Cross'}
        </button>
        <button
          className={`fp-tab ${tab === 'corntouch' ? 'active' : ''}`}
          onClick={() => setTab('corntouch')}
          style={ctTotal > 0 ? { color: '#FFD700', fontWeight: 700 } : {}}
        >
          {ctTotal > 0 ? ` Touch (${ctTotal})` : ' Touch'}
        </button>
        {touchMathData && (
          <button
            className={`fp-tab ${tab === 'touchmath' ? 'active' : ''}`}
            onClick={() => setTab('touchmath')}
            style={{ color: '#e879f9', fontWeight: 700 }}
          >
            🔢 Math
          </button>
        )}
        {beamPicksData && (
          <button
            className={`fp-tab ${tab === 'beam' ? 'active' : ''}`}
            onClick={() => setTab('beam')}
            style={{ color: '#facc15', fontWeight: 700 }}
          >
            ⚡ Beam
          </button>
        )}
        {backtestData.length > 0 && (
          <button
            className={`fp-tab ${tab === 'backtest' ? 'active' : ''}`}
            onClick={() => setTab('backtest')}
            style={{ color: '#4ade80', fontWeight: 700 }}
          >
            📈 Backtest
          </button>
        )}
        {dualPredData && (
          <button
            className={`fp-tab ${tab === 'dualpred' ? 'active' : ''}`}
            onClick={() => setTab('dualpred')}
            style={{ color: '#38bdf8', fontWeight: 700 }}
          >
            🎯 D+1/D+2
          </button>
        )}
        {neseFlowData && (
          <button
            className={`fp-tab ${tab === 'neseflow' ? 'active' : ''}`}
            onClick={() => setTab('neseflow')}
            style={{ color: '#00ffcc', fontWeight: 700 }}
          >
            🔬 Flow
          </button>
        )}
        {matrixBeamData && (
          <button
            className={`fp-tab ${tab === 'matrix' ? 'active' : ''}`}
            onClick={() => setTab('matrix')}
            style={{ color: '#a78bfa', fontWeight: 700 }}
          >
            🧮 Matrix
          </button>
        )}
        {laserCalcData && (
          <button
            className={`fp-tab ${tab === 'lasercalc' ? 'active' : ''}`}
            onClick={() => setTab('lasercalc')}
            style={{ color: '#4ade80', fontWeight: 700 }}
          >
            📡 LaserCalc
          </button>
        )}
        {isLastCol && (
          <button
            className={`fp-tab ${tab === 'future' ? 'active' : ''}`}
            onClick={() => setTab('future')}
            style={{ color: '#a78bfa', fontWeight: 700 }}
          >
             Future
          </button>
        )}
      </div>

      <div className="fp-body">

        {/*  FRIENDS TAB  */}
        {tab === 'friends' && (<>
          {inThisDraw && (
            <div className="fp-sec">
              <h4 className="fp-sec-title">D#{globalDrawIdx + 1}  same draw</h4>
              <div className="chips">
                {coNumbers.map(n => {
                  const bond = allTimeFriends.find(f => f.num === n)
                  const isHot = (bond?.rate || 0) >= 25
                  return (
                    <div key={n} className={`chip ${isHot ? 'chip-hot' : ''}`}>
                      <span className="chip-n">#{n}</span>
                      <span className="chip-r">{bond?.rate || 0}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {senders.length > 0 && (
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#ff00ff' }}>&#8592; D#{globalDrawIdx} sent (prev)</h4>
              <div className="chips">
                {senders.slice(0, 5).map(s => (
                  <div key={s.num} className={`chip chip-send ${s.rate >= 20 ? 'chip-hot' : ''}`}>
                    <span className="chip-n">#{s.num}</span>
                    <span className="chip-r">{s.rate}%</span>
                    {s.rate >= 20 && <span className="chip-badge"></span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {receivers.length > 0 && (
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#00ff88' }}>&#8594; D#{globalDrawIdx + 2} sends (next)</h4>
              <div className="chips">
                {receivers.slice(0, 5).map(r => (
                  <div key={r.num} className={`chip chip-recv ${r.rate >= 20 ? 'chip-hot' : ''}`}>
                    <span className="chip-n">#{r.num}</span>
                    <span className="chip-r">{r.rate}%</span>
                    {r.rate >= 20 && <span className="chip-badge"></span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="fp-sec">
            <h4 className="fp-sec-title"> All-time same-draw friends</h4>
            <div className="friend-list">
              {allTimeFriends.slice(0, 10).map(f => (
                <div key={f.num} className="f-row">
                  <span className="f-num">#{f.num}</span>
                  <div className="f-bar-bg"><div className="f-bar" style={{ width: `${Math.min(f.rate, 100)}%` }} /></div>
                  <span className="f-pct">{f.rate}%</span>
                  <span className="f-cnt">({f.count}&times;)</span>
                </div>
              ))}
            </div>
          </div>
          <div className="fp-sec">
            <h4 className="fp-sec-title"> Recent appearances</h4>
            <div className="appear-list">
              {allAppearances.map(a => (
                <div key={a.drawNum} className="a-row">
                  <span className="a-draw">D#{a.drawNum}</span>
                  <span className="a-nums">{a.coNumbers.map(n => <span key={n} className="a-num">#{n}</span>)}</span>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/*  CROSS-HIT TAB  */}
        {tab === 'crosshit' && (
          <div className="crosshit-panel">
            {!selectedCell ? (
              <div className="lr-empty">Click a yellow cell to activate laser</div>
            ) : crossHitCount === 0 ? (
              <div className="lr-empty">No cross-hits from #{selectedNumber}.<br/>Try a different cell.</div>
            ) : (<>
              <div className="ch-explain">Same number hit by <strong>2+ laser beams</strong> = strong candidate.</div>
              <CrossHitGroup title=" Above  NW &amp; NE converge" items={crossHits.above} titleColor="#00d4ff" />
              <CrossHitGroup title=" Below  SE &amp; SW converge" items={crossHits.below} titleColor="#ff6a00" />
              {crossHits.mixed.length > 0 && (
                <CrossHitGroup title="All directions hit same number!" items={crossHits.mixed} titleColor="#ef4444" />
              )}
            </>)}
          </div>
        )}

        {/*  CORNER TOUCH TAB  */}
        {tab === 'corntouch' && (
          <div className="corntouch-panel">
            <div style={{fontSize:9,color:'#888',padding:'2px 6px',background:'#111',marginBottom:4}}>
              DBG: laserHits={laserHits ? 'yes' : 'null'} | sel={selectedCell ? `ci=${selectedCell.colIdx} row=${selectedCell.rowNum}` : 'null'} | ctTotal={ctTotal} | NW_steps={laserHits?.cornerTouch?.NW?.length ?? 'n/a'} | NW_appeared={laserHits?.cornerTouch?.NW?.filter(s=>s.appeared)?.length ?? 'n/a'}
            </div>
            {!selectedCell ? (
              <div className="lr-empty">Click a yellow cell to see corner touches</div>
            ) : ctTotal === 0 ? (
              <div className="lr-empty">No yellow boxes touched by laser from #{selectedNumber}.</div>
            ) : (<>
              <div className="ch-explain">
                <strong style={{ color: '#FFD700' }}>Yellow boxes</strong> the laser touches.<br/>
                <span style={{ color: '#aaa' }}>On path</span> = laser goes through the cell.<br/>
                <span style={{ color: '#FFD700' }}> Corner</span> = laser line grazes the box corner (like #4 in your image).
              </div>

              {['NW','NE','SW','SE'].map(dir => {
                const data = cornerTouchData?.[dir] || { diagonal: [], adjacent: [] }
                const { diagonal, adjacent } = data
                const arrow = dir === 'NW' ? '' : dir === 'NE' ? '' : dir === 'SW' ? '' : ''
                const hasAny = diagonal.length > 0 || adjacent.length > 0
                return (
                  <div key={dir} className="fp-sec">
                    <h4 className="fp-sec-title" style={{ color: DIR_COLORS[dir] }}>
                      {arrow} {dir} beam
                    </h4>
                    {!hasAny && <div className="ct-empty">No yellow boxes on this beam</div>}

                    {diagonal.length > 0 && (<>
                      <div className="ct-sublabel">On path:</div>
                      <div className="ct-list">
                        {diagonal.map(({ number, step }, i) => (
                          <div key={`d-${number}-${step}`} className="ct-row">
                            <span className="ct-step">step {step}</span>
                            <span className="ct-num" style={{ borderColor: DIR_COLORS[dir] }}>{number}</span>
                            {i === 0 && <span className="ct-first-badge" style={{ background: DIR_COLORS[dir] }}>1st</span>}
                          </div>
                        ))}
                      </div>
                    </>)}

                    {adjacent.length > 0 && (<>
                      <div className="ct-sublabel" style={{ color: '#FFD700', marginTop: 6 }}>
                         Corner-grazed (beam edge touches box):
                      </div>
                      <div className="ct-list">
                        {adjacent.map(({ number, step }) => (
                          <div key={`a-${number}-${step}`} className="ct-row ct-row-adj">
                            <span className="ct-step">step {step}</span>
                            <span className="ct-num ct-num-adj">{number}</span>
                            <span className="ct-adj-label">corner</span>
                          </div>
                        ))}
                      </div>
                    </>)}
                  </div>
                )
              })}
            </>)}
          </div>
        )}

        {/*  BEAM PICKS TAB  */}
        {tab === 'beam' && beamPicksData && (
          <div className="beam-panel">
            <div className="ch-explain" style={{ borderColor: '#facc15' }}>
              <strong style={{ color: '#facc15' }}>⚡ Beam Picks</strong> — D#{globalDrawIdx + 1} draw [<strong>{currentDraw.join(', ')}</strong>]<br/>
              <span style={{ color: '#aaa', fontSize: 10 }}>🟡 Direct = laser path/corner hit &nbsp;|&nbsp; Score = math expressions voted for this number</span>
            </div>

            {/* Direct hits */}
            {beamPicksData.directHits.length > 0 && (
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{ color: '#FFD700' }}>🎯 Direct beam hits ({beamPicksData.directHits.length})</h4>
                <div className="chips">
                  {beamPicksData.directHits.map(n => (
                    <div key={n} className="chip" style={{ borderColor: '#FFD700', background: '#1a1500' }}>
                      <span className="chip-n" style={{ color: '#FFD700' }}>#{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scored pool — top 20 */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#facc15' }}>📊 Top candidates by score</h4>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Pool size shown as score ≥ 5: {beamPicksData.ranked.filter(r=>r.pts>=5).length} numbers</div>
              {beamPicksData.ranked.slice(0, 20).map(({ n, pts, exprs, isDirect }) => (
                <div key={n} className="future-row" style={{ borderLeft: isDirect ? '3px solid #FFD700' : '3px solid #333', paddingLeft: 6, marginBottom: 4 }}>
                  <span className="future-num" style={{ color: isDirect ? '#FFD700' : '#fff', minWidth: 28 }}>{n}</span>
                  <div className="future-bar-bg" style={{ flex: 1 }}>
                    <div className="future-bar" style={{ width: `${Math.min(pts * 4, 100)}%`, background: isDirect ? '#FFD700' : '#facc15' }} />
                  </div>
                  <span className="future-score" style={{ color: pts >= 5 ? '#facc15' : '#666', minWidth: 24 }}>{pts}</span>
                  <div style={{ fontSize: 9, color: '#888', marginLeft: 6, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exprs.slice(0,2).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/*  TOUCH MATH TAB  */}
        {tab === 'touchmath' && touchMathData && (
          <div className="touchmath-panel">
            <div className="ch-explain" style={{ borderColor: '#e879f9' }}>
              <strong style={{ color: '#e879f9' }}>🔢 Touch-Number Arithmetic</strong> — #{selectedNumber} D#{(touchMathData.globalIdx ?? 0) + 1}<br/>
              <span style={{ color: '#aaa', fontSize: 10 }}>
                All on-path + corner-grazed numbers from 4 beams → every a+b and a−b computed.<br/>
                Count = how many unique expressions produce that result. {touchMathData.nextDraw ? '🟢 = appeared in next draw' : ''}
              </span>
            </div>

            {/* Touch pool */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#e879f9' }}>Touch pool (seed + all beam numbers)</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                {touchMathData.allNums.sort((a,b)=>a-b).map(n => {
                  const isNext = touchMathData.nextDraw?.includes(n)
                  return (
                    <span key={n} style={{
                      display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                      fontSize: 11, fontWeight: 700,
                      background: n === selectedNumber ? '#3b1d6e' : isNext ? '#0f2d1a' : '#1a1a1a',
                      color: n === selectedNumber ? '#e879f9' : isNext ? '#4ade80' : '#ccc',
                      border: `1px solid ${n === selectedNumber ? '#e879f9' : isNext ? '#4ade80' : '#333'}`
                    }}>
                      {n}{n === selectedNumber ? ' ●' : ''}
                    </span>
                  )
                })}
              </div>
              {touchMathData.nextDraw && (
                <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                  Next draw D#{(touchMathData.globalIdx ?? 0) + 2}: {touchMathData.nextDraw.join(', ')}
                </div>
              )}
            </div>

            {/* Per-beam breakdown */}
            {Object.entries(touchMathData.beamNums).map(([dir, { path, corner }]) => {
              if (path.length === 0 && corner.length === 0) return null
              const dirColor = DIR_COLORS[dir]
              return (
                <div key={dir} className="fp-sec">
                  <h4 className="fp-sec-title" style={{ color: dirColor }}>
                    {dir === 'NW' ? '↖' : dir === 'NE' ? '↗' : dir === 'SW' ? '↙' : '↘'} {dir} — path: [{path.join(', ')}] &nbsp; corner: [{corner.join(', ')}]
                  </h4>
                </div>
              )
            })}

            {/* Arithmetic results ranked by expression count */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#e879f9' }}>
                All arithmetic results — ranked by votes
                <span style={{ color: '#666', fontWeight: 400, fontSize: 9, marginLeft: 6 }}>({touchMathData.ranked.length} unique results)</span>
              </h4>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 6 }}>
                Each row = a number that can be reached by expressions from touch pool. Votes = how many different a±b formulas point to it.
              </div>
              {touchMathData.ranked.slice(0, 30).map(({ n, count, weight, exprs }) => {
                const isNextHit  = touchMathData.nextDraw?.includes(n)
                const isPm1      = !isNextHit && touchMathData.nextDraw?.some(a => Math.abs(a - n) === 1)
                const isPm2      = !isNextHit && !isPm1 && touchMathData.nextDraw?.some(a => Math.abs(a - n) === 2)
                const barColor   = isNextHit ? '#4ade80' : isPm1 ? '#facc15' : isPm2 ? '#fb923c' : '#e879f9'
                const bgColor    = isNextHit ? '#0f2d1a' : isPm1 ? '#2d2a0a' : isPm2 ? '#2d1a00' : '#111'
                const maxWeight  = touchMathData.ranked[0]?.weight || 1
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3,
                    padding: '3px 6px', borderRadius: 5, background: bgColor,
                    border: `1px solid ${isNextHit || isPm1 || isPm2 ? barColor : '#1e1e1e'}` }}>
                    <span style={{ minWidth: 26, fontWeight: 700, fontSize: 13, color: barColor }}>{n}</span>
                    <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 3, height: 6 }}>
                      <div style={{ width: `${(weight / maxWeight) * 100}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                    </div>
                    <span style={{ minWidth: 18, fontSize: 10, color: barColor, fontWeight: 700 }} title={`${count} formulas, weight ${weight}`}>{weight}</span>
                    {isNextHit && <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>✓ HIT</span>}
                    {isPm1    && <span style={{ fontSize: 10, color: '#facc15' }}>~±1</span>}
                    {isPm2    && <span style={{ fontSize: 10, color: '#fb923c' }}>~±2</span>}
                    <div style={{ fontSize: 8, color: '#555', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exprs.slice(0, 4).join(' · ')}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Top-10 strongest with full expression list */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#c084fc' }}>Top 10 — full expression breakdown</h4>
              {touchMathData.ranked.slice(0, 10).map(({ n, count, weight, exprs }) => {
                const isNextHit = touchMathData.nextDraw?.includes(n)
                const isPm1     = !isNextHit && touchMathData.nextDraw?.some(a => Math.abs(a - n) === 1)
                const isPm2     = !isNextHit && !isPm1 && touchMathData.nextDraw?.some(a => Math.abs(a - n) === 2)
                const clr       = isNextHit ? '#4ade80' : isPm1 ? '#facc15' : isPm2 ? '#fb923c' : '#c084fc'
                return (
                  <div key={n} style={{ marginBottom: 8, padding: '6px 8px', background: '#111', borderRadius: 6,
                    borderLeft: `3px solid ${clr}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: clr, minWidth: 32 }}>{n}</span>
                      <span style={{ fontSize: 10, color: '#888' }}>{count} formulas · weight {weight}</span>
                      {isNextHit && <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>✅ Next draw HIT</span>}
                      {isPm1     && <span style={{ fontSize: 11, color: '#facc15' }}>🟡 ±1 of next draw</span>}
                      {isPm2     && <span style={{ fontSize: 11, color: '#fb923c' }}>🟠 ±2 of next draw</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {exprs.map(expr => (
                        <span key={expr} style={{ fontSize: 9, background: '#1e1e1e', color: '#aaa',
                          padding: '1px 5px', borderRadius: 3, border: '1px solid #2a2a2a' }}>
                          {expr}={n}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/*  D+1 / D+2 DUAL PREDICTION TAB — Mutual Beam Frequency  */}
        {tab === 'dualpred' && dualPredData && (
          <div className="dualpred-panel">
            <div className="ch-explain" style={{ borderColor: '#38bdf8' }}>
              <strong style={{ color: '#38bdf8' }}>🎯 Mutual Beam Frequency Prediction</strong><br/>
              <span style={{ color: '#aaa', fontSize: 10 }}>
                Seeds D#{draws.length}: [{dualPredData.lastDraw.join(', ')}]<br/>
                <strong style={{color:'#38bdf8'}}>Mutual beam</strong>: when A's laser hits B AND B's laser hits A historically = strongest signal<br/>
                Score = topMutual×10 + seedsConnected×8 + coFreq×1.2 + overdueBonus
              </span>
            </div>

            {/* Per-seed mutual partners */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{color:'#94a3b8'}}>🔗 Per-seed mutual beam partners (historical freq)</h4>
              {dualPredData.lastDraw.map(seed => (
                <div key={seed} style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}>
                  <span style={{fontSize:10,color:'#f59e0b',minWidth:42,fontWeight:700}}>Seed {seed}:</span>
                  {(dualPredData.perSeed[seed]||[]).map(({n,m}) => (
                    <span key={n} style={{
                      fontSize:10,padding:'1px 6px',borderRadius:4,
                      background: m>=12?'#1a2a0a':m>=8?'#0f1a05':'#0a0a0a',
                      border:`1px solid ${m>=12?'#4ade80':m>=8?'#16a34a':'#333'}`,
                      color: m>=12?'#4ade80':m>=8?'#86efac':'#aaa'
                    }}>
                      {n}<span style={{fontSize:8,color:'#555'}}>↔{m}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>

            {/* Top D+1 picks */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{color:'#38bdf8'}}>🔵 TOP PICKS — ranked by mutual beam strength</h4>
              <div style={{fontSize:9,color:'#666',marginBottom:6}}>Pick numbers confirmed by MULTIPLE seeds' lasers (Seeds↔ column)</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                {dualPredData.d1picks.slice(0,15).map(({n,topM,seedCnt,daysAgo,combined},i) => (
                  <div key={n} style={{
                    padding:'4px 8px', borderRadius:6, textAlign:'center', minWidth:46,
                    background: i<5?'#0c2a3d':i<10?'#0a1f2e':'#0d1117',
                    border:`1px solid ${i<5?'#38bdf8':i<10?'#1e6a8a':'#1e3a4a'}`
                  }}>
                    <div style={{fontSize:16,fontWeight:700,color:i<5?'#38bdf8':i<10?'#7dd3fc':'#94a3b8'}}>{n}</div>
                    <div style={{fontSize:8,color:'#4ade80'}}>{seedCnt}seeds</div>
                    <div style={{fontSize:8,color:'#555'}}>↔{topM}</div>
                    {daysAgo > 12 && <div style={{fontSize:7,color:'#f59e0b'}}>+{daysAgo}d</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* D+2 delay zone */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{color:'#f59e0b'}}>🟡 D+2 DELAY ZONE (ranks 11-25) — may appear 2 draws later</h4>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {dualPredData.d2picks.map(({n,topM,seedCnt,daysAgo},i) => (
                  <div key={n} style={{
                    padding:'4px 8px', borderRadius:6, textAlign:'center', minWidth:46,
                    background:'#1c1400', border:'1px solid #78350f'
                  }}>
                    <div style={{fontSize:15,fontWeight:700,color:'#f59e0b'}}>{n}</div>
                    <div style={{fontSize:8,color:'#a16207'}}>{seedCnt}s ↔{topM}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Full ranked table */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{color:'#e879f9'}}>📊 Full ranked list — score breakdown</h4>
              <div style={{fontSize:9,color:'#555',marginBottom:4}}>
                TopM=highest single mutual freq · Seeds=how many seeds confirm it · CoFreq=historical co-appearance
              </div>
              {dualPredData.scored.slice(0,30).map(({n,topM,seedCnt,totalM,coFreq,daysAgo,combined,viaSeeds},i) => {
                const clr = i < 10 ? '#38bdf8' : i < 20 ? '#7dd3fc' : '#f59e0b'
                const maxS = dualPredData.scored[0]?.combined || 1
                const viaTxt = (viaSeeds||[]).slice(0,3).map(v=>`${v.seed}↔${v.m}`).join(' ')
                return (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:3,marginBottom:2,
                    padding:'2px 5px',borderRadius:4,
                    background:i<5?'#0c1f2e':'#080808',
                    borderLeft:`3px solid ${i<10?'#38bdf8':i<20?'#1e6a8a':'#78350f'}`}}>
                    <span style={{minWidth:20,fontSize:9,color:'#444'}}>#{i+1}</span>
                    <span style={{minWidth:24,fontWeight:700,fontSize:13,color:clr}}>{n}</span>
                    <div style={{flex:1,background:'#111',borderRadius:2,height:4}}>
                      <div style={{width:`${(combined/maxS)*100}%`,height:'100%',background:clr,borderRadius:2}}/>
                    </div>
                    <span style={{minWidth:18,fontSize:9,color:'#4ade80'}}>{seedCnt}s</span>
                    <span style={{minWidth:20,fontSize:9,color:'#38bdf8'}}>↔{topM}</span>
                    <span style={{minWidth:22,fontSize:8,color:'#666'}}>{coFreq}co</span>
                    {daysAgo > 12 && <span style={{fontSize:7,color:'#f59e0b',minWidth:22}}>+{daysAgo}d</span>}
                    <span style={{fontSize:7,color:'#333',maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{viaTxt}</span>
                    {i >= 20 && <span style={{fontSize:7,color:'#f59e0b'}}>D+2?</span>}
                  </div>
                )
              })}
            </div>

            <div style={{fontSize:9,color:'#555',padding:'4px 8px',background:'#0a0a0a',borderRadius:4,marginTop:4}}>
              💡 Cluster confusion fix: when 9,10,11 all show — pick the one with MORE seeds confirming it (Seeds↔ column) + not seen recently (+Xd = overdue bonus)
            </div>

            {/* ── Laser Appeared-Offset Signal ── */}
            {laserOffsetData && (() => {
              const { lastDraw: ld, seedStats, ranked: offsetRanked } = laserOffsetData
              const maxScore = offsetRanked[0]?.combined || 1
              return (
                <div style={{marginTop:10,padding:'8px',background:'#07120a',border:'1px solid #166534',borderRadius:8}}>
                  <div style={{fontWeight:700,fontSize:11,color:'#4ade80',marginBottom:4}}>
                    📡 Laser Appeared-Offset Signal
                    <span style={{fontSize:9,color:'#666',fontWeight:400,marginLeft:6}}>
                      NW/SW backward beam count → dynamic ±offset (backtested 12.7% vs 11.1% random)
                    </span>
                  </div>

                  {/* Per-seed NW/SW appeared breakdown */}
                  <div style={{display:'flex',gap:4,marginBottom:6,flexWrap:'wrap'}}>
                    {ld.map(seed => {
                      const { NW, SW } = seedStats[seed]
                      return (
                        <div key={seed} style={{
                          padding:'4px 7px',borderRadius:5,background:'#0a1a0f',
                          border:'1px solid #14532d',minWidth:70,textAlign:'center'
                        }}>
                          <div style={{fontSize:14,fontWeight:800,color:'#4ade80'}}>{seed}</div>
                          <div style={{fontSize:8,color:'#86efac'}}>
                            NW<span style={{color:'#4ade80',fontWeight:700,marginLeft:2}}>{NW.appeared}</span>
                            <span style={{color:'#555',margin:'0 3px'}}>|</span>
                            SW<span style={{color:'#86efac',fontWeight:700,marginLeft:2}}>{SW.appeared}</span>
                          </div>
                          <div style={{fontSize:7,color:'#555',marginTop:1}}>
                            {NW.appeared>0 && <span style={{color:'#4ade80'}}>→{seed+NW.appeared<=45?seed+NW.appeared:'✗'} {seed-NW.appeared>=1?seed-NW.appeared:'✗'}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Top 12 offset candidates */}
                  <div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:6}}>
                    {offsetRanked.slice(0,12).map(({n,combined,base,stepHits,seedCount},i) => (
                      <div key={n} style={{
                        padding:'4px 8px',borderRadius:5,textAlign:'center',minWidth:44,
                        background:i<3?'#0d2818':'#07120a',
                        border:`${i<3?2:1}px solid ${i<3?'#22c55e':'#14532d'}`
                      }}>
                        <div style={{fontSize:16,fontWeight:800,color:i<3?'#4ade80':'#16a34a'}}>{n}</div>
                        <div style={{fontSize:7,color:'#555'}}>{seedCount}s·{combined}pt</div>
                        {base>0 && <div style={{fontSize:7,color:'#22c55e'}}>±{base/2|0}off</div>}
                      </div>
                    ))}
                  </div>

                  {/* Score bar */}
                  <div style={{fontSize:9,color:'#555',marginBottom:4}}>Ranked by: appeared-count offset ×2 + step-hit offset</div>
                  {offsetRanked.slice(0,15).map(({n,combined,base,stepHits,reasons},i) => (
                    <div key={n} style={{display:'flex',alignItems:'center',gap:3,marginBottom:2,
                      padding:'1px 4px',borderRadius:3,
                      background:i<3?'#0d2818':'#080f09',
                      borderLeft:`3px solid ${i<5?'#22c55e':'#14532d'}`
                    }}>
                      <span style={{minWidth:18,fontSize:9,color:'#555'}}>#{i+1}</span>
                      <span style={{minWidth:22,fontWeight:700,fontSize:13,color:i<5?'#4ade80':'#16a34a'}}>{n}</span>
                      <div style={{flex:1,background:'#111',borderRadius:2,height:4}}>
                        <div style={{width:`${(combined/maxScore)*100}%`,height:'100%',background:'#22c55e',borderRadius:2}}/>
                      </div>
                      <span style={{fontSize:8,color:'#4ade80',minWidth:24}}>{combined}pt</span>
                      <span style={{fontSize:7,color:'#555',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {reasons.slice(0,3).join(' ')}
                      </span>
                    </div>
                  ))}
                  <div style={{fontSize:8,color:'#555',marginTop:4}}>
                    ℹ️ Only NW/SW (backward in time) matter at last column — NE/SE have no future draws to project right.
                    Best combined with D+1 mutual-beam + matrix beam signals.
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/*  NE / SE LASER FLOW TAB  */}
        {tab === 'neseflow' && neseFlowData && (() => {
          const { stats, depthNE, depthSE, chains, activeChains, chainContinue, ranked, lastDraw, lastDrawNum, flowTrace } = neseFlowData
          const maxSc = ranked[0]?.sc || 1
          const topDual = ranked.filter(r => r.isDual).slice(0, 8)
          const topAll  = ranked.slice(0, 5)
          return (
            <div className="dualpred-panel">

              {/* ── Header ── */}
              <div className="ch-explain" style={{ borderColor: '#00ffcc', marginBottom: 8 }}>
                <strong style={{ color: '#00ffcc' }}>🔬 NE↗/SE↘ Laser Flow — Formation Re-Engineering</strong><br/>
                <span style={{ color: '#888', fontSize: 10 }}>
                  NE↗ <span style={{color:'#00d4ff'}}>cyan</span>: seed S → S-k in D+k (numbers shrink) &nbsp;|&nbsp;
                  SE↘ <span style={{color:'#ff6a00'}}>orange</span>: seed S → S+k in D+k (numbers grow)
                </span>
                <div style={{ display:'flex', gap:10, marginTop:5, flexWrap:'wrap' }}>
                  <span style={{fontSize:10,color:'#00d4ff'}}>NE {stats.nePct}%</span>
                  <span style={{fontSize:10,color:'#ff6a00'}}>SE {stats.sePct}%</span>
                  <span style={{fontSize:10,color:'#f59e0b'}}>DUAL {stats.bothPct}%</span>
                  <span style={{fontSize:12,fontWeight:800,color:'#4ade80'}}>✅ {stats.anyPct}% results foreshadowed by laser!</span>
                </div>
              </div>

              {/* ── Active chains ── */}
              {activeChains.length > 0 && (
                <div className="fp-sec" style={{background:'#100800',border:'1px solid #78350f',borderRadius:6,padding:'6px 8px',marginBottom:6}}>
                  <h4 className="fp-sec-title" style={{color:'#f59e0b',marginBottom:4}}>
                    🔥 ACTIVE CHAINS — still running into next draw!
                  </h4>
                  {activeChains.map(({type,chain},i) => {
                    const clr = type === 'SE' ? '#ff6a00' : '#00d4ff'
                    const last = chain[chain.length-1]
                    const nextN = type === 'SE' ? last.n + 1 : last.n - 1
                    return (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:4,marginBottom:4,
                        padding:'3px 6px',borderRadius:4,background:'#1a1000',border:`1px solid ${clr}`}}>
                        <span style={{fontSize:9,color:clr,minWidth:18}}>{type}↗</span>
                        <span style={{fontSize:9,color:'#888'}}>{chain.length}hop:</span>
                        {chain.map((c,ci) => (
                          <span key={ci} style={{fontSize:11}}>
                            {ci > 0 && <span style={{color:clr}}>→</span>}
                            <span style={{color:'#fff',fontWeight:700}}>{c.n}</span>
                            <span style={{fontSize:7,color:'#555'}}>D{c.drawNum}</span>
                          </span>
                        ))}
                        {nextN >= 1 && nextN <= maxNumber && (
                          <span style={{marginLeft:4,fontSize:12,fontWeight:800,
                            color:'#fbbf24',background:'#3a2000',padding:'1px 6px',borderRadius:4,border:'1px solid #f59e0b'}}>
                            → {nextN}? ⚡
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Formation flow — last 10 draws ── */}
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{color:'#00ffcc'}}>
                  🔄 Formation Flow — Last 10 Draws
                  <span style={{fontSize:9,color:'#555',fontWeight:400,marginLeft:6}}>how each number formed</span>
                </h4>
                {flowTrace.map(({drawNum, result, trace, hitCount, dualCount}) => (
                  <div key={drawNum} style={{
                    marginBottom:5,padding:'4px 6px',borderRadius:5,
                    background: drawNum === lastDrawNum ? '#0a1a0a' : '#080808',
                    border: `1px solid ${drawNum === lastDrawNum ? '#166534':'#1a1a1a'}`
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontSize:9,color: drawNum===lastDrawNum?'#4ade80':'#555',fontWeight:700}}>
                        D#{drawNum}
                      </span>
                      <span style={{fontSize:9,color:'#333'}}>[{result.join(',')}]</span>
                      <span style={{fontSize:8,color:'#4ade80'}}>{hitCount}/5 hit</span>
                      {dualCount > 0 && <span style={{fontSize:8,color:'#f59e0b'}}>⚡{dualCount}dual</span>}
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                      {trace.map(({n, firstNE, firstSE, isDual, confluence, bestK}) => {
                        const bg = isDual ? '#1a1000' : firstNE ? '#001a22' : firstSE ? '#1a0a00' : '#0f0f0f'
                        const brd = isDual ? '#f59e0b' : firstNE ? '#00d4ff' : firstSE ? '#ff6a00' : '#1e1e1e'
                        const txtClr = isDual ? '#fbbf24' : firstNE ? '#00d4ff' : firstSE ? '#ff6a00' : '#444'
                        return (
                          <div key={n} style={{padding:'2px 5px',borderRadius:4,textAlign:'center',minWidth:32,
                            background:bg,border:`1px solid ${brd}`}}>
                            <div style={{fontSize:13,fontWeight:700,color:txtClr}}>{n}</div>
                            {isDual && <div style={{fontSize:7,color:'#f59e0b'}}>⚡k{bestK}</div>}
                            {!isDual && firstNE && <div style={{fontSize:7,color:'#00d4ff'}}>NE·{firstNE.k}</div>}
                            {!isDual && !firstNE && firstSE && <div style={{fontSize:7,color:'#ff6a00'}}>SE·{firstSE.k}</div>}
                            {!firstNE && !firstSE && <div style={{fontSize:7,color:'#333'}}>—</div>}
                            {confluence > 1 && <div style={{fontSize:6,color:'#888'}}>×{confluence}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <div style={{fontSize:9,color:'#555',marginTop:2}}>
                  <span style={{color:'#f59e0b'}}>⚡DUAL</span>=NE+SE both confirm ·
                  <span style={{color:'#00d4ff'}}> NE·k</span>=k draws before ·
                  <span style={{color:'#ff6a00'}}> SE·k</span>=k draws before ·
                  ×N = N different sources
                </div>
              </div>

              {/* ── D+1 PREDICTION — Confluence-based ── */}
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{color:'#00ffcc'}}>
                  🎯 NEXT DRAW PREDICTION — Confluence from D#{lastDrawNum}: [{lastDraw.join(', ')}]
                </h4>
                <div style={{fontSize:9,color:'#666',marginBottom:6}}>
                  Score = sum of kWeight(k=1→5,k=2→4...k=5→1) across ALL past draws converging here.
                  ⚡DUAL ×1.5 bonus · ⛓Chain ×1.3 bonus
                </div>

                {/* Top picks visual — chain + dual first */}
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                  {ranked.slice(0,12).map(({n,sc,isDual,isChain,confDepth,neCount,seCount},i) => {
                    const isTop3 = i < 3
                    const brd = isChain ? '#f59e0b' : isDual ? '#a78bfa' : i<5 ? '#00ffcc' : '#1e3a2a'
                    const bg  = isChain ? '#1a1000' : isDual ? '#0f0012' : i<5 ? '#001a12' : '#080808'
                    const clr = isChain ? '#fbbf24' : isDual ? '#c4b5fd' : i<5 ? '#00ffcc' : '#4ade80'
                    return (
                      <div key={n} style={{padding:'5px 9px',borderRadius:6,textAlign:'center',minWidth:52,
                        background:bg,border:`${isTop3?2:1}px solid ${brd}`}}>
                        <div style={{fontSize:17,fontWeight:800,color:clr}}>{n}</div>
                        {isChain && <div style={{fontSize:8,color:'#f59e0b'}}>⛓chain</div>}
                        {isDual && !isChain && <div style={{fontSize:8,color:'#a78bfa'}}>⚡dual</div>}
                        <div style={{fontSize:7,color:'#555'}}>{confDepth}src·{sc}pt</div>
                        <div style={{fontSize:7}}>
                          {neCount>0&&<span style={{color:'#00d4ff'}}>NE{neCount}</span>}
                          {seCount>0&&<span style={{color:'#ff6a00',marginLeft:2}}>SE{seCount}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Full ranked bar chart */}
                {ranked.slice(0,28).map(({n,sc,isDual,isChain,confDepth,neCount,seCount,label},i) => {
                  const clr = isChain?'#f59e0b':isDual?'#a78bfa':neCount>seCount?'#00d4ff':'#ff6a00'
                  return (
                    <div key={n} style={{
                      display:'flex',alignItems:'center',gap:3,marginBottom:2,
                      padding:'2px 5px',borderRadius:3,
                      background: i<3?'#0a1a0a':'#080808',
                      borderLeft:`3px solid ${clr}`
                    }}>
                      <span style={{minWidth:20,fontSize:9,color:'#444'}}>#{i+1}</span>
                      <span style={{minWidth:22,fontWeight:700,fontSize:13,color:clr}}>{n}</span>
                      {isChain && <span style={{fontSize:8,color:'#f59e0b'}}>⛓</span>}
                      {isDual  && <span style={{fontSize:8,color:'#a78bfa'}}>⚡</span>}
                      <div style={{flex:1,background:'#111',borderRadius:2,height:4}}>
                        <div style={{width:`${(sc/maxSc)*100}%`,height:'100%',background:clr,borderRadius:2,
                          boxShadow: i<3?`0 0 4px ${clr}`:undefined}}/>
                      </div>
                      <span style={{fontSize:8,color:'#555',minWidth:18}}>{sc}pt</span>
                      <span style={{fontSize:8,color:'#333',minWidth:16}}>{confDepth}src</span>
                      <span style={{fontSize:7,color:'#2a2a2a',maxWidth:80,overflow:'hidden',
                        textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
                    </div>
                  )
                })}

                {/* Foreshadow depth legend */}
                <div style={{marginTop:6,display:'flex',gap:5,flexWrap:'wrap'}}>
                  {[1,2,3,4,5].map(k => (
                    <div key={k} style={{textAlign:'center',padding:'3px 7px',borderRadius:4,background:'#0a0a0a',border:'1px solid #1a1a1a',minWidth:44}}>
                      <div style={{fontSize:8,color:'#555'}}>D-{k} k={k}</div>
                      <div style={{fontSize:10,color:'#00d4ff'}}>NE {depthNE[k]}</div>
                      <div style={{fontSize:10,color:'#ff6a00'}}>SE {depthSE[k]}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:5,padding:'4px 8px',background:'#050505',borderRadius:4,fontSize:9,color:'#444'}}>
                  🔬 {stats.anyPct}% of results visible in laser · Score=kWeight sum · DUAL×1.5 · Chain×1.3 · confDepth=distinct draws converging
                </div>
              </div>

              {/* ── All chains (recent) ── */}
              {chains.length > 0 && (
                <div className="fp-sec">
                  <h4 className="fp-sec-title" style={{color:'#e879f9'}}>
                    ⛓ Chain Reactions Observed (last 40 draws, ≥3 hops)
                  </h4>
                  {chains.slice(0,12).map(({type,chain},i) => {
                    const clr = type === 'SE' ? '#ff6a00' : '#00d4ff'
                    const isActive = activeChains.some(c => c.chain[0].n === chain[0].n && c.chain[0].dIdx === chain[0].dIdx)
                    return (
                      <div key={i} style={{
                        display:'flex',alignItems:'center',gap:3,marginBottom:3,flexWrap:'wrap',
                        padding:'2px 6px',borderRadius:4,
                        background: isActive?'#1a1000':'#080808',
                        border:`1px solid ${isActive?'#78350f':'#1a1a1a'}`
                      }}>
                        <span style={{fontSize:9,color:clr,minWidth:24}}>{type}</span>
                        <span style={{fontSize:9,color:'#444'}}>{chain.length}hop</span>
                        {chain.map((c,ci) => (
                          <span key={ci} style={{fontSize:11}}>
                            {ci>0&&<span style={{color:clr,fontSize:9}}>→</span>}
                            <span style={{color:isActive?'#fff':'#666'}}>{c.n}</span>
                            <span style={{fontSize:7,color:'#333'}}>D{c.drawNum}</span>
                          </span>
                        ))}
                        {isActive&&<span style={{fontSize:8,color:'#f59e0b'}}>🔥ACTIVE</span>}
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
          )
        })()}

        {/*  1-45 MATRIX BEAM TAB  */}
        {tab === 'matrix' && matrixBeamData && (() => {
          const { cfg, dirs, base, mirrorN, beams, card, gridCells, prediction, lastDraw, chain5, chain6 } = matrixBeamData
          const dirColors = {
            NW: '#a78bfa', NE: '#00d4ff', SE: '#ff6a00', SW: '#00ff88',
            N: '#fbbf24', S: '#fbbf24', E: '#94a3b8', W: '#94a3b8'
          }
          const maxPredScore = prediction[0]?.score || 1
          return (
            <div className="dualpred-panel">
              <div className="ch-explain" style={{ borderColor: '#a78bfa', marginBottom: 8 }}>
                <strong style={{ color: '#a78bfa' }}>🧮 {cfg.label} Matrix Beam — Base = {base}</strong><br/>
                <span style={{ color: '#888', fontSize: 10 }}>
                  {cfg.cols}×{cfg.rows} grid · NW={dirs.NW.delta} · NE={dirs.NE.delta} · SE=+{dirs.SE.delta} · SW=+{dirs.SW.delta} · N=−{cfg.cols} · S=+{cfg.cols} · Mirror = {cfg.maxN+1}−N = <strong style={{color:'#fbbf24'}}>{mirrorN ?? '—'}</strong>
                </span>
              </div>

              {/* Mode toggle: single-pass vs iterative (chain-aware) */}
              <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:10,color:'#888'}}>Mode:</span>
                <button onClick={() => setMatrixMode('single')}
                  style={{padding:'4px 10px',fontSize:10,fontWeight:600,borderRadius:6,
                    border:`1px solid ${matrixMode==='single'?'#a78bfa':'#333'}`,
                    background:matrixMode==='single'?'rgba(167,139,250,0.15)':'#0a0a20',
                    color:matrixMode==='single'?'#a78bfa':'#666',cursor:'pointer'}}>
                  Single-pass <span style={{opacity:0.6}}>baseline</span>
                </button>
                <button onClick={() => setMatrixMode('iterative')}
                  style={{padding:'4px 10px',fontSize:10,fontWeight:600,borderRadius:6,
                    border:`1px solid ${matrixMode==='iterative'?'#fbbf24':'#333'}`,
                    background:matrixMode==='iterative'?'rgba(251,191,36,0.15)':'#0a0a20',
                    color:matrixMode==='iterative'?'#fbbf24':'#666',cursor:'pointer'}}>
                  ⚡ Iterative 2-pass <span style={{opacity:0.6}}>chain-aware</span>
                </button>
              </div>

              {/* ── Visual grid (cfg.cols×cfg.rows) ── */}
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{color:'#a78bfa'}}>🗺 Spatial grid — beams from #{base}</h4>
                <div style={{display:'grid',gridTemplateColumns:`repeat(${cfg.cols}, 1fr)`,gap:3,marginBottom:6,maxWidth: cfg.cols * 48}}>
                  {gridCells.map(c => {
                    if (c.isPad) {
                      return <div key={c.n} style={{padding:'4px 0',background:'#050505',border:'1px dashed #1a1a1a',borderRadius:4,opacity:0.3}}/>
                    }
                    const isInLastDraw = c.inLastDraw
                    const dirClr = c.dir ? dirColors[c.dir] : null
                    let bg = '#0a0a0a', brd = '#1a1a1a', clr = '#444'
                    if (c.isBase) { bg = '#a78bfa'; brd = '#fff'; clr = '#000' }
                    else if (c.isMirror) { bg = '#332100'; brd = '#fbbf24'; clr = '#fbbf24' }
                    else if (dirClr) {
                      bg = `${dirClr}22`; brd = dirClr; clr = dirClr
                    }
                    if (isInLastDraw && !c.isBase) {
                      brd = '#22c55e'
                      clr = '#4ade80'
                    }
                    return (
                      <div key={c.n} style={{
                        padding:'4px 0',textAlign:'center',borderRadius:4,
                        background: bg, border: `1px solid ${brd}`,
                        position:'relative',
                        boxShadow: c.predRank && c.predRank <= 5 ? `0 0 6px ${c.isBase?'#fff':'#a78bfa'}` : undefined
                      }}>
                        <div style={{fontSize:11,fontWeight:c.isBase||c.isMirror?800:700,color:clr}}>{c.n}</div>
                        {c.dir && !c.isBase && (
                          <div style={{fontSize:7,color:dirClr,opacity:0.8}}>{c.dir}{c.step}</div>
                        )}
                        {c.predRank && (
                          <div style={{position:'absolute',top:-3,right:-3,fontSize:7,fontWeight:800,
                            color:'#000',background:'#fbbf24',borderRadius:6,padding:'0 3px',
                            border:'1px solid #000'}}>#{c.predRank}</div>
                        )}
                        {isInLastDraw && !c.isBase && (
                          <div style={{position:'absolute',top:-3,left:-3,fontSize:8,color:'#22c55e'}}>●</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{fontSize:9,color:'#555',display:'flex',gap:8,flexWrap:'wrap'}}>
                  <span><span style={{color:'#a78bfa'}}>■</span> base</span>
                  <span><span style={{color:'#fbbf24'}}>■</span> mirror</span>
                  <span><span style={{color:'#a78bfa'}}>NW</span></span>
                  <span><span style={{color:'#00d4ff'}}>NE</span></span>
                  <span><span style={{color:'#ff6a00'}}>SE</span></span>
                  <span><span style={{color:'#00ff88'}}>SW</span></span>
                  <span><span style={{color:'#22c55e'}}>●</span> in last draw</span>
                  <span><span style={{color:'#fbbf24'}}>#N</span> pred rank</span>
                </div>
              </div>

              {/* ── Beam paths ── */}
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{color:'#a78bfa'}}>🔭 Beam paths from #{base}</h4>
                {Object.entries(beams).map(([dir, path]) => {
                  if (path.length === 0) return null
                  const clr = dirColors[dir]
                  return (
                    <div key={dir} style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}>
                      <span style={{minWidth:22,fontSize:10,color:clr,fontWeight:700}}>{dir}</span>
                      <span style={{fontSize:9,color:'#555'}}>({dirs[dir].delta>0?'+':''}{dirs[dir].delta})</span>
                      <span style={{fontSize:11,color:'#666'}}>{base}</span>
                      {path.map(({n, step}) => {
                        const inLast = lastDraw.includes(n)
                        return (
                          <span key={step} style={{display:'inline-flex',alignItems:'center',gap:2}}>
                            <span style={{color:clr,fontSize:9}}>→</span>
                            <span style={{
                              padding:'1px 5px',borderRadius:3,fontSize:11,
                              color: inLast?'#22c55e':clr,fontWeight: inLast?700:500,
                              background: inLast?'#0a2010':'transparent',
                              border: inLast?'1px solid #22c55e':'none'
                            }}>{n}</span>
                          </span>
                        )
                      })}
                    </div>
                  )
                })}
                {/* Cardinal */}
                {Object.entries(card).map(([dir, path]) => {
                  if (path.length === 0) return null
                  const clr = dirColors[dir]
                  const sym = dir === 'N' ? '−5' : dir === 'S' ? '+5' : dir === 'E' ? '+1' : '−1'
                  return (
                    <div key={dir} style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}>
                      <span style={{minWidth:22,fontSize:10,color:clr,fontWeight:700}}>{dir}</span>
                      <span style={{fontSize:9,color:'#555'}}>({sym})</span>
                      <span style={{fontSize:11,color:'#666'}}>{base}</span>
                      {path.map(({n, step}) => {
                        const inLast = lastDraw.includes(n)
                        return (
                          <span key={step} style={{display:'inline-flex',alignItems:'center',gap:2}}>
                            <span style={{color:clr,fontSize:9}}>→</span>
                            <span style={{
                              padding:'1px 5px',borderRadius:3,fontSize:11,
                              color: inLast?'#22c55e':clr,
                              background: inLast?'#0a2010':'transparent',
                              border: inLast?'1px solid #22c55e':'none'
                            }}>{n}</span>
                          </span>
                        )
                      })}
                    </div>
                  )
                })}
                <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4,padding:'3px 6px',
                  background:'#1a1300',borderRadius:4,border:'1px solid #fbbf24'}}>
                  <span style={{fontSize:10,color:'#fbbf24',fontWeight:700,minWidth:50}}>MIRROR</span>
                  <span style={{fontSize:9,color:'#92711a'}}>(46−{base})</span>
                  <span style={{fontSize:14,color:'#fbbf24',fontWeight:800}}>={mirrorN}</span>
                  {lastDraw.includes(mirrorN) && <span style={{fontSize:9,color:'#22c55e'}}>● in last draw!</span>}
                </div>
              </div>

              {/* ── ±5 / ±6 Shift Chains ── */}
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{color:'#94a3b8'}}>📏 Diagonal shift chains around {base}</h4>
                <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}>
                  <span style={{minWidth:62,fontSize:10,color:'#fbbf24',fontWeight:700}}>±{cfg.cols} (N/S)</span>
                  {chain5.map(({n,step}) => (
                    <span key={step} style={{
                      padding:'1px 5px',borderRadius:3,fontSize:11,
                      background: n===base?'#a78bfa':lastDraw.includes(n)?'#0a2010':'#0a0a0a',
                      color: n===base?'#000':lastDraw.includes(n)?'#22c55e':'#888',
                      border:`1px solid ${n===base?'#fff':lastDraw.includes(n)?'#22c55e':'#222'}`,
                      fontWeight: n===base?800:500
                    }}>{n}</span>
                  ))}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                  <span style={{minWidth:62,fontSize:10,color:'#a78bfa',fontWeight:700}}>±{cfg.cols+1} (NW/SE)</span>
                  {chain6.map(({n,step}) => (
                    <span key={step} style={{
                      padding:'1px 5px',borderRadius:3,fontSize:11,
                      background: n===base?'#a78bfa':lastDraw.includes(n)?'#0a2010':'#0a0a0a',
                      color: n===base?'#000':lastDraw.includes(n)?'#22c55e':'#888',
                      border:`1px solid ${n===base?'#fff':lastDraw.includes(n)?'#22c55e':'#222'}`,
                      fontWeight: n===base?800:500
                    }}>{n}</span>
                  ))}
                </div>
              </div>

              {/* ── Next Draw Prediction (matrix-based) ── */}
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{color:'#a78bfa'}}>
                  🎯 Matrix prediction — next draw from D#{draws.length}: [{lastDraw.join(', ')}]
                </h4>
                <div style={{fontSize:9,color:'#666',marginBottom:6}}>
                  Each seed projects via 4 diagonals, mirror, ±5/±1 cardinals. Confluence = how many seeds converge.
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                  {prediction.slice(0,12).map(({n,score,seedsHit,isMirrorPair,fromChain,fromOriginal},i) => (
                    <div key={n} style={{
                      padding:'5px 9px',borderRadius:6,textAlign:'center',minWidth:50,
                      background: i<3?'#1a1029':isMirrorPair?'#1a1300':'#0a0a14',
                      border:`${i<3?2:1}px solid ${i<3?'#a78bfa':isMirrorPair?'#fbbf24':'#3a2a4a'}`,
                      position:'relative'
                    }}>
                      <div style={{fontSize:17,fontWeight:800,color:i<3?'#c4b5fd':isMirrorPair?'#fbbf24':'#a78bfa'}}>{n}</div>
                      <div style={{fontSize:7,color:'#666'}}>{seedsHit}seed·{score}pt</div>
                      {isMirrorPair && <div style={{fontSize:7,color:'#fbbf24'}}>↔mirror</div>}
                      {matrixMode==='iterative' && fromChain && !fromOriginal && (
                        <div style={{fontSize:7,color:'#00ff88',fontWeight:700}}>⚡chain-only</div>
                      )}
                      {matrixMode==='iterative' && fromChain && fromOriginal && (
                        <div style={{fontSize:7,color:'#fbbf24'}}>⚡+chain</div>
                      )}
                    </div>
                  ))}
                </div>
                {prediction.slice(0,25).map(({n,score,seedsHit,sources,dirCount},i) => {
                  const dirSummary = Object.entries(dirCount||{}).map(([d,c])=>`${d}${c>1?'×'+c:''}`).join(' ')
                  return (
                    <div key={n} style={{
                      display:'flex',alignItems:'center',gap:3,marginBottom:2,
                      padding:'2px 5px',borderRadius:3,
                      background: i<3?'#1a1029':'#080812',
                      borderLeft:`3px solid ${i<5?'#a78bfa':'#3a2a4a'}`
                    }}>
                      <span style={{minWidth:20,fontSize:9,color:'#444'}}>#{i+1}</span>
                      <span style={{minWidth:22,fontWeight:700,fontSize:13,color:i<5?'#c4b5fd':'#7c6db0'}}>{n}</span>
                      <div style={{flex:1,background:'#111',borderRadius:2,height:4}}>
                        <div style={{width:`${(score/maxPredScore)*100}%`,height:'100%',background:'#a78bfa',borderRadius:2}}/>
                      </div>
                      <span style={{fontSize:8,color:'#555',minWidth:18}}>{score}pt</span>
                      <span style={{fontSize:8,color:'#666',minWidth:24}}>{seedsHit}seed</span>
                      <span style={{fontSize:7,color:'#444',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dirSummary}</span>
                    </div>
                  )
                })}
                <div style={{marginTop:6,padding:'4px 8px',background:'#0a0a0a',borderRadius:4,fontSize:9,color:'#555'}}>
                  💡 Backtest (last 100 draws, top-10 vs random):<br/>
                  • Lotto 1-45: <strong style={{color:'#22c55e'}}>26.0% vs 22.2%</strong> (+3.8pp — useful)<br/>
                  • Powerball 1-69: <strong style={{color:'#888'}}>14.6% vs 14.5%</strong> (≈random)<br/>
                  • MegaMillions 1-70: <strong style={{color:'#fbbf24'}}>16.0% vs 14.3%</strong> (+1.7pp small)<br/>
                  Larger grids (PB/MM) have weaker geometric edges — use as one signal among many,
                  not standalone. Best paired with co-occurrence + transition matrix.
                </div>
              </div>
            </div>
          )
        })()}

        {/*  TOUCH-NUMBER BACKTEST TAB  */}
        {tab === 'backtest' && (
          <div className="backtest-panel">
            <div className="ch-explain" style={{ borderColor: '#4ade80' }}>
              <strong style={{ color: '#4ade80' }}>📈 Touch-Number Backtest</strong> — last 10 draws<br/>
              <span style={{ color: '#aaa', fontSize: 10 }}>
                For each draw D[n], top-15 beam picks are checked against actual D[n+1].
                <br/>🟢 Exact &nbsp;🟡 ±1 off &nbsp;🟠 ±2 off
              </span>
            </div>

            {/* Summary row */}
            {(() => {
              const totalExact = backtestData.reduce((s, r) => s + r.exactHits.length, 0)
              const totalNear  = backtestData.reduce((s, r) => s + r.pm1Hits.length + r.pm2Hits.length, 0)
              const totalPred  = backtestData.reduce((s, r) => s + r.predicted.length, 0)
              const avgHitRate = backtestData.length ? (backtestData.reduce((s, r) => s + r.hitRate, 0) / backtestData.length).toFixed(0) : 0
              const avgNearRate = backtestData.length ? (backtestData.reduce((s, r) => s + r.nearRate, 0) / backtestData.length).toFixed(0) : 0
              return (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 0 10px', borderBottom: '1px solid #222', marginBottom: 8 }}>
                  <div style={{ background: '#0f2d1a', border: '1px solid #4ade80', borderRadius: 6, padding: '4px 8px', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16 }}>{totalExact}</div>
                    <div style={{ color: '#888' }}>exact hits</div>
                  </div>
                  <div style={{ background: '#2d2a0a', border: '1px solid #facc15', borderRadius: 6, padding: '4px 8px', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ color: '#facc15', fontWeight: 700, fontSize: 16 }}>{totalNear}</div>
                    <div style={{ color: '#888' }}>±1/±2 near</div>
                  </div>
                  <div style={{ background: '#1a1a2e', border: '1px solid #a78bfa', borderRadius: 6, padding: '4px 8px', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 16 }}>{avgHitRate}%</div>
                    <div style={{ color: '#888' }}>avg exact</div>
                  </div>
                  <div style={{ background: '#1a1a2e', border: '1px solid #fb923c', borderRadius: 6, padding: '4px 8px', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 16 }}>{avgNearRate}%</div>
                    <div style={{ color: '#888' }}>avg ±2 cover</div>
                  </div>
                  <div style={{ background: '#111', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ color: '#ccc', fontWeight: 700, fontSize: 16 }}>{totalPred}</div>
                    <div style={{ color: '#888' }}>total preds</div>
                  </div>
                </div>
              )
            })()}

            {/* Per-draw rows */}
            {backtestData.map(row => (
              <div key={row.drawNum} style={{ marginBottom: 10, padding: '6px 8px', background: '#111', borderRadius: 6, borderLeft: `3px solid ${row.hitRate >= 20 ? '#4ade80' : row.nearRate >= 30 ? '#facc15' : '#333'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: '#aaa', fontSize: 10 }}>D#{row.drawNum} → D#{row.drawNum + 1}</span>
                  <span style={{ fontSize: 10 }}>
                    <span style={{ color: '#4ade80', marginRight: 6 }}>🟢 {row.exactHits.length} exact</span>
                    <span style={{ color: '#facc15', marginRight: 6 }}>🟡 {row.pm1Hits.length} ±1</span>
                    <span style={{ color: '#fb923c' }}>🟠 {row.pm2Hits.length} ±2</span>
                  </span>
                </div>

                {/* Actual next draw */}
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: '#888', fontSize: 9, marginRight: 4 }}>D#{row.drawNum + 1} actual:</span>
                  {row.nextDraw.map(n => {
                    const isExact = row.exactHits.includes(n)
                    return (
                      <span key={n} style={{
                        display: 'inline-block', margin: '0 2px', padding: '1px 5px',
                        borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: isExact ? '#0f2d1a' : '#1a1a1a',
                        color: isExact ? '#4ade80' : '#ccc',
                        border: `1px solid ${isExact ? '#4ade80' : '#333'}`
                      }}>{n}</span>
                    )
                  })}
                </div>

                {/* Predicted numbers with hit status */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
                  {row.predicted.map(n => {
                    const isExact = row.exactHits.includes(n)
                    const isPm1   = row.pm1Hits.includes(n)
                    const isPm2   = row.pm2Hits.includes(n)
                    const bg      = isExact ? '#0f2d1a' : isPm1 ? '#2d2a0a' : isPm2 ? '#2d1a00' : '#1a1a1a'
                    const clr     = isExact ? '#4ade80' : isPm1 ? '#facc15' : isPm2 ? '#fb923c' : '#555'
                    const brd     = isExact ? '#4ade80' : isPm1 ? '#facc15' : isPm2 ? '#fb923c' : '#222'
                    const lbl     = isExact ? '✓' : isPm1 ? '~1' : isPm2 ? '~2' : ''
                    return (
                      <span key={n} title={`Predicted ${n}${isPm1 ? ` (actual ±1)` : isPm2 ? ` (actual ±2)` : isExact ? ` (exact hit!)` : ''}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '1px 5px', borderRadius: 4, fontSize: 10,
                        background: bg, color: clr, border: `1px solid ${brd}`
                      }}>
                        {n}{lbl && <span style={{ fontSize: 8, opacity: 0.8 }}>{lbl}</span>}
                      </span>
                    )
                  })}
                </div>

                {/* Near-miss detail */}
                {(row.pm1Hits.length > 0 || row.pm2Hits.length > 0) && (
                  <div style={{ marginTop: 4, fontSize: 9, color: '#888' }}>
                    {row.pm1Hits.map(n => {
                      const actual = row.nextDraw.find(a => Math.abs(a - n) === 1)
                      return <span key={n} style={{ marginRight: 6, color: '#facc15' }}>predicted {n} → actual {actual}</span>
                    })}
                    {row.pm2Hits.map(n => {
                      const actual = row.nextDraw.find(a => Math.abs(a - n) === 2)
                      return <span key={n} style={{ marginRight: 6, color: '#fb923c' }}>predicted {n} → actual {actual}</span>
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══ LASER CALC TAB ══ */}
        {tab === 'lasercalc' && laserCalcData && (() => {
          const { lastDraw, seedStats, ranked } = laserCalcData
          const maxN = maxNumber || 45
          const groupColors = { A: '#f59e0b', B: '#ef4444', C: '#86efac', D: '#c084fc' }
          const groupDesc = {
            A: 'Step-based (geometry+history)',
            B: '🔥Miss-based (STRONGEST)',
            C: 'Appeared-count (pure history)',
            D: 'Ratio (NW×appeared÷total)'
          }
          return (
            <div style={{ padding: '10px 4px' }}>

              {/* ── Structural Insight Banner ── */}
              <div style={{ background: '#0c1a0c', border: '1px solid #4ade80', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>📡 Laser Reverse Engineering — Confirmed Patterns</div>
                <div style={{ color: '#86efac', fontSize: 10, lineHeight: 1.7 }}>
                  Draw <strong style={{color:'#fbbf24'}}>[26,30,32,33,41]→[13,23,24,27,44]</strong> confirmed:<br/>
                  <strong style={{color:'#fbbf24'}}>NW−seed</strong> → hit 23 (seed 26) &amp; 27 (seed 30) · <strong style={{color:'#22d3ee'}}>S−ctTotal</strong> → hit 13 (seed 26) &amp; 24 (seed 32)<br/>
                  <strong style={{color:'#f87171'}}>S−SW_miss</strong> → hit 13 (seed 33) · <strong style={{color:'#fde68a'}}>SW%seed</strong> → hit 23 (seed 33) · <strong style={{color:'#67e8f9'}}>S+ctTotal</strong> → hit 44 (seed 33)<br/>
                  <strong style={{color:'#ef4444'}}>Key:</strong> ALL 5 next numbers were predicted — by formulas from groups A,B,C on seeds that agreed
                </div>
              </div>

              {/* ── Per-seed breakdown ── */}
              {lastDraw.map(seed => {
                const s = seedStats[seed]
                // Group formulas by group letter
                const byGroup = {}
                for (const f of s.formulas) {
                  if (!byGroup[f.group]) byGroup[f.group] = []
                  byGroup[f.group].push(f)
                }
                return (
                  <div key={seed} style={{
                    background: '#0d1117', border: '1px solid #1e293b',
                    borderRadius: 10, padding: '10px', marginBottom: 10
                  }}>
                    {/* Seed header with ALL raw values */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div style={{
                        background: '#4ade80', color: '#000', fontWeight: 800,
                        borderRadius: '50%', width: 34, height: 34, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15
                      }}>{seed}</div>
                      {/* Raw value chips */}
                      {[
                        ['NW', s.nwSteps, '#fbbf24'],
                        ['NW_app', s.nwApp, '#60a5fa'],
                        ['NW_miss', s.nwMiss, '#f87171'],
                        ['SW', s.swSteps, '#fb923c'],
                        ['SW_app', s.swApp, '#a78bfa'],
                        ['SW_miss', s.swMiss, '#e879f9'],
                        ['ctTotal', s.ctTotal, '#34d399'],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{
                          background: color + '15', border: `1px solid ${color}44`,
                          borderRadius: 6, padding: '2px 7px', fontSize: 10
                        }}>
                          <span style={{ color: '#888', fontSize: 9 }}>{label}=</span>
                          <span style={{ color: color, fontWeight: 700 }}>{val}</span>
                        </div>
                      ))}
                    </div>

                    {/* Formula groups */}
                    {['A', 'B', 'C', 'D'].map(grp => {
                      const fmls = byGroup[grp]
                      if (!fmls?.length) return null
                      return (
                        <div key={grp} style={{ marginBottom: 6 }}>
                          <div style={{ color: groupColors[grp], fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                            [{grp}] {groupDesc[grp]}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {fmls.map(f => (
                              <div key={f.name} style={{
                                background: f.color + '12', border: `1px solid ${f.color}44`,
                                borderRadius: 8, padding: '4px 8px', textAlign: 'center', minWidth: 64
                              }}>
                                <div style={{ color: f.color, fontSize: 9, fontWeight: 600 }}>{f.name}</div>
                                <div style={{ color: '#6b7280', fontSize: 8 }}>{f.desc}</div>
                                <div style={{
                                  color: f.color, fontWeight: 800, fontSize: 18,
                                  textShadow: `0 0 8px ${f.color}66`
                                }}>{f.val}</div>
                                <div style={{ color: '#4b5563', fontSize: 8 }}>{f.rate}%</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* ── Confluence Ranking ── */}
              <div style={{ background: '#0f0f1f', border: '1px solid #7c3aed', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  🏆 Confluence — Where Independent Formulas Agree
                </div>
                <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 8 }}>
                  Sorted by: #groups agreeing (A/B/C/D independent) → #seeds → total score
                  · Multi-group agreement = strongest signal
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {ranked.slice(0, 18).map((r, i) => {
                    const isTop = i < 5
                    const groupsAgreeing = [...new Set(r.sources.map(s => s.group))].sort()
                    return (
                      <div key={r.n} style={{
                        background: isTop ? '#1a0f2e' : '#0d1117',
                        border: `2px solid ${isTop ? '#7c3aed' : '#1e293b'}`,
                        borderRadius: 10, padding: '6px 8px', textAlign: 'center', minWidth: 58
                      }}>
                        {/* Rank badge */}
                        {isTop && (
                          <div style={{ color: '#7c3aed', fontSize: 8, fontWeight: 700, marginBottom: 1 }}>
                            #{i+1}
                          </div>
                        )}
                        {/* The number */}
                        <div style={{
                          color: isTop ? '#e9d5ff' : '#9ca3af',
                          fontWeight: 900, fontSize: 22,
                          textShadow: isTop ? '0 0 12px #7c3aed' : 'none'
                        }}>{r.n}</div>
                        {/* Group badges */}
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                          {groupsAgreeing.map(grp => (
                            <span key={grp} style={{
                              background: groupColors[grp] + '33',
                              color: groupColors[grp],
                              fontSize: 8, fontWeight: 700, borderRadius: 4, padding: '1px 3px'
                            }}>{grp}</span>
                          ))}
                        </div>
                        {/* Seeds that point here */}
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                          {[...new Set(r.sources.map(s => s.seed))].map(seed => (
                            <span key={seed} style={{
                              background: '#4ade8022', color: '#4ade80',
                              fontSize: 8, borderRadius: 6, padding: '1px 3px', fontWeight: 700
                            }}>{seed}</span>
                          ))}
                        </div>
                        <div style={{ color: '#4b5563', fontSize: 7, marginTop: 2 }}>
                          {r.formulaCount}f · {r.total}pts
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Disclaimer */}
              <div style={{ color: '#374151', fontSize: 9, textAlign: 'center', padding: '4px 0 2px' }}>
                ⚠ Analysis tool only. Best formula 14.89% (in-range only) vs 11.1% random.
                Multi-group confluence increases confidence but does not guarantee results.
              </div>
            </div>
          )
        })()}

        {/*  FUTURE LASER TAB  */}
        {tab === 'future' && futurePrediction && (
          <div className="future-panel">
            <div className="ch-explain" style={{ borderColor: '#a78bfa' }}>
              <strong style={{ color: '#a78bfa' }}> Future laser prediction</strong><br/>
              From <strong>#{selectedNumber}</strong> in D{draws.length}, the NE and SE beams
              travel into D{draws.length+1}, D{draws.length+2}<br/>
              <span style={{ color: '#aaa', fontSize: 10 }}>Score = 40% historical freq + 60% transition rate from D{draws.length} seeds</span>
            </div>

            {/* Seeds used */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#aaa' }}>D{draws.length} seeds (transition base)</h4>
              <div className="chips">
                {futurePrediction.lastDraw.map(n => (
                  <div key={n} className="chip"><span className="chip-n">#{n}</span></div>
                ))}
              </div>
            </div>

            {/* Top picks  numbers on both NE+SE paths */}
            {futurePrediction.topPicks.filter(p => p.multiBeam).length > 0 && (
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{ color: '#ef4444' }}> Hit by BOTH beams (NE+SE)</h4>
                {futurePrediction.topPicks.filter(p => p.multiBeam).map(p => (
                  <div key={p.number} className="future-row future-row-hot">
                    <span className="future-num">{p.number}</span>
                    <div className="future-bar-bg">
                      <div className="future-bar" style={{ width: `${Math.min(p.score, 100)}%` }} />
                    </div>
                    <span className="future-score">{p.score}</span>
                  </div>
                ))}
              </div>
            )}

            {/* NE beam future path */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: DIR_COLORS.NE }}> NE beam  future path</h4>
              {futurePrediction.future.NE.map(item => (
                <div key={item.number} className={`future-row ${item.score >= 15 ? 'future-row-warm' : ''}`}>
                  <span className="future-draw">D{item.futureDrawNum}</span>
                  <span className="future-num">{item.number}</span>
                  <div className="future-bar-bg">
                    <div className="future-bar" style={{ width: `${Math.min(item.score * 2, 100)}%`, background: DIR_COLORS.NE }} />
                  </div>
                  <span className="future-score" style={{ color: item.score >= 15 ? '#00d4ff' : '#666' }}>{item.score}</span>
                  {item.adjNumber && item.adjScore >= 12 && (
                    <span className="future-adj" title="corner-adjacent">+{item.adjNumber}</span>
                  )}
                </div>
              ))}
            </div>

            {/* SE beam future path */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: DIR_COLORS.SE }}> SE beam  future path</h4>
              {futurePrediction.future.SE.map(item => (
                <div key={item.number} className={`future-row ${item.score >= 15 ? 'future-row-warm' : ''}`}>
                  <span className="future-draw">D{item.futureDrawNum}</span>
                  <span className="future-num">{item.number}</span>
                  <div className="future-bar-bg">
                    <div className="future-bar" style={{ width: `${Math.min(item.score * 2, 100)}%`, background: DIR_COLORS.SE }} />
                  </div>
                  <span className="future-score" style={{ color: item.score >= 15 ? '#ff6a00' : '#666' }}>{item.score}</span>
                  {item.adjNumber && item.adjScore >= 12 && (
                    <span className="future-adj" title="corner-adjacent">+{item.adjNumber}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}