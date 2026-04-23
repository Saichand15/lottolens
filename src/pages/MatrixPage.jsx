import { useState, useEffect, useMemo, useCallback } from 'react'
import Grid from '../components/Grid'
import CompassControl from '../components/CompassControl'
import FriendshipPanel from '../components/FriendshipPanel'
import NextDrawPanel from '../components/NextDrawPanel'
import {
  buildTransitionMatrix,
  buildCoOccurrence,
  buildGapMap,
  gapToRowColor
} from '../utils/dataUtils'
import { computeLaserHits } from '../utils/predictionEngine'
import { fetchAllDraws } from '../lib/supabase'
import './MatrixPage.css'

const COUNT_OPTIONS = [60, 100, 200, 'ALL']

export default function MatrixPage() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [displayCount, setDisplayCount] = useState(100)
  const [selectedCell, setSelectedCell] = useState(null)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [activeDir, setActiveDir] = useState({ NE: true, NW: true, SE: true, SW: true })
  const [panelOpen, setPanelOpen] = useState(false)

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
            const sorted = data.map(d => [...d].sort((a, b) => a - b))
            setDraws(sorted)
            setLoading(false)
          })
          .catch(() => setLoading(false))
      })
  }, [])

  const transMatrix = useMemo(() => draws.length ? buildTransitionMatrix(draws) : null, [draws])
  const coOccur     = useMemo(() => draws.length ? buildCoOccurrence(draws) : null, [draws])
  const gapMap      = useMemo(() => draws.length ? buildGapMap(draws) : null, [draws])
  const rowColors   = useMemo(() => {
    if (!gapMap) return {}
    const c = {}
    for (let n = 1; n <= 45; n++) c[n] = gapToRowColor(gapMap[n])
    return c
  }, [gapMap])

  const displayDraws = useMemo(
    () => displayCount === 'ALL' ? draws : draws.slice(-displayCount),
    [draws, displayCount]
  )
  const lastDraw = draws[draws.length - 1]

  const laserHits = useMemo(() => {
    if (!selectedCell) return null
    return computeLaserHits(displayDraws, selectedCell.colIdx, selectedCell.rowNum)
  }, [selectedCell, displayDraws])

  const handleCellClick   = useCallback((colIdx, rowNum) => { setSelectedCell({ colIdx, rowNum }); setSelectedNumber(rowNum); setPanelOpen(true) }, [])
  const handleNumberClick = useCallback((n) => { setSelectedNumber(prev => prev === n ? null : n); setSelectedCell(prev => prev?.rowNum === n ? prev : null); setPanelOpen(true) }, [])
  const handleDirToggle   = useCallback((dir) => setActiveDir(prev => ({ ...prev, [dir]: !prev[dir] })), [])
  const handleClose       = useCallback(() => { setPanelOpen(false); setSelectedCell(null); setSelectedNumber(null) }, [])

  if (loading) return <div className="loading-screen"><div className="loading-spinner"/><p className="loading-text">Loading matrix</p></div>

  return (
    <div className="matrix-page">
      <div className="matrix-info-bar">
        {lastDraw && (
          <div className="hdr-last">
            <span className="hdr-last-label">LATEST</span>
            {lastDraw.map(n => <span key={n} className="hdr-ball">{n}</span>)}
            <span className="hdr-sum">Σ {lastDraw.reduce((a,b)=>a+b,0)}</span>
          </div>
        )}
        <div className="hdr-stat-row">
          <div className="hdr-count-btns">
            {COUNT_OPTIONS.map(opt => (
              <button
                key={opt}
                className={`hdr-count-btn ${displayCount === opt ? 'active' : ''}`}
                onClick={() => { setDisplayCount(opt); setSelectedCell(null) }}
              >
                {opt}
              </button>
            ))}
          </div>
          <span className="hdr-stat-item">{displayDraws.length} shown / {draws.length} total</span>
        </div>
      </div>

      <div className="matrix-body">
        <div className="grid-section">
          <CompassControl activeDir={activeDir} onToggle={handleDirToggle} selectedCell={selectedCell} selectedNumber={selectedNumber} />
          <div className="grid-container">
            <Grid
              draws={displayDraws}
              allDraws={draws}
              selectedCell={selectedCell}
              selectedNumber={selectedNumber}
              activeDir={activeDir}
              onCellClick={handleCellClick}
              onNumberClick={handleNumberClick}
              rowColors={rowColors}
            />
          </div>
        </div>

        <div className="side-panels">
          <NextDrawPanel
            draws={draws}
            transMatrix={transMatrix}
            coOccur={coOccur}
            gapMap={gapMap}
          />

          {panelOpen && selectedNumber != null && (
            <FriendshipPanel
              selectedNumber={selectedNumber}
              selectedCell={selectedCell}
              draws={draws}
              displayDraws={displayDraws}
              transMatrix={transMatrix}
              coOccur={coOccur}
              laserHits={laserHits}
              onClose={handleClose}
            />
          )}
        </div>
      </div>

      <footer className="matrix-footer">
        <div className="legend-item"><span className="legend-dot" style={{ background: '#f5c842' }}/> Number appeared</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: 'rgb(12,10,140)' }}/> Recently drawn</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: 'rgb(122,10,10)' }}/> Long gap overdue</div>
        <div className="legend-item" style={{ color: '#00d4ff' }}> NE/NW</div>
        <div className="legend-item" style={{ color: '#ff7a2f' }}> SE/SW</div>
      </footer>
    </div>
  )
}