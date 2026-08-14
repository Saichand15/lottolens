import { useState, useEffect, useMemo } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import { computeHybridPrediction } from '../utils/hybridPrediction'
import './BeamConsensus.css'

// ── Beam directions ────────────────────────────────────────────────────────────
const BP_DIRS = {
  NW: { dc: -1, dr: -1 },
  NE: { dc: +1, dr: -1 },
  SW: { dc: -1, dr: +1 },
  SE: { dc: +1, dr: +1 }
}

// Get path + corner touches for one seed in one direction
function getTouches(slice, ci, seed, dir, maxNum = 45) {
  const { dc, dr } = BP_DIRS[dir]
  const path = [], corner = []
  for (let step = 1; step <= slice.length; step++) {
    const c2 = ci + dc * step
    const n = seed + dr * step
    if (c2 < 0 || c2 >= slice.length || n < 1 || n > maxNum) break
    if (slice[c2].includes(n)) path.push(n)
    if (n - 1 >= 1        && slice[c2].includes(n - 1)) corner.push(n - 1)
    if (n + 1 <= maxNum   && slice[c2].includes(n + 1)) corner.push(n + 1)
  }
  return { path: [...new Set(path)], corner: [...new Set(corner)] }
}

// Get touches for a seed — dominant direction only (most path hits),
// matching the real bpComputeBeamPicks behaviour to keep signal tight.
// Falls back to corner-richest direction for edge seeds like 1-3 (no path hits).
// Also returns all-direction beams for the display breakdown panel.
function getAllTouches(slice, ci, seed, maxNum = 45) {
  const beams = {}
  let bestDir = null, bestPath = [], bestCornerDir = null, bestCornerLen = 0
  for (const dir of Object.keys(BP_DIRS)) {
    const { path, corner } = getTouches(slice, ci, seed, dir, maxNum)
    beams[dir] = { path, corner }
    if (path.length > bestPath.length) { bestPath = path; bestDir = dir }
    if (corner.length > bestCornerLen) { bestCornerLen = corner.length; bestCornerDir = dir }
  }
  // Use bestDir if it has path hits; otherwise fall back to corner-richest direction
  const useDir = bestDir || bestCornerDir
  const { path: domPath, corner: domCorner } = (useDir && beams[useDir]) || { path: [], corner: [] }
  const touchAll = [...new Set([seed, ...domPath, ...domCorner])].sort((a, b) => a - b)
  const pathAll = [seed, ...domPath]
  return { touchAll, pathAll, beams, bestDir: useDir }
}

// Pairwise +/− math on a number set
function pairMath(nums, maxNum = 45) {
  const cands = {}, exprs = {}
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      const a = nums[i], b = nums[j]
      const diff = Math.abs(a - b)
      const sum = a + b
      const ops = [
        [diff, `${Math.max(a, b)}-${Math.min(a, b)}=${diff}`],
        [sum,  `${a}+${b}=${sum}`]
      ]
      ops.forEach(([n, lbl]) => {
        if (n < 1 || n > maxNum) return
        cands[n] = (cands[n] || 0) + 1
        if (!exprs[n]) exprs[n] = []
        if (!exprs[n].includes(lbl)) exprs[n].push(lbl)
      })
    }
  }
  return { cands, exprs }
}

// Full consensus engine: run all seeds, cross-compare
function runConsensus(draws, windowSize = 100, maxNum = 45) {
  if (!draws || draws.length < 2) return null

  const slice = draws.slice(-windowSize)
  const ci = slice.length - 1          // latest draw column index
  const lastDraw = slice[ci]            // the 5 seeds

  // Per-seed analysis
  const seedData = lastDraw.map(seed => {
    const { touchAll, pathAll, beams } = getAllTouches(slice, ci, seed, maxNum)
    const { cands, exprs } = pairMath(touchAll, maxNum)
    return { seed, touchAll, pathAll, beams, cands, exprs }
  })

  // Build set of ALL numbers any seed generates via math (for push detection)
  const globalMathSet = new Set()
  seedData.forEach(({ cands }) => Object.keys(cands).forEach(n => globalMathSet.add(+n)))

  // Cross-seed coverage:
  //   MODE A — "MATH":   seed's own pairMath produces N
  //   MODE B — "DIRECT": N is physically in seed's beam touch (seed field contains N)
  //   MODE C — "PUSH":   N is in seed's touchAll AND another seed's math also produces N
  //                      → the other seed is "pushing" N into this seed's field
  const coverage = {}       // n → count of seeds covering (any mode)
  const mathCount = {}      // n → seeds covering via MATH only
  const directCount2 = {}   // n → seeds covering via DIRECT touch only  
  const pushCount = {}      // n → seeds receiving a PUSH from other seeds
  const seedsThatCover = {}
  const exprBySeed = {}

  for (let n = 1; n <= maxNum; n++) {
    seedsThatCover[n] = []
    exprBySeed[n] = []
    let math = 0, direct = 0, push = 0

    // Which seeds generate N via math?
    const mathGenerators = seedData.filter(({ cands }) => cands[n]).map(s => s.seed)

    seedData.forEach(({ seed, cands, exprs, touchAll }) => {
      if (cands[n]) {
        // MODE A: this seed's own math produces N
        math++
        seedsThatCover[n].push(seed)
        exprBySeed[n].push(`s${seed}:MATH(${exprs[n]?.[0] || ''})`)
      } else if (touchAll.includes(n)) {
        // N is in this seed's beam field
        const pushedByOther = mathGenerators.some(g => g !== seed)
        if (pushedByOther) {
          // MODE C: another seed's math output lands in this seed's touch field
          push++
          seedsThatCover[n].push(seed)
          exprBySeed[n].push(`s${seed}:PUSH←(${mathGenerators.filter(g=>g!==seed).join(',')})`)
        } else {
          // MODE B: direct touch, no math confirmation
          direct++
          seedsThatCover[n].push(seed)
          exprBySeed[n].push(`s${seed}:DIRECT`)
        }
      }
    })

    coverage[n] = math + direct + push
    mathCount[n] = math
    directCount2[n] = direct
    pushCount[n] = push
  }

  // Direct touch count across all seeds (for display)
  const directTouchCount = {}
  for (let n = 1; n <= maxNum; n++) {
    directTouchCount[n] = seedData.filter(({ touchAll }) => touchAll.includes(n)).length
  }

  // Path coverage (stronger signal)
  const pathCoverage = {}
  for (let n = 1; n <= maxNum; n++) {
    pathCoverage[n] = seedData.filter(({ pathAll }) => {
      const { cands: pc } = pairMath(pathAll, maxNum)
      return pc[n] || pathAll.includes(n)
    }).length
  }

  // MEGA score — PUSH gets highest weight because it means: N was math-generated
  // by ≥1 seed AND physically touched by another seed's beam (double confirmation)
  const ranked = []
  for (let n = 1; n <= maxNum; n++) {
    // NOTE: do NOT skip seeds — a seed number CAN appear again in the next draw
    const cov  = coverage[n]      || 0
    const mc   = mathCount[n]     || 0
    const pc   = pathCoverage[n]  || 0
    const push = pushCount[n]     || 0
    const dtc  = directTouchCount[n] || 0
    // PUSH = 25pts (math + field confirmation), MATH = 20pts, PATH = 10pts, DIRECT = 8pts
    const mega = push * 25 + mc * 20 + pc * 10 + dtc * 8
    if (mega === 0) continue
    ranked.push({
      n,
      coverage: cov,
      mathCount: mc,
      pushCount: push,
      pathCov: pc,
      directCount: dtc,
      mega,
      seeds: seedsThatCover[n],
      exprs: exprBySeed[n]
    })
  }
  // Sort: coverage first (5/5 must top), then mega score, then push count
  ranked.sort((a, b) => b.coverage - a.coverage || b.mega - a.mega || b.pushCount - a.pushCount)

  return {
    seeds: lastDraw,
    drawNum: draws.length,   // ordinal index of latest draw
    ranked,
    seedData,
    total: maxNum
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BeamConsensus() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [windowSize, setWindowSize] = useState(100)
  const [showAll, setShowAll] = useState(false)
  const [activeSeq, setActiveSeq] = useState('hybrid') // 'hybrid' | 'mega' | 'cov5' | 'path' | 'direct'
  const [copiedTicket, setCopiedTicket] = useState(false)
  const [ticket, setTicket] = useState([])

  useEffect(() => {
    fetchAllDraws()
      .then(data => setDraws(data.map(d => d.numbers.slice().sort((a, b) => a - b))))
      .catch(() =>
        fetch('/all_draws.json')
          .then(r => r.json())
          .then(data => setDraws(data.map(d => (Array.isArray(d) ? d : d.numbers).slice().sort((a, b) => a - b))))
      )
      .finally(() => setLoading(false))
  }, [])

  const result = useMemo(() => runConsensus(draws, windowSize), [draws, windowSize])
  const hybrid = useMemo(() => computeHybridPrediction(draws), [draws])

  const toggleTicket = n => {
    setTicket(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : prev.length < 5 ? [...prev, n].sort((a, b) => a - b) : prev
    )
  }

  const copyTicket = () => {
    navigator.clipboard.writeText(ticket.join(', '))
    setCopiedTicket(true)
    setTimeout(() => setCopiedTicket(false), 2000)
  }

  if (loading) return (
    <div className="bc-loading">
      <div className="bc-spinner" />
      <span>Running beam consensus engine…</span>
    </div>
  )
  if (!result) return <div className="bc-loading"><p>Not enough data.</p></div>

  const { seeds, drawNum, ranked, seedData } = result
  const maxNum = result.total
  const hybridRanked = (hybrid?.results || []).map((r, idx) => ({
    n: r.number,
    coverage: Math.min(5, Math.max(1, new Set((r.reasons || []).map(x => String(x).split('#')[0].split('@')[0].split(':')[0])).size)),
    mathCount: r.reasons?.filter(x => String(x).startsWith('formula') || String(x).startsWith('beamMath')).length || 0,
    pushCount: r.reasons?.filter(x => String(x).startsWith('mutual') || String(x).includes('rescue')).length || 0,
    pathCov: r.laserDirect || 0,
    directCount: r.directSeeds?.length || 0,
    mega: Math.round(r.rawScore || r.score || 0),
    seeds: r.directSeeds || [],
    exprs: [`HYBRID #${idx + 1}`, ...(r.reasons || []).slice(0, 2)]
  }))

  // Zone-balanced spread picker: pick best from each zone by coverage→mega
  // This prevents the "all low numbers" problem
  function balancedSpread(pool, zones, exclude = []) {
    const used = new Set(exclude)
    const picks = []
    zones.forEach(([lo, hi]) => {
      const pick = pool.find(r => r.n >= lo && r.n <= hi && !used.has(r.n))
      if (pick) { picks.push(pick); used.add(pick.n) }
    })
    return picks
  }

  const zones4 = [[1, Math.floor(maxNum*0.22)], [Math.floor(maxNum*0.22)+1, Math.floor(maxNum*0.45)],
                  [Math.floor(maxNum*0.45)+1, Math.floor(maxNum*0.7)], [Math.floor(maxNum*0.7)+1, maxNum]]
  const zones5 = [[1, Math.floor(maxNum*0.15)], [Math.floor(maxNum*0.15)+1, Math.floor(maxNum*0.35)],
                  [Math.floor(maxNum*0.35)+1, Math.floor(maxNum*0.55)], [Math.floor(maxNum*0.55)+1, Math.floor(maxNum*0.78)],
                  [Math.floor(maxNum*0.78)+1, maxNum]]

  const inAll5   = ranked.filter(r => r.coverage === 5)
  const in4plus  = ranked.filter(r => r.coverage >= 4)

  // Balanced sequences — coverage-sorted ranked list ensures 5/5 seeds come first
  const spreadA = balancedSpread(ranked, zones5)          // pure coverage-rank spread
  const spreadB = balancedSpread(in4plus.length >= 4 ? in4plus : ranked, zones5) // 4+ only
  const spreadC = balancedSpread([...ranked].sort((a,b) => b.mega - a.mega || b.coverage - a.coverage), zones5)
  const spreadD = balancedSpread([...ranked].sort((a,b) => b.pushCount - a.pushCount || b.coverage - a.coverage), zones5)

  const seqMap = {
    hybrid: hybridRanked.slice(0, 5),
    mega:   spreadC.length === 5 ? spreadC : ranked.slice(0, 5),
    cov5:   spreadB.length === 5 ? spreadB : spreadA.length === 5 ? spreadA : in4plus.slice(0, 5),
    path:   spreadA.length === 5 ? spreadA : ranked.slice(0, 5),
    direct: spreadD.length === 5 ? spreadD : ranked.slice(0, 5)
  }

  const displayList = showAll ? ranked : ranked.slice(0, 20)

  return (
    <div className="bc-page">
      {/* Header */}
      <div className="bc-header">
        <div className="bc-header-left">
          <div className="bc-draw-badge">D{drawNum + 1}</div>
          <div>
            <div className="bc-title">⚡ Beam Consensus</div>
            <div className="bc-subtitle">
              Auto-analysis of D{drawNum} seeds:&nbsp;
              {seeds.map(s => <span key={s} className="bc-seed-chip">{s}</span>)}
            </div>
          </div>
        </div>
        <select className="bc-window-sel" value={windowSize} onChange={e => setWindowSize(+e.target.value)}>
          <option value={60}>60 draws</option>
          <option value={100}>100 draws</option>
          <option value={200}>200 draws</option>
        </select>
      </div>

      {/* Ticket bar */}
      <div className="bc-ticket-bar">
        <span className="bc-ticket-label">🎫 MY TICKET ({ticket.length}/5):</span>
        <div className="bc-ticket-nums">
          {ticket.length === 0
            ? <span className="bc-ticket-empty">Click any number below to add</span>
            : ticket.map(n => (
              <span key={n} className="bc-ticket-num" onClick={() => toggleTicket(n)}>{n} ✕</span>
            ))
          }
        </div>
        {ticket.length === 5 && (
          <button className="bc-copy-btn" onClick={copyTicket}>
            {copiedTicket ? '✓ Copied!' : '📋 Copy'}
          </button>
        )}
        {ticket.length > 0 && (
          <button className="bc-clear-btn" onClick={() => setTicket([])}>Clear</button>
        )}
      </div>

      {/* Quick Sequences */}
      <div className="bc-sequences">
        <div className="bc-seq-title">🎯 PREDICTION SEQUENCES — pick one or combine</div>
        <div className="bc-seq-tabs">
          {[
            { key: 'hybrid', label: '🧠 Hybrid Main', color: '#38bdf8' },
            { key: 'mega', label: '🏆 Mega Score', color: '#facc15' },
            { key: 'cov5', label: '🌐 5-Seed Cover', color: '#10b981' },
            { key: 'path', label: '📍 Path Strong', color: '#f59e0b' },
            { key: 'direct', label: '👁 Direct Touch', color: '#a78bfa' }
          ].map(({ key, label, color }) => (
            <button
              key={key}
              className={`bc-seq-tab ${activeSeq === key ? 'bc-seq-tab-active' : ''}`}
              style={{ '--seq-color': color }}
              onClick={() => setActiveSeq(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="bc-seq-balls">
          {seqMap[activeSeq].map((r, i) => (
            <div
              key={r.n}
              className={`bc-seq-ball ${ticket.includes(r.n) ? 'bc-seq-ball-sel' : ''}`}
              onClick={() => toggleTicket(r.n)}
              title={`Coverage: ${r.coverage}/5 seeds | Path: ${r.pathCov}/5 | Direct: ${r.directCount} seeds`}
            >
              <span className="bc-seq-rank">#{i + 1}</span>
              <span className="bc-seq-num">{r.n}</span>
              <span className="bc-seq-cov">{r.coverage}/5</span>
            </div>
          ))}
        </div>
        {/* Anchor picks */}
        {(() => {
          const anchors = ranked.filter(r => r.coverage >= 4 && r.pathCov >= 2)
          if (!anchors.length) return null
          return (
            <div className="bc-anchors">
              <span className="bc-anchor-label">⚓ ANCHOR PICKS (4+/5 seeds + strong path):</span>
              {anchors.slice(0, 5).map(r => (
                <span
                  key={r.n}
                  className={`bc-anchor-num ${ticket.includes(r.n) ? 'bc-anchor-sel' : ''}`}
                  onClick={() => toggleTicket(r.n)}
                >
                  {r.n}
                </span>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Per-Seed Breakdown */}
      <div className="bc-seed-breakdown">
        <div className="bc-sec-title">🔬 PER-SEED TOUCH ANALYSIS (D{drawNum})</div>
        <div className="bc-seed-grid">
          {seedData.map(({ seed, touchAll, beams }) => (
            <div key={seed} className="bc-seed-card">
              <div className="bc-seed-card-header">
                <span className="bc-seed-num">{seed}</span>
                <span className="bc-seed-touch-count">{touchAll.length} touches</span>
              </div>
              {Object.entries(beams).map(([dir, { path, corner }]) => (
                (path.length > 0 || corner.length > 0) && (
                  <div key={dir} className="bc-seed-beam-row">
                    <span className={`bc-beam-dir bc-beam-${dir.toLowerCase()}`}>{dir}</span>
                    {path.length > 0 && (
                      <span className="bc-beam-path">
                        path: {path.map((n, i) => (
                          <span key={n} className={`bc-touch-num ${i === 0 ? 'bc-touch-first' : ''}`}>{n}</span>
                        ))}
                      </span>
                    )}
                    {corner.length > 0 && (
                      <span className="bc-beam-corner">
                        corner: {corner.map(n => (
                          <span key={n} className="bc-touch-corner">{n}</span>
                        ))}
                      </span>
                    )}
                  </div>
                )
              ))}
              <div className="bc-seed-all-touch">
                All: {touchAll.filter(n => !seeds.includes(n)).map(n => (
                  <span
                    key={n}
                    className="bc-touch-chip"
                    onClick={() => toggleTicket(n)}
                  >{n}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full ranked table */}
      <div className="bc-full-list">
        <div className="bc-sec-title">📊 FULL RANKED LIST — all candidates</div>
        <div className="bc-table-header">
          <span>Num</span><span>Seeds</span><span>🔺Push</span><span>Path</span><span>MEGA</span><span>How covered</span>
        </div>
        {displayList.map(r => (
          <div
            key={r.n}
            className={`bc-table-row ${r.coverage === 5 ? 'bc-row-all5' : r.coverage >= 4 ? 'bc-row-4' : r.coverage >= 3 ? 'bc-row-3' : ''} ${ticket.includes(r.n) ? 'bc-row-sel' : ''}`}
            onClick={() => toggleTicket(r.n)}
          >
            <span className="bc-tbl-num">{r.n}</span>
            <span className="bc-tbl-cov">
              <span className={`bc-cov-badge bc-cov-${r.coverage}`}>{r.coverage}/5</span>
            </span>
            <span className="bc-tbl-push">
              {r.pushCount > 0 && <span className="bc-push-badge">⚡{r.pushCount}</span>}
              {r.mathCount > 0 && <span className="bc-math-badge">M{r.mathCount}</span>}
            </span>
            <span className="bc-tbl-path">{r.pathCov}/5</span>
            <span className="bc-tbl-mega">{r.mega}</span>
            <span className="bc-tbl-exprs">{r.exprs.slice(0, 3).join(' · ')}</span>
          </div>
        ))}
        {!showAll && ranked.length > 20 && (
          <button className="bc-show-all" onClick={() => setShowAll(true)}>
            Show {ranked.length - 20} more…
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="bc-legend">
        <div className="bc-legend-item"><span className="bc-cov-badge bc-cov-5">5/5</span> Covered by all 5 seeds (any mode)</div>
        <div className="bc-legend-item"><span className="bc-cov-badge bc-cov-4">4/5</span> 4 seeds agree</div>
        <div className="bc-legend-item"><span className="bc-push-badge">⚡Push</span> = another seed's math output lands inside this seed's beam field — <strong>strongest signal</strong></div>
        <div className="bc-legend-item"><span className="bc-math-badge">Math</span> = seed's own pairwise arithmetic produces this number</div>
        <div className="bc-legend-item"><span style={{color:'#f59e0b'}}>Path</span> = produced by direct beam path touches (no corners)</div>
        <div className="bc-legend-item"><span style={{color:'#facc15'}}>MEGA</span> = Push×25 + Math×20 + Path×10 + Direct×8</div>
      </div>
    </div>
  )
}
