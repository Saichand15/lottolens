import { useState, useEffect } from 'react'
import { fetchAllPBDraws } from '../../lib/supabase'
import {
  pbComputeFullPrediction,
  pbPredictPowerball,
  pbBuildGapMap,
  pbBuildFreqMap,
  pbGetHotCold
} from '../../utils/pbEngine'
import './PBPredict.css'

export default function PBPredict() {
  const [draws, setDraws]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [tab, setTab]       = useState('main') // 'main' | 'pb'
  const [pickedNums, setPickedNums] = useState([])
  const [pickedPB, setPickedPB]     = useState(null)

  useEffect(() => {
    fetchAllPBDraws()
      .then(setDraws)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>
  if (error)   return <div className="page-error">⚠ {error}</div>
  if (!draws.length) return <div className="page-error">No draws yet.</div>

  const pred   = pbComputeFullPrediction(draws)
  const pbPred = pbPredictPowerball(draws)
  const gaps   = pbBuildGapMap(draws)
  const { hot } = pbGetHotCold(draws, 30)

  const togglePick = n => {
    setPickedNums(prev =>
      prev.includes(n) ? prev.filter(x => x !== n)
        : prev.length < 5 ? [...prev, n].sort((a, b) => a - b)
        : prev
    )
  }

  const tierColor = t => t === 'hot' ? '#ef4444' : t === 'warm' ? '#f59e0b' : '#6b7280'

  return (
    <div className="pb-predict">
      <div className="pb-pred-header">
        <div>
          <h1 className="pb-pred-title">🔮 Powerball Predictor</h1>
          <p className="pb-pred-sub">Seeds: {pred?.seeds.join(', ')} · Draw #{pred?.nextDrawNum}</p>
        </div>
        <div className="pb-pred-tabs">
          <button className={`pb-tab ${tab === 'main' ? 'active' : ''}`} onClick={() => setTab('main')}>Main Balls</button>
          <button className={`pb-tab ${tab === 'pb' ? 'active' : ''}`} onClick={() => setTab('pb')}>🔴 Powerball</button>
        </div>
      </div>

      {/* Picked ticket */}
      {(pickedNums.length > 0 || pickedPB) && (
        <div className="pb-ticket">
          <div className="pb-ticket-label">🎟 Your Ticket</div>
          <div className="pb-ticket-balls">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`pb-ball ${pickedNums[i] ? 'pb-ball-white' : 'pb-ball-empty'}`}>
                {pickedNums[i] || '?'}
              </span>
            ))}
            <span className={`pb-ball ${pickedPB ? 'pb-ball-red' : 'pb-ball-empty-red'}`}>
              {pickedPB || '?'}
            </span>
          </div>
          <button className="pb-clear-btn" onClick={() => { setPickedNums([]); setPickedPB(null) }}>Clear</button>
        </div>
      )}

      {tab === 'main' && (
        <div className="pb-pred-main">
          <div className="pb-pred-legend">
            <span className="pb-legend-dot" style={{ background: '#ef4444' }} /> Hot &nbsp;
            <span className="pb-legend-dot" style={{ background: '#f59e0b' }} /> Warm &nbsp;
            <span className="pb-legend-dot" style={{ background: '#6b7280' }} /> Cold &nbsp;
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>· Click to pick (max 5)</span>
          </div>
          <div className="pb-pred-grid">
            {pred?.results.map(({ number, score, tier, gap }) => (
              <div
                key={number}
                className={`pb-pred-card ${pickedNums.includes(number) ? 'picked' : ''}`}
                onClick={() => togglePick(number)}
                style={{ '--tier-color': tierColor(tier) }}
              >
                <div className="ppc-tier-bar" />
                <div className="ppc-number">{number}</div>
                <div className="ppc-score">{score}</div>
                <div className="ppc-gap">gap {gap}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'pb' && (
        <div className="pb-pred-pblist">
          <p className="pb-pb-sub">Click a Powerball to select it for your ticket</p>
          <div className="pb-pb-grid">
            {pbPred.map(({ number, score, gap, freq }) => (
              <div
                key={number}
                className={`pb-pb-card ${pickedPB === number ? 'picked' : ''}`}
                onClick={() => setPickedPB(prev => prev === number ? null : number)}
              >
                <span className="pb-ball pb-ball-red">{number}</span>
                <div className="pb-pb-info">
                  <span className="pb-pb-score">Score: {score}</span>
                  <span className="pb-pb-gap">Gap: {gap} · {freq}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
