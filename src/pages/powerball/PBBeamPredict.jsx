import { useState, useEffect, useMemo } from 'react'
import { fetchAllPBDraws } from '../../lib/supabase'
import './PBBeamPredict.css'

const MAX_WHITE = 69
const MAX_PB    = 26

// ── Core beam prediction engine ─────────────────────────────────────────────
function runBeamPredictor(draws, maxNum = MAX_WHITE) {
  if (!draws.length) return { candidates: [], pbCandidates: [] }

  const latest    = draws[draws.length - 1]          // { numbers: [...], pb }
  const whiteNums = latest.numbers                   // e.g. [4, 26, 66, 67, 69]
  const numCols   = draws.length
  const colIdx    = numCols - 1                      // latest = rightmost

  // Build draw sets for O(1) lookup
  const drawSets  = draws.map(d => new Set(d.numbers))

  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 },
  }

  // candidates[n] = { score, sources: [{from, step, beam, formula, isCorner, isFirst}] }
  const candidates = {}

  whiteNums.forEach(seedNum => {
    const rowIdx = seedNum - 1

    Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
      let step      = 1
      let firstHit  = true

      while (true) {
        const ci = colIdx + dc * step
        const ri = rowIdx + dr * step
        if (ci < 0 || ci >= numCols || ri < 0 || ri >= maxNum) break

        const n       = ri + 1
        const appeared = drawSets[ci].has(n)

        if (appeared) {
          // Recency score: step 1 = highest, decays with distance
          const recency  = 100 / (1 + step * 0.08)
          const firstMul = firstHit ? 2.5 : 1
          const score    = recency * firstMul
          const formula  = dr > 0
            ? `${seedNum} + ${step} = ${n}`
            : `${seedNum} − ${step} = ${n}`

          if (!candidates[n]) candidates[n] = { score: 0, sources: [] }
          candidates[n].score += score
          candidates[n].sources.push({
            from: seedNum, step, beam: dir,
            formula, isCorner: false, isFirst: firstHit
          })
          firstHit = false
        }

        // Corner-adjacent check
        const adjRi = dr < 0 ? ri - 1 : ri + 1
        if (adjRi >= 0 && adjRi < maxNum) {
          const adjN       = adjRi + 1
          const adjAppeared = drawSets[ci].has(adjN)
          if (adjAppeared) {
            const recency  = 80 / (1 + step * 0.08)
            const formula  = dr > 0
              ? `${seedNum} + ${step} + 1 = ${adjN}`
              : `${seedNum} − ${step} − 1 = ${adjN}`
            if (!candidates[adjN]) candidates[adjN] = { score: 0, sources: [] }
            candidates[adjN].score += recency * 0.65
            candidates[adjN].sources.push({
              from: seedNum, step, beam: dir,
              formula, isCorner: true, isFirst: false
            })
          }
        }

        step++
      }
    })
  })

  // Remove numbers already in the latest draw
  whiteNums.forEach(n => delete candidates[n])

  const sorted = Object.entries(candidates)
    .map(([n, d]) => ({ number: +n, ...d }))
    .sort((a, b) => b.score - a.score)

  // ── Powerball prediction (1–26) using the PB column ──────────────────────
  const pbCandidates = predictPowerball(draws)

  return { candidates: sorted, pbCandidates, latestDraw: latest }
}

function predictPowerball(draws) {
  // Frequency + recency of PB values in recent draws
  const freq = {}
  const lastN = Math.min(draws.length, 100)
  for (let i = draws.length - lastN; i < draws.length - 1; i++) {
    const pb = draws[i].pb
    if (!pb) continue
    const recency = (i - (draws.length - lastN)) / lastN  // 0→old, 1→recent
    freq[pb] = (freq[pb] || 0) + 1 + recency * 2
  }
  // Also: gap map for PB
  const gapMap = {}
  for (let pb = 1; pb <= MAX_PB; pb++) {
    let gap = 0
    for (let i = draws.length - 2; i >= 0; i--) {
      gap++
      if (draws[i].pb === pb) break
    }
    gapMap[pb] = gap
  }
  // Combined score: frequency + overdue bonus
  return Array.from({ length: MAX_PB }, (_, i) => i + 1)
    .map(pb => ({
      number: pb,
      score:  (freq[pb] || 0) + Math.min(gapMap[pb] || 0, 30) * 0.8,
      gap:    gapMap[pb] || 0,
      freq:   Math.floor(freq[pb] || 0)
    }))
    .sort((a, b) => b.score - a.score)
}

// ── Scoring label ─────────────────────────────────────────────────────────
function scoreLabel(score, max) {
  const pct = score / max
  if (pct > 0.6) return 'hot'
  if (pct > 0.35) return 'warm'
  return 'cool'
}

