import { useState, useMemo } from 'react'
import './BeamPredictPage.css'

// ── Core beam engine (game-agnostic) ────────────────────────────────────────
function runBeams(draws, maxNum) {
  if (!draws.length) return []
  const latest   = draws[draws.length - 1].numbers
  const numCols  = draws.length
  const colIdx   = numCols - 1
  const drawSets = draws.map(d => new Set(d.numbers))

  const DIRS = {
    NE: { dc: +1, dr: -1 },
    NW: { dc: -1, dr: -1 },
    SE: { dc: +1, dr: +1 },
    SW: { dc: -1, dr: +1 },
  }

  const cands = {}

  latest.forEach(seedNum => {
    const rowIdx = seedNum - 1
    Object.entries(DIRS).forEach(([dir, { dc, dr }]) => {
      let step = 1, firstHit = true
      while (true) {
        const ci = colIdx + dc * step
        const ri = rowIdx + dr * step
        if (ci < 0 || ci >= numCols || ri < 0 || ri >= maxNum) break
        const n = ri + 1
        if (drawSets[ci].has(n)) {
          const score   = (100 / (1 + step * 0.08)) * (firstHit ? 2.5 : 1)
          const formula = dr > 0 ? `${seedNum} + ${step} = ${n}` : `${seedNum} − ${step} = ${n}`
          if (!cands[n]) cands[n] = { score: 0, sources: [] }
          cands[n].score += score
          cands[n].sources.push({ from: seedNum, step, beam: dir, formula, isCorner: false, isFirst: firstHit })
          firstHit = false
        }
        // corner
        const adjRi = dr < 0 ? ri - 1 : ri + 1
        if (adjRi >= 0 && adjRi < maxNum) {
          const adjN = adjRi + 1
          if (drawSets[ci].has(adjN)) {
            const score   = 80 / (1 + step * 0.08) * 0.65
            const formula = dr > 0 ? `${seedNum} + ${step} + 1 = ${adjN}` : `${seedNum} − ${step} − 1 = ${adjN}`
            if (!cands[adjN]) cands[adjN] = { score: 0, sources: [] }
            cands[adjN].score += score
            cands[adjN].sources.push({ from: seedNum, step, beam: dir, formula, isCorner: true, isFirst: false })
          }
        }
        step++
      }
    })
  })

  latest.forEach(n => delete cands[n])
  return Object.entries(cands)
    .map(([n, d]) => ({ number: +n, ...d }))
    .sort((a, b) => b.score - a.score)
}

function predictBonus(draws, bonusField, maxBonus) {
  if (!bonusField || !maxBonus) return []
  const freq = {}
  const lastN = Math.min(draws.length, 100)
  for (let i = draws.length - lastN; i < draws.length - 1; i++) {
    const b = draws[i][bonusField]
    if (!b) continue
    const recency = (i - (draws.length - lastN)) / lastN
    freq[b] = (freq[b] || 0) + 1 + recency * 2
  }
  const gapMap = {}
  for (let b = 1; b <= maxBonus; b++) {
    let gap = 0
    for (let i = draws.length - 2; i >= 0; i--) { gap++; if (draws[i][bonusField] === b) break }
    gapMap[b] = gap
  }
  return Array.from({ length: maxBonus }, (_, i) => i + 1)
    .map(b => ({ number: b, score: (freq[b] || 0) + Math.min(gapMap[b] || 0, 30) * 0.8, gap: gapMap[b] || 0, freq: Math.floor(freq[b] || 0) }))
    .sort((a, b) => b.score - a.score)
}

const DIR_COLOR = { NE: '#00ffff', NW: '#ff00ff', SE: '#ff6600', SW: '#00ff88' }

function tier(score, max) {
  const p = score / max
  return p > 0.6 ? 'hot' : p > 0.35 ? 'warm' : 'cool'
}

