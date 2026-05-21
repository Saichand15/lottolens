import { useMemo, useState } from 'react'

// Score weights
const W_TRANS  = 0.50   // transition rate from last draw seeds
const W_FREQ   = 0.20   // historical appearance frequency
const W_LASER  = 0.20   // how many laser beams from last draw hit this number
const W_GAP    = 0.10   // gap bonus (overdue numbers)

export default function NextDrawPanel({ draws, transMatrix, coOccur, gapMap, onClose, maxNumber = 45 }) {
  const [show, setShow] = useState(true)

  const prediction = useMemo(() => {
    if (!draws?.length || !transMatrix || !coOccur) return null
    const lastDraw  = draws[draws.length - 1]  // e.g. D333 numbers
    const nextDrawN = draws.length + 1          // D334

    const totalDraws = draws.length
    // Appearance freq 0-100
    const appFreq = {}
    for (let n = 1; n <= maxNumber; n++)
      appFreq[n] = +((coOccur.appearances?.[n] || 0) / totalDraws * 100).toFixed(1)

    // Gap score: draws since last seen (capped at 50)
    const gapScore = {}
    for (let n = 1; n <= maxNumber; n++)
      gapScore[n] = Math.min((gapMap?.[n] || 0), 50)
    const maxGap = Math.max(...Object.values(gapScore), 1)

    // Transition scores from each seed in last draw
    const transScores = {}
    for (let n = 1; n <= maxNumber; n++) transScores[n] = 0
    lastDraw.forEach(seed => {
      const rates = transMatrix?.rates?.[seed] || {}
      Object.entries(rates).forEach(([to, rate]) => {
        transScores[+to] = (transScores[+to] || 0) + rate
      })
    })
    const maxTrans = Math.max(...Object.values(transScores), 1)

    // Laser beam hits: fire NE (+1col -1row) and SE (+1col +1row) from ALL last draw seeds
    // Step 1 = direct D334 diagonal neighbor
    const laserHits = {}
    for (let n = 1; n <= maxNumber; n++) laserHits[n] = { count: 0, dirs: [] }
    lastDraw.forEach(seed => {
      const rowIdx = seed - 1
      // NE: row-1
      const neRow = rowIdx - 1
      if (neRow >= 0) { laserHits[neRow + 1].count++; laserHits[neRow + 1].dirs.push('NE') }
      // SE: row+1
      const seRow = rowIdx + 1
      if (seRow < maxNumber) { laserHits[seRow + 1].count++; laserHits[seRow + 1].dirs.push('SE') }
      // Also step 2,3 with diminishing weight
      for (let step = 2; step <= 5; step++) {
        const w = 0.5 / step
        const nr = rowIdx - step; if (nr >= 0) laserHits[nr + 1].count += w
        const sr = rowIdx + step; if (sr < maxNumber) laserHits[sr + 1].count += w
      }
    })
    const maxLaser = Math.max(...Object.values(laserHits).map(l => l.count), 1)
    const maxNumber_ = maxNumber

    // Final score per number
    const scores = []
    for (let n = 1; n <= maxNumber_; n++) {
      if (lastDraw.includes(n)) continue  // skip seeds themselves
      const tScore  = (transScores[n] / maxTrans) * 100
      const fScore  = appFreq[n]
      const lScore  = (laserHits[n].count / maxLaser) * 100
      const gScore  = (gapScore[n] / maxGap) * 100
      const final   = +(W_TRANS * tScore + W_FREQ * fScore + W_LASER * lScore + W_GAP * gScore).toFixed(1)
      scores.push({
        number: n,
        score: final,
        transScore: +tScore.toFixed(1),
        freq: appFreq[n],
        laserCount: +laserHits[n].count.toFixed(1),
        laserDirs: [...new Set(laserHits[n].dirs)],
        gap: gapMap?.[n] || 0
      })
    }
    scores.sort((a, b) => b.score - a.score)

    // Tier classification
    const top = scores.slice(0, 15)
    const maxScore = top[0]?.score || 1
    top.forEach(s => {
      if (s.score >= maxScore * 0.85) s.tier = 'hot'
      else if (s.score >= maxScore * 0.65) s.tier = 'warm'
      else s.tier = 'cold'
    })

    return { top, nextDrawN, lastDraw, maxScore }
  }, [draws, transMatrix, coOccur, gapMap])

  if (!prediction) return null
  if (!show) return (
    <div className="ndp-collapsed" onClick={() => setShow(true)}>
       D{prediction.nextDrawN} Prediction  click to expand
    </div>
  )

  const { top, nextDrawN, lastDraw } = prediction

  return (
    <div className="ndp">
      <div className="ndp-head">
        <span className="ndp-title"> D{nextDrawN} Laser Prediction</span>
        <span className="ndp-sub">Seeds: {lastDraw.map(n => `#${n}`).join(' ')}</span>
        <button className="ndp-close" onClick={() => setShow(false)}></button>
      </div>

      <div className="ndp-explain">
        Firing NE+SE lasers from all D{nextDrawN - 1} numbers, combined with transition rates &amp; gap analysis.
      </div>

      <div className="ndp-tiers">
        {['hot','warm','cold'].map(tier => {
          const items = top.filter(s => s.tier === tier)
          if (!items.length) return null
          const label = tier === 'hot' ? ' Strong' : tier === 'warm' ? ' Likely' : ' Possible'
          return (
            <div key={tier} className={`ndp-tier ndp-tier-${tier}`}>
              <div className="ndp-tier-label">{label}</div>
              <div className="ndp-balls">
                {items.map(s => (
                  <div key={s.number} className={`ndp-ball ndp-ball-${tier}`} title={`Score: ${s.score} | Trans: ${s.transScore} | Freq: ${s.freq}% | Laser: ${s.laserCount} | Gap: ${s.gap}`}>
                    <span className="ndp-n">{s.number}</span>
                    <span className="ndp-sc">{s.score}</span>
                    {s.laserDirs.length > 0 && <span className="ndp-beam">{s.laserDirs.join('')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="ndp-top5">
        <div className="ndp-top5-title">Top 5 picks</div>
        {top.slice(0, 5).map((s, i) => (
          <div key={s.number} className="ndp-row">
            <span className="ndp-rank">#{i + 1}</span>
            <span className={`ndp-row-num ndp-ball-${s.tier}`}>{s.number}</span>
            <div className="ndp-bar-bg">
              <div className="ndp-bar" style={{ width: `${s.score}%`, background: s.tier === 'hot' ? '#ef4444' : s.tier === 'warm' ? '#f59e0b' : '#4f46e5' }} />
            </div>
            <span className="ndp-row-score">{s.score}</span>
            <div className="ndp-row-tags">
              {s.laserDirs.length > 0 && <span className="ndp-tag-beam">Laser</span>}
              {s.gap > 15 && <span className="ndp-tag-gap">gap:{s.gap}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}