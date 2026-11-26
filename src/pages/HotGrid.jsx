import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import { computeLaserHits } from '../utils/predictionEngine'
import { buildTransitionMatrix, buildCoOccurrence, buildGapMap } from '../utils/dataUtils'
import { analyzePuzzleLShapes } from '../utils/puzzleLShapes'
import { splitPairDigits, buildTouchDigitOverlap, getCapturePool, rankRepeatCaptures, buildPuzzleBoxes } from '../utils/puzzleCapture'
import LaserLayer from '../components/LaserLayer'
import PuzzleCompare from '../components/PuzzleCompare'
import './HotGrid.css'

const WINDOW_OPTIONS = [20, 50, 100, 200, 'ALL']
const MAXN    = 45
const CELL_W  = 18
const CELL_H  = 20
const LABEL_W = 140

function uniqSorted(nums) {
  return [...new Set(nums)].sort((a, b) => a - b)
}

function sameNumList(a = [], b = []) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function parseStepsInput(text) {
  return uniqSorted((text || '').split(/[^\d]+/).map(Number).filter(n => Number.isFinite(n) && n > 0))
}

function buildDigitPairCalculator(pairInput, maxNum = MAXN) {
  const nums = parseStepsInput(pairInput)
  if (nums.length < 2) return null

  const a = nums[0]
  const b = nums[1]
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  const A = splitPairDigits(a)
  const B = splitPairDigits(b)

  const rows = [
    { label: `${a} + ${b}`, value: a + b },
    { label: `${a} + ${b} - 1`, value: a + b - 1 },
    { label: `${a} + ${b} + 1`, value: a + b + 1 },
    { label: `${A.tens} + ${A.ones} + ${B.tens} + ${B.ones}`, value: A.tens + A.ones + B.tens + B.ones },
    { label: `${A.tens} + ${B.tens} + ${A.ones}`, value: A.tens + B.tens + A.ones },
    { label: `${A.tens} + ${B.ones}`, value: A.tens + B.ones },
    { label: `${A.ones} + ${B.tens}`, value: A.ones + B.tens },
    { label: `${A.ones} + ${B.ones}`, value: A.ones + B.ones },
    { label: `${b} - ${A.ones}`, value: b - A.ones },
    { label: `${b} - ${A.tens}`, value: b - A.tens },
    { label: `${b} - ${a}`, value: b - a },
    { label: `${b} + ${A.ones} + ${A.tens}`, value: b + A.ones + A.tens },
    { label: `${a} + ${B.ones} + ${B.tens}`, value: a + B.ones + B.tens },
    { label: `${a} + ${B.tens}`, value: a + B.tens },
    { label: `${b} + ${A.tens}`, value: b + A.tens },
    { label: `${b} + ${A.ones}`, value: b + A.ones },
    { label: `${a} + ${B.ones}`, value: a + B.ones },
    { label: `${B.ones} + ${A.ones} + ${A.tens}`, value: B.ones + A.ones + A.tens },
    { label: `${hi} - ${lo}`, value: hi - lo },
    { label: `${hi} - ${lo} - 1`, value: hi - lo - 1 },
    { label: `${hi} - ${lo} + 1`, value: hi - lo + 1 },
    { label: `${hi} + ${lo}`, value: hi + lo },
  ]

  const filtered = rows
    .filter(r => Number.isFinite(r.value) && r.value >= 1)
    .map((r, idx) => ({
      id: idx,
      label: r.label,
      value: r.value,
    }))

  const tally = {}
  filtered.forEach(r => {
    if (!tally[r.value]) tally[r.value] = { count: 0, rows: [] }
    tally[r.value].count += 1
    tally[r.value].rows.push(r.label)
  })

  return {
    nums,
    rows: filtered,
    repeated: Object.entries(tally)
      .map(([n, info]) => ({ n: +n, count: info.count, rows: info.rows }))
      .filter(r => r.count >= 2)
      .sort((a, b) => b.count - a.count || a.n - b.n),
  }
}

function getDirStepProfile(laserData, dir) {
  const ct = laserData?.cornerTouch?.[dir] || []
  const onPath = ct.filter(x => x.appeared && !x.isCornerAdj)
  const corner = ct.filter(x => x.appeared && x.isCornerAdj)
  const onPathSteps = uniqSorted(onPath.map(x => x.step))
  const cornerSteps = uniqSorted(corner.map(x => x.step))

  return {
    totalSteps: ct.filter(x => !x.isCornerAdj).length,
    onPathCount: onPath.length,
    cornerCount: corner.length,
    onPathSteps,
    cornerSteps,
    onPathPairs: onPathSteps.map(step => {
      const hit = onPath.find(x => x.step === step)
      return { step, number: hit?.number }
    })
  }
}

function profileMatches(a, b) {
  if (!a || !b) return false
  return (
    a.totalSteps === b.totalSteps &&
    sameNumList(a.onPathSteps, b.onPathSteps) &&
    sameNumList(a.cornerSteps, b.cornerSteps)
  )
}

function aggregateNextDrawNumbers(matches) {
  if (!matches.length) return []
  const count = {}
  matches.forEach(m => {
    m.nextDraw.forEach(n => { count[n] = (count[n] || 0) + 1 })
  })
  return Object.entries(count)
    .map(([n, c]) => ({ n: +n, c, pct: ((c / matches.length) * 100).toFixed(0) }))
    .sort((a, b) => b.c - a.c || a.n - b.n)
    .slice(0, 20)
}

function jaccardScore(a = [], b = []) {
  const sa = new Set(a)
  const sb = new Set(b)
  const union = new Set([...sa, ...sb]).size
  if (!union) return 100
  let overlap = 0
  sa.forEach(v => { if (sb.has(v)) overlap++ })
  return +(overlap / union * 100).toFixed(1)
}

function getSimilarityScore(queryProfile, histProfile) {
  if (!queryProfile || !histProfile) return 0
  const onPath = jaccardScore(queryProfile.onPathSteps, histProfile.onPathSteps)
  const corner = jaccardScore(queryProfile.cornerSteps, histProfile.cornerSteps)
  const totalMax = Math.max(queryProfile.totalSteps || 0, histProfile.totalSteps || 0, 1)
  const countScore = +(100 - (Math.abs((queryProfile.totalSteps || 0) - (histProfile.totalSteps || 0)) / totalMax) * 100).toFixed(1)
  return +((onPath * 0.72) + (corner * 0.18) + (countScore * 0.10)).toFixed(1)
}

function buildAiNextOutcome(matches) {
  if (!matches.length) return []
  const count = {}
  matches.forEach(m => {
    m.nextDraw.forEach(n => { count[n] = (count[n] || 0) + 1 })
  })
  return Object.entries(count)
    .map(([n, c]) => ({ n: +n, c, pct: +(c / matches.length * 100).toFixed(1) }))
    .sort((a, b) => b.c - a.c || a.n - b.n)
    .slice(0, 15)
}

function splitDigits(n) {
  const abs = Math.abs(Number(n) || 0)
  const text = String(abs).padStart(2, '0')
  const tens = +text[0]
  const ones = +text[text.length - 1]
  return { tens, ones, digits: text.split('').map(Number) }
}

function calcPairRecipe(aRaw, bRaw, maxNum = MAXN) {
  const a = Math.round(Number(aRaw))
  const b = Math.round(Number(bRaw))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return []

  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  const A = splitDigits(a)
  const B = splitDigits(b)

  const rows = [
    { label: `${a} + ${b}`, value: a + b },
    { label: `${A.tens} + ${A.ones} + ${B.tens} + ${B.ones}`, value: A.tens + A.ones + B.tens + B.ones },
    { label: `${b} - ${A.ones}`, value: b - A.ones },
    { label: `${b} - ${a}`, value: b - a },
    { label: `${b} + ${A.ones} + ${A.tens}`, value: b + A.ones + A.tens },
    { label: `${a} + ${B.ones} + ${B.tens}`, value: a + B.ones + B.tens },
    { label: `${b} + ${A.ones}`, value: b + A.ones },
    { label: `${a} + ${B.ones}`, value: a + B.ones },
    { label: `${B.ones} + ${A.ones} + ${A.tens}`, value: B.ones + A.ones + A.tens },
    { label: `${hi} - ${lo}`, value: hi - lo },
    { label: `${hi} + ${lo}`, value: hi + lo },
  ]

  return rows
    .filter(r => Number.isFinite(r.value) && r.value >= 1 && r.value <= maxNum)
    .map((r, idx) => ({
      id: idx,
      label: r.label,
      value: r.value,
      digits: splitDigits(r.value),
    }))
}

