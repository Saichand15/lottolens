import { useState, useEffect } from 'react'
import { fetchAllMMDraws } from '../../lib/supabase'
import {
  mmComputeFullPrediction,
  mmPredictMegaBall
} from '../../utils/mmEngine'
import '../powerball/PBPredict.css'

export default function MMPredict() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('main')
  const [pickedNums, setPickedNums] = useState([])
  const [pickedMB, setPickedMB] = useState(null)

  useEffect(() => {
    fetchAllMMDraws()
      .then(setDraws)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>
  if (error) return <div className="page-error">⚠ {error}</div>
  if (!draws.length) return <div className="page-error">No draws yet.</div>

  const pred = mmComputeFullPrediction(draws)
  const mbPred = mmPredictMegaBall(draws)

  const togglePick = n => {
    setPickedNums(prev => prev.includes(n)
      ? prev.filter(x => x !== n)
      : prev.length < 5 ? [...prev, n].sort((a, b) => a - b) : prev)
  }

  const tierColor = t => t === 'hot' ? '#ef4444' : t === 'warm' ? '#f59e0b' : '#6b7280'

  return (
    <div className="pb-predict">
      <div className="pb-pred-header">
        <div>
          <h1 className="pb-pred-title">🔮 Mega Millions Predictor</h1>
          <p className="pb-pred-sub">Seeds: {pred?.seeds.join(', ')} · Draw #{pred?.nextDrawNum}</p>
        </div>
        <div className="pb-pred-tabs">
          <button className={`pb-tab ${tab === 'main' ? 'active' : ''}`} onClick={() => setTab('main')}>Main Balls</button>
          <button className={`pb-tab ${tab === 'mb' ? 'active' : ''}`} onClick={() => setTab('mb')}>🟡 Mega Ball</button>
        </div>
      </div>

      {(pickedNums.length > 0 || pickedMB) && (
        <div className="pb-ticket">
          <div className="pb-ticket-label">🎟 Your Ticket</div>
          <div className="pb-ticket-balls">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`pb-ball ${pickedNums[i] ? 'pb-ball-white' : 'pb-ball-empty'}`}>{pickedNums[i] || '?'}</span>
            ))}
            <span className={`pb-ball ${pickedMB ? 'pb-ball-red' : 'pb-ball-empty-red'}`}>{pickedMB || '?'}</span>
          </div>
          <button className="pb-clear-btn" onClick={() => { setPickedNums([]); setPickedMB(null) }}>Clear</button>
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
              <div key={number} className={`pb-pred-card ${pickedNums.includes(number) ? 'picked' : ''}`} onClick={() => togglePick(number)} style={{ '--tier-color': tierColor(tier) }}>
                <div className="ppc-tier-bar" />
                <div className="ppc-number">{number}</div>
                <div className="ppc-score">{score}</div>
                <div className="ppc-gap">gap {gap}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'mb' && (
        <div className="pb-pred-pblist">
          <p className="pb-pb-sub">Click a Mega Ball to select it for your ticket</p>
          <div className="pb-pb-grid">
            {mbPred.map(({ number, score, gap, freq }) => (
              <div key={number} className={`pb-pb-card ${pickedMB === number ? 'picked' : ''}`} onClick={() => setPickedMB(prev => prev === number ? null : number)}>
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
