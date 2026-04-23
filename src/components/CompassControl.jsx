const DIAG_INFO = {
  NW: { label: '↖', sub: 'NW', desc: 'Top-left diagonal', color: '#ff00ff' },
  NE: { label: '↗', sub: 'NE', desc: 'Top-right diagonal', color: '#00ffff' },
  SW: { label: '↙', sub: 'SW', desc: 'Bottom-left diagonal', color: '#00ff88' },
  SE: { label: '↘', sub: 'SE', desc: 'Bottom-right diagonal', color: '#ff6600' },
}

export default function CompassControl({ activeDir, onToggle, selectedCell, selectedNumber }) {
  return (
    <div className="compass-bar">
      <div className="compass-title">
        <div className="compass-title-main">⬡ DIAGONAL LASER</div>
        {selectedCell && (
          <span className="compass-target">
            #{selectedCell.rowNum} · D{selectedCell.colIdx + 1}
          </span>
        )}
      </div>

      {/* 2×2 diagonal compass pad */}
      <div className="compass-pad-diag">
        {['NW','NE','SW','SE'].map(dir => {
          const info = DIAG_INFO[dir]
          const on = activeDir[dir]
          return (
            <button
              key={dir}
              className={`cp-btn cp-diag ${on ? 'cp-active' : ''}`}
              onClick={() => onToggle(dir)}
              title={info.desc}
              style={on ? { borderColor: info.color, color: info.color, boxShadow: `0 0 10px ${info.color}55` } : {}}
            >
              <span style={{ fontSize: 18 }}>{info.label}</span>
              <small>{info.sub}</small>
            </button>
          )
        })}
        {/* Center crosshair */}
        <div className="cp-center-diag">⬡</div>
      </div>

      <div className="compass-legend">
        {Object.entries(DIAG_INFO).map(([dir, info]) => (
          <div key={dir} className="legend-row">
            <span style={{ color: info.color }}>◆</span>
            <span style={{ color: activeDir[dir] ? info.color : '#445', minWidth: 24 }}>{dir}</span>
            <span className="legend-desc">{info.desc}</span>
          </div>
        ))}
      </div>

      {selectedNumber && (
        <div className="compass-hint">
          <span style={{ color: '#ffd700' }}>#{selectedNumber}</span> highlighted — click row label to toggle
        </div>
      )}
    </div>
  )
}
