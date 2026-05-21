import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllPBDraws } from '../../lib/supabase'
import {
  pbComputeFullPrediction,
  pbBuildGapMap,
  pbGetHotCold,
  pbGetHotColdPB,
  pbAnalyzeZones,
  pbBuildFreqMap,
  pbPredictPowerball,
  pbAnalyzeSums
} from '../../utils/pbEngine'
import './PBDashboard.css'

export default function PBDashboard() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAllPBDraws()
      .then(setDraws)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading Powerball draws…</span></div>
  if (error)   return <div className="page-error">⚠ {error}<br /><em>Make sure the <code>pb_draws</code> table exists in Supabase.</em></div>
  if (!draws.length) return (
    <div className="page-error">
      No Powerball draws yet. <Link to="/powerball/add">Add the first draw →</Link>
    </div>
  )

  const latest   = draws[draws.length - 1]
  const nextId   = latest.id + 1
  const pred     = pbComputeFullPrediction(draws)
  const top5     = pred?.results.slice(0, 5) || []
  const pbPred   = pbPredictPowerball(draws)
  const topPB    = pbPred.slice(0, 5)
  const gaps     = pbBuildGapMap(draws)
  const { hot, cold } = pbGetHotCold(draws, 30)
  const { hot: hotPB } = pbGetHotColdPB(draws, 20)
  const zones    = pbAnalyzeZones(draws)
  const { avg: sumAvg } = pbAnalyzeSums(draws)
  const mostOverdue = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="pb-dashboard">
      {/* Header */}
      <div className="pb-dash-header">
        <div>
          <h1 className="pb-dash-title">
            <span className="pb-icon">🔴</span> Powerball Dashboard
          </h1>
          <p className="pb-dash-sub">{draws.length} draws loaded · latest #{latest.id}{latest.date ? ` · ${latest.date}` : ''}</p>
        </div>
        <Link to="/powerball/add" className="pb-btn-add">+ Add Draw #{nextId}</Link>
      </div>

      {/* Cards Row */}
      <div className="pb-cards">

        {/* Latest Draw */}
        <div className="pb-card pb-card-latest">
          <div className="pb-card-label">Draw #{latest.id} — Latest</div>
          <div className="pb-ball-row">
            {latest.numbers.map(n => (
              <span key={n} className="pb-ball pb-ball-white">{n}</span>
            ))}
            <span className="pb-ball pb-ball-red">{latest.pb}</span>
          </div>
          <div className="pb-card-sub">
            Sum: {latest.numbers.reduce((a, b) => a + b, 0)} · PB: {latest.pb}
          </div>
        </div>

        {/* Predicted Next */}
        <div className="pb-card pb-card-pred">
          <div className="pb-card-label">Draw #{nextId} — Predicted Top 5 + PB</div>
          <div className="pb-ball-row">
            {top5.map(({ number, score }) => (
              <div key={number} className="pb-pred-wrap">
                <span className="pb-ball pb-ball-pred">{number}</span>
                <span className="pb-pred-score">{score}</span>
              </div>
            ))}
            <div className="pb-pred-wrap">
              <span className="pb-ball pb-ball-pred-red">{topPB[0]?.number}</span>
              <span className="pb-pred-score">PB</span>
            </div>
          </div>
          <Link to="/powerball/predict" className="pb-card-sub pb-link-action">Full prediction →</Link>
        </div>

        {/* Quick Stats */}
        <div className="pb-card pb-card-stats">
          <div className="pb-card-label">Quick Stats</div>
          <div className="pb-stats-grid">
            <div className="pb-stat"><span className="pb-stat-val">{draws.length}</span><span className="pb-stat-lbl">Total Draws</span></div>
            <div className="pb-stat"><span className="pb-stat-val">{hot[0]?.number}</span><span className="pb-stat-lbl">Hottest #</span></div>
            <div className="pb-stat"><span className="pb-stat-val">{cold[0]?.number}</span><span className="pb-stat-lbl">Coldest #</span></div>
            <div className="pb-stat"><span className="pb-stat-val">{mostOverdue?.[0]}</span><span className="pb-stat-lbl">Most Overdue</span></div>
            <div className="pb-stat"><span className="pb-stat-val">{sumAvg}</span><span className="pb-stat-lbl">Avg Sum</span></div>
            <div className="pb-stat"><span className="pb-stat-val" style={{color:'#ef4444'}}>{hotPB[0]?.number}</span><span className="pb-stat-lbl">Hot PB</span></div>
          </div>
        </div>
      </div>

      {/* Mid Row */}
      <div className="pb-mid">
        {/* Hot Numbers */}
        <div className="pb-card">
          <div className="pb-card-label">🔥 Hot Numbers (last 30)</div>
          <div className="pb-ball-row pb-ball-row-wrap">
            {hot.map(({ number, count }) => (
              <div key={number} className="pb-num-wrap">
                <span className="pb-ball pb-ball-hot">{number}</span>
                <span className="pb-num-count">{count}x</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cold Numbers */}
        <div className="pb-card">
          <div className="pb-card-label">❄️ Cold Numbers (last 30)</div>
          <div className="pb-ball-row pb-ball-row-wrap">
            {cold.map(({ number, count }) => (
              <div key={number} className="pb-num-wrap">
                <span className="pb-ball pb-ball-cold">{number}</span>
                <span className="pb-num-count">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zone Analysis */}
      <div className="pb-card">
        <div className="pb-card-label">📊 Zone Distribution (last 20 draws)</div>
        <div className="pb-zones">
          {zones.map(z => (
            <div key={z.label} className="pb-zone">
              <div className="pb-zone-label">{z.label}</div>
              <div className="pb-zone-bar-wrap">
                <div className="pb-zone-bar" style={{ width: `${Math.min(z.avg / 1.5 * 100, 100)}%` }} />
              </div>
              <div className="pb-zone-val">{z.count} <span>({z.avg}/draw)</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Top PB predictions */}
      <div className="pb-card">
        <div className="pb-card-label">🔴 Top Powerball Predictions</div>
        <div className="pb-ball-row pb-ball-row-wrap">
          {topPB.map(({ number, score, gap }) => (
            <div key={number} className="pb-pred-wrap">
              <span className="pb-ball pb-ball-pred-red">{number}</span>
              <span className="pb-pred-score">gap:{gap}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="pb-quick-links">
        <Link to="/powerball/history" className="pb-ql-btn">📜 History</Link>
        <Link to="/powerball/predict" className="pb-ql-btn">🔮 Full Predict</Link>
        <Link to="/powerball/pb-matrix" className="pb-ql-btn">🔴 PB Matrix</Link>
        <Link to="/powerball/add" className="pb-ql-btn pb-ql-add">+ Add Result</Link>
      </div>
    </div>
  )
}