// ── Shared component ─────────────────────────────────────────────────────────
export default function BeamPredictPage({
  draws,
  maxNumber,
  bonusField,   // 'pb' | 'mb' | null
  maxBonus,     // 26 | 25 | 0
  bonusLabel,   // 'PB' | 'MB' | null
  gameName,
  accent,       // CSS color string
}) {
  const [showTop,   setShowTop]   = useState(10)
  const [pickedW,   setPicked]    = useState([])
  const [pickedB,   setPickedB]   = useState(null)
  const [expanded,  setExpanded]  = useState(null)

  const candidates  = useMemo(() => runBeams(draws, maxNumber), [draws, maxNumber])
  const bonusCands  = useMemo(() => predictBonus(draws, bonusField, maxBonus), [draws, bonusField, maxBonus])
  const maxScore    = candidates[0]?.score || 1

  const latest    = draws[draws.length - 1]
  const latestNums = latest?.numbers || []
  const latestBonus = latest?.[bonusField] || null
  const drawNum    = draws.length

  const toggleW = n => {
    if (pickedW.includes(n)) { setPicked(p => p.filter(x => x !== n)); return }
    if (pickedW.length >= 5) return
    setPicked(p => [...p, n].sort((a, b) => a - b))
  }

  return (
    <div className="bpp-page" style={{ '--accent': accent }}>

      {/* Header */}
      <div className="bpp-header">
        <div>
          <h1 className="bpp-title">⚡ Beam Predictor</h1>
          <p className="bpp-sub">{gameName} · {draws.length} draws · firing from D#{drawNum}</p>
        </div>
        <div className="bpp-latest-box">
          <span className="bpp-latest-label">Latest D#{drawNum}</span>
          <div className="bpp-latest-nums">
            {latestNums.map(n => <span key={n} className="bpp-seed-ball">{n}</span>)}
            {latestBonus && bonusLabel &&
              <span className="bpp-seed-bonus" style={{ background: accent }}>{bonusLabel} {latestBonus}</span>}
          </div>
        </div>
      </div>

      {/* Info bar */}
      <div className="bpp-info">
        Beams fire diagonally from each number through history.
        Hit numbers score by recency (step 1 = highest).
        <strong> First hit ×2.5 bonus.</strong>
        Click a number to expand its calculation.
      </div>

      {/* Ticket */}
      <div className="bpp-ticket-wrap">
        <div className="bpp-ticket-title">
          Your Ticket &nbsp;
          <span className="bpp-ticket-hint">({pickedW.length}/5{bonusLabel ? ` · ${pickedB ? 1 : 0}/1 ${bonusLabel}` : ''})</span>
          {(pickedW.length > 0 || pickedB) &&
            <button className="bpp-clear" onClick={() => { setPicked([]); setPickedB(null) }}>Clear</button>}
        </div>
        <div className="bpp-ticket">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`bpp-slot ${pickedW[i] ? 'filled' : ''}`}>{pickedW[i] || '—'}</div>
          ))}
          {bonusLabel && (
            <div className={`bpp-slot bpp-slot-bonus ${pickedB ? 'filled' : ''}`}
              style={pickedB ? { background: accent, borderColor: accent, color: '#fff' } : {}}>
              {pickedB ? `${bonusLabel} ${pickedB}` : `${bonusLabel} —`}
            </div>
          )}
        </div>
        {pickedW.length === 5 && (!bonusLabel || pickedB) && (
          <div className="bpp-ready">
            ✓ {pickedW.join(' · ')}{bonusLabel && pickedB ? ` + ${bonusLabel} ${pickedB}` : ''}
          </div>
        )}
      </div>

      {/* Auto-pick strip */}
      <div className="bpp-autopick" style={{ borderColor: accent }}>
        <div className="bpp-ap-label">⚡ Auto-Pick Top 5{bonusLabel ? ` + ${bonusLabel}` : ''}</div>
        <div className="bpp-ap-row">
          {candidates.slice(0, 5).map(c => (
            <span key={c.number} className="bpp-ap-ball">{c.number}</span>
          ))}
          {bonusLabel && bonusCands[0] && (
            <span className="bpp-ap-bonus" style={{ background: accent }}>{bonusLabel} {bonusCands[0].number}</span>
          )}
        </div>
        <button className="bpp-ap-btn" style={{ background: accent }}
          onClick={() => {
            setPicked(candidates.slice(0, 5).map(c => c.number).sort((a, b) => a - b))
            if (bonusLabel) setPickedB(bonusCands[0]?.number || null)
          }}>
          Use this ticket
        </button>
      </div>

      <div className="bpp-body">

        {/* White balls */}
        <div className="bpp-white">
          <div className="bpp-sec-title">
            Numbers (1–{maxNumber})
            <span className="bpp-sec-sub"> top {Math.min(showTop, candidates.length)} of {candidates.length}</span>
          </div>

          <div className="bpp-list">
            {candidates.slice(0, showTop).map((c, rank) => {
              const t       = tier(c.score, maxScore)
              const isPicked = pickedW.includes(c.number)
              const isOpen  = expanded === c.number
              const topSrcs = c.sources
                .sort((a, b) => (a.isFirst ? -1 : 1) - (b.isFirst ? -1 : 1) || a.step - b.step)
                .slice(0, 6)

              return (
                <div key={c.number} className={`bpp-cand bpp-${t} ${isPicked ? 'picked' : ''}`}>
                  <div className="bpp-cand-row" onClick={() => toggleW(c.number)}>
                    <span className="bpp-cr-rank">#{rank + 1}</span>
                    <span className="bpp-cr-num">{c.number}</span>
                    <div className="bpp-bar-wrap">
                      <div className={`bpp-bar bpp-bar-${t}`} style={{ width: `${(c.score / maxScore) * 100}%` }}/>
                    </div>
                    <span className={`bpp-cr-score bpp-score-${t}`}>{c.score.toFixed(0)}</span>
                    <span className="bpp-cr-hits">{c.sources.length}×</span>
                    <button className="bpp-chevron"
                      onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : c.number) }}>
                      {isOpen ? '▲' : '▼'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="bpp-detail">
                      <div className="bpp-detail-hdr">Calculation:</div>
                      {topSrcs.map((s, i) => (
                        <div key={i} className={`bpp-src ${s.isFirst ? 'first' : ''} ${s.isCorner ? 'corner' : ''}`}>
                          <span className="bpp-src-formula">{s.formula}</span>
                          <span className="bpp-src-beam" style={{ color: DIR_COLOR[s.beam] }}>{s.beam}</span>
                          <span className="bpp-src-step">step {s.step}</span>
                          {s.isFirst  && <span className="bpp-tag first">1st</span>}
                          {s.isCorner && <span className="bpp-tag corner">corner</span>}
                        </div>
                      ))}
                      {c.sources.length > 6 && <div className="bpp-more">+{c.sources.length - 6} more</div>}
                      <button className={`bpp-pick-btn ${isPicked ? 'remove' : ''}`} onClick={() => toggleW(c.number)}>
                        {isPicked ? '✕ Remove' : '+ Add to ticket'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {showTop < candidates.length && (
            <button className="bpp-show-more" onClick={() => setShowTop(t => t + 10)}>
              Show more ({candidates.length - showTop} remaining)
            </button>
          )}
        </div>

        {/* Bonus ball panel */}
        {bonusLabel && bonusCands.length > 0 && (
          <div className="bpp-bonus-panel">
            <div className="bpp-sec-title">{bonusLabel} (1–{maxBonus})</div>
            <div className="bpp-bonus-grid">
              {bonusCands.slice(0, 13).map((c, rank) => (
                <div key={c.number}
                  className={`bpp-bonus-cand ${pickedB === c.number ? 'picked' : ''}`}
                  style={pickedB === c.number ? { background: accent, borderColor: accent } : {}}
                  onClick={() => setPickedB(prev => prev === c.number ? null : c.number)}
                  title={`Freq: ${c.freq} · Gap: ${c.gap}d`}>
                  <span className="bpp-bc-rank">#{rank + 1}</span>
                  <span className="bpp-bc-num">{c.number}</span>
                  <span className="bpp-bc-gap">{c.gap}d</span>
                </div>
              ))}
            </div>
            <div className="bpp-bonus-top5">
              <div className="bpp-bt-label">Top 5:</div>
              <div className="bpp-bt-row">
                {bonusCands.slice(0, 5).map(c => (
                  <span key={c.number}
                    className={`bpp-bt-chip ${pickedB === c.number ? 'picked' : ''}`}
                    style={pickedB === c.number ? { background: accent, borderColor: accent } : { borderColor: accent, color: accent }}
                    onClick={() => setPickedB(prev => prev === c.number ? null : c.number)}>
                    {c.number}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seeds summary */}
      <div className="bpp-seeds">
        <div className="bpp-seeds-label">Seeds from D#{drawNum}</div>
        <div className="bpp-seeds-row">
          {latestNums.map(n => (
            <div key={n} className="bpp-seed">
              <span className="bpp-seed-n">{n}</span>
              <span className="bpp-seed-c">{candidates.filter(c => c.sources.some(s => s.from === n)).length} cands</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
