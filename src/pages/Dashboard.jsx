import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllDraws } from '../lib/supabase'
import { predictNextDraw, buildGapMap, getHotCold, analyzeZones, buildFreqMap } from '../utils/predictionEngine'
import './Dashboard.css'

export default function Dashboard() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAllDraws()
      .then(setDraws)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner"/><span>Loading draws…</span></div>
  if (error) return <div className="page-error">⚠ {error} — <em>Have you created the draws table in Supabase?</em></div>
  if (!draws.length) return <div className="page-error">No draws yet. <Link to="/add">Add the first draw →</Link></div>

  const latest = draws[draws.length - 1]
  const prev   = draws.length >= 2 ? draws[draws.length - 2] : null
  const prediction = predictNextDraw(draws, latest.numbers)
  const top5 = prediction.slice(0, 5)
  const top20 = prediction.slice(0, 20)
  const gaps = buildGapMap(draws)
  const { hot, cold } = getHotCold(draws, 30)
  const zones = analyzeZones(draws)
  const freq = buildFreqMap(draws)

  const nextId = latest.id + 1

  return (
    <div className="dashboard">
      {/* Header row */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-sub">{draws.length} draws loaded · latest D{latest.id}</p>
        </div>
        <Link to="/add" className="btn-add">+ Add D{nextId}</Link>
      </div>

      {/* Cards row */}
      <div className="dash-cards">
        {/* Latest draw */}
        <div className="dash-card card-latest">
          <div className="card-label">D{latest.id} — Latest Draw</div>
          <div className="ball-row">
            {latest.numbers.map(n => (
              <span key={n} className="ball ball-latest">{n}</span>
            ))}
          </div>
          <div className="card-sub">Sum: {latest.numbers.reduce((a,b)=>a+b,0)}</div>
        </div>

        {/* Prediction */}
        <div className="dash-card card-prediction">
          <div className="card-label">D{nextId} — Predicted Top 5</div>
          <div className="ball-row">
            {top5.map(({ number, score }) => (
              <div key={number} className="pred-ball-wrap">
                <span className="ball ball-pred">{number}</span>
                <span className="pred-score">{score}</span>
              </div>
            ))}
          </div>
          <Link to="/ticket" className="card-sub link-action">Build full ticket →</Link>
        </div>

        {/* Stats */}
        <div className="dash-card card-stats">
          <div className="card-label">Quick Stats</div>
          <div className="stats-grid">
            <div className="stat-item"><span className="stat-val">{draws.length}</span><span className="stat-lbl">Total Draws</span></div>
            <div className="stat-item"><span className="stat-val">{hot[0]?.number}</span><span className="stat-lbl">Hottest #</span></div>
            <div className="stat-item"><span className="stat-val">{cold[0]?.number}</span><span className="stat-lbl">Coldest #</span></div>
            <div className="stat-item"><span className="stat-val">{Object.entries(gaps).sort((a,b)=>b[1]-a[1])[0]?.[0]}</span><span className="stat-lbl">Most Overdue</span></div>
          </div>
        </div>
      </div>

      {/* Middle row */}
      <div className="dash-mid">
        {/* Top 20 predictions heatmap */}
        <div className="dash-section">
          <h2 className="section-title">D{nextId} Score Heatmap (Top 20)</h2>
          <div className="heatmap-grid">
            {top20.map(({ number, score, gap }) => {
              const maxScore = top20[0].score
              const intensity = score / maxScore
              return (
                <div key={number} className="heatmap-cell" style={{ '--intensity': intensity }}>
                  <span className="hm-num">{number}</span>
                  <span className="hm-score">{score}</span>
                  <span className="hm-gap">G{gap}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Zone distribution */}
        <div className="dash-section">
          <h2 className="section-title">Zone Distribution (last 20 draws)</h2>
          <div className="zone-bars">
            {zones.map(z => (
              <div key={z.label} className="zone-bar-wrap">
                <div className="zone-label">{z.label}</div>
                <div className="zone-bar-track">
                  <div className="zone-bar-fill" style={{ width: `${Math.min(100, z.count * 4)}%` }} />
                </div>
                <div className="zone-count">{z.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hot / Cold */}
      <div className="dash-mid">
        <div className="dash-section">
          <h2 className="section-title">🔥 Hot Numbers (last 30)</h2>
          <div className="ball-list">
            {hot.map(({ number, count }) => (
              <div key={number} className="ball-item">
                <span className="ball ball-hot">{number}</span>
                <span className="ball-count">{count}x</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dash-section">
          <h2 className="section-title">🧊 Cold Numbers (last 30)</h2>
          <div className="ball-list">
            {cold.map(({ number, count }) => (
              <div key={number} className="ball-item">
                <span className="ball ball-cold">{number}</span>
                <span className="ball-count">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Previous draws */}
      <div className="dash-section full-width">
        <h2 className="section-title">Recent Draws</h2>
        <div className="recent-draws">
          {draws.slice(-10).reverse().map(d => (
            <div key={d.id} className={`recent-draw-row ${d.id === latest.id ? 'is-latest' : ''}`}>
              <span className="draw-id">D{d.id}</span>
              <div className="ball-row-sm">
                {d.numbers.map(n => <span key={n} className="ball ball-sm">{n}</span>)}
              </div>
              <span className="draw-sum">Σ{d.numbers.reduce((a,b)=>a+b,0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
