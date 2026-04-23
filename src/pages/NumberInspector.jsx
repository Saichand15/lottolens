import { useState, useEffect, useMemo } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import { computeLaserReport } from '../utils/predictionEngine'
import { getPrevNextFrequency, buildCoOccurrence } from '../utils/dataUtils'
import './NumberInspector.css'

const DIR_COLORS = { NE: '#00d4ff', NW: '#ff00ff', SE: '#ff6a00', SW: '#00ff88' }

export default function NumberInspector() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [inputVal, setInputVal] = useState('')
  const [target, setTarget] = useState(null)

  useEffect(() => { fetchAllDraws().then(setDraws).finally(() => setLoading(false)) }, [])

  const coOccur = useMemo(() => draws.length ? buildCoOccurrence(draws.map(d => d.numbers)) : null, [draws])

  // All appearances of target number with prev/same/next context
  const appearances = useMemo(() => {
    if (!target || !draws.length) return []
    return draws
      .map((d, i) => {
        if (!d.numbers.includes(target)) return null
        const prev = i > 0 ? draws[i - 1].numbers : []
        const next = i < draws.length - 1 ? draws[i + 1].numbers : []
        return { drawId: d.id, idx: i, same: d.numbers.filter(n => n !== target), prev, next }
      })
      .filter(Boolean)
  }, [draws, target])

  // Aggregate: how often each number appeared in prev/same/next across all appearances
  const stats = useMemo(() => {
    if (!appearances.length) return null
    const prevCount = {}, sameCount = {}, nextCount = {}
    appearances.forEach(({ prev, same, next }) => {
      prev.forEach(n => { prevCount[n] = (prevCount[n] || 0) + 1 })
      same.forEach(n => { sameCount[n] = (sameCount[n] || 0) + 1 })
      next.forEach(n => { nextCount[n] = (nextCount[n] || 0) + 1 })
    })
    const toArr = obj => Object.entries(obj)
      .map(([n, c]) => ({ number: +n, count: c, pct: +(c / appearances.length * 100).toFixed(1) }))
      .sort((a, b) => b.count - a.count)
    return {
      prev: toArr(prevCount).slice(0, 15),
      same: toArr(sameCount).slice(0, 15),
      next: toArr(nextCount).slice(0, 15)
    }
  }, [appearances])

  // Historical laser report
  const laserReport = useMemo(() => {
    if (!target || !draws.length) return null
    return computeLaserReport(draws, target)
  }, [draws, target])

  function handleSearch() {
    const n = parseInt(inputVal)
    if (n >= 1 && n <= 45) setTarget(n)
  }

  if (loading) return <div className="page-loading"><div className="spinner"/><span>Loading...</span></div>

  const maxStat = stats ? Math.max(
    ...[...stats.prev, ...stats.same, ...stats.next].map(x => x.count), 1
  ) : 1

  return (
    <div className="inspector-page">
      <h1 className="ins-title">🔍 Number Inspector</h1>
      <p className="ins-sub">
        Enter any number (1–45) to see every draw it appeared in, along with the previous draw,
        same draw companions, and next draw — plus historical diagonal laser hit statistics.
      </p>

      <div className="ins-search">
        <input
          className="ins-input"
          type="number" min="1" max="45"
          placeholder="Enter number 1–45"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="ins-btn" onClick={handleSearch}>Inspect</button>
        {target && <span className="ins-badge">#{target} — {appearances.length} appearances</span>}
      </div>

      {target && stats && (<>

        {/* ── Aggregate stats ── */}
        <div className="ins-stats-row">
          {[
            { label: '⬅ Prev Draw (top companions)', data: stats.prev, color: '#7c3aed' },
            { label: '🟡 Same Draw (friends)',        data: stats.same, color: '#d97706' },
            { label: '➡ Next Draw (future signals)',  data: stats.next, color: '#059669' }
          ].map(({ label, data, color }) => (
            <div key={label} className="ins-stat-card">
              <div className="ins-stat-title" style={{ color }}>{label}</div>
              <div className="ins-stat-list">
                {data.map(({ number, count, pct }) => (
                  <div key={number} className="ins-stat-row">
                    <span className="ins-stat-num">{number}</span>
                    <div className="ins-stat-bar-track">
                      <div className="ins-stat-bar" style={{ width: `${(count / maxStat) * 100}%`, background: color }} />
                    </div>
                    <span className="ins-stat-pct">{pct}%</span>
                    <span className="ins-stat-cnt">({count})</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Historical Laser Report ── */}
        {laserReport && (
          <div className="ins-laser-card">
            <h2 className="ins-laser-title">
              ⚡ Historical Diagonal Laser Report — #{target}
              <span className="ins-laser-sub">across {laserReport.totalAppearances} appearances</span>
            </h2>
            <p className="ins-laser-desc">
              For every draw #{target} appeared in, all 4 diagonal lasers were fired.
              Numbers that were most frequently the <em>first hit</em> in each direction are shown below.
              <strong> Multi-direction = strongest signals.</strong>
            </p>

            {/* Top multi-direction hits */}
            {laserReport.results.filter(r => r.dirCount >= 2).length > 0 && (
              <div className="ins-strong-hits">
                <h3>🔥 Multi-direction hits (strongest)</h3>
                <div className="ins-strong-grid">
                  {laserReport.results.filter(r => r.dirCount >= 2).slice(0, 12).map(r => (
                    <div key={r.number} className={`ins-strong-cell ${r.dirCount >= 3 ? 'super' : ''}`}>
                      <span className="isc-num">{r.number}</span>
                      <div className="isc-dirs">
                        {['NE','NW','SE','SW'].filter(d => r[d] > 0).map(d => (
                          <span key={d} className="isc-dir" style={{ background: DIR_COLORS[d] }}>
                            {d} {r[d]}×
                          </span>
                        ))}
                      </div>
                      <div className="isc-stats">
                        <span className="isc-total">{r.total}× total</span>
                        <span className="isc-rate">{r.hitRate}% rate</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full table */}
            <div className="ins-laser-table-wrap">
              <table className="ins-laser-table">
                <thead>
                  <tr>
                    <th>Num</th>
                    <th style={{ color: DIR_COLORS.NE }}>NE</th>
                    <th style={{ color: DIR_COLORS.NW }}>NW</th>
                    <th style={{ color: DIR_COLORS.SE }}>SE</th>
                    <th style={{ color: DIR_COLORS.SW }}>SW</th>
                    <th>Total</th>
                    <th>Rate</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {laserReport.results.slice(0, 25).map(r => (
                    <tr key={r.number} className={r.dirCount >= 2 ? 'strong-row' : ''}>
                      <td className="lt-num">{r.number}</td>
                      <td className="lt-dir">{r.NE > 0 ? <span className="lt-hit ne">{r.NE}</span> : '–'}</td>
                      <td className="lt-dir">{r.NW > 0 ? <span className="lt-hit nw">{r.NW}</span> : '–'}</td>
                      <td className="lt-dir">{r.SE > 0 ? <span className="lt-hit se">{r.SE}</span> : '–'}</td>
                      <td className="lt-dir">{r.SW > 0 ? <span className="lt-hit sw">{r.SW}</span> : '–'}</td>
                      <td className="lt-total">{r.total}</td>
                      <td className="lt-rate">{r.hitRate}%</td>
                      <td className="lt-signal">
                        {r.dirCount >= 4 ? <span className="sig s4">🎯 ALL 4</span> :
                         r.dirCount === 3 ? <span className="sig s3">⚡ 3-dir</span> :
                         r.dirCount === 2 ? <span className="sig s2">✅ 2-dir</span> :
                         <span className="sig s1">1-dir</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Per-draw companion table ── */}
        <div className="ins-history-card">
          <h2 className="ins-history-title">Draw History — #{target} appearances</h2>
          <div className="ins-history-table-wrap">
            <table className="ins-history-table">
              <thead>
                <tr>
                  <th>Draw</th>
                  <th>⬅ Prev Draw</th>
                  <th>🟡 Same Draw (with #{target})</th>
                  <th>➡ Next Draw</th>
                </tr>
              </thead>
              <tbody>
                {appearances.slice().reverse().map(({ drawId, prev, same, next }) => (
                  <tr key={drawId}>
                    <td className="hist-id">D{drawId}</td>
                    <td className="hist-nums">
                      {prev.map(n => <span key={n} className="hn prev">{n}</span>)}
                    </td>
                    <td className="hist-nums">
                      {same.map(n => <span key={n} className="hn same">{n}</span>)}
                    </td>
                    <td className="hist-nums">
                      {next.map(n => <span key={n} className="hn next">{n}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </>)}

      {target && !appearances.length && (
        <div className="ins-no-data">#{target} has never appeared in any draw.</div>
      )}
    </div>
  )
}