const DIR_COLOR = { NE: '#00ffff', NW: '#ff00ff', SE: '#ff6600', SW: '#00ff88' }

// ── Component ─────────────────────────────────────────────────────────────
export default function PBBeamPredict() {
  const [draws,   setDraws]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showTop, setShowTop] = useState(10)   // how many candidates to show
  const [pickedWhite, setPicked]  = useState([])
  const [pickedPB,    setPickedPB] = useState(null)
  const [expandedNum, setExpanded] = useState(null)

  useEffect(() => {
    fetchAllPBDraws()
      .then(setDraws)
      .finally(() => setLoading(false))
  }, [])

  const result = useMemo(() => runBeamPredictor(draws), [draws])
  const { candidates, pbCandidates, latestDraw } = result
  const maxScore = candidates[0]?.score || 1

  const togglePick = n => {
    if (pickedWhite.includes(n)) { setPicked(p => p.filter(x => x !== n)); return }
    if (pickedWhite.length >= 5) return
    setPicked(p => [...p, n].sort((a, b) => a - b))
  }

  if (loading) return (
    <div className="pbp-loading"><div className="pbp-spinner"/>Loading beam predictor…</div>
  )
  if (!draws.length) return <div className="pbp-loading">No draw data found.</div>

  const latest = latestDraw?.numbers || []
  const latestPB = latestDraw?.pb
  const drawNum = draws.length

  return (
    <div className="pbp-page">

      {/* ── Header ── */}
      <div className="pbp-header">
        <div>
          <h1 className="pbp-title">⚡ Beam Predictor</h1>
          <p className="pbp-sub">Based on {draws.length} draws · firing lasers from D#{drawNum}</p>
        </div>
        <div className="pbp-latest-box">
          <span className="pbp-latest-label">Latest D#{drawNum}</span>
          <div className="pbp-latest-nums">
            {latest.map(n => <span key={n} className="pbp-seed-ball">{n}</span>)}
            {latestPB && <span className="pbp-seed-pb">PB {latestPB}</span>}
          </div>
        </div>
      </div>

      {/* ── How it works ── */}
      <div className="pbp-explain">
        <span className="pbp-explain-icon">ℹ</span>
        Beams fire diagonally from each of today's numbers through all history.
        Every number that appeared on a beam path scores points.
        <strong> Lower step = more recent = higher score.</strong>
        First hit in each direction gets ×2.5 bonus.
      </div>

      {/* ── Ticket builder ── */}
      <div className="pbp-ticket-section">
        <div className="pbp-ticket-title">
          Your Ticket &nbsp;
          <span className="pbp-ticket-hint">
            ({pickedWhite.length}/5 white · {pickedPB ? 1 : 0}/1 PB)
          </span>
          {(pickedWhite.length > 0 || pickedPB) && (
            <button className="pbp-clear-btn" onClick={() => { setPicked([]); setPickedPB(null) }}>
              Clear
            </button>
          )}
        </div>
        <div className="pbp-ticket">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`pbp-ticket-slot ${pickedWhite[i] ? 'filled' : ''}`}>
              {pickedWhite[i] || '—'}
            </div>
          ))}
          <div className={`pbp-ticket-slot pbp-pb-slot ${pickedPB ? 'filled' : ''}`}>
            {pickedPB ? `PB ${pickedPB}` : 'PB —'}
          </div>
        </div>
        {pickedWhite.length === 5 && pickedPB && (
          <div className="pbp-ticket-ready">
            ✓ Ticket ready: <strong>{pickedWhite.join(' · ')} + PB {pickedPB}</strong>
          </div>
        )}
      </div>

      <div className="pbp-body">

        {/* ── White ball candidates ── */}
        <div className="pbp-white-section">
          <div className="pbp-section-title">
            White Balls (1–69) &nbsp;
            <span className="pbp-section-sub">showing top {showTop} of {candidates.length}</span>
          </div>

          <div className="pbp-candidates">
            {candidates.slice(0, showTop).map((c, rank) => {
              const tier    = scoreLabel(c.score, maxScore)
              const isPickd = pickedWhite.includes(c.number)
              const isOpen  = expandedNum === c.number
              // Deduplicate sources: keep best (lowest step) per formula
              const topSrcs = c.sources
                .sort((a, b) => (a.isFirst ? -1 : 1) - (b.isFirst ? -1 : 1) || a.step - b.step)
                .slice(0, 6)

              return (
                <div
                  key={c.number}
                  className={`pbp-cand ${tier} ${isPickd ? 'picked' : ''}`}
                >
                  {/* Main row */}
                  <div className="pbp-cand-main" onClick={() => togglePick(c.number)}>
                    <span className="pbp-cand-rank">#{rank + 1}</span>
                    <span className="pbp-cand-num">{c.number}</span>
                    <div className="pbp-score-bar-wrap">
                      <div
                        className={`pbp-score-bar pbp-bar-${tier}`}
                        style={{ width: `${(c.score / maxScore) * 100}%` }}
                      />
                    </div>
                    <span className={`pbp-score-label pbp-score-${tier}`}>
                      {c.score.toFixed(0)}
                    </span>
                    <span className="pbp-src-count">{c.sources.length} hits</span>
                    <button
                      className="pbp-expand-btn"
                      onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : c.number) }}
                    >
                      {isOpen ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Expanded calculation detail */}
                  {isOpen && (
                    <div className="pbp-cand-detail">
                      <div className="pbp-detail-header">How this number was found:</div>
                      {topSrcs.map((s, i) => (
                        <div key={i} className={`pbp-src-row ${s.isFirst ? 'pbp-src-first' : ''} ${s.isCorner ? 'pbp-src-corner' : ''}`}>
                          <span className="pbp-src-formula">{s.formula}</span>
                          <span className="pbp-src-beam" style={{ color: DIR_COLOR[s.beam] }}>{s.beam}</span>
                          <span className="pbp-src-step">step {s.step}</span>
                          {s.isFirst && <span className="pbp-src-tag first">1st hit</span>}
                          {s.isCorner && <span className="pbp-src-tag corner">corner</span>}
                        </div>
                      ))}
                      {c.sources.length > 6 && (
                        <div className="pbp-src-more">+{c.sources.length - 6} more sources</div>
                      )}
                      <button
                        className={`pbp-pick-btn ${isPickd ? 'remove' : ''}`}
                        onClick={() => togglePick(c.number)}
                      >
                        {isPickd ? '✕ Remove from ticket' : '+ Add to ticket'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {showTop < candidates.length && (
            <button className="pbp-show-more" onClick={() => setShowTop(t => t + 10)}>
              Show more ({candidates.length - showTop} remaining)
            </button>
          )}
        </div>

        {/* ── Powerball candidates ── */}
        <div className="pbp-pb-section">
          <div className="pbp-section-title">
            🔴 Powerball (1–26)
            <span className="pbp-section-sub"> freq + gap score</span>
          </div>

          <div className="pbp-pb-grid">
            {pbCandidates.slice(0, 13).map((c, rank) => {
              const isPickd = pickedPB === c.number
              return (
                <div
                  key={c.number}
                  className={`pbp-pb-cand ${isPickd ? 'picked' : ''}`}
                  onClick={() => setPickedPB(prev => prev === c.number ? null : c.number)}
                  title={`Freq: ${c.freq} · Gap: ${c.gap} draws`}
                >
                  <span className="pbp-pb-rank">#{rank + 1}</span>
                  <span className="pbp-pb-num">{c.number}</span>
                  <span className="pbp-pb-gap">{c.gap}d</span>
                </div>
              )
            })}
          </div>

          {/* Top 5 auto-suggest */}
          <div className="pbp-pb-suggest">
            <div className="pbp-pb-suggest-title">Top 5 auto-suggest:</div>
            <div className="pbp-pb-suggest-row">
              {pbCandidates.slice(0, 5).map(c => (
                <span
                  key={c.number}
                  className={`pbp-pb-chip ${pickedPB === c.number ? 'picked' : ''}`}
                  onClick={() => setPickedPB(prev => prev === c.number ? null : c.number)}
                >
                  {c.number}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick top-5 auto-pick ── */}
      <div className="pbp-autopick">
        <div className="pbp-autopick-title">⚡ Auto-Pick Top 5 + PB</div>
        <div className="pbp-autopick-row">
          {candidates.slice(0, 5).map(c => (
            <span key={c.number} className="pbp-autopick-ball">{c.number}</span>
          ))}
          {pbCandidates[0] && (
            <span className="pbp-autopick-pb">PB {pbCandidates[0].number}</span>
          )}
        </div>
        <button
          className="pbp-autopick-btn"
          onClick={() => {
            setPicked(candidates.slice(0, 5).map(c => c.number).sort((a, b) => a - b))
            setPickedPB(pbCandidates[0]?.number || null)
          }}
        >
          Use this ticket
        </button>
      </div>

      {/* ── Seed summary ── */}
      <div className="pbp-seeds-summary">
        <div className="pbp-seeds-title">Seeds used (D#{drawNum} numbers)</div>
        <div className="pbp-seeds-row">
          {latest.map(n => (
            <div key={n} className="pbp-seed-info">
              <span className="pbp-seed-n">{n}</span>
              <span className="pbp-seed-hits">
                {candidates.filter(c => c.sources.some(s => s.from === n)).length} candidates
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