export default function HotGrid() {
  const [allDraws, setAllDraws] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [window_,  setWindow]   = useState(100)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [selectedCell,   setSelectedCell]   = useState(null)
  const [selectedPair, setSelectedPair] = useState([])
  const [activeDir, setActiveDir] = useState({ NE: true, NW: true, SE: true, SW: true })
  const [panelOpen, setPanelOpen] = useState(false)
  const [sideTab,   setSideTab]   = useState('touch')
  const [historyDir, setHistoryDir] = useState('SW')
  const [manualStepInput, setManualStepInput] = useState('')
  const [pairStepInput, setPairStepInput] = useState('24,27')
  const [repeatCaptureMap, setRepeatCaptureMap] = useState({})
  const [puzzleDraw, setPuzzleDraw] = useState('latest')
  const captureSeenRef = useRef(new Set())
  const scrollRef = useRef(null)

  useEffect(() => {
    fetchAllDraws()
      .then(d => setAllDraws(d.map(r => r.numbers.slice().sort((a, b) => a - b))))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [allDraws.length, window_])

  const draws = useMemo(
    () => window_ === 'ALL' ? allDraws : allDraws.slice(-window_),
    [allDraws, window_]
  )

  const drawSets = useMemo(() => draws.map(d => new Set(d)), [draws])

  const freq = useMemo(() => {
    const f = {}
    for (let n = 1; n <= MAXN; n++) f[n] = 0
    draws.forEach(d => d.forEach(n => f[n]++))
    return f
  }, [draws])

  const sortedNums = useMemo(
    () => Array.from({ length: MAXN }, (_, i) => i + 1).sort((a, b) => freq[b] - freq[a] || a - b),
    [freq]
  )

  const maxFreq     = useMemo(() => Math.max(...Object.values(freq), 1), [freq])
  const lastDrawSet = useMemo(() => new Set(allDraws[allDraws.length - 1] || []), [allDraws])
  const gapMap      = useMemo(() => allDraws.length ? buildGapMap(allDraws)           : {}, [allDraws])
  const transMatrix = useMemo(() => allDraws.length ? buildTransitionMatrix(allDraws) : null, [allDraws])
  const coOccur     = useMemo(() => allDraws.length ? buildCoOccurrence(allDraws)     : null, [allDraws])

  const gridW = draws.length * CELL_W
  const gridH = sortedNums.length * CELL_H

  function gapColor(n) {
    const g = gapMap[n] || 0
    if (g <= 3)  return '#0c2a0c'
    if (g <= 7)  return '#111128'
    if (g <= 14) return '#1a1a1a'
    if (g <= 20) return '#2a1a00'
    return '#3a0a0a'
  }

  const laserHits = useMemo(() => {
    if (!selectedCell) return null
    return computeLaserHits(draws, selectedCell.colIdx, selectedCell.rowNum)
  }, [selectedCell, draws])

  const debugInfo = useMemo(() => {
    if (!selectedCell) return null
    const ci  = selectedCell.colIdx
    const row = selectedCell.rowNum
    const drawNum = allDraws.length - draws.length + ci + 1
    if (!laserHits) return `DBG: sel=ci=${ci} row=${row} | laser=pending`
    const { hits, cornerTouch } = laserHits
    const ctTotal = ['NE','NW','SE','SW'].reduce((s, d) => s + (cornerTouch?.[d]?.length || 0), 0)
    const dirs = ['NE','NW','SE','SW'].map(d => {
      const steps    = (cornerTouch?.[d]?.filter(x => !x.isCornerAdj) || []).length
      const appeared = (hits?.[d]?.length || 0)
      return `${d}_steps=${steps} ${d}_hit=${appeared}`
    }).join(' | ')
    return `DBG: laserHits=yes | sel=ci=${ci} row=${row} D${drawNum} | ctTotal=${ctTotal} | ${dirs}`
  }, [selectedCell, laserHits, draws, allDraws])

  const followsData = useMemo(() => {
    if (!selectedNumber) return []
    const count = {}
    for (let n = 1; n <= MAXN; n++) count[n] = 0
    for (let i = 0; i < allDraws.length - 1; i++) {
      if (allDraws[i].includes(selectedNumber)) allDraws[i + 1].forEach(n => count[n]++)
    }
    const appearances = allDraws.filter(d => d.includes(selectedNumber)).length
    return Object.entries(count)
      .filter(([n]) => +n !== selectedNumber)
      .map(([n, c]) => ({ n: +n, c, pct: appearances ? (c / appearances * 100).toFixed(0) : 0 }))
      .sort((a, b) => b.c - a.c).slice(0, 12)
  }, [selectedNumber, allDraws])

  const precededBy = useMemo(() => {
    if (!selectedNumber) return []
    const count = {}
    for (let n = 1; n <= MAXN; n++) count[n] = 0
    for (let i = 1; i < allDraws.length; i++) {
      if (allDraws[i].includes(selectedNumber)) allDraws[i - 1].forEach(n => count[n]++)
    }
    const appearances = allDraws.filter(d => d.includes(selectedNumber)).length
    return Object.entries(count)
      .filter(([n]) => +n !== selectedNumber)
      .map(([n, c]) => ({ n: +n, c, pct: appearances ? (c / appearances * 100).toFixed(0) : 0 }))
      .sort((a, b) => b.c - a.c).slice(0, 12)
  }, [selectedNumber, allDraws])

  const handleCellClick = useCallback((colIdx, rowNum) => {
    setSelectedCell({ colIdx, rowNum })
    setSelectedNumber(rowNum)
    setPanelOpen(true)
    setSelectedPair(prev => {
      if (prev.includes(rowNum)) return prev.filter(x => x !== rowNum)
      if (prev.length >= 2) return [prev[1], rowNum]
      return [...prev, rowNum]
    })
  }, [])

  const handleRowClick  = useCallback((n) => {
    setSelectedNumber(prev => prev === n ? null : n)
    setSelectedCell(null)
    setPanelOpen(true)
    setSelectedPair(prev => {
      if (prev.includes(n)) return prev.filter(x => x !== n)
      if (prev.length >= 2) return [prev[1], n]
      return [...prev, n]
    })
  }, [])

  const handleDirToggle = useCallback((dir) => setActiveDir(prev => ({ ...prev, [dir]: !prev[dir] })), [])
  const handleClose     = useCallback(() => {
    setSelectedNumber(null)
    setSelectedCell(null)
    setPanelOpen(false)
    setManualStepInput('')
    setSelectedPair([])
  }, [])

  // ── Math tab: arithmetic combinations of beam STEP numbers only ─────────────
  const mathCandidates = useMemo(() => {
    if (!laserHits || !selectedCell) return []

    // Collect ONLY the step numbers (distances) where hits occurred — NOT the hit numbers
    const stepSet = new Set()
    ;['NE','NW','SE','SW'].forEach(dir => {
      if (!activeDir[dir]) return
      const ct = laserHits.cornerTouch?.[dir] || []
      ct.filter(x => x.appeared).forEach(x => stepSet.add(x.step))
    })
    const steps = [...stepSet].sort((a, b) => a - b)
    if (steps.length < 2) return []

    const scores = {}
    const reg = (val, expr) => {
      if (val < 1 || val > MAXN) return
      if (!scores[val]) scores[val] = new Set()
      scores[val].add(expr)
    }

    // Pairs: a+b, b-a, ±1 variants
    for (let i = 0; i < steps.length; i++) {
      for (let j = i + 1; j < steps.length; j++) {
        const a = steps[i], b = steps[j]
        reg(a + b,     `${a}+${b}`)
        reg(a + b - 1, `${a}+${b}-1`)
        reg(a + b + 1, `${a}+${b}+1`)
        reg(b - a,     `${b}-${a}`)
        reg(b - a - 1, `${b}-${a}-1`)
        reg(b - a + 1, `${b}-${a}+1`)
      }
    }

    // Triples: all sign combinations ±1
    for (let i = 0; i < steps.length; i++) {
      for (let j = i + 1; j < steps.length; j++) {
        for (let k = j + 1; k < steps.length; k++) {
          const a = steps[i], b = steps[j], c = steps[k]
          reg(a + b + c,     `${a}+${b}+${c}`)
          reg(a + b + c - 1, `${a}+${b}+${c}-1`)
          reg(a + b + c + 1, `${a}+${b}+${c}+1`)
          reg(a + b - c,     `${a}+${b}-${c}`)
          reg(a + b - c - 1, `${a}+${b}-${c}-1`)
          reg(a + b - c + 1, `${a}+${b}-${c}+1`)
          reg(a + c - b,     `${a}+${c}-${b}`)
          reg(a + c - b - 1, `${a}+${c}-${b}-1`)
          reg(b + c - a,     `${b}+${c}-${a}`)
          reg(b + c - a - 1, `${b}+${c}-${a}-1`)
          reg(b + c - a + 1, `${b}+${c}-${a}+1`)
        }
      }
    }

    return Object.entries(scores)
      .map(([n, exprSet]) => {
        const exprs = [...exprSet]
        return { n: +n, exprs, count: exprs.length }
      })
      .sort((a, b) => b.count - a.count || a.n - b.n)
      .slice(0, 25)
  }, [laserHits, activeDir, selectedCell])

  // Gather step numbers for display in Math tab
  const mathInputs = useMemo(() => {
    if (!laserHits || !selectedCell) return []
    const stepSet = new Set()
    ;['NE','NW','SE','SW'].forEach(dir => {
      if (!activeDir[dir]) return
      const ct = laserHits.cornerTouch?.[dir] || []
      ct.filter(x => x.appeared).forEach(x => stepSet.add(x.step))
    })
    return [...stepSet].sort((a, b) => a - b)
  }, [laserHits, activeDir, selectedCell])

  const currentStepProfiles = useMemo(() => {
    if (!laserHits) return null
    return {
      NE: getDirStepProfile(laserHits, 'NE'),
      NW: getDirStepProfile(laserHits, 'NW'),
      SE: getDirStepProfile(laserHits, 'SE'),
      SW: getDirStepProfile(laserHits, 'SW'),
    }
  }, [laserHits])

  const historyOccurrences = useMemo(() => {
    if (!selectedNumber || allDraws.length < 2) return []
    const out = []
    for (let i = 0; i < allDraws.length - 1; i++) {
      if (!allDraws[i].includes(selectedNumber)) continue
      const histLaser = computeLaserHits(allDraws, i, selectedNumber)
      out.push({
        drawIdx: i,
        drawNum: i + 1,
        nextDrawNum: i + 2,
        nextDraw: allDraws[i + 1],
        profileByDir: {
          NE: getDirStepProfile(histLaser, 'NE'),
          NW: getDirStepProfile(histLaser, 'NW'),
          SE: getDirStepProfile(histLaser, 'SE'),
          SW: getDirStepProfile(histLaser, 'SW'),
        }
      })
    }
    return out
  }, [selectedNumber, allDraws])

  useEffect(() => {
    if (selectedPair.length === 2) {
      setPairStepInput(selectedPair.join(','))
      setPanelOpen(true)
    }
  }, [selectedPair])

  const stepHistoryData = useMemo(() => {
    const manualSteps = parseStepsInput(manualStepInput)
    const targetProfile = currentStepProfiles?.[historyDir] || null

    const exactMatches = targetProfile
      ? historyOccurrences.filter(item => profileMatches(item.profileByDir[historyDir], targetProfile))
      : []

    const manualContainsMatches = manualSteps.length
      ? historyOccurrences.filter(item => manualSteps.every(s => item.profileByDir[historyDir].onPathSteps.includes(s)))
      : []

    const manualExactMatches = manualSteps.length
      ? historyOccurrences.filter(item => sameNumList(item.profileByDir[historyDir].onPathSteps, manualSteps))
      : []

    return {
      targetProfile,
      exactMatches,
      exactNextAgg: aggregateNextDrawNumbers(exactMatches),
      manualSteps,
      manualContainsMatches,
      manualExactMatches,
      manualNextAgg: aggregateNextDrawNumbers(manualContainsMatches),
    }
  }, [manualStepInput, currentStepProfiles, historyDir, historyOccurrences])

  const aiAnalyzerData = useMemo(() => {
    const manualSteps = parseStepsInput(manualStepInput)
    const queryProfile = manualSteps.length
      ? { totalSteps: manualSteps.length, onPathSteps: manualSteps, cornerSteps: [] }
      : currentStepProfiles?.[historyDir] || null

    if (!queryProfile || !historyOccurrences.length) {
      return { queryProfile, matches: [], nextAgg: [], coverage: 0, avgSim: 0, mode: manualSteps.length ? 'manual' : 'live' }
    }

    const matches = historyOccurrences
      .map(item => ({
        ...item,
        sim: getSimilarityScore(queryProfile, item.profileByDir[historyDir])
      }))
      .filter(item => item.sim >= 95)
      .sort((a, b) => b.sim - a.sim || b.drawNum - a.drawNum)

    const coverage = historyOccurrences.length ? +(matches.length / historyOccurrences.length * 100).toFixed(1) : 0
    const avgSim = matches.length ? +(matches.reduce((s, m) => s + m.sim, 0) / matches.length).toFixed(1) : 0
    return {
      queryProfile,
      matches,
      nextAgg: buildAiNextOutcome(matches),
      coverage,
      avgSim,
      mode: manualSteps.length ? 'manual' : 'live'
    }
  }, [manualStepInput, currentStepProfiles, historyDir, historyOccurrences])

  const pairInputValue = selectedPair.length === 2 ? selectedPair.join(',') : pairStepInput
  const pairCalcData = useMemo(() => buildDigitPairCalculator(pairInputValue, MAXN), [pairInputValue])
  const touchDigitData = useMemo(() => buildTouchDigitOverlap(laserHits, activeDir, allDraws.slice(-5)), [laserHits, activeDir, allDraws])

  const showPuzzleOverview = panelOpen && selectedNumber != null && (sideTab === 'puzzles' || sideTab === 'compare')
  const puzzleDrawNumber = puzzleDraw === 'latest' ? allDraws.length : Number(puzzleDraw)
  const puzzleOverview = useMemo(() => {
    if (!showPuzzleOverview || !draws.length) return { boxes: [], ranking: [], lShapes: [] }
    const colIdx = puzzleDrawNumber - 1 - (allDraws.length - draws.length)
    const recentDraws = allDraws.slice(-5)
    const boxes = buildPuzzleBoxes(draws, colIdx, activeDir, recentDraws)
    const totals = new Map()
    boxes.forEach(({ seed, values }) => {
      values.forEach(item => {
        const entry = totals.get(item.n) || { number: item.n, seeds: [], totalStrength: 0 }
        entry.seeds.push(seed)
        entry.totalStrength += item.pairCount + item.tripleCount + item.recentCount
        totals.set(item.n, entry)
      })
    })
    const ranking = [...totals.values()]
      .map(item => ({ ...item, avgStrength: item.totalStrength / item.seeds.length }))
      .sort((a, b) => b.seeds.length - a.seeds.length || b.avgStrength - a.avgStrength || a.number - b.number)
    return { boxes, ranking, lShapes: analyzePuzzleLShapes(boxes) }
  }, [showPuzzleOverview, puzzleDrawNumber, draws, allDraws, activeDir])

  useEffect(() => {
    if (showPuzzleOverview || !selectedNumber || !touchDigitData) return
    const captureKey = `${selectedNumber}-${selectedCell?.colIdx ?? 'row'}-${Object.values(activeDir).map(v => (v ? 1 : 0)).join('')}`
    if (captureSeenRef.current.has(captureKey)) return

    const pool = getCapturePool(touchDigitData)
    if (!pool.length) return

    setRepeatCaptureMap(prev => {
      const next = { ...prev }
      pool.forEach(item => {
        const n = item.n
        const strength = (item.pairCount || 0) + (item.tripleCount || 0) + (item.recentCount || 0)
        const existing = next[n] || {
          number: n,
          hitCount: 0,
          totalStrength: 0,
          seeds: [],
          sampleLabels: [],
          lastSeenAt: null,
        }
        const seedSet = new Set(existing.seeds)
        seedSet.add(selectedNumber)
        const labels = [...existing.sampleLabels]
        ;(item.labels || []).slice(0, 2).forEach(label => {
          if (!labels.includes(label)) labels.push(label)
        })
        next[n] = {
          ...existing,
          hitCount: existing.hitCount + 1,
          totalStrength: existing.totalStrength + strength,
          seeds: [...seedSet].sort((a, b) => a - b),
          sampleLabels: labels.slice(0, 6),
          lastSeenAt: new Date().toISOString(),
        }
      })
      return next
    })

    captureSeenRef.current.add(captureKey)
  }, [showPuzzleOverview, selectedNumber, selectedCell, touchDigitData, activeDir])

  const repeatCaptureList = useMemo(() => rankRepeatCaptures(Object.values(repeatCaptureMap)), [repeatCaptureMap])

  const repeatStrong = useMemo(() => repeatCaptureList.filter(item => item.seedCount >= 2), [repeatCaptureList])

  const comparisonGrids = useMemo(() => [
    { id: 'capture', label: 'Accumulated Repeat Capture (current session)', values: repeatCaptureList.slice(0, 24) },
    {
      id: 'combined', label: `Combined all-seed values - D${puzzleDrawNumber}`,
      values: puzzleOverview.ranking.map(item => ({ ...item, seedCount: item.seeds.length })),
    },
    ...puzzleOverview.boxes.map(box => ({
      id: `seed-${box.seed}`, label: `Seed ${box.seed} - D${puzzleDrawNumber}`, values: box.values,
    })),
  ], [repeatCaptureList, puzzleOverview, puzzleDrawNumber])

  const clearRepeatCapture = useCallback(() => {
    setRepeatCaptureMap({})
    captureSeenRef.current = new Set()
  }, [])

  if (loading) return <div className="hg-loading"><div className="hg-spinner"/>Loading hot grid...</div>

  const lastDraw = allDraws[allDraws.length - 1] || []

  const puzzleDrawSelector = (
            <label className="hg-puzzle-draw-label">
              Draw
              <select className="hg-history-input" value={puzzleDraw} disabled={!draws.length}
                onChange={event => setPuzzleDraw(event.target.value)}>
                <option value="latest">Latest{allDraws.length > 0 ? ` - D${allDraws.length}` : ''}</option>
                {draws.slice(0, -1).map((draw, idx) => {
                  const number = allDraws.length - draws.length + idx + 1
                  return <option key={number} value={number}>D{number} - {draw.join(', ')}</option>
                }).reverse()}
              </select>
            </label>
  )

  const puzzlePanel = (
        <section className="hg-puzzle-overview" aria-label="All puzzle values">
          <div className="hg-puzzle-toolbar">
            <h2 className="hg-analysis-title">All Puzzle Values {draws.length > 0 && `- D${puzzleDrawNumber}`}</h2>
            {puzzleDrawSelector}
          </div>
          <p className="hg-history-note">
            All seed boxes for one draw, calculated automatically using the active directions and {draws.length}-draw grid window.
            Choose ALL above to select older draws. Each box uses the same top 20 values as Repeat Capture.
            Historical selections use the current grid and latest five draws, just like manual inspection; this is not a historical prediction.
          </p>
          {!draws.length ? (
            <p className="hg-tab-empty">No draws available.</p>
          ) : (
            <>
              {!Object.values(activeDir).some(Boolean) && <p className="hg-tab-empty">Enable at least one direction above to calculate values.</p>}
              <div className="hg-history-card hg-puzzle-ranking">
                <h3 className="hg-history-card-title">Combined values - most repeated first</h3>
                <p className="hg-history-note">Counts show distinct seed boxes, not clicks. Outlined values appear in two or more boxes.</p>
                {puzzleOverview.ranking.length ? (
                  <div className="hg-puzzle-values">
                    {puzzleOverview.ranking.map(item => (
                      <div key={item.number} className={`hg-capture-pill ${item.seeds.length >= 2 ? 'hg-puzzle-repeat' : ''}`}
                        title={`Seeds: ${item.seeds.join(', ')}; average strength: ${item.avgStrength.toFixed(2)}`}>
                        <span>{item.number}</span>
                        <small>{item.seeds.length} / {puzzleOverview.boxes.length} seeds</small>
                        <small>Seeds: {item.seeds.join(', ')}</small>
                      </div>
                    ))}
                  </div>
                ) : <p className="hg-tab-empty">No capture values for this draw and these directions.</p>}
              </div>
              <section className="hg-history-card hg-lshape-panel" aria-label="L-shape calculations">
                <h3 className="hg-history-card-title">L-shape calculations - repeated exact results</h3>
                <p className="hg-history-note">
                  Checks touching three-cell L shapes in every orientation within each six-column seed box.
                  Uses whole numbers or digit sums with addition and subtraction; the answer must match the third cell.
                  Strong means at least 2 different number pairs, not repeated formulas from the same pair.
                  These are arithmetic matches for reference, not a prediction of the next draw.
                </p>
                {puzzleOverview.lShapes.length ? (
                  <div className="hg-lshape-results">
                    {puzzleOverview.lShapes.map(result => (
                      <article key={result.number} className={`hg-lshape-result ${result.strong ? 'hg-lshape-strong' : ''}`}
                        aria-label={`L-shape result ${result.number}`}>
                        <div className="hg-capture-head-row">
                          <span className="hg-capture-num">{result.number}</span>
                          {result.strong && <strong className="hg-lshape-strength">Strong</strong>}
                        </div>
                        <p className="hg-history-note">
                          {result.pairCount} distinct pairs | {result.matchCount} L matches | {result.seedCount} seed boxes
                        </p>
                        <code className="hg-lshape-formula">{result.matches[0].formulas[0]}</code>
                        <details>
                          <summary>Show all matching cells and formulas</summary>
                          <ol className="hg-lshape-matches">
                            {result.matches.map(match => (
                              <li key={match.key}>
                                <strong>Seed {match.seed} - D{puzzleDrawNumber}</strong>
                                <div className="hg-history-note">
                                  Pair: {match.operands.map(cell => `${cell.number} at R${cell.row}C${cell.column}`).join(' and ')}
                                  {'; '}result: {match.target.number} at R{match.target.row}C{match.target.column}
                                </div>
                                {match.formulas.map(formula => <code className="hg-lshape-formula" key={formula}>{formula}</code>)}
                              </li>
                            ))}
                          </ol>
                        </details>
                      </article>
                    ))}
                  </div>
                ) : <p className="hg-tab-empty">No exact L-shape matches for this draw and these directions.</p>}
              </section>
              <div className="hg-puzzle-boxes">
                {puzzleOverview.boxes.map(box => (
                  <article className="hg-history-card hg-puzzle-box" key={box.seed} aria-label={`Seed ${box.seed}`}>
                    <h3 className="hg-history-card-title">Seed <span className="hg-num-badge">{box.seed}</span> - D{puzzleDrawNumber}</h3>
                    <p className="hg-history-note">Touched values: {box.touched.join(', ') || 'none'}</p>
                    <div className="hg-history-examples-title">All captured values (latest ranking)</div>
                    <div className="hg-capture-all-grid">
                      {box.values.map(item => (
                        <div className="hg-capture-pill" key={item.n}
                          title={`${item.pairCount} pairs, ${item.tripleCount} triples, ${item.recentCount} recent draws\n${item.labels.slice(0, 3).join('\n')}`}>
                          <span>{item.n}</span>
                          <small>{item.seedCount}s</small>
                        </div>
                      ))}
                    </div>
                    {!box.values.length && <p className="hg-tab-empty">No capture values for this seed.</p>}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
  )

  return (
    <div className={`hg-page ${showPuzzleOverview ? 'hg-puzzle-mode' : ''}`}>
      <div className="hg-header">
        <div>
          <h1 className="hg-title">Hot Number Grid</h1>
          <p className="hg-sub">
            {draws.length} draws shown / {allDraws.length} total | sorted hot to cold
            {lastDraw.length > 0 && <span className="hg-latest-label"> | Latest: <strong>{lastDraw.join(', ')}</strong></span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="hg-dir-toggles">
            {['NE','NW','SE','SW'].map(dir => (
              <button
                key={dir}
                className={`hg-dir-btn hg-dir-btn-${dir.toLowerCase()} ${activeDir[dir] ? 'active' : ''}`}
                onClick={() => handleDirToggle(dir)}
              >{dir}</button>
            ))}
          </div>
          <div className="hg-window-btns">
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt}
                className={`hg-wbtn ${window_ === opt ? 'active' : ''}`}
                onClick={() => { setWindow(opt); setSelectedCell(null); setPuzzleDraw('latest') }}
              >{opt}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Debug bar ── */}
      <div className="hg-debug-bar">
        {debugInfo
          ? debugInfo.split(' | ').map((seg, i) => (
              <span key={i} className={`hg-dbg-seg ${seg.startsWith('DBG') ? 'hg-dbg-label' : seg.includes('hit=0') ? 'hg-dbg-zero' : seg.includes('hit=') ? 'hg-dbg-hit' : ''}`}>
                {seg}
              </span>
            ))
          : <span className="hg-dbg-idle">click any gold cell to fire laser</span>
        }
      </div>

      <div className="hg-body">

        <div className="hg-grid-area">

          {/* LEFT: fixed row labels */}
          <div className="hg-labels-col" style={{ width: LABEL_W }}>
            <div className="hg-label-header">
              <span className="hg-lh-rank">#</span>
              <span className="hg-lh-num">N</span>
              <span className="hg-lh-bar">Freq</span>
              <span className="hg-lh-cnt">Cnt</span>
              <span className="hg-lh-gap">Gap</span>
            </div>
            {sortedNums.map((n, rank) => {
              const count  = freq[n]
              const gap    = gapMap[n] || 0
              const isSelN = selectedNumber === n
              const isLast = lastDrawSet.has(n)
              return (
                <div
                  key={n}
                  className={`hg-label-row ${isSelN ? 'hg-label-sel' : ''} ${isLast ? 'hg-label-latest' : ''}`}
                  style={{ height: CELL_H, background: isSelN ? '#1a1a40' : gapColor(n) }}
                  onClick={() => handleRowClick(n)}
                >
                  <span className="hg-rank">#{rank + 1}</span>
                  <span className="hg-num">{n}</span>
                  <div className="hg-freq-bar-wrap">
                    <div className="hg-freq-bar" style={{ width: `${(count / maxFreq) * 100}%` }}/>
                  </div>
                  <span className={`hg-cnt-badge ${count >= maxFreq * 0.7 ? 'hot' : count >= maxFreq * 0.4 ? 'warm' : 'cold'}`}>{count}x</span>
                  <span className={`hg-gap-badge ${gap <= 3 ? 'fresh' : gap <= 10 ? 'normal' : gap <= 18 ? 'warm' : 'due'}`}>{gap}</span>
                </div>
              )
            })}
          </div>

          {/* RIGHT: scrollable columns */}
          <div className="hg-cols-scroll" ref={scrollRef}>

            {/* Column headers */}
            <div className="hg-col-headers" style={{ width: gridW }}>
              {draws.map((_, ci) => {
                const drawNum  = allDraws.length - draws.length + ci + 1
                const isLatest = ci === draws.length - 1
                return (
                  <div
                    key={ci}
                    className={`hg-col-hdr ${isLatest ? 'hg-col-latest' : ''}`}
                    style={{ width: CELL_W }}
                  >
                    {isLatest ? `D${drawNum}` : (draws.length - ci) % 10 === 0 ? drawNum : ''}
                  </div>
                )
              })}
            </div>

            {/* Cell grid with LaserLayer overlay */}
            <div style={{ position: 'relative', width: gridW, height: gridH }}>
              {sortedNums.map((n, rowIdx) => {
                const isSelN = selectedNumber === n
                return (
                  <div
                    key={n}
                    className="hg-grid-row"
                    style={{
                      position: 'absolute',
                      top: rowIdx * CELL_H,
                      left: 0,
                      width: gridW,
                      height: CELL_H,
                      display: 'flex',
                      background: isSelN ? '#1a1a40' : gapColor(n),
                    }}
                  >
                    {draws.map((_, ci) => {
                      const appeared    = drawSets[ci].has(n)
                      const isLatestCol = ci === draws.length - 1
                      const isCellSel   = selectedCell?.rowNum === n && selectedCell?.colIdx === ci
                      const isNumHigh   = isSelN && appeared
                      return (
                        <div
                          key={ci}
                          className={[
                            'hg-cell',
                            appeared    ? 'hg-cell-on'    : 'hg-cell-off',
                            isLatestCol ? 'hg-cell-lat'   : '',
                            isCellSel   ? 'hg-cell-sel'   : '',
                            isNumHigh   ? 'hg-cell-nhigh' : '',
                          ].join(' ')}
                          style={{ width: CELL_W, height: CELL_H, flexShrink: 0 }}
                          onClick={() => appeared && handleCellClick(ci, n)}
                          title={appeared ? `D${allDraws.length - draws.length + ci + 1}: ${draws[ci].join(',')}` : ''}
                        >
                          {appeared && <span className="hg-cell-num">{n}</span>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Laser SVG overlay — same as Matrix page */}
              {selectedCell != null && (
                <LaserLayer
                  selectedCell={selectedCell}
                  activeDir={activeDir}
                  drawSets={drawSets}
                  cellW={CELL_W}
                  cellH={CELL_H}
                  gridW={gridW}
                  gridH={gridH}
                  numbers={sortedNums}
                  numCols={draws.length}
                />
              )}
            </div>
          </div>
        </div>

        {/* Side panel */}
        {panelOpen && selectedNumber && (
          <div className="hg-side">
            <div className="hg-analysis-card">

              {/* Header */}
              <div className="hg-analysis-header">
                <span className="hg-analysis-title">
                  {showPuzzleOverview ? 'Draw overview' : <>
                  <span className="hg-num-badge">{selectedNumber}</span>
                  {selectedCell && <span className="hg-cell-ref"> D{allDraws.length - draws.length + selectedCell.colIdx + 1}</span>}
                  </>}
                </span>
                <button className="hg-close-btn" aria-label="Close analysis panel" onClick={handleClose}>✕</button>
              </div>

              {!showPuzzleOverview && (
              <div className="hg-stats-row">
                <div className="hg-stat"><strong>{freq[selectedNumber]}</strong><span>last {draws.length}</span></div>
                <div className="hg-stat"><strong>{allDraws.filter(d => d.includes(selectedNumber)).length}</strong><span>all-time</span></div>
                <div className="hg-stat"><strong>{gapMap[selectedNumber] || 0}</strong><span>gap</span></div>
                <div className="hg-stat"><strong>{((allDraws.filter(d => d.includes(selectedNumber)).length / (allDraws.length || 1)) * 100).toFixed(1)}%</strong><span>hit rate</span></div>
              </div>
              )}

              {/* Tabs */}
              <div className="hg-tabs hg-lotto-tabs">
                {[
                  { key: 'touch', label: 'Touch' },
                  { key: 'compare', label: 'Compare' },
                  { key: 'math',  label: `Math ${mathCandidates.length ? `(${mathCandidates.length})` : ''}` },
                  { key: 'capture', label: `Repeat Capture ${repeatStrong.length ? `(${repeatStrong.length})` : ''}` },
                  { key: 'puzzles', label: 'All Puzzle Values' },
                  { key: 'history', label: 'Step History' },
                  { key: 'pair', label: 'Digit Calc' },
                  { key: 'ai', label: 'AI Analyzer' },
                  { key: 'stats', label: 'Stats' },
                ].map(t => (
                  <button
                    key={t.key}
                    className={`hg-tab ${sideTab === t.key ? 'active' : ''}`}
                    aria-pressed={sideTab === t.key}
                    onClick={() => setSideTab(t.key)}
                  >{t.label}</button>
                ))}
              </div>

              {sideTab === 'puzzles' && showPuzzleOverview && puzzlePanel}
              {sideTab === 'compare' && showPuzzleOverview && (
                <section className="hg-puzzle-overview">
                  <div className="hg-puzzle-toolbar">
                    <h2 className="hg-analysis-title">Visual Comparison</h2>
                    {puzzleDrawSelector}
                  </div>
                  <p className="hg-history-note">
                    Automatic grids use the selected draw, active directions, current window and latest five draws, as in All Puzzle Values.
                    Accumulated captures keep their session ranking and counts; the Draw selector does not change them.
                  </p>
                  {!Object.values(activeDir).some(Boolean) && <p>Enable a direction to populate automatic grids.</p>}
                  <PuzzleCompare grids={comparisonGrids} />
                </section>
              )}

              {/* ── TOUCH TAB ── */}
              {sideTab === 'touch' && (
                <>
                  {laserHits && selectedCell ? (
                    <>
                      <div className="hg-laser-strip">
                        <div className="hg-laser-title">
                          ⚡ Laser · D{allDraws.length - draws.length + selectedCell.colIdx + 1} · row {selectedCell.rowNum}
                        </div>
                        {['NE','NW','SE','SW'].map(dir => {
                          if (!activeDir[dir]) return null
                          const ct       = laserHits.cornerTouch?.[dir] || []
                          const onPath   = ct.filter(x => x.appeared && !x.isCornerAdj)
                          const cornered = ct.filter(x => x.appeared &&  x.isCornerAdj)
                          const totalSteps = ct.filter(x => !x.isCornerAdj).length
                          return (
                            <div key={dir} className="hg-beam-block">
                              <div className={`hg-beam-heading hg-dir-${dir.toLowerCase()}`}>
                                {dir} beam <span className="hg-beam-meta">({totalSteps} steps · {onPath.length} on-path · {cornered.length} corner)</span>
                              </div>
                              {onPath.length > 0 && (
                                <>
                                  <div className="hg-beam-section-label">On path:</div>
                                  {onPath.map((h, i) => (
                                    <div key={i} className="hg-beam-row hg-beam-onpath">
                                      <span className="hg-beam-step">step {h.step}</span>
                                      <span className="hg-beam-num">{h.number}</span>
                                      <span className="hg-beam-draw">D{allDraws.length - draws.length + h.colIdx + 1}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                              {cornered.length > 0 && (
                                <>
                                  <div className="hg-beam-section-label">Corner-grazed:</div>
                                  {cornered.map((h, i) => (
                                    <div key={i} className="hg-beam-row hg-beam-corner">
                                      <span className="hg-beam-step">step {h.step}</span>
                                      <span className="hg-beam-num">{h.number}</span>
                                      <span className="hg-beam-draw">D{allDraws.length - draws.length + h.colIdx + 1}</span>
                                      <span className="hg-beam-tag">corner</span>
                                    </div>
                                  ))}
                                </>
                              )}
                              {onPath.length === 0 && cornered.length === 0 && (
                                <div className="hg-beam-row hg-no-hit">— no hits</div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {touchDigitData && (
                        <div className="hg-history-card">
                          <div className="hg-history-card-title">Digit overlap from touched values</div>
                          <div className="hg-history-note">
                            Uses the visible hit values from active beams, runs digit formulas across all pairs, and ranks results repeated by multiple pairs.
                          </div>

                          <div className="hg-math-tags" style={{ marginTop: 6 }}>
                            {(touchDigitData.nums || []).map(n => (
                              <span key={`touch-num-${n}`} className="hg-math-tag hg-tag-hit">{n}</span>
                            ))}
                          </div>

                          {touchDigitData.exact.length > 0 && (
                            <div className="hg-touch-exact-box">
                              <div className="hg-touch-exact-title">Exact picks confirmed by the last 5 draws</div>
                              <div className="hg-touch-exact-list">
                                {touchDigitData.exact.slice(0, 8).map(({ n, pairCount, tripleCount, total, recentCount, recentDraws, labels }) => (
                                  <button key={`touch-exact-${n}`} className="hg-touch-exact-pill" onClick={() => handleRowClick(n)}>
                                    <span className="hg-touch-exact-num">{n}</span>
                                    <span className="hg-touch-exact-meta">{pairCount} pairs · {tripleCount} triples · {total} hits · in {recentCount} of last 5</span>
                                    <span className="hg-touch-exact-formula">{labels.slice(0, 3).join(' | ')}</span>
                                    <span className="hg-touch-exact-draws">{recentDraws.slice(0, 3).map(d => `D${d}`).join(' · ')}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {touchDigitData.common.length > 0 ? (
                            <>
                              <div className="hg-pair-grid" style={{ marginTop: 8 }}>
                                {touchDigitData.common.slice(0, 10).map(({ n, pairCount, tripleCount, total, recentCount }) => (
                                  <div key={`touch-common-${n}`} className="hg-pair-card">
                                    <div className="hg-pair-card-head">
                                      <span className="hg-pair-value">{n}</span>
                                      <span className="hg-pair-index">{pairCount + tripleCount} combos</span>
                                    </div>
                                    <div className="hg-pair-card-total">{total} formula hits</div>
                                    <div className="hg-pair-card-line">{recentCount > 0 ? `confirmed in last 5: ${recentCount}` : 'not seen in last 5'}</div>
                                  </div>
                                ))}
                              </div>

                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {touchDigitData.common.slice(0, 6).map(({ n, labels }) => (
                                  <div key={`touch-label-${n}`} className="hg-history-example-row">
                                    <span className="hg-history-example-id">{n}</span>
                                    <span className="hg-history-example-next">{labels.slice(0, 2).join(' | ')}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="hg-tab-empty">Need at least two touched values with repeated outputs.</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="hg-tab-empty">Click a gold cell to fire laser beams</div>
                  )}
                </>
              )}

              {/* ── MATH TAB ── */}
              {sideTab === 'math' && (
                <div className="hg-math-panel">
                  {!selectedCell ? (
                    <div className="hg-tab-empty">Click a gold cell to fire laser and compute Math</div>
                  ) : mathCandidates.length === 0 ? (
                    <div className="hg-tab-empty">No beam hits — try a different cell</div>
                  ) : (
                    <>
                      {/* Input step numbers */}
                      <div className="hg-math-inputs">
                        <div className="hg-math-input-label">Step numbers from beams:</div>
                        <div className="hg-math-tags">
                          {mathInputs.map(s => <span key={s} className="hg-math-tag hg-tag-step">{s}</span>)}
                        </div>
                      </div>

                      {/* Results */}
                      <div className="hg-math-results-label">
                        Predicted numbers — sorted by derivation count:
                      </div>
                      <div className="hg-math-results">
                        {mathCandidates.map(({ n, exprs, count }, idx) => {
                          const isLatest = lastDrawSet.has(n)
                          return (
                            <div
                              key={n}
                              className={`hg-math-row ${idx < 5 ? 'hg-math-top' : ''} ${isLatest ? 'hg-math-latest' : ''}`}
                              onClick={() => handleRowClick(n)}
                            >
                              <span className="hg-math-rank">#{idx+1}</span>
                              <span className="hg-math-num">{n}</span>
                              <div className="hg-math-exprs">
                                {exprs.slice(0, 4).map((e, i) => (
                                  <span key={i} className="hg-math-expr">{e}={n}</span>
                                ))}
                                {exprs.length > 4 && <span className="hg-math-more">+{exprs.length-4} more</span>}
                              </div>
                              <span className="hg-math-score">{count}×</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── REPEAT CAPTURE TAB ── */}
              {sideTab === 'capture' && (
                <div className="hg-step-history-panel">
                  <div className="hg-history-card">
                    <div className="hg-capture-head-row">
                      <div className="hg-history-card-title">Recurring values across inspected numbers</div>
                      <button className="hg-capture-clear-btn" onClick={clearRepeatCapture}>Reset</button>
                    </div>
                    <div className="hg-history-note">
                      Auto-captures values from Touch calculations after you click gold cells. Strong values are numbers that repeat across multiple seed inspections.
                    </div>

                    {repeatStrong.length > 0 ? (
                      <div className="hg-capture-list">
                        {repeatStrong.slice(0, 20).map(item => (
                          <button key={`cap-${item.number}`} className="hg-capture-item" onClick={() => handleRowClick(item.number)}>
                            <span className="hg-capture-num">{item.number}</span>
                            <span className="hg-capture-meta">seen in {item.seedCount} seeds · {item.hitCount} captures · avg {item.avgStrength}</span>
                            <span className="hg-capture-seeds">Seeds: {(item.seeds || []).slice(0, 10).join(', ')}</span>
                            <span className="hg-capture-formula">{(item.sampleLabels || []).slice(0, 2).join(' | ')}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="hg-tab-empty">Inspect at least two different numbers first. Repeated values (like 9 across multiple checks) will appear here.</div>
                    )}

                    {repeatCaptureList.length > 0 && (
                      <div className="hg-capture-all-wrap">
                        <div className="hg-history-examples-title">All captured values (latest ranking)</div>
                        <div className="hg-capture-all-grid">
                          {repeatCaptureList.slice(0, 24).map(item => (
                            <button key={`cap-all-${item.number}`} className="hg-capture-pill" onClick={() => handleRowClick(item.number)}>
                              <span>{item.number}</span>
                              <small>{item.seedCount}s</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP HISTORY TAB ── */}
              {sideTab === 'history' && (
                <div className="hg-step-history-panel">
                  <div className="hg-history-dir-row">
                    {['NE', 'NW', 'SE', 'SW'].map(dir => (
                      <button
                        key={dir}
                        className={`hg-history-dir-btn ${historyDir === dir ? 'active' : ''} hg-dir-${dir.toLowerCase()}`}
                        onClick={() => setHistoryDir(dir)}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>

                  <div className="hg-history-note">
                    Checking #{selectedNumber} across {historyOccurrences.length} past occurrences with next draw available.
                  </div>

                  {stepHistoryData.targetProfile ? (
                    <div className="hg-history-card">
                      <div className="hg-history-card-title">
                        Current {historyDir} signature: {stepHistoryData.targetProfile.totalSteps} steps, {stepHistoryData.targetProfile.onPathCount} on-path, {stepHistoryData.targetProfile.cornerCount} corner
                      </div>

                      <div className="hg-history-pairs">
                        {stepHistoryData.targetProfile.onPathPairs.map(({ step, number }) => (
                          <div key={`${step}-${number}`} className="hg-history-pair-row">
                            <span className="hg-history-step">step {step}</span>
                            <span className="hg-history-num">{number}</span>
                          </div>
                        ))}
                        {!stepHistoryData.targetProfile.onPathPairs.length && (
                          <div className="hg-no-hit">No on-path hits in current cell.</div>
                        )}
                      </div>

                      <div className="hg-history-card-title" style={{ marginTop: 7 }}>
                        Exact repeats in history: {stepHistoryData.exactMatches.length}
                      </div>
                      {stepHistoryData.exactMatches.length > 0 ? (
                        <>
                          <div className="hg-history-next-grid">
                            {stepHistoryData.exactNextAgg.slice(0, 12).map(({ n, c, pct }) => (
                              <button
                                key={n}
                                className="hg-history-next-pill"
                                onClick={() => handleRowClick(n)}
                                title={`Appeared in ${c}/${stepHistoryData.exactMatches.length} next draws`}
                              >
                                <span className="hg-history-next-num">{n}</span>
                                <span className="hg-history-next-meta">{c}x · {pct}%</span>
                              </button>
                            ))}
                          </div>

                          <div className="hg-history-examples-title">Recent exact cases:</div>
                          <div className="hg-history-examples">
                            {stepHistoryData.exactMatches.slice(-6).reverse().map(m => (
                              <div key={`${m.drawNum}-${m.nextDrawNum}`} className="hg-history-example-row">
                                <span className="hg-history-example-id">D{m.drawNum} → D{m.nextDrawNum}</span>
                                <span className="hg-history-example-next">[{m.nextDraw.join(', ')}]</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="hg-tab-empty">No exact repeat found yet for this full signature.</div>
                      )}
                    </div>
                  ) : (
                    <div className="hg-tab-empty">Click a gold cell to capture a beam signature. Manual step lookup works below.</div>
                  )}

                  <div className="hg-history-card">
                    <div className="hg-history-card-title">Manual step lookup ({historyDir} on-path steps)</div>
                    <input
                      className="hg-history-input"
                      placeholder="Enter steps like 6,7 or 3 5 8"
                      value={manualStepInput}
                      onChange={e => setManualStepInput(e.target.value)}
                    />

                    {stepHistoryData.manualSteps.length > 0 ? (
                      <>
                        <div className="hg-history-note">
                          Contains mode matches: {stepHistoryData.manualContainsMatches.length} · Exact step-set matches: {stepHistoryData.manualExactMatches.length}
                        </div>
                        {stepHistoryData.manualNextAgg.length > 0 ? (
                          <div className="hg-history-next-grid">
                            {stepHistoryData.manualNextAgg.slice(0, 12).map(({ n, c, pct }) => (
                              <button
                                key={`manual-${n}`}
                                className="hg-history-next-pill"
                                onClick={() => handleRowClick(n)}
                                title={`Appeared in ${c}/${stepHistoryData.manualContainsMatches.length} next draws`}
                              >
                                <span className="hg-history-next-num">{n}</span>
                                <span className="hg-history-next-meta">{c}x · {pct}%</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="hg-tab-empty">No next-draw data for those manual steps.</div>
                        )}
                      </>
                    ) : (
                      <div className="hg-history-note">Tip: enter step numbers to see what next-draw numbers historically followed them.</div>
                    )}
                  </div>
                </div>
              )}

              {/* ── PAIR CALC TAB ── */}
              {sideTab === 'pair' && (
                <div className="hg-step-history-panel">
                  <div className="hg-history-card">
                    <div className="hg-history-card-title">Digit pair calculator</div>
                    <div className="hg-history-note">
                      Enter two numbers like 24,27 to see the same digit recipe outputs and the repeated results.
                    </div>

                    <div className="hg-pair-example">
                      Pair input: {pairInputValue || '—'}
                    </div>

                    {selectedPair.length > 0 && (
                      <div className="hg-pair-picked-row">
                        <div className="hg-pair-picked-label">Grid selection</div>
                        <div className="hg-pair-picked-chips">
                          {selectedPair.map(n => (
                            <span key={n} className="hg-pair-picked-chip">#{n}</span>
                          ))}
                          {selectedPair.length === 1 && <span className="hg-pair-picked-hint">pick one more number</span>}
                        </div>
                        <button
                          className="hg-pair-clear-btn"
                          onClick={() => { setSelectedPair([]); setPairStepInput('') }}
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    <div className="hg-pair-input-row">
                      <input
                        className="hg-history-input"
                        inputMode="numeric"
                        value={pairInputValue}
                        onChange={e => { setSelectedPair([]); setPairStepInput(e.target.value) }}
                        placeholder="Enter numbers like 24,27"
                      />
                    </div>

                    {pairCalcData ? (
                      <>
                      <div className="hg-pair-grid">
                        {pairCalcData.rows.map(({ label, value }) => (
                          <div key={`${label}-${value}`} className="hg-pair-card">
                            <div className="hg-pair-card-head">
                              <span className="hg-pair-value">{value}</span>
                              <span className="hg-pair-index">{label}</span>
                            </div>
                            <div className="hg-pair-card-total">{label} = {value}</div>
                            <div className="hg-pair-card-line hg-pair-card-expr">Digit recipe</div>
                          </div>
                        ))}
                      </div>
                      {pairCalcData.repeated.length > 0 && (
                        <div className="hg-pair-strong">
                          Repeated results: {pairCalcData.repeated.map(r => `${r.n}(${r.count}x)`).slice(0, 12).join(', ')}
                        </div>
                      )}
                    </>
                    ) : (
                      <div className="hg-tab-empty">Enter at least two step numbers to generate the calculator output.</div>
                    )}
                  </div>
                </div>
              )}

              {/* ── AI ANALYZER TAB ── */}
              {sideTab === 'ai' && (
                <div className="hg-step-history-panel">
                  <div className="hg-history-dir-row">
                    {['NE', 'NW', 'SE', 'SW'].map(dir => (
                      <button
                        key={dir}
                        className={`hg-history-dir-btn ${historyDir === dir ? 'active' : ''} hg-dir-${dir.toLowerCase()}`}
                        onClick={() => setHistoryDir(dir)}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>

                  <div className="hg-history-card">
                    <div className="hg-history-card-title">AI similarity analyzer</div>
                    <div className="hg-history-note">
                      Threshold is fixed at 95%+. It only returns matches when the historical step shape is almost the same.
                    </div>
                    <div className="hg-ai-query-box">
                      <div className="hg-ai-query-label">Query mode</div>
                      <div className="hg-ai-query-value">{aiAnalyzerData.mode === 'manual' ? 'Manual step input' : 'Live beam signature from the selected cell'}</div>
                    </div>
                    <div className="hg-ai-query-box">
                      <div className="hg-ai-query-label">Query steps</div>
                      <div className="hg-math-tags">
                        {(aiAnalyzerData.queryProfile?.onPathSteps || []).map(s => <span key={s} className="hg-math-tag hg-tag-step">{s}</span>)}
                        {!(aiAnalyzerData.queryProfile?.onPathSteps || []).length && <span className="hg-history-note">No step input yet.</span>}
                      </div>
                    </div>
                    <div className="hg-ai-stats-row">
                      <div className="hg-ai-stat">
                        <strong>{aiAnalyzerData.matches.length}</strong>
                        <span>95%+ matches</span>
                      </div>
                      <div className="hg-ai-stat">
                        <strong>{aiAnalyzerData.coverage}%</strong>
                        <span>coverage</span>
                      </div>
                      <div className="hg-ai-stat">
                        <strong>{aiAnalyzerData.avgSim}%</strong>
                        <span>avg sim</span>
                      </div>
                    </div>

                    {aiAnalyzerData.matches.length >= 3 ? (
                      <>
                        <div className="hg-history-next-grid">
                          {aiAnalyzerData.nextAgg.slice(0, 12).map(({ n, c, pct }) => (
                            <button
                              key={`ai-${n}`}
                              className="hg-history-next-pill"
                              onClick={() => handleRowClick(n)}
                              title={`Seen in ${c}/${aiAnalyzerData.matches.length} near-matches`}
                            >
                              <span className="hg-history-next-num">{n}</span>
                              <span className="hg-history-next-meta">{c}x · {pct}%</span>
                            </button>
                          ))}
                        </div>

                        <div className="hg-history-examples-title">Top high-similarity cases:</div>
                        <div className="hg-history-examples">
                          {aiAnalyzerData.matches.slice(0, 6).map(m => (
                            <div key={`ai-match-${m.drawNum}-${m.nextDrawNum}`} className="hg-ai-match-row">
                              <span className="hg-ai-match-head">{m.sim}% · D{m.drawNum} → D{m.nextDrawNum}</span>
                              <span className="hg-ai-match-next">[{m.nextDraw.join(', ')}]</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="hg-tab-empty">
                        Not enough 95%+ history yet. This tab stays conservative instead of pretending it knows the answer.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STATS TAB ── */}
              {sideTab === 'stats' && (
                <>
                  <FollowBlock title="🔗 Co-appears with (same draw)" color="#4fa3ff"
                    data={coOccur ? Object.entries(coOccur[selectedNumber] || {}).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,c])=>({n:+n,c,pct:c*5})) : []}
                    onClickNum={handleRowClick} />
                  <FollowBlock title={`➡ After ${selectedNumber}, next draw has...`} color="#f5a623"
                    data={followsData} onClickNum={handleRowClick} />
                  <FollowBlock title={`⬅ Before ${selectedNumber} appeared...`} color="#9b59b6"
                    data={precededBy} onClickNum={handleRowClick} />
                  <FollowBlock title="🔄 Transition D→D+1" color="#2ecc71"
                    data={transMatrix ? Object.entries(transMatrix[selectedNumber] || {}).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,c])=>({n:+n,c,pct:c*8})) : []}
                    onClickNum={handleRowClick} />
                </>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Bottom heatmap */}
      <div className="hg-freq-summary">
        <div className="hg-freq-summary-title">Frequency Heatmap (last {draws.length} draws)</div>
        <div className="hg-num-bubbles">
          {sortedNums.map(n => {
            const f    = freq[n]
            const heat = f / maxFreq
            const bg   = heat > 0.75 ? '#c0392b' : heat > 0.5 ? '#e67e22' : heat > 0.25 ? '#2980b9' : heat > 0 ? '#27ae60' : '#1a1a2e'
            return (
              <div
                key={n}
                className={`hg-bubble ${lastDrawSet.has(n) ? 'hg-bubble-latest' : ''} ${selectedNumber === n ? 'hg-bubble-sel' : ''}`}
                style={{ background: bg }}
                onClick={() => handleRowClick(n)}
                title={`${n}: ${f}x in window, gap=${gapMap[n]||0}`}
              >
                <span className="hg-bubble-n">{n}</span>
                <span className="hg-bubble-f">{f}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FollowBlock({ title, color, data, onClickNum }) {
  if (!data.length) return null
  return (
    <div className="hg-follows-block">
      <div className="hg-follows-title">{title}</div>
      <div className="hg-follows-list">
        {data.map(({ n, c, pct }) => (
          <div key={n} className="hg-follow-item" onClick={() => onClickNum(n)}>
            <span className="hg-follow-num">{n}</span>
            <div className="hg-follow-bar-wrap">
              <div className="hg-follow-bar" style={{ width: `${Math.min(+pct, 100)}%`, background: color }}/>
            </div>
            <span className="hg-follow-cnt">{c}x</span>
          </div>
        ))}
      </div>
    </div>
  )
}
