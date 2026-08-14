import { useState, useEffect, useMemo } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import { computeHybridPrediction } from '../utils/hybridPrediction'
import AiChat from '../components/AiChat'
import './PredictPage.css'

const TIER_COLORS = { hot: '#ef4444', warm: '#f59e0b', cold: '#4f46e5' }
const TIER_LABELS = { hot: '🔥 Strong', warm: '⚡ Likely', cold: '🔵 Possible' }

export default function PredictPage() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [ticket, setTicket] = useState([])
  const [showAll, setShowAll] = useState(false)
  const [activeTab, setActiveTab] = useState('predict') // 'predict' | 'accuracy' | 'breakdown'
  const [copiedTicket, setCopiedTicket] = useState(false)

  useEffect(() => {
    fetchAllDraws()
      .then(data => {
        setDraws(data.map(d => d.numbers.slice().sort((a, b) => a - b)))
        setLoading(false)
      })
      .catch(() => {
        fetch('/all_draws.json')
          .then(r => r.json())
          .then(data => {
            setDraws(data.map(d => [...d].sort((a, b) => a - b)))
            setLoading(false)
          })
          .catch(() => setLoading(false))
      })
  }, [])

  const prediction = useMemo(() => draws.length >= 2 ? computeHybridPrediction(draws) : null, [draws])

  // Accuracy check: for the last 10 draws, how many top-10 predictions appeared?
  const accuracy = useMemo(() => {
    if (!draws || draws.length < 12) return []
    const records = []
    for (let i = draws.length - 1; i >= Math.max(1, draws.length - 10); i--) {
      const past = draws.slice(0, i)
      const actual = draws[i]
      const pred = computeHybridPrediction(past)
      if (!pred) continue
      const top10 = pred.results.slice(0, 10).map(r => r.number)
      const top15 = pred.results.slice(0, 15).map(r => r.number)
      const top20 = pred.results.slice(0, 20).map(r => r.number)
      const hits10 = actual.filter(n => top10.includes(n)).length
      const hits15 = actual.filter(n => top15.includes(n)).length
      const hits20 = actual.filter(n => top20.includes(n)).length
      records.push({
        drawNum: i + 1,
        actual,
        top10,
        hits10, hits15, hits20,
        seeds: past[past.length - 1]
      })
    }
    return records
  }, [draws])

  const toggleTicket = (n) => {
    setTicket(prev => {
      if (prev.includes(n)) return prev.filter(x => x !== n)
      if (prev.length >= 5) return prev
      return [...prev, n].sort((a, b) => a - b)
    })
  }

  const copyTicket = () => {
    navigator.clipboard.writeText(ticket.join(', ')).catch(() => {})
    setCopiedTicket(true)
    setTimeout(() => setCopiedTicket(false), 2000)
  }

  if (loading) return (
    <div className="pp-loading">
      <div className="pp-spinner" />
      <p>Loading prediction engine…</p>
    </div>
  )

  if (!prediction) return <div className="pp-loading"><p>Not enough data.</p></div>

  const { results, seeds, nextDrawNum, drawNum } = prediction
  const hot   = results.filter(r => r.tier === 'hot')
  const warm  = results.filter(r => r.tier === 'warm')
  const cold  = results.filter(r => r.tier === 'cold')
  const displayResults = showAll ? results : results.slice(0, 20)

  return (
    <div className="pp-page">
      {/* Header */}
      <div className="pp-header">
        <div className="pp-header-left">
          <div className="pp-draw-badge">D{nextDrawNum}</div>
          <div>
            <div className="pp-title">Laser Prediction</div>
            <div className="pp-subtitle">Based on D{drawNum}: {seeds.map(s => <span key={s} className="pp-seed">{s}</span>)}</div>
          </div>
        </div>
        <div className="pp-tabs">
          {['predict', 'accuracy', 'breakdown'].map(t => (
            <button key={t} className={`pp-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t === 'predict' ? '🎯 Predict' : t === 'accuracy' ? '📊 Accuracy' : '🔬 Breakdown'}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket builder sticky bar */}
      <div className="pp-ticket-bar">
        <span className="pp-ticket-label">🎫 MY TICKET ({ticket.length}/5):</span>
        <div className="pp-ticket-nums">
          {ticket.length === 0
            ? <span className="pp-ticket-empty">Click numbers below to build your ticket</span>
            : ticket.map(n => <span key={n} className="pp-ticket-num" onClick={() => toggleTicket(n)}>{n} ✕</span>)
          }
        </div>
        {ticket.length === 5 && (
          <button className="pp-copy-btn" onClick={copyTicket}>
            {copiedTicket ? '✓ Copied!' : '📋 Copy'}
          </button>
        )}
        {ticket.length > 0 && (
          <button className="pp-clear-btn" onClick={() => setTicket([])}>Clear</button>
        )}
      </div>

      {/* ── PREDICT TAB ── */}
      {activeTab === 'predict' && (
        <div className="pp-body">
          {/* Tier cards */}
          {[['hot', hot], ['warm', warm], ['cold', cold]].map(([tier, items]) => (
            items.length > 0 && (
              <div key={tier} className={`pp-tier-section pp-tier-${tier}`}>
                <div className="pp-tier-header">
                  <span className="pp-tier-label">{TIER_LABELS[tier]}</span>
                  <span className="pp-tier-count">{items.length} numbers</span>
                </div>
                <div className="pp-balls">
                  {items.map(r => (
                    <div
                      key={r.number}
                      className={`pp-ball pp-ball-${tier} ${ticket.includes(r.number) ? 'pp-ball-selected' : ''}`}
                      onClick={() => toggleTicket(r.number)}
                      title={`Score: ${r.score} | Laser: ${r.laserDirect} direct + ${r.laserCorner} corner | Trans: ${r.transScore} | W50: ${r.w50Score} | Gap: ${r.gap}`}
                    >
                      <span className="pp-ball-num">{r.number}</span>
                      <span className="pp-ball-score">{r.score}</span>
                      {r.laserDirect >= 2 && <span className="pp-ball-beam">⚡{r.laserDirect}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {/* Top 15 ranked list */}
          <div className="pp-ranked">
            <div className="pp-ranked-title">📋 Top 20 Ranked</div>
            {displayResults.map((r, i) => (
              <div
                key={r.number}
                className={`pp-row pp-row-${r.tier} ${ticket.includes(r.number) ? 'pp-row-selected' : ''}`}
                onClick={() => toggleTicket(r.number)}
              >
                <span className="pp-rank">#{i + 1}</span>
                <span className={`pp-rnum pp-rnum-${r.tier}`}>{r.number}</span>
                <div className="pp-bar-bg">
                  <div className="pp-bar" style={{ width: `${r.score}%`, background: TIER_COLORS[r.tier] }} />
                </div>
                <span className="pp-rscore">{r.score}</span>
                <div className="pp-tags">
                  {r.laserDirect > 0 && <span className="pp-tag pp-tag-laser">⚡{r.laserDirect}D</span>}
                  {r.laserCorner > 0 && <span className="pp-tag pp-tag-corner">◈{r.laserCorner}C</span>}
                  {r.w50Score >= 50 && <span className="pp-tag pp-tag-hot">W50</span>}
                  {r.gap >= 15 && <span className="pp-tag pp-tag-gap">gap:{r.gap}</span>}
                </div>
                <div className="pp-sources">
                  {r.directSeeds.map(s => <span key={s} className="pp-src">{s}→</span>)}
                </div>
              </div>
            ))}
            {!showAll && results.length > 20 && (
              <button className="pp-show-all" onClick={() => setShowAll(true)}>Show all {results.length - 20} more…</button>
            )}
          </div>

          {/* Legend */}
          <div className="pp-legend">
            <div className="pp-legend-item"><span style={{ color: '#ef4444' }}>⚡D</span> = direct laser beam hits</div>
            <div className="pp-legend-item"><span style={{ color: '#FFD700' }}>◈C</span> = corner-graze touches</div>
            <div className="pp-legend-item"><span style={{ color: '#0ff' }}>W50</span> = strong recent 50-draw transition</div>
            <div className="pp-legend-item"><span style={{ color: '#888' }}>gap:N</span> = overdue by N draws</div>
          </div>
        </div>
      )}

      {/* ── ACCURACY TAB ── */}
      {activeTab === 'accuracy' && (
        <div className="pp-body">
          <div className="pp-acc-note">
            Retroactive test: for each of the last 10 draws, we ran the prediction engine on all prior draws, then checked how many of the actual 5 numbers landed in the top 10/15/20 predictions.
          </div>
          <table className="pp-acc-table">
            <thead>
              <tr>
                <th>Draw</th>
                <th>Seeds (prev)</th>
                <th>Actual result</th>
                <th>In Top10</th>
                <th>In Top15</th>
                <th>In Top20</th>
              </tr>
            </thead>
            <tbody>
              {accuracy.map(a => (
                <tr key={a.drawNum}>
                  <td className="pp-acc-draw">D{a.drawNum}</td>
                  <td className="pp-acc-seeds">{a.seeds.map(s => <span key={s} className="pp-mini-ball">{s}</span>)}</td>
                  <td className="pp-acc-actual">
                    {a.actual.map(n => (
                      <span key={n} className={`pp-mini-ball ${a.top10.includes(n) ? 'pp-acc-hit10' : ''}`}>{n}</span>
                    ))}
                  </td>
                  <td className={`pp-acc-hits ${a.hits10 >= 2 ? 'pp-acc-good' : ''}`}>{a.hits10}/5</td>
                  <td className={`pp-acc-hits ${a.hits15 >= 3 ? 'pp-acc-good' : ''}`}>{a.hits15}/5</td>
                  <td className={`pp-acc-hits ${a.hits20 >= 3 ? 'pp-acc-good' : ''}`}>{a.hits20}/5</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pp-acc-avg">
            Avg hits in top10: {accuracy.length ? (accuracy.reduce((s, a) => s + a.hits10, 0) / accuracy.length).toFixed(1) : 0} / 5
            &nbsp;| top15: {accuracy.length ? (accuracy.reduce((s, a) => s + a.hits15, 0) / accuracy.length).toFixed(1) : 0} / 5
            &nbsp;| top20: {accuracy.length ? (accuracy.reduce((s, a) => s + a.hits20, 0) / accuracy.length).toFixed(1) : 0} / 5
          </div>
        </div>
      )}

      {/* ── BREAKDOWN TAB ── */}
      {activeTab === 'breakdown' && (
        <div className="pp-body">
          <div className="pp-bk-title">Score Breakdown — Top 15 Numbers</div>
          <table className="pp-bk-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Num</th>
                <th>Final</th>
                <th>Laser (D)</th>
                <th>Corner (C)</th>
                <th>Trans</th>
                <th>W50</th>
                <th>Freq%</th>
                <th>Gap</th>
                <th>Beam sources</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 15).map((r, i) => (
                <tr key={r.number} className={`pp-bk-row pp-bk-${r.tier}`}>
                  <td>#{i + 1}</td>
                  <td><span className={`pp-bk-num pp-ball-${r.tier}`}>{r.number}</span></td>
                  <td className="pp-bk-final">{r.score}</td>
                  <td>{r.laserDirect}</td>
                  <td>{r.laserCorner}</td>
                  <td>{r.transScore.toFixed(0)}</td>
                  <td>{r.w50Score.toFixed(0)}</td>
                  <td>{r.freq}</td>
                  <td>{r.gap}</td>
                  <td className="pp-bk-sources">
                    {r.directSeeds.map(s => <span key={s} className="pp-src-d">#{s}</span>)}
                    {r.cornerSeeds.slice(0, 3).map(s => <span key={'c'+s} className="pp-src-c">#{s}◈</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pp-bk-weights">
            Weights: Laser 30% + Corner 15% + All-time trans 25% + W50 trans 20% + Gap 7% + Freq 3%
          </div>
        </div>
      )}

      {/* AI Chat */}
      <AiChat prediction={prediction} draws={draws} />
    </div>
  )
}
