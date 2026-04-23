import { useMemo } from 'react'

// Diagonal directions: corner-to-corner
const DIAG_DIRS = {
  NE: { dc: +1, dr: -1, color: '#00ffff', label: '↗', corner: 'top-right' },
  NW: { dc: -1, dr: -1, color: '#ff00ff', label: '↖', corner: 'top-left' },
  SE: { dc: +1, dr: +1, color: '#ff6600', label: '↘', corner: 'bottom-right' },
  SW: { dc: -1, dr: +1, color: '#00ff88', label: '↙', corner: 'bottom-left' },
}

// Get the corner coordinate of a cell for a given diagonal direction
function cornerXY(ci, ri, dir, cellW, cellH) {
  const { dc, dr } = DIAG_DIRS[dir]
  const x = ci * cellW + (dc > 0 ? cellW : 0)
  const y = ri * cellH + (dr > 0 ? cellH : 0)
  return { x, y }
}

export default function LaserLayer({
  selectedCell, activeDir, drawSets,
  cellW, cellH, gridW, gridH, numbers, numCols
}) {
  const { colIdx, rowNum } = selectedCell
  const rowIdx = numbers.indexOf(rowNum)
  if (rowIdx === -1 || colIdx == null) return null

  // ── Walk diagonally and collect ALL cells along the path ─────────────────
  // hits[dir] = array of { ci, ri, appeared } for every cell on the diagonal
  const { allSteps, firstHits } = useMemo(() => {
    const allSteps = { NE: [], NW: [], SE: [], SW: [] }
    const firstHits = { NE: null, NW: null, SE: null, SW: null }

    Object.entries(DIAG_DIRS).forEach(([dir, { dc, dr }]) => {
      let ci = colIdx + dc
      let ri = rowIdx + dr
      while (ci >= 0 && ci < numCols && ri >= 0 && ri < numbers.length) {
        const n = numbers[ri]
        const appeared = drawSets[ci]?.has(n) || false
        allSteps[dir].push({ ci, ri, n, appeared })
        if (appeared && !firstHits[dir]) firstHits[dir] = { ci, ri, n }
        ci += dc
        ri += dr
      }
    })
    return { allSteps, firstHits }
  }, [colIdx, rowIdx, drawSets, numbers, numCols])

  // ── Build SVG ──────────────────────────────────────────────────────────────
  const lines = []
  const rings = []
  const labels = []

  Object.entries(DIAG_DIRS).forEach(([dir, { dc, dr, color }]) => {
    if (!activeDir[dir]) return
    const steps = allSteps[dir]
    if (steps.length === 0) return

    // Start corner of selected cell
    const start = cornerXY(colIdx, rowIdx, dir, cellW, cellH)

    // Draw laser line to each step's entering corner
    // Use the LAST step for the full-length beam endpoint
    const last = steps[steps.length - 1]
    const end = cornerXY(last.ci, last.ri, dir, cellW, cellH)

    lines.push(
      <line key={`beam-${dir}`}
        x1={start.x} y1={start.y}
        x2={end.x} y2={end.y}
        stroke={color} strokeWidth="2" opacity="0.75"
        className="laser-beam"
      />
    )

    // Mark every cell along path — dim touch on pass-through, bright ring on appeared
    steps.forEach(({ ci, ri, n, appeared }, idx) => {
      const corner = cornerXY(ci, ri, dir, cellW, cellH)
      const cx2 = ci * cellW + cellW / 2
      const cy2 = ri * cellH + cellH / 2
      const isFirst = firstHits[dir]?.ci === ci && firstHits[dir]?.ri === ri

      if (!appeared) {
        // Dim edge-touch indicator on every pass-through cell
        rings.push(
          <g key={`touch-${dir}-${idx}`}>
            <circle cx={corner.x} cy={corner.y} r={2}
              fill="none" stroke={color}
              strokeWidth="1" opacity="0.25"
            />
            <circle cx={corner.x} cy={corner.y} r={0.8}
              fill={color} opacity="0.2"
            />
          </g>
        )
        return
      }

      rings.push(
        <g key={`hit-${dir}-${idx}`}>
          {/* Bright edge-touch ring at the corner where beam grazes the cell */}
          <circle cx={corner.x} cy={corner.y} r={isFirst ? 6 : 4}
            fill="none" stroke={color}
            strokeWidth={isFirst ? 2.5 : 1.5} opacity="1"
          />
          <circle cx={corner.x} cy={corner.y} r={isFirst ? 2.5 : 1.5}
            fill={color} opacity="1"
          />
          {/* Short accent line from edge-touch to cell center */}
          <line
            x1={corner.x} y1={corner.y}
            x2={cx2} y2={cy2}
            stroke={color} strokeWidth="1" opacity="0.4" strokeDasharray="2 2"
          />
          {/* Glow ring at cell center */}
          <circle cx={cx2} cy={cy2} r={isFirst ? 9 : 6}
            fill="none" stroke={color}
            strokeWidth={isFirst ? 2 : 1} opacity={isFirst ? 0.9 : 0.5}
          />
        </g>
      )

      // Label: show number and draw index
      if (isFirst) {
        const lx = cx2 + (dc > 0 ? 11 : -11)
        const ly = cy2 + (dr > 0 ? -4 : 12)
        labels.push(
          <text key={`lbl-${dir}-${idx}`}
            x={lx} y={ly}
            fill={color} fontSize="9" opacity="0.95"
            textAnchor={dc > 0 ? 'start' : 'end'}
            style={{ fontWeight: 'bold' }}
          >
            #{n} D{ci + 1}
          </text>
        )
      }
    })
  })

  const selX = colIdx * cellW
  const selY = rowIdx * cellH
  const cx = selX + cellW / 2
  const cy = selY + cellH / 2

  return (
    <svg
      className="laser-svg"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: gridW, height: gridH,
        pointerEvents: 'none', zIndex: 10, overflow: 'visible'
      }}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-strong" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Corner dots on selected cell — the 4 junction points */}
      {Object.entries(DIAG_DIRS).map(([dir, { color }]) => {
        const { x, y } = cornerXY(colIdx, rowIdx, dir, cellW, cellH)
        return (
          <circle key={`cp-${dir}`}
            cx={x} cy={y} r={3.5}
            fill={activeDir[dir] ? color : '#333'}
            opacity={activeDir[dir] ? 1 : 0.3}
            filter={activeDir[dir] ? 'url(#glow)' : undefined}
          />
        )
      })}

      <g filter="url(#glow)">{lines}</g>
      <g filter="url(#glow-strong)">{rings}</g>
      {labels}

      {/* Selected cell border */}
      <rect
        x={selX + 1} y={selY + 1}
        width={cellW - 2} height={cellH - 2}
        fill="none" stroke="#ffffff" strokeWidth="1.5"
        className="sel-cell-ring"
        filter="url(#glow-strong)"
      />
      <circle cx={cx} cy={cy} r={2.5} fill="#fff" opacity="0.9" />
    </svg>
  )
}
