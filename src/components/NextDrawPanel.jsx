import { useMemo, useState } from 'react'
import { computeHybridPrediction } from '../utils/hybridPrediction'

// Score weights
const W_TRANS  = 0.50   // transition rate from last draw seeds
const W_FREQ   = 0.20   // historical appearance frequency
const W_LASER  = 0.20   // how many laser beams from last draw hit this number
const W_GAP    = 0.10   // gap bonus (overdue numbers)

export default function NextDrawPanel({ draws, transMatrix, coOccur, gapMap, onClose, maxNumber = 45 }) {
  const [show, setShow] = useState(true)

  const prediction = useMemo(() => {
    if (!draws?.length || !transMatrix || !coOccur) return null
    const pred = computeHybridPrediction(draws, { maxNum: maxNumber })
    if (!pred) return null
    return {
      top: pred.results.slice(0, 15).map(r => ({
        number: r.number,
        score: r.score,
        transScore: r.transScore,
        freq: r.freq,
        laserCount: r.laserDirect + r.laserCorner,
        laserDirs: r.reasons.filter(x => String(x).startsWith('nese')).length ? ['NE/SE'] : [],
        gap: r.gap,
        tier: r.tier,
      })),
      nextDrawN: pred.nextDrawNum,
      lastDraw: pred.seeds,
      maxScore: pred.results[0]?.score || 1
    }
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