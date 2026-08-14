import { useEffect, useMemo, useState } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import { computeAutoSequence, computeSequenceReplay } from '../utils/autoSequence'
import './AutoSequence.css'

function Ball({ n, score, className = '' }) {
  return (
    <span className={`as-ball ${className}`} title={score != null ? `Score ${score}` : ''}>
      {n}
      {score != null && <small>{score}</small>}
    </span>
  )
}

function Ticket({ ticket, idx }) {
  return (
    <div className="as-ticket">
      <span className="as-ticket-rank">#{idx + 1}</span>
      <div className="as-ticket-balls">
        {ticket.map(r => <Ball key={r.number} n={r.number} score={r.score} />)}
      </div>
    </div>
  )
}

export default function AutoSequence() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState(null)
  const [ticketCount, setTicketCount] = useState(10)
  const [replayLimit, setReplayLimit] = useState(25)
  const [selectedReplayIdx, setSelectedReplayIdx] = useState(0)
  const [auto, setAuto] = useState(null)
  const [replay, setReplay] = useState([])
  const [replayComputing, setReplayComputing] = useState(false)

  // Step 1: load draws
  useEffect(() => {
    fetchAllDraws()
      .then(setDraws)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Step 2: compute auto sequence asynchronously after draws load
  useEffect(() => {
    if (!draws.length) return
    setComputing(true)
    // defer so browser renders the "computing" spinner first
    const t = setTimeout(() => {
      try {
        const result = computeAutoSequence(draws)
        setAuto(result)
      } catch (e) {
        setError(e.message)
      } finally {
        setComputing(false)
      }
    }, 50)
    return () => clearTimeout(t)
  }, [draws])

  // Step 3: compute replay asynchronously, re-run only when limit changes
  useEffect(() => {
    if (!draws.length) return
    setReplayComputing(true)
    setSelectedReplayIdx(0)
    const t = setTimeout(() => {
      try {
        const result = computeSequenceReplay(draws, { limit: replayLimit })
        setReplay(result)
      } catch {
        setReplay([])
      } finally {
        setReplayComputing(false)
      }
    }, 100)
    return () => clearTimeout(t)
  }, [draws, replayLimit])

  const selectedReplay = replay[selectedReplayIdx] || replay[0]

  const lossStats = useMemo(() => {
    if (!replay.length) return null
    const primaryAvg = replay.reduce((s, r) => s + r.primaryHits.length, 0) / replay.length
    const top20Avg = replay.reduce((s, r) => s + r.exact20.length, 0) / replay.length
    const selectionFailures = replay.filter(r => r.primaryHits.length <= 1 && r.exact20.length >= 3).length
    const outsideTop30 = replay.reduce((s, r) => s + r.actualRank.filter(a => !a.rank || a.rank > 30).length, 0)
    return {
      primaryAvg: primaryAvg.toFixed(2),
      top20Avg: top20Avg.toFixed(2),
      selectionFailures,
      outsideTop30,
      totalNumbers: replay.length * 5,
    }
  }, [replay])

  if (loading) return <div className="as-loading"><div className="as-spinner"/>Loading draws…</div>
  if (error) return <div className="as-loading">⚠ {error}</div>
  if (computing || !auto) return <div className="as-loading"><div className="as-spinner"/>Computing next sequence… (this takes a few seconds)</div>

  return (
    <div className="as-page">
      <header className="as-header">
        <div>
          <div className="as-kicker">AUTOMATED DEEP SEQUENCE ENGINE</div>
          <h1>D{auto.nextDrawNum} Auto Next Result</h1>
          <p>
            Based on D{auto.drawNum}: {auto.lastDraw.map(n => <Ball key={n} n={n} className="as-seed" />)}
          </p>
        </div>
        <div className="as-backtest">
          <strong>{auto.avgTop20}/5</strong>
          <span>avg top-20 hits, last 20 draws</span>
        </div>
      </header>

      <section className="as-primary-card">
        <div className="as-section-title">Strong automatic sequence</div>
        <div className="as-primary-balls">
          {auto.primary.map(r => <Ball key={r.number} n={r.number} score={r.score} className="as-primary-ball" />)}
        </div>
        <p className="as-note">
          This is zone-balanced automatically: high score + dependency movement + formula/±1 correction + missing-zone rebound.
        </p>
      </section>

      {auto.formulaAgent && (
        <section className="as-card as-agent-card">
          <div className="as-ticket-head">
            <div>
              <div className="as-section-title">Formula Agent Robo</div>
              <p className="as-note">
                Scans full history draw-by-draw, checks which formulas actually hit, detects current regime, then forms the next sequence from working formulas.
              </p>
            </div>
            <div className="as-agent-badge">
              <strong>{auto.formulaAgent.selectedShape}</strong>
              <span>predicted shape</span>
            </div>
          </div>

          <div className="as-agent-grid">
            <div className="as-agent-panel">
              <strong>Active regime</strong>
              <span>{auto.formulaAgent.currentRegime}</span>
              <small>Rows analyzed: {auto.formulaAgent.rowsAnalyzed}</small>
            </div>
            <div className="as-agent-panel">
              <strong>Agent primary</strong>
              <div>{auto.formulaAgent.primary.map(r => <Ball key={r.number} n={r.number} score={r.laserRank ? `L#${r.laserRank}` : r.score} />)}</div>
            </div>
            <div className="as-agent-panel">
              <strong>Laser-only primary</strong>
              <div>{auto.formulaAgent.laserPrimary.map(r => <Ball key={r.number} n={r.number} score={`L#${r.laserRank}`} />)}</div>
            </div>
            <div className="as-agent-panel">
              <strong>Spider movement primary</strong>
              <div>{auto.formulaAgent.spiderPrimary.map(r => <Ball key={r.number} n={r.number} score={`S#${r.spiderRank}`} />)}</div>
            </div>
            <div className="as-agent-panel wide">
              <strong>Agent cover pool</strong>
              <div>{auto.formulaAgent.cover20.slice(0, 20).map(r => <Ball key={r.number} n={r.number} score={r.spiderRank ? `S#${r.spiderRank}` : r.laserRank ? `L#${r.laserRank}` : r.score} />)}</div>
            </div>
          </div>

          <div className="as-agent-columns">
            <div>
              <div className="as-mini-title">Top working formulas now</div>
              {auto.formulaAgent.topFormulas.slice(0, 8).map((f, i) => (
                <div key={f.name} className="as-agent-row">
                  <span>#{i + 1}</span>
                  <strong>{f.name}</strong>
                  <em>{f.hits}/{f.tries} hits · {(f.hitRate * 100).toFixed(1)}%</em>
                </div>
              ))}
            </div>
            <div>
              <div className="as-mini-title">Live laser decides</div>
              {auto.formulaAgent.laser.slice(0, 8).map((l, i) => (
                <div key={l.number} className="as-agent-row">
                  <span>#{i + 1}</span>
                  <strong>{l.number}</strong>
                  <em>laser {l.score} · seeds {l.seedsHit} · direct {l.direct} · corner {l.corner}</em>
                </div>
              ))}
            </div>
            <div>
              <div className="as-mini-title">Spider number talk</div>
              {auto.formulaAgent.spider.slice(0, 8).map(s => (
                <div key={s.number} className="as-agent-row">
                  <span>#{s.rank}</span>
                  <strong>{s.number}</strong>
                  <em>{s.pathTypes.slice(0, 3).join(' + ')} · talk {s.talkers.slice(0, 4).join(',') || '—'}</em>
                </div>
              ))}
            </div>
            <div>
              <div className="as-mini-title">Shape behavior options</div>
              {auto.formulaAgent.shapeOptions.slice(0, 8).map((s, i) => (
                <div key={s.signature} className="as-agent-row">
                  <span>#{i + 1}</span>
                  <strong>{s.signature}</strong>
                  <em>score {s.score.toFixed(1)}</em>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {lossStats && (
        <section className="as-card as-loss-card">
          <div className="as-section-title">Why we were losing</div>
          <div className="as-loss-grid">
            <div><strong>{lossStats.primaryAvg}/5</strong><span>Auto 5 avg in selected replay</span></div>
            <div><strong>{lossStats.top20Avg}/5</strong><span>Top 20 cover avg</span></div>
            <div><strong>{lossStats.selectionFailures}</strong><span>Final-selection failures</span></div>
            <div><strong>{lossStats.outsideTop30}/{lossStats.totalNumbers}</strong><span>Actual numbers outside top 30</span></div>
          </div>
          <p className="as-note">
            Missing part detected: the raw ranking finds more numbers in the cover pool than the final 5. Auto Next now uses a historical regime selector, but the safest play is still the cover pool/ticket set, not only one line.
          </p>
        </section>
      )}

      <div className="as-grid">
        <section className="as-card">
          <div className="as-section-title">Important forces detected</div>
          <div className="as-force-list">
            {auto.forces.map((f, i) => (
              <div key={i} className="as-force">
                <strong>{f.title}</strong>
                <span>{f.detail}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="as-card">
          <div className="as-section-title">Cover pool</div>
          <div className="as-cover-row">
            {auto.cover20.map(r => <Ball key={r.number} n={r.number} score={r.score} />)}
          </div>
          <p className="as-note">Use this pool when trying to catch full sequence. Top 20 is the real safety net.</p>
        </section>
      </div>

      <section className="as-card">
        <div className="as-ticket-head">
          <div>
            <div className="as-section-title">Auto generated tickets</div>
            <p className="as-note">Generated from low rebound + boundary + mid + high compression patterns.</p>
          </div>
          <select value={ticketCount} onChange={e => setTicketCount(+e.target.value)}>
            <option value={5}>5 tickets</option>
            <option value={10}>10 tickets</option>
            <option value={20}>20 tickets</option>
          </select>
        </div>
        <div className="as-ticket-grid">
          {auto.tickets.slice(0, ticketCount).map((t, i) => <Ticket key={i} ticket={t} idx={i} />)}
        </div>
      </section>

      <section className="as-card">
        <div className="as-section-title">Ranked sequence formation table</div>
        <div className="as-table">
          <div className="as-tr as-th">
            <span>Rank</span><span>No</span><span>Score</span><span>Zone</span><span>Signals</span><span>Why important</span>
          </div>
          {auto.results.slice(0, 30).map(r => (
            <div key={r.number} className="as-tr">
              <span>#{r.rank}</span>
              <span><Ball n={r.number} /></span>
              <span>{r.score}</span>
              <span>{r.zone}</span>
              <span>{r.signalCount}</span>
              <span>{r.explanation}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="as-card">
        <div className="as-section-title">Recent validation</div>
        <div className="as-bt-list">
          {auto.backtest.slice(-10).map(row => (
            <div key={row.drawNum} className="as-bt-row">
              <strong>D{row.drawNum}</strong>
              <span>actual {row.actual.join(', ')}</span>
              <span className={row.exact.length >= 4 ? 'as-good' : row.exact.length >= 3 ? 'as-ok' : ''}>
                hit {row.exact.length}/5: {row.exact.join(', ') || '—'}
              </span>
              <span>±1: {row.pm1.slice(0, 6).join(', ') || '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="as-card as-replay-card">
        <div className="as-ticket-head">
          <div>
            <div className="as-section-title">Previous draw-to-draw replay</div>
            <p className="as-note">Central audit of every past prediction: what hit, what missed, and what was only ±1/±2 away.</p>
          </div>
          <select value={replayLimit} onChange={e => { setReplayLimit(e.target.value === 'all' ? 'all' : +e.target.value); setSelectedReplayIdx(0) }}>
            <option value={25}>Last 25 draws</option>
            <option value={50}>Last 50 draws</option>
            <option value={100}>Last 100 draws</option>
            <option value="all">Entire history</option>
          </select>
        </div>

        {replayComputing ? (
          <div className="as-loading" style={{minHeight:'80px'}}><div className="as-spinner"/>Computing replay…</div>
        ) : (
        <div className="as-replay-layout">
          <div className="as-replay-list">
            <div className="as-replay-head">
              <span>Draw</span><span>Actual</span><span>Auto</span><span>Top20</span><span>Missed</span><span>Near</span>
            </div>
            {replay.map((row, idx) => (
              <button
                key={row.drawNum}
                className={`as-replay-row ${idx === selectedReplayIdx ? 'active' : ''}`}
                onClick={() => setSelectedReplayIdx(idx)}
              >
                <span>D{row.prevDrawNum}→D{row.drawNum}</span>
                <span>{row.actual.join(',')}</span>
                <span className={row.primaryHits.length >= 3 ? 'as-good' : row.primaryHits.length >= 2 ? 'as-ok' : ''}>{row.primaryHits.length}/5</span>
                <span className={row.exact20.length >= 5 ? 'as-good' : row.exact20.length >= 3 ? 'as-ok' : ''}>{row.exact20.length}/5</span>
                <span>{row.missed20.join(',') || '—'}</span>
                <span>{row.near1.slice(0, 4).join(',') || '—'}</span>
              </button>
            ))}
          </div>

          {selectedReplay && (
            <div className="as-replay-detail">
              <div className="as-section-title">D{selectedReplay.prevDrawNum} → D{selectedReplay.drawNum} detail</div>
              <div className="as-detail-block">
                <strong>Seeds</strong>
                <div>{selectedReplay.seeds.map(n => <Ball key={n} n={n} className="as-seed" />)}</div>
              </div>
              <div className="as-detail-block">
                <strong>Actual</strong>
                <div>{selectedReplay.actual.map(n => <Ball key={n} n={n} className={selectedReplay.exact20.includes(n) ? 'as-hit-ball' : 'as-miss-ball'} />)}</div>
              </div>
              <div className="as-detail-block">
                <strong>Auto 5</strong>
                <div>{selectedReplay.primary.map(n => <Ball key={n} n={n} className={selectedReplay.actual.includes(n) ? 'as-hit-ball' : ''} />)}</div>
              </div>
              <div className="as-detail-block">
                <strong>Top 20 cover</strong>
                <div>{selectedReplay.top20.map(n => <Ball key={n} n={n} className={selectedReplay.actual.includes(n) ? 'as-hit-ball' : ''} />)}</div>
              </div>

              <div className="as-rank-cards">
                {selectedReplay.actualRank.map(r => (
                  <div key={r.number} className={`as-rank-card ${r.rank && r.rank <= 20 ? 'hit' : 'miss'}`}>
                    <Ball n={r.number} score={r.rank ? `#${r.rank}` : '—'} />
                    <div>
                      <strong>{r.rank ? `Rank #${r.rank} · score ${r.score}` : 'Outside ranking'}</strong>
                      <span>{r.explanation}</span>
                      <small>{r.reasons.slice(0, 5).join(' · ')}</small>
                    </div>
                  </div>
                ))}
              </div>

              <div className="as-detail-block">
                <strong>Forces for that draw</strong>
                <div className="as-force-list compact">
                  {selectedReplay.forces.slice(0, 6).map((f, i) => (
                    <div key={i} className="as-force"><strong>{f.title}</strong><span>{f.detail}</span></div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        )}
      </section>
    </div>
  )
}
