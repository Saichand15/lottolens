import { useMemo, useState } from 'react'
import { getSenders, getReceivers, getNumberAppearances } from '../utils/dataUtils'

const DIR_COLORS = {
  NE: '#00d4ff',
  NW: '#ff00ff',
  SE: '#ff6a00',
  SW: '#00ff88'
}

function CrossHitGroup({ title, items, titleColor }) {
  if (items.length === 0) return null
  return (
    <div className="fp-sec">
      <h4 className="fp-sec-title" style={{ color: titleColor }}>{title}</h4>
      {items.map(({ number, dirs, count }) => (
        <div key={number} className={`ch-row ch-row-${count >= 3 ? 'triple' : 'double'}`}>
          <div className="ch-num">{number}</div>
          <div className="ch-dirs">
            {dirs.map(d => (
              <span key={d} className="ch-dir-pill" style={{ background: DIR_COLORS[d] }}>{d}</span>
            ))}
          </div>
          <div className="ch-signal">
            {count === 4 && <span className="ch-badge ch-ultra">ALL 4</span>}
            {count === 3 && <span className="ch-badge ch-triple">3-WAY</span>}
            {count === 2 && <span className="ch-badge ch-double">2-WAY</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FriendshipPanel({
  selectedNumber,
  selectedCell,
  draws,
  displayDraws,
  transMatrix,
  coOccur,
  laserHits,
  fusionData,
  onClose
}) {
  const [tab, setTab] = useState('friends')

  const drawOffset = (draws?.length || 0) - (displayDraws?.length || 0)
  const globalDrawIdx = drawOffset + (selectedCell?.colIdx ?? (displayDraws?.length || 1) - 1)

  const currentDraw = draws?.[globalDrawIdx] || []
  const inThisDraw = currentDraw.includes(selectedNumber)
  const coNumbers = currentDraw.filter(n => n !== selectedNumber)

  const senders = useMemo(
    () => getSenders(draws, globalDrawIdx, selectedNumber, transMatrix),
    [draws, globalDrawIdx, selectedNumber, transMatrix]
  )
  const receivers = useMemo(
    () => getReceivers(draws, globalDrawIdx, selectedNumber, transMatrix),
    [draws, globalDrawIdx, selectedNumber, transMatrix]
  )

  const allTimeFriends = coOccur?.friends?.[selectedNumber] || []
  const appearances = coOccur?.appearances?.[selectedNumber] || 0
  const freq = draws?.length ? (appearances / draws.length * 100).toFixed(1) : 0

  const allAppearances = useMemo(
    () => getNumberAppearances(draws || [], selectedNumber).slice(-12).reverse(),
    [draws, selectedNumber]
  )

  // Cross-hits
  const crossHits = useMemo(() => {
    if (!laserHits) return { above: [], below: [], mixed: [], total: 0 }
    const multi = (laserHits.multiDir || []).filter(m => m.count >= 2)
    const above = [], below = [], mixed = []
    multi.forEach(m => {
      const hasUp   = m.dirs.some(d => d === 'NW' || d === 'NE')
      const hasDown = m.dirs.some(d => d === 'SE' || d === 'SW')
      if (hasUp && hasDown) mixed.push(m)
      else if (hasUp)       above.push(m)
      else                  below.push(m)
    })
    return { above, below, mixed, total: multi.length }
  }, [laserHits])

  // Corner touch
  const cornerTouchData = useMemo(() => {
    if (!laserHits?.cornerTouch) return null
    const result = {}
    let total = 0
    Object.entries(laserHits.cornerTouch).forEach(([dir, steps]) => {
      const diagonal = steps.filter(s => s.appeared && !s.isCornerAdj)
      const adjacent = steps.filter(s => s.appeared && s.isCornerAdj)
      result[dir] = { diagonal, adjacent }
      total += diagonal.length + adjacent.length
    })
    return { ...result, total }
  }, [laserHits])

  // Future laser prediction  only when clicking last column
  const futurePrediction = useMemo(() => {
    if (!selectedCell || !draws?.length || !coOccur) return null
    const isLastCol = selectedCell.colIdx === (displayDraws?.length ?? 0) - 1
    if (!isLastCol) return null

    const rowNum = selectedCell.rowNum
    const rowIdx = rowNum - 1
    const totalDraws = draws.length

    // Build appearance frequency for all numbers
    const appFreq = {}
    for (let n = 1; n <= 45; n++) {
      appFreq[n] = +(((coOccur.appearances?.[n] || 0) / totalDraws) * 100).toFixed(1)
    }

    // Transition rates from the LAST draw's numbers (seeds)
    const lastDraw = draws[draws.length - 1] || []
    const transRates = {}
    for (let n = 1; n <= 45; n++) transRates[n] = 0
    lastDraw.forEach(seed => {
      const seedRates = transMatrix?.rates?.[seed] || {}
      Object.entries(seedRates).forEach(([to, rate]) => {
        transRates[+to] = (transRates[+to] || 0) + rate
      })
    })

    // NE: dc=+1 dr=-1 (goes right+up into future draws)
    // SE: dc=+1 dr=+1 (goes right+down into future draws)
    const future = { NE: [], SE: [] }
    for (let step = 1; step <= 10; step++) {
      const neRow = rowIdx - step
      const seRow = rowIdx + step
      const futureDrawNum = draws.length + step  // D334, D335...

      if (neRow >= 0) {
        const n = neRow + 1
        const score = +(appFreq[n] * 0.4 + (transRates[n] || 0) * 0.6).toFixed(1)
        future.NE.push({ number: n, step, futureDrawNum, appFreq: appFreq[n], transScore: +(transRates[n] || 0).toFixed(1), score })
      }
      if (seRow < 45) {
        const n = seRow + 1
        const score = +(appFreq[n] * 0.4 + (transRates[n] || 0) * 0.6).toFixed(1)
        future.SE.push({ number: n, step, futureDrawNum, appFreq: appFreq[n], transScore: +(transRates[n] || 0).toFixed(1), score })
      }
    }

    // Also compute "corner adjacent" for NE/SE future beams
    for (const dir of ['NE', 'SE']) {
      future[dir].forEach(item => {
        const dr = dir === 'NE' ? -1 : 1
        const adjRow = item.number - 1 + dr
        if (adjRow >= 0 && adjRow < 45) {
          const adjN = adjRow + 1
          item.adjNumber = adjN
          item.adjScore = +(appFreq[adjN] * 0.4 + (transRates[adjN] || 0) * 0.6).toFixed(1)
        }
      })
    }

    // Merge NE+SE and find overlapping numbers (hit by both)
    const allFutureNums = {}
    ;['NE', 'SE'].forEach(dir => {
      future[dir].forEach(item => {
        if (!allFutureNums[item.number]) allFutureNums[item.number] = { dirs: [], score: 0 }
        allFutureNums[item.number].dirs.push(dir)
        allFutureNums[item.number].score = Math.max(allFutureNums[item.number].score, item.score)
      })
    })
    const topPicks = Object.entries(allFutureNums)
      .map(([n, d]) => ({ number: +n, dirs: d.dirs, score: d.score, multiBeam: d.dirs.length > 1 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return { future, topPicks, lastDraw, isLastCol: true }
  }, [selectedCell, draws, displayDraws, coOccur, transMatrix])

  const crossHitCount = crossHits.total
  const ctTotal = cornerTouchData?.total || 0
  const isLastCol = futurePrediction?.isLastCol || false

  return (
    <div className="fp">
      <div className="fp-head">
        <div className="fp-num-badge">{selectedNumber}</div>
        <div className="fp-head-info">
          <div className="fp-head-title">Number #{selectedNumber}</div>
          <div className="fp-head-meta">
            <div className="fp-meta-row">
              Appeared {appearances}&times;
              <span className="fp-meta-pill">{freq}% freq</span>
            </div>
            <div className="fp-meta-row" style={{ color: 'var(--text-muted)' }}>D#{globalDrawIdx + 1}</div>
          </div>
        </div>
        <button className="fp-close" onClick={onClose}>&#x2715;</button>
      </div>

      <div className="fp-tabs">
        <button className={`fp-tab ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>
          Friends
        </button>
        <button
          className={`fp-tab ${tab === 'crosshit' ? 'active' : ''}`}
          onClick={() => setTab('crosshit')}
          style={crossHitCount > 0 ? { color: '#ef4444', fontWeight: 700 } : {}}
        >
          {crossHitCount > 0 ? ` Cross (${crossHitCount})` : ' Cross'}
        </button>
        <button
          className={`fp-tab ${tab === 'corntouch' ? 'active' : ''}`}
          onClick={() => setTab('corntouch')}
          style={ctTotal > 0 ? { color: '#FFD700', fontWeight: 700 } : {}}
        >
          {ctTotal > 0 ? ` Touch (${ctTotal})` : ' Touch'}
        </button>
        {isLastCol && (
          <button
            className={`fp-tab ${tab === 'future' ? 'active' : ''}`}
            onClick={() => setTab('future')}
            style={{ color: '#a78bfa', fontWeight: 700 }}
          >
             Future
          </button>
        )}
      </div>

      <div className="fp-body">

        {/*  FRIENDS TAB  */}
        {tab === 'friends' && (<>
          {inThisDraw && (
            <div className="fp-sec">
              <h4 className="fp-sec-title">D#{globalDrawIdx + 1}  same draw</h4>
              <div className="chips">
                {coNumbers.map(n => {
                  const bond = allTimeFriends.find(f => f.num === n)
                  const isHot = (bond?.rate || 0) >= 25
                  return (
                    <div key={n} className={`chip ${isHot ? 'chip-hot' : ''}`}>
                      <span className="chip-n">#{n}</span>
                      <span className="chip-r">{bond?.rate || 0}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {senders.length > 0 && (
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#ff00ff' }}>&#8592; D#{globalDrawIdx} sent (prev)</h4>
              <div className="chips">
                {senders.slice(0, 5).map(s => (
                  <div key={s.num} className={`chip chip-send ${s.rate >= 20 ? 'chip-hot' : ''}`}>
                    <span className="chip-n">#{s.num}</span>
                    <span className="chip-r">{s.rate}%</span>
                    {s.rate >= 20 && <span className="chip-badge"></span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {receivers.length > 0 && (
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#00ff88' }}>&#8594; D#{globalDrawIdx + 2} sends (next)</h4>
              <div className="chips">
                {receivers.slice(0, 5).map(r => (
                  <div key={r.num} className={`chip chip-recv ${r.rate >= 20 ? 'chip-hot' : ''}`}>
                    <span className="chip-n">#{r.num}</span>
                    <span className="chip-r">{r.rate}%</span>
                    {r.rate >= 20 && <span className="chip-badge"></span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="fp-sec">
            <h4 className="fp-sec-title"> All-time same-draw friends</h4>
            <div className="friend-list">
              {allTimeFriends.slice(0, 10).map(f => (
                <div key={f.num} className="f-row">
                  <span className="f-num">#{f.num}</span>
                  <div className="f-bar-bg"><div className="f-bar" style={{ width: `${Math.min(f.rate, 100)}%` }} /></div>
                  <span className="f-pct">{f.rate}%</span>
                  <span className="f-cnt">({f.count}&times;)</span>
                </div>
              ))}
            </div>
          </div>
          <div className="fp-sec">
            <h4 className="fp-sec-title"> Recent appearances</h4>
            <div className="appear-list">
              {allAppearances.map(a => (
                <div key={a.drawNum} className="a-row">
                  <span className="a-draw">D#{a.drawNum}</span>
                  <span className="a-nums">{a.coNumbers.map(n => <span key={n} className="a-num">#{n}</span>)}</span>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/*  CROSS-HIT TAB  */}
        {tab === 'crosshit' && (
          <div className="crosshit-panel">
            {!selectedCell ? (
              <div className="lr-empty">Click a yellow cell to activate laser</div>
            ) : crossHitCount === 0 ? (
              <div className="lr-empty">No cross-hits from #{selectedNumber}.<br/>Try a different cell.</div>
            ) : (<>
              <div className="ch-explain">Same number hit by <strong>2+ laser beams</strong> = strong candidate.</div>
              <CrossHitGroup title=" Above  NW &amp; NE converge" items={crossHits.above} titleColor="#00d4ff" />
              <CrossHitGroup title=" Below  SE &amp; SW converge" items={crossHits.below} titleColor="#ff6a00" />
              {crossHits.mixed.length > 0 && (
                <CrossHitGroup title="All directions hit same number!" items={crossHits.mixed} titleColor="#ef4444" />
              )}
            </>)}
          </div>
        )}

        {/*  CORNER TOUCH TAB  */}
        {tab === 'corntouch' && (
          <div className="corntouch-panel">
            <div style={{fontSize:9,color:'#888',padding:'2px 6px',background:'#111',marginBottom:4}}>
              DBG: laserHits={laserHits ? 'yes' : 'null'} | sel={selectedCell ? `ci=${selectedCell.colIdx} row=${selectedCell.rowNum}` : 'null'} | ctTotal={ctTotal} | NW_steps={laserHits?.cornerTouch?.NW?.length ?? 'n/a'} | NW_appeared={laserHits?.cornerTouch?.NW?.filter(s=>s.appeared)?.length ?? 'n/a'}
            </div>
            {!selectedCell ? (
              <div className="lr-empty">Click a yellow cell to see corner touches</div>
            ) : ctTotal === 0 ? (
              <div className="lr-empty">No yellow boxes touched by laser from #{selectedNumber}.</div>
            ) : (<>
              <div className="ch-explain">
                <strong style={{ color: '#FFD700' }}>Yellow boxes</strong> the laser touches.<br/>
                <span style={{ color: '#aaa' }}>On path</span> = laser goes through the cell.<br/>
                <span style={{ color: '#FFD700' }}> Corner</span> = laser line grazes the box corner (like #4 in your image).
              </div>

              {['NW','NE','SW','SE'].map(dir => {
                const data = cornerTouchData?.[dir] || { diagonal: [], adjacent: [] }
                const { diagonal, adjacent } = data
                const arrow = dir === 'NW' ? '' : dir === 'NE' ? '' : dir === 'SW' ? '' : ''
                const hasAny = diagonal.length > 0 || adjacent.length > 0
                return (
                  <div key={dir} className="fp-sec">
                    <h4 className="fp-sec-title" style={{ color: DIR_COLORS[dir] }}>
                      {arrow} {dir} beam
                    </h4>
                    {!hasAny && <div className="ct-empty">No yellow boxes on this beam</div>}

                    {diagonal.length > 0 && (<>
                      <div className="ct-sublabel">On path:</div>
                      <div className="ct-list">
                        {diagonal.map(({ number, step }, i) => (
                          <div key={`d-${number}-${step}`} className="ct-row">
                            <span className="ct-step">step {step}</span>
                            <span className="ct-num" style={{ borderColor: DIR_COLORS[dir] }}>{number}</span>
                            {i === 0 && <span className="ct-first-badge" style={{ background: DIR_COLORS[dir] }}>1st</span>}
                          </div>
                        ))}
                      </div>
                    </>)}

                    {adjacent.length > 0 && (<>
                      <div className="ct-sublabel" style={{ color: '#FFD700', marginTop: 6 }}>
                         Corner-grazed (beam edge touches box):
                      </div>
                      <div className="ct-list">
                        {adjacent.map(({ number, step }) => (
                          <div key={`a-${number}-${step}`} className="ct-row ct-row-adj">
                            <span className="ct-step">step {step}</span>
                            <span className="ct-num ct-num-adj">{number}</span>
                            <span className="ct-adj-label">corner</span>
                          </div>
                        ))}
                      </div>
                    </>)}
                  </div>
                )
              })}
            </>)}
          </div>
        )}

        {/*  FUTURE LASER TAB  */}
        {tab === 'future' && futurePrediction && (
          <div className="future-panel">
            <div className="ch-explain" style={{ borderColor: '#a78bfa' }}>
              <strong style={{ color: '#a78bfa' }}> Future laser prediction</strong><br/>
              From <strong>#{selectedNumber}</strong> in D{draws.length}, the NE and SE beams
              travel into D{draws.length+1}, D{draws.length+2}<br/>
              <span style={{ color: '#aaa', fontSize: 10 }}>Score = 40% historical freq + 60% transition rate from D{draws.length} seeds</span>
            </div>

            {/* Seeds used */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: '#aaa' }}>D{draws.length} seeds (transition base)</h4>
              <div className="chips">
                {futurePrediction.lastDraw.map(n => (
                  <div key={n} className="chip"><span className="chip-n">#{n}</span></div>
                ))}
              </div>
            </div>

            {/* Top picks  numbers on both NE+SE paths */}
            {futurePrediction.topPicks.filter(p => p.multiBeam).length > 0 && (
              <div className="fp-sec">
                <h4 className="fp-sec-title" style={{ color: '#ef4444' }}> Hit by BOTH beams (NE+SE)</h4>
                {futurePrediction.topPicks.filter(p => p.multiBeam).map(p => (
                  <div key={p.number} className="future-row future-row-hot">
                    <span className="future-num">{p.number}</span>
                    <div className="future-bar-bg">
                      <div className="future-bar" style={{ width: `${Math.min(p.score, 100)}%` }} />
                    </div>
                    <span className="future-score">{p.score}</span>
                  </div>
                ))}
              </div>
            )}

            {/* NE beam future path */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: DIR_COLORS.NE }}> NE beam  future path</h4>
              {futurePrediction.future.NE.map(item => (
                <div key={item.number} className={`future-row ${item.score >= 15 ? 'future-row-warm' : ''}`}>
                  <span className="future-draw">D{item.futureDrawNum}</span>
                  <span className="future-num">{item.number}</span>
                  <div className="future-bar-bg">
                    <div className="future-bar" style={{ width: `${Math.min(item.score * 2, 100)}%`, background: DIR_COLORS.NE }} />
                  </div>
                  <span className="future-score" style={{ color: item.score >= 15 ? '#00d4ff' : '#666' }}>{item.score}</span>
                  {item.adjNumber && item.adjScore >= 12 && (
                    <span className="future-adj" title="corner-adjacent">+{item.adjNumber}</span>
                  )}
                </div>
              ))}
            </div>

            {/* SE beam future path */}
            <div className="fp-sec">
              <h4 className="fp-sec-title" style={{ color: DIR_COLORS.SE }}> SE beam  future path</h4>
              {futurePrediction.future.SE.map(item => (
                <div key={item.number} className={`future-row ${item.score >= 15 ? 'future-row-warm' : ''}`}>
                  <span className="future-draw">D{item.futureDrawNum}</span>
                  <span className="future-num">{item.number}</span>
                  <div className="future-bar-bg">
                    <div className="future-bar" style={{ width: `${Math.min(item.score * 2, 100)}%`, background: DIR_COLORS.SE }} />
                  </div>
                  <span className="future-score" style={{ color: item.score >= 15 ? '#ff6a00' : '#666' }}>{item.score}</span>
                  {item.adjNumber && item.adjScore >= 12 && (
                    <span className="future-adj" title="corner-adjacent">+{item.adjNumber}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}