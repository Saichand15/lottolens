import { useState, useEffect, useMemo } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import {
  buildTransitionMatrix, buildCoOccurrence, buildGapMap,
  buildFreqMap, buildPositionFreq, findLegendaryChains,
  analyzeZones, getHotCold, TOTAL_NUMBERS
} from '../utils/predictionEngine'
import './Analysis.css'

const TABS = ['Frequency', 'Transitions', 'Gaps', 'Zones', 'Chains', 'Position Heatmap']

export default function Analysis() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [hoverNum, setHoverNum] = useState(null)

  useEffect(() => { fetchAllDraws().then(setDraws).finally(() => setLoading(false)) }, [])

  const matrix = useMemo(() => draws.length ? buildTransitionMatrix(draws) : {}, [draws])
  const co     = useMemo(() => draws.length ? buildCoOccurrence(draws) : {}, [draws])
  const gaps   = useMemo(() => draws.length ? buildGapMap(draws) : {}, [draws])
  const freq   = useMemo(() => draws.length ? buildFreqMap(draws) : {}, [draws])
  const pf     = useMemo(() => draws.length ? buildPositionFreq(draws) : {}, [draws])
  const chains = useMemo(() => draws.length ? findLegendaryChains(draws) : [], [draws])
  const zones  = useMemo(() => draws.length ? analyzeZones(draws) : [], [draws])
  const { hot, cold } = useMemo(() => draws.length ? getHotCold(draws, 30) : { hot: [], cold: [] }, [draws])

  if (loading) return <div className="page-loading"><div className="spinner"/><span>Loading…</span></div>
  if (!draws.length) return <div className="page-error">No draws yet.</div>

  const maxFreq = Math.max(...Object.values(freq))
  const maxGap  = Math.max(...Object.values(gaps))
  const maxChain = chains[0]?.chain || 1

  const numbers = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1)

  return (
    <div className="analysis-page">
      <h1 className="an-title">Analysis</h1>

      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <div className="tab-content">
          <h2>Number Frequency — all {draws.length} draws</h2>
          <div className="freq-bars">
            {numbers.map(n => {
              const cnt = freq[n] || 0
              const pct = (cnt / maxFreq) * 100
              return (
                <div key={n} className="freq-row" onMouseEnter={() => setHoverNum(n)} onMouseLeave={() => setHoverNum(null)}>
                  <span className="freq-num">{n}</span>
                  <div className="freq-track">
                    <div className="freq-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="freq-count">{cnt}</span>
                  <span className="freq-pct">{(cnt / draws.length * 5 * 100).toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 1 && (
        <div className="tab-content">
          <h2>Transition Heatmap — {hoverNum ? `from #${hoverNum}` : 'hover a row'}</h2>
          <div className="trans-grid-wrap">
            <div className="trans-grid">
              {/* Header */}
              <div className="trans-header-row">
                <div className="trans-corner">From↓ To→</div>
                {numbers.slice(0, 45).map(n => (
                  <div key={n} className="trans-col-head">{n}</div>
                ))}
              </div>
              {numbers.map(from => {
                const row = matrix[from] || {}
                const maxRow = Math.max(...Object.values(row), 1)
                return (
                  <div key={from} className={`trans-row ${hoverNum === from ? 'row-hover' : ''}`}
                    onMouseEnter={() => setHoverNum(from)} onMouseLeave={() => setHoverNum(null)}>
                    <div className="trans-row-head">{from}</div>
                    {numbers.map(to => {
                      const v = row[to] || 0
                      const intensity = v / maxRow
                      return (
                        <div key={to} className="trans-cell" style={{ '--v': intensity }} title={`${from}→${to}: ${v}`}>
                          {v > 0 ? v : ''}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 2 && (
        <div className="tab-content">
          <h2>Gap Map — draws since last appearance</h2>
          <div className="gap-grid">
            {numbers.map(n => {
              const g = gaps[n] || 0
              const intensity = g / maxGap
              const cls = g === 0 ? 'gap-fresh' : g > 20 ? 'gap-overdue' : g > 10 ? 'gap-mid' : 'gap-recent'
              return (
                <div key={n} className={`gap-cell ${cls}`}>
                  <span className="gap-n">{n}</span>
                  <span className="gap-g">G{g}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 3 && (
        <div className="tab-content">
          <h2>Zone Analysis (last 20 draws)</h2>
          <div className="zone-detail">
            {zones.map(z => (
              <div key={z.label} className="zone-card">
                <div className="zc-label">{z.label}</div>
                <div className="zc-count">{z.count}</div>
                <div className="zc-bar-track"><div className="zc-bar-fill" style={{ width: `${Math.min(100, z.count * 5)}%` }} /></div>
                <div className="zc-avg">avg {z.avg}/draw</div>
              </div>
            ))}
          </div>
          <div className="hot-cold-wrap">
            <div>
              <h3>🔥 Hot (last 30)</h3>
              <div className="hc-list">
                {hot.map(({ number, count }) => (
                  <div key={number} className="hc-item hc-hot">
                    <span className="hc-num">{number}</span>
                    <span className="hc-count">{count}x</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>🧊 Cold (last 30)</h3>
              <div className="hc-list">
                {cold.map(({ number, count }) => (
                  <div key={number} className="hc-item hc-cold">
                    <span className="hc-num">{number}</span>
                    <span className="hc-count">{count}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 4 && (
        <div className="tab-content">
          <h2>Legendary Chains — longest consecutive appearances</h2>
          <div className="chain-list">
            {chains.slice(0, 20).map(({ number, chain }, i) => (
              <div key={number} className="chain-row">
                <span className="chain-rank">#{i + 1}</span>
                <span className="chain-num">{number}</span>
                <div className="chain-track">
                  <div className="chain-fill" style={{ width: `${(chain / maxChain) * 100}%` }} />
                </div>
                <span className="chain-count">{chain} draws</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 5 && (
        <div className="tab-content">
          <h2>Position Heatmap — where each number appears most</h2>
          <div className="pos-heatmap">
            <div className="ph-header">
              <span>Num</span>
              {['P1','P2','P3','P4','P5'].map(p => <span key={p}>{p}</span>)}
              <span>Total</span>
            </div>
            {numbers.map(n => {
              const positions = pf[n] || [0,0,0,0,0]
              const total = positions.reduce((a,b) => a+b, 0)
              const maxPos = Math.max(...positions, 1)
              return (
                <div key={n} className="ph-row">
                  <span className="ph-num">{n}</span>
                  {positions.map((c, i) => (
                    <div key={i} className="ph-cell" style={{ '--pct': c / maxPos }}>{c}</div>
                  ))}
                  <span className="ph-total">{total}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
