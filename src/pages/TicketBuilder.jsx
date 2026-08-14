import { useState, useEffect, useMemo } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import {
  analyzePosition, buildGapMap,
  buildCoOccurrence, buildFreqMap, checkTripleCoOcc, getCoOcc
} from '../utils/predictionEngine'
import { computeHybridPrediction } from '../utils/hybridPrediction'
import './TicketBuilder.css'

const POSITIONS = ['Pos 1', 'Pos 2', 'Pos 3', 'Pos 4', 'Pos 5']

export default function TicketBuilder() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState([])          // array of 0-5 numbers
  const [activePos, setActivePos] = useState(0)     // 0-4

  useEffect(() => {
    fetchAllDraws().then(setDraws).finally(() => setLoading(false))
  }, [])

  const hybrid = useMemo(() => computeHybridPrediction(draws), [draws])
  const hybridRank = useMemo(() => {
    const rank = {}
    ;(hybrid?.results || []).forEach((r, idx) => { rank[r.number] = { score: r.score, rank: idx + 1, tier: r.tier } })
    return rank
  }, [hybrid])

  if (loading) return <div className="page-loading"><div className="spinner"/><span>Loading…</span></div>
  if (!draws.length) return <div className="page-error">No draws in database.</div>

  const gaps = buildGapMap(draws)
  const co   = buildCoOccurrence(draws)
  const freq = buildFreqMap(draws)

  // Candidates for current active position
  const candidates = analyzePosition(draws, activePos, picked)
    .map(c => {
      const h = hybridRank[c.number]
      const hybridScore = h ? (100 - Math.min(h.rank - 1, 40) * 2) : 0
      return {
        ...c,
        hybridScore: h?.score || 0,
        hybridRank: h?.rank || null,
        hybridTier: h?.tier || 'cold',
        score: Math.round(c.score + hybridScore * 1.2)
      }
    })
    .sort((a, b) => b.score - a.score || (a.hybridRank || 99) - (b.hybridRank || 99))
    .slice(0, 20)

  // When a number is picked, register it and advance to next pos
  function pick(n) {
    if (picked.includes(n)) return
    const next = [...picked, n]
    setPicked(next)
    if (next.length < 5) setActivePos(next.length)
  }

  function removeLast() {
    const next = picked.slice(0, -1)
    setPicked(next)
    setActivePos(Math.max(0, next.length))
  }

  function reset() { setPicked([]); setActivePos(0) }

  const isComplete = picked.length === 5

  // Analysis for the complete ticket
  let ticketAnalysis = null
  if (isComplete) {
    const tripleChecks = []
    for (let i = 0; i < 5; i++) for (let j = i+1; j < 5; j++) for (let k = j+1; k < 5; k++) {
      const cnt = checkTripleCoOcc(draws, picked[i], picked[j], picked[k])
      if (cnt > 0) tripleChecks.push({ combo: `${picked[i]}+${picked[j]}+${picked[k]}`, count: cnt })
    }
    const coScores = []
    for (let i = 0; i < 5; i++) for (let j = i+1; j < 5; j++) {
      coScores.push({ a: picked[i], b: picked[j], count: getCoOcc(co, picked[i], picked[j]) })
    }
    coScores.sort((a,b)=>b.count-a.count)
    const sumVal = picked.reduce((a,b)=>a+b,0)
    ticketAnalysis = { tripleChecks, coScores, sumVal }
  }

  return (
    <div className="ticket-builder">
      <h1 className="tb-title">🎟 Ticket Builder</h1>
      <p className="tb-sub">Pick one number per position. Suggestions now combine hybrid prediction rank + position frequency + co-occurrence + gap.</p>

      {/* Ticket display */}
      <div className="ticket-card">
        {POSITIONS.map((label, i) => {
          const num = picked[i]
          const isActive = i === activePos && !isComplete
          const isDone = i < picked.length
          return (
            <div key={i} className={`ticket-pos ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
              <span className="pos-label">{label}</span>
              {num
                ? <span className="ball ball-picked">{num}</span>
                : <span className="ball ball-empty">{isActive ? '?' : '—'}</span>
              }
              {isDone && <span className="pos-gap">G{gaps[num]}</span>}
            </div>
          )
        })}
        {picked.length > 0 && (
          <button className="btn-remove" onClick={removeLast} title="Remove last pick">↩</button>
        )}
        {isComplete && (
          <button className="btn-reset" onClick={reset}>Reset</button>
        )}
      </div>

      {/* Analysis or candidates */}
      {isComplete ? (
        <div className="analysis-section">
          <h2>Ticket Analysis: [{picked.join(', ')}]</h2>
          <div className="analysis-grid">
            <div className="an-card">
              <div className="an-label">Sum</div>
              <div className="an-val">{ticketAnalysis.sumVal}</div>
              <div className="an-sub">{ticketAnalysis.sumVal < 90 ? 'Low sum' : ticketAnalysis.sumVal > 150 ? 'High sum' : 'Balanced'}</div>
            </div>
            <div className="an-card">
              <div className="an-label">Triples Found</div>
              <div className="an-val">{ticketAnalysis.tripleChecks.length}</div>
              <div className="an-sub">{ticketAnalysis.tripleChecks.length === 0 ? '⚠ No triple history' : '✅ Historical triples'}</div>
            </div>
            <div className="an-card">
              <div className="an-label">Best Co-Pair</div>
              <div className="an-val">{ticketAnalysis.coScores[0]?.a} + {ticketAnalysis.coScores[0]?.b}</div>
              <div className="an-sub">{ticketAnalysis.coScores[0]?.count}x together</div>
            </div>
          </div>

          {ticketAnalysis.tripleChecks.length > 0 && (
            <div className="triple-list">
              <h3>Triple Co-Occurrences</h3>
              {ticketAnalysis.tripleChecks.map(t => (
                <div key={t.combo} className="triple-row">
                  <span className="triple-combo">{t.combo}</span>
                  <span className="triple-count">{t.count}x</span>
                </div>
              ))}
            </div>
          )}

          <div className="co-pairs">
            <h3>All Pair Co-Occurrences</h3>
            <div className="co-grid">
              {ticketAnalysis.coScores.map(({ a, b, count }) => (
                <div key={`${a}-${b}`} className={`co-cell ${count === 0 ? 'co-zero' : ''}`}>
                  <span>{a}+{b}</span>
                  <span className="co-count">{count}x</span>
                </div>
              ))}
            </div>
          </div>

          <button className="btn-reset full" onClick={reset}>Build Another Ticket</button>
        </div>
      ) : (
        <div className="candidates-section">
          <h2 className="cand-title">
            {POSITIONS[activePos]} — Top candidates
            {picked.length > 0 && <span className="locked-label"> (locked: {picked.join(', ')})</span>}
          </h2>
          <div className="candidates-grid">
            {candidates.map(({ number, posFreq, coScore, gap, score, hybridScore, hybridRank }) => (
              <button
                key={number}
                className={`cand-btn ${picked.includes(number) ? 'already-picked' : ''}`}
                onClick={() => pick(number)}
                disabled={picked.includes(number)}
              >
                <span className="cand-num">{number}</span>
                <div className="cand-stats">
                  <span className="cand-stat">P{posFreq}</span>
                  <span className="cand-stat">C{coScore}</span>
                  <span className="cand-stat">G{gap}</span>
                  {hybridRank && <span className="cand-stat">H{hybridScore}</span>}
                </div>
                <span className="cand-score">{score}</span>
              </button>
            ))}
          </div>
          <p className="cand-hint">H = unified hybrid score · P = position frequency · C = co-score with locked · G = gap</p>
        </div>
      )}
    </div>
  )
}
