import { useState, useEffect } from 'react'
import { fetchAllPBDraws, insertPBDraw } from '../../lib/supabase'
import './PBAddResult.css'

export default function PBAddResult() {
  const [draws, setDraws]     = useState([])
  const [numbers, setNumbers] = useState(['', '', '', '', ''])
  const [pb, setPb]           = useState('')
  const [drawDate, setDrawDate] = useState('')
  const [drawNum, setDrawNum] = useState('')
  const [status, setStatus]   = useState(null) // null | 'saving' | 'ok' | 'err'
  const [errMsg, setErrMsg]   = useState('')
  const [saveNote, setSaveNote] = useState('')

  useEffect(() => {
    fetchAllPBDraws().then(d => {
      setDraws(d)
      setDrawNum(d.length > 0 ? d[d.length - 1].id + 1 : 1)
    })
  }, [])

  const setNum = (i, val) => {
    const v = val.replace(/\D/g, '').slice(0, 2)
    setNumbers(prev => { const n = [...prev]; n[i] = v; return n })
  }

  const validate = () => {
    const nums = numbers.map(Number)
    if (nums.some(n => !n || n < 1 || n > 69)) return 'White balls must be 1–69'
    if (new Set(nums).size !== 5) return 'No duplicate white balls'
    const p = Number(pb)
    if (!p || p < 1 || p > 26) return 'Powerball must be 1–26'
    if (!drawNum || Number(drawNum) < 1) return 'Enter a valid draw number'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setErrMsg(err); return }
    setStatus('saving'); setErrMsg(''); setSaveNote('')
    try {
      const sorted = numbers.map(Number).sort((a, b) => a - b)
      const saveResult = await insertPBDraw(Number(drawNum), sorted, Number(pb), drawDate || null)
      const updated = await fetchAllPBDraws()
      setDraws(updated)

      if (saveResult?.supabaseSaved === false) {
        setSaveNote(`Saved in app cache, but Supabase sync failed: ${saveResult.supabaseError || 'unknown error'}`)
      }

      setStatus('ok')
      setDrawNum(n => Number(n) + 1)
      setNumbers(['', '', '', '', ''])
      setPb('')
      setDrawDate('')
    } catch (e) {
      setStatus('err'); setErrMsg(e.message)
    }
  }

  const sorted = numbers.every(n => n) ? numbers.map(Number).sort((a, b) => a - b) : null

  return (
    <div className="pb-add">
      <div className="pb-add-header">
        <h1 className="pb-add-title">🔴 Add Powerball Result</h1>
        <p className="pb-add-sub">{draws.length} draws in database</p>
      </div>

      <div className="pb-add-card">
        {/* Draw number & date */}
        <div className="pb-add-row">
          <div className="pb-add-field">
            <label>Draw #</label>
            <input
              type="number"
              value={drawNum}
              onChange={e => setDrawNum(e.target.value)}
              className="pb-add-input pb-add-input-sm"
              min={1}
            />
          </div>
          <div className="pb-add-field">
            <label>Draw Date (optional)</label>
            <input
              type="date"
              value={drawDate}
              onChange={e => setDrawDate(e.target.value)}
              className="pb-add-input pb-add-input-md"
            />
          </div>
        </div>

        {/* White balls */}
        <div className="pb-add-section-label">White Balls (1–69)</div>
        <div className="pb-balls-input-row">
          {numbers.map((n, i) => (
            <input
              key={i}
              type="text"
              inputMode="numeric"
              value={n}
              onChange={e => setNum(i, e.target.value)}
              placeholder={`B${i + 1}`}
              className={`pb-ball-input ${n && (Number(n) < 1 || Number(n) > 69) ? 'invalid' : ''}`}
            />
          ))}
        </div>

        {/* Powerball */}
        <div className="pb-add-section-label">Powerball (1–26)</div>
        <div className="pb-balls-input-row">
          <input
            type="text"
            inputMode="numeric"
            value={pb}
            onChange={e => setPb(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="PB"
            className={`pb-ball-input pb-ball-input-red ${pb && (Number(pb) < 1 || Number(pb) > 26) ? 'invalid' : ''}`}
          />
        </div>

        {/* Preview */}
        {sorted && pb && (
          <div className="pb-add-preview">
            <span className="pb-add-preview-label">Preview:</span>
            <div className="pb-preview-balls">
              {sorted.map(n => <span key={n} className="pb-ball pb-ball-white">{n}</span>)}
              <span className="pb-ball pb-ball-red">{pb}</span>
            </div>
          </div>
        )}

        {errMsg && <div className="pb-add-err">⚠ {errMsg}</div>}
        {status === 'ok' && <div className="pb-add-ok">✅ Draw saved successfully!</div>}
        {saveNote && <div className="pb-add-err">⚠ {saveNote}</div>}

        <button
          className="pb-add-btn"
          onClick={handleSave}
          disabled={status === 'saving'}
        >
          {status === 'saving' ? 'Saving…' : '💾 Save Draw'}
        </button>
      </div>

      {/* Recent draws */}
      {draws.length > 0 && (
        <div className="pb-add-recent">
          <div className="pb-add-recent-label">Recent Draws</div>
          {[...draws].reverse().slice(0, 8).map(d => (
            <div key={d.id} className="pb-add-recent-row">
              <span className="pb-add-recent-id">#{d.id}</span>
              {d.date && <span className="pb-add-recent-date">{d.date}</span>}
              <span className="pb-preview-balls">
                {d.numbers.map(n => <span key={n} className="pb-ball-sm">{n}</span>)}
                <span className="pb-ball-sm-red">{d.pb}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
