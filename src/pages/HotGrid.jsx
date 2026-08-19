import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import { computeLaserHits } from '../utils/predictionEngine'
import { buildTransitionMatrix, buildCoOccurrence, buildGapMap } from '../utils/dataUtils'
import LaserLayer from '../components/LaserLayer'
import './HotGrid.css'

const WINDOW_OPTIONS = [20, 50, 100, 200, 'ALL']
const MAXN    = 45
const CELL_W  = 18
const CELL_H  = 20
const LABEL_W = 140

export default function HotGrid() {
  const [allDraws, setAllDraws] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [window_,  setWindow]   = useState(100)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [selectedCell,   setSelectedCell]   = useState(null)
  const [activeDir, setActiveDir] = useState({ NE: true, NW: true, SE: true, SW: true })
  const [panelOpen, setPanelOpen] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    fetchAllDraws()
      .then(d => setAllDraws(d.map(r => r.numbers.slice().sort((a, b) => a - b))))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [allDraws.length, window_])

  const draws = useMemo(
    () => window_ === 'ALL' ? allDraws : allDraws.slice(-window_),
    [allDraws, window_]
  )

  const drawSets = useMemo(() => draws.map(d => new Set(d)), [draws])

  const freq = useMemo(() => {
    const f = {}
    for (let n = 1; n <= MAXN; n++) f[n] = 0
    draws.forEach(d => d.forEach(n => f[n]++))
    return f
  }, [draws])

  const sortedNums = useMemo(
    () => Array.from({ length: MAXN }, (_, i) => i + 1).sort((a, b) => freq[b] - freq[a] || a - b),
    [freq]
  )

  const maxFreq     = useMemo(() => Math.max(...Object.values(freq), 1), [freq])
  const lastDrawSet = useMemo(() => new Set(allDraws[allDraws.length - 1] || []), [allDraws])
  const gapMap      = useMemo(() => allDraws.length ? buildGapMap(allDraws)           : {}, [allDraws])
  const transMatrix = useMemo(() => allDraws.length ? buildTransitionMatrix(allDraws) : null, [allDraws])
  const coOccur     = useMemo(() => allDraws.length ? buildCoOccurrence(allDraws)     : null, [allDraws])

  const gridW = draws.length * CELL_W
  const gridH = sortedNums.length * CELL_H

  function gapColor(n) {
    const g = gapMap[n] || 0
    if (g <= 3)  return '#0c2a0c'
    if (g <= 7)  return '#111128'
    if (g <= 14) return '#1a1a1a'
    if (g <= 20) return '#2a1a00'
    return '#3a0a0a'
  }

  const laserHits = useMemo(() => {
    if (!selectedCell) return null
    return computeLaserHits(draws, selectedCell.colIdx, selectedCell.rowNum)
  }, [selectedCell, draws])

  const debugInfo = useMemo(() => {
    if (!selectedCell) return null
    const ci  = selectedCell.colIdx
    const row = selectedCell.rowNum
    const drawNum = allDraws.length - draws.length + ci + 1
    if (!laserHits) return `DBG: sel=ci=${ci} row=${row} | laser=pending`
    const { hits, cornerTouch } = laserHits
    const ctTotal = ['NE','NW','SE','SW'].reduce((s, d) => s + (cornerTouch?.[d]?.length || 0), 0)
    const dirs = ['NE','NW','SE','SW'].map(d => {
      const steps    = (cornerTouch?.[d]?.filter(x => !x.isCornerAdj) || []).length
      const appeared = (hits?.[d]?.length || 0)
      return `${d}_steps=${steps} ${d}_hit=${appeared}`
    }).join(' | ')
    return `DBG: laserHits=yes | sel=ci=${ci} row=${row} D${drawNum} | ctTotal=${ctTotal} | ${dirs}`
  }, [selectedCell, laserHits, draws, allDraws])

  const followsData = useMemo(() => {
    if (!selectedNumber) return []
    const count = {}
    for (let n = 1; n <= MAXN; n++) count[n] = 0
    for (let i = 0; i < allDraws.length - 1; i++) {
      if (allDraws[i].includes(selectedNumber)) allDraws[i + 1].forEach(n => count[n]++)
    }
    const appearances = allDraws.filter(d => d.includes(selectedNumber)).length
    return Object.entries(count)
      .filter(([n]) => +n !== selectedNumber)
      .map(([n, c]) => ({ n: +n, c, pct: appearances ? (c / appearances * 100).toFixed(0) : 0 }))
      .sort((a, b) => b.c - a.c).slice(0, 12)
  }, [selectedNumber, allDraws])

  const precededBy = useMemo(() => {
    if (!selectedNumber) return []
    const count = {}
    for (let n = 1; n <= MAXN; n++) count[n] = 0
    for (let i = 1; i < allDraws.length; i++) {
      if (allDraws[i].includes(selectedNumber)) allDraws[i - 1].forEach(n => count[n]++)
    }
    const appearances = allDraws.filter(d => d.includes(selectedNumber)).length
    return Object.entries(count)
      .filter(([n]) => +n !== selectedNumber)
      .map(([n, c]) => ({ n: +n, c, pct: appearances ? (c / appearances * 100).toFixed(0) : 0 }))
      .sort((a, b) => b.c - a.c).slice(0, 12)
  }, [selectedNumber, allDraws])

  const handleCellClick = useCallback((colIdx, rowNum) => {
    setSelectedCell({ colIdx, rowNum })
    setSelectedNumber(rowNum)
    setPanelOpen(true)
  }, [])

  const handleRowClick  = useCallback((n) => {
    setSelectedNumber(prev => prev === n ? null : n)
    setSelectedCell(null)
    setPanelOpen(true)
  }, [])

  const handleDirToggle = useCallback((dir) => setActiveDir(prev => ({ ...prev, [dir]: !prev[dir] })), [])
  const handleClose     = useCallback(() => { setSelectedNumber(null); setSelectedCell(null); setPanelOpen(false) }, [])

  if (loading) return <div className="hg-loading"><div className="hg-spinner"/>Loading hot grid...</div>

  const lastDraw = allDraws[allDraws.length - 1] || []

  return (
    <div className="hg-page">
      <div className="hg-header">
        <div>
          <h1 className="hg-title">Hot Number Grid</h1>
          <p className="hg-sub">
            {draws.length} draws shown / {allDraws.length} total | sorted hot to cold
            {lastDraw.length > 0 && <span className="hg-latest-label"> | Latest: <strong>{lastDraw.join(', ')}</strong></span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="hg-dir-toggles">
            {['NE','NW','SE','SW'].map(dir => (
              <button
                key={dir}
                className={`hg-dir-btn hg-dir-btn-${dir.toLowerCase()} ${activeDir[dir] ? 'active' : ''}`}
                onClick={() => handleDirToggle(dir)}
              >{dir}</button>
            ))}
          </div>
          <div className="hg-window-btns">
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt}
                className={`hg-wbtn ${window_ === opt ? 'active' : ''}`}
                onClick={() => { setWindow(opt); setSelectedCell(null) }}
              >{opt}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Debug bar ── */}
      <div className="hg-debug-bar">
        {debugInfo
          ? debugInfo.split(' | ').map((seg, i) => (
              <span key={i} className={`hg-dbg-seg ${seg.startsWith('DBG') ? 'hg-dbg-label' : seg.includes('hit=0') ? 'hg-dbg-zero' : seg.includes('hit=') ? 'hg-dbg-hit' : ''}`}>
                {seg}
              </span>
            ))
          : <span className="hg-dbg-idle">click any gold cell to fire laser</span>
        }
      </div>

      <div className="hg-body">

        <div className="hg-grid-area">

          {/* LEFT: fixed row labels */}
          <div className="hg-labels-col" style={{ width: LABEL_W }}>
            <div className="hg-label-header">
              <span className="hg-lh-rank">#</span>
              <span className="hg-lh-num">N</span>
              <span className="hg-lh-bar">Freq</span>
              <span className="hg-lh-cnt">Cnt</span>
              <span className="hg-lh-gap">Gap</span>
            </div>
            {sortedNums.map((n, rank) => {
              const count  = freq[n]
              const gap    = gapMap[n] || 0
              const isSelN = selectedNumber === n
              const isLast = lastDrawSet.has(n)
              return (
                <div
                  key={n}
                  className={`hg-label-row ${isSelN ? 'hg-label-sel' : ''} ${isLast ? 'hg-label-latest' : ''}`}
                  style={{ height: CELL_H, background: isSelN ? '#1a1a40' : gapColor(n) }}
                  onClick={() => handleRowClick(n)}
                >
                  <span className="hg-rank">#{rank + 1}</span>
                  <span className="hg-num">{n}</span>
                  <div className="hg-freq-bar-wrap">
                    <div className="hg-freq-bar" style={{ width: `${(count / maxFreq) * 100}%` }}/>
                  </div>
                  <span className={`hg-cnt-badge ${count >= maxFreq * 0.7 ? 'hot' : count >= maxFreq * 0.4 ? 'warm' : 'cold'}`}>{count}x</span>
                  <span className={`hg-gap-badge ${gap <= 3 ? 'fresh' : gap <= 10 ? 'normal' : gap <= 18 ? 'warm' : 'due'}`}>{gap}</span>
                </div>
              )
            })}
          </div>

          {/* RIGHT: scrollable columns */}
          <div className="hg-cols-scroll" ref={scrollRef}>

            {/* Column headers */}
            <div className="hg-col-headers" style={{ width: gridW }}>
              {draws.map((_, ci) => {
                const drawNum  = allDraws.length - draws.length + ci + 1
                const isLatest = ci === draws.length - 1
                return (
                  <div
                    key={ci}
                    className={`hg-col-hdr ${isLatest ? 'hg-col-latest' : ''}`}
                    style={{ width: CELL_W }}
                  >
                    {isLatest ? `D${drawNum}` : (draws.length - ci) % 10 === 0 ? drawNum : ''}
                  </div>
                )
              })}
            </div>

            {/* Cell grid with LaserLayer overlay */}
            <div style={{ position: 'relative', width: gridW, height: gridH }}>
              {sortedNums.map((n, rowIdx) => {
                const isSelN = selectedNumber === n
                return (
                  <div
                    key={n}
                    style={{
                      position: 'absolute',
                      top: rowIdx * CELL_H,
                      left: 0,
                      width: gridW,
                      height: CELL_H,
                      display: 'flex',
                      background: isSelN ? '#1a1a40' : gapColor(n),
                    }}
                  >
                    {draws.map((_, ci) => {
                      const appeared    = drawSets[ci].has(n)
                      const isLatestCol = ci === draws.length - 1
                      const isCellSel   = selectedCell?.rowNum === n && selectedCell?.colIdx === ci
                      const isNumHigh   = isSelN && appeared
                      return (
                        <div
                          key={ci}
                          className={[
                            'hg-cell',
                            appeared    ? 'hg-cell-on'    : 'hg-cell-off',
                            isLatestCol ? 'hg-cell-lat'   : '',
                            isCellSel   ? 'hg-cell-sel'   : '',
                            isNumHigh   ? 'hg-cell-nhigh' : '',
                          ].join(' ')}
                          style={{ width: CELL_W, height: CELL_H, flexShrink: 0 }}
                          onClick={() => appeared && handleCellClick(ci, n)}
                          title={appeared ? `D${allDraws.length - draws.length + ci + 1}: ${draws[ci].join(',')}` : ''}
                        >
                          {appeared && <span className="hg-cell-num">{n}</span>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Laser SVG overlay — same as Matrix page */}
              {selectedCell != null && (
                <LaserLayer
                  selectedCell={selectedCell}
                  activeDir={activeDir}
                  drawSets={drawSets}
                  cellW={CELL_W}
                  cellH={CELL_H}
                  gridW={gridW}
                  gridH={gridH}
                  numbers={sortedNums}
                  numCols={draws.length}
                />
              )}
            </div>
          </div>
        </div>

        {/* Side panel */}
        {panelOpen && selectedNumber && (
          <div className="hg-side">
            <div className="hg-analysis-card">
              <div className="hg-analysis-header">
                <span className="hg-analysis-title">
                  Analysis <span className="hg-num-badge">{selectedNumber}</span>
                </span>
                <button className="hg-close-btn" onClick={handleClose}>x</button>
              </div>

              <div className="hg-stats-row">
                <div className="hg-stat"><strong>{freq[selectedNumber]}</strong><span>last {draws.length}</span></div>
                <div className="hg-stat"><strong>{allDraws.filter(d => d.includes(selectedNumber)).length}</strong><span>all-time</span></div>
                <div className="hg-stat"><strong>{gapMap[selectedNumber] || 0}</strong><span>draws ago</span></div>
                <div className="hg-stat"><strong>{((allDraws.filter(d => d.includes(selectedNumber)).length / (allDraws.length || 1)) * 100).toFixed(1)}%</strong><span>hit rate</span></div>
              </div>

              {laserHits && selectedCell && (
                <div className="hg-laser-strip">
                  <div className="hg-laser-title">
                    ⚡ Laser · D{allDraws.length - draws.length + selectedCell.colIdx + 1} · row {selectedCell.rowNum}
                  </div>
                  {['NE','NW','SE','SW'].map(dir => {
                    if (!activeDir[dir]) return null
                    const ct       = laserHits.cornerTouch?.[dir] || []
                    const onPath   = ct.filter(x => x.appeared && !x.isCornerAdj)
                    const cornered = ct.filter(x => x.appeared &&  x.isCornerAdj)
                    const totalSteps = ct.filter(x => !x.isCornerAdj).length
                    return (
                      <div key={dir} className="hg-beam-block">
                        <div className={`hg-beam-heading hg-dir-${dir.toLowerCase()}`}>
                          {dir} beam &nbsp;<span className="hg-beam-meta">({totalSteps} steps · {onPath.length} on-path · {cornered.length} corner)</span>
                        </div>

                        {onPath.length > 0 && (
                          <>
                            <div className="hg-beam-section-label">On path:</div>
                            {onPath.map((h, i) => (
                              <div key={i} className="hg-beam-row hg-beam-onpath">
                                <span className="hg-beam-step">step {h.step}</span>
                                <span className="hg-beam-num">{h.number}</span>
                                <span className="hg-beam-draw">D{allDraws.length - draws.length + h.colIdx + 1}</span>
                              </div>
                            ))}
                          </>
                        )}

                        {cornered.length > 0 && (
                          <>
                            <div className="hg-beam-section-label">Corner-grazed:</div>
                            {cornered.map((h, i) => (
                              <div key={i} className="hg-beam-row hg-beam-corner">
                                <span className="hg-beam-step">step {h.step}</span>
                                <span className="hg-beam-num">{h.number}</span>
                                <span className="hg-beam-draw">D{allDraws.length - draws.length + h.colIdx + 1}</span>
                                <span className="hg-beam-tag">corner</span>
                              </div>
                            ))}
                          </>
                        )}

                        {onPath.length === 0 && cornered.length === 0 && (
                          <div className="hg-beam-row hg-no-hit">— no hits</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <FollowBlock title="Co-appears with (same draw)" color="#4fa3ff"
                data={coOccur ? Object.entries(coOccur[selectedNumber] || {}).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,c])=>({n:+n,c,pct:c*5})) : []}
                onClickNum={handleRowClick} />

              <FollowBlock title={`After ${selectedNumber}, next draw has...`} color="#f5a623"
                data={followsData} onClickNum={handleRowClick} />

              <FollowBlock title={`Before ${selectedNumber} appeared...`} color="#9b59b6"
                data={precededBy} onClickNum={handleRowClick} />

              <FollowBlock title="Transition D to D+1" color="#2ecc71"
                data={transMatrix ? Object.entries(transMatrix[selectedNumber] || {}).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,c])=>({n:+n,c,pct:c*8})) : []}
                onClickNum={handleRowClick} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom heatmap */}
      <div className="hg-freq-summary">
        <div className="hg-freq-summary-title">Frequency Heatmap (last {draws.length} draws)</div>
        <div className="hg-num-bubbles">
          {sortedNums.map(n => {
            const f    = freq[n]
            const heat = f / maxFreq
            const bg   = heat > 0.75 ? '#c0392b' : heat > 0.5 ? '#e67e22' : heat > 0.25 ? '#2980b9' : heat > 0 ? '#27ae60' : '#1a1a2e'
            return (
              <div
                key={n}
                className={`hg-bubble ${lastDrawSet.has(n) ? 'hg-bubble-latest' : ''} ${selectedNumber === n ? 'hg-bubble-sel' : ''}`}
                style={{ background: bg }}
                onClick={() => handleRowClick(n)}
                title={`${n}: ${f}x in window, gap=${gapMap[n]||0}`}
              >
                <span className="hg-bubble-n">{n}</span>
                <span className="hg-bubble-f">{f}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FollowBlock({ title, color, data, onClickNum }) {
  if (!data.length) return null
  return (
    <div className="hg-follows-block">
      <div className="hg-follows-title">{title}</div>
      <div className="hg-follows-list">
        {data.map(({ n, c, pct }) => (
          <div key={n} className="hg-follow-item" onClick={() => onClickNum(n)}>
            <span className="hg-follow-num">{n}</span>
            <div className="hg-follow-bar-wrap">
              <div className="hg-follow-bar" style={{ width: `${Math.min(+pct, 100)}%`, background: color }}/>
            </div>
            <span className="hg-follow-cnt">{c}x</span>
          </div>
        ))}
      </div>
    </div>
  )
}
