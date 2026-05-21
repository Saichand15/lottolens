import { useRef, useMemo, useCallback, useEffect, memo } from 'react'
import LaserLayer from './LaserLayer'

export const CELL_W = 22
export const CELL_H = 20
export const LABEL_W = 34
export const HEADER_H = 26

// ─── Single cell ─────────────────────────────────────────────────────────────
const GridCell = memo(function GridCell({
  appeared, rowBg, isLatest, isSelected, isNumHighlight, onClick, number
}) {
  let bg = rowBg
  if (appeared && isNumHighlight) bg = '#ffe066'
  else if (appeared) bg = '#FFD700'
  else if (isLatest) bg = 'rgba(255,215,0,0.07)'

  return (
    <div
      className={[
        'gc',
        appeared ? 'gc-app' : '',
        isSelected ? 'gc-sel' : '',
        isNumHighlight && appeared ? 'gc-nhigh' : '',
        isLatest ? 'gc-latest' : ''
      ].join(' ')}
      style={{ background: bg }}
      onClick={onClick}
    >
      {appeared && <span className="gc-lbl">{number}</span>}
    </div>
  )
})

// ─── Grid ────────────────────────────────────────────────────────────────────
export default function Grid({
  draws,          // display slice (last N draws)
  allDraws,       // all draws for offset
  selectedCell,   // { colIdx, rowNum } — specific cell click
  selectedNumber, // number whose entire row is highlighted
  activeDir,
  onCellClick,
  onNumberClick,
  rowColors,      // { [n]: cssColor } gap-based
  maxNumber = 45  // 45 for lotto, 69 for powerball
}) {
  const NUMBERS = Array.from({ length: maxNumber }, (_, i) => i + 1)
  const scrollRef = useRef(null)
  const offset = (allDraws?.length || 0) - draws.length

  // Auto-scroll to rightmost (latest draw) on load
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [draws.length])

  // Build Set per column for O(1) lookup
  const drawSets = useMemo(() => draws.map(d => new Set(d)), [draws])

  const handleCellClick = useCallback((ci, n) => onCellClick(ci, n), [onCellClick])

  const gridW = draws.length * CELL_W
  const gridH = NUMBERS.length * CELL_H

  return (
    <div className="grid-wrap">
      {/* ── Row labels (fixed left) ── */}
      <div className="grid-labels" style={{ width: LABEL_W }}>
        <div className="lbl-header" style={{ height: HEADER_H }}>
          <span>N</span>
        </div>
        {NUMBERS.map(n => (
          <div
            key={n}
            className={`row-lbl ${selectedNumber === n ? 'row-lbl-active' : ''}`}
            style={{
              height: CELL_H,
              background: selectedNumber === n ? '#1a1a40' : (rowColors?.[n] || '#111128')
            }}
            onClick={() => onNumberClick(n)}
            title={`Click to highlight all draws with #${n}`}
          >
            {n}
          </div>
        ))}
      </div>

      {/* ── Scrollable columns ── */}
      <div className="grid-scroll" ref={scrollRef}>
        {/* Column headers */}
        <div className="col-headers" style={{ width: gridW, height: HEADER_H }}>
          {draws.map((_, ci) => {
            const drawNum = offset + ci + 1
            const isLatest = ci === draws.length - 1
            return (
              <div
                key={ci}
                className={`col-hdr ${isLatest ? 'col-hdr-latest' : ''}`}
                style={{ width: CELL_W }}
              >
                {isLatest ? `D${drawNum}` : drawNum % 10 === 0 ? drawNum : ''}
              </div>
            )
          })}
        </div>

        {/* Cell grid + laser overlay */}
        <div className="grid-cells" style={{ position: 'relative', width: gridW, height: gridH }}>
          {NUMBERS.map((n, rowIdx) => (
            <div key={n} className="grid-row" style={{ top: rowIdx * CELL_H, width: gridW }}>
              {draws.map((_, ci) => {
                const appeared = drawSets[ci].has(n)
                const isLatest = ci === draws.length - 1
                const isSelected = selectedCell?.colIdx === ci && selectedCell?.rowNum === n
                const isNumHigh = selectedNumber === n && appeared
                return (
                  <GridCell
                    key={ci}
                    appeared={appeared}
                    rowBg={rowColors?.[n] || '#111128'}
                    isLatest={isLatest}
                    isSelected={isSelected}
                    isNumHighlight={isNumHigh}
                    onClick={() => handleCellClick(ci, n)}
                    number={n}
                  />
                )
              })}
            </div>
          ))}

          {/* Laser SVG overlay */}
          {selectedCell != null && (
            <LaserLayer
              selectedCell={selectedCell}
              activeDir={activeDir}
              drawSets={drawSets}
              cellW={CELL_W}
              cellH={CELL_H}
              gridW={gridW}
              gridH={gridH}
              numbers={NUMBERS}
              numCols={draws.length}
            />
          )}
        </div>
      </div>
    </div>
  )
}
