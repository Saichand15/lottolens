import { useState, useEffect } from 'react'
import { fetchAllMMDraws, insertMMDraw } from '../../lib/supabase'
import '../powerball/PBAddResult.css'

export default function MMAddResult() {
  const [draws, setDraws] = useState([])
  const [numbers, setNumbers] = useState(['', '', '', '', ''])
  const [mb, setMb] = useState('')
  const [drawDate, setDrawDate] = useState('')
  const [drawNum, setDrawNum] = useState('')
  const [status, setStatus] = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const [saveNote, setSaveNote] = useState('')

  useEffect(() => {
    fetchAllMMDraws().then(d => {
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
    if (nums.some(n => !n || n < 1 || n > 70)) return 'White balls must be 1–70'
    if (new Set(nums).size !== 5) return 'No duplicate white balls'
    const m = Number(mb)
    if (!m || m < 1 || m > 25) return 'Mega Ball must be 1–25'
    if (!drawNum || Number(drawNum) < 1) return 'Enter a valid draw number'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setErrMsg(err); return }
    setStatus('saving'); setErrMsg(''); setSaveNote('')
    try {
      const sorted = numbers.map(Number).sort((a, b) => a - b)
      const saveResult = await insertMMDraw(Number(drawNum), sorted, Number(mb), drawDate || null)
      const updated = await fetchAllMMDraws()
      setDraws(updated)
      if (saveResult?.supabaseSaved === false) {
        setSaveNote(`Saved in app cache, but Supabase sync failed: ${saveResult.supabaseError || 'unknown error'}`)
      }
      setStatus('ok')
      setDrawNum(n => Number(n) + 1)
      setNumbers(['', '', '', '', ''])
      setMb('')
      setDrawDate('')
    } catch (e) {
      setStatus('err'); setErrMsg(e.message)
    }
  }

  const sorted = numbers.every(n => n) ? numbers.map(Number).sort((a, b) => a - b) : null

  return (
    <div className="pb-add">
      <div className="pb-add-header">
        <h1 className="pb-add-title">🟡 Add Mega Millions Result</h1>
        <p className="pb-add-sub">{draws.length} draws in database</p>
      </div>

      <div className="pb-add-card">
        <div className="pb-add-row">
          <div className="pb-add-field">
            <label>Draw #</label>
            <input type="number" value={drawNum} onChange={e => setDrawNum(e.target.value)} className="pb-add-input pb-add-input-sm" min={1} />
          </div>
          <div className="pb-add-field">
            <label>Draw Date (optional)</label>
            <input type="date" value={drawDate} onChange={e => setDrawDate(e.target.value)} className="pb-add-input pb-add-input-md" />
          </div>
        </div>

        <div className="pb-add-section-label">White Balls (1–70)</div>
        <div className="pb-balls-input-row">
          {numbers.map((n, i) => (
            <input key={i} type="text" inputMode="numeric" value={n} onChange={e => setNum(i, e.target.value)} placeholder={`B${i + 1}`} className={`pb-ball-input ${n && (Number(n) < 1 || Number(n) > 70) ? 'invalid' : ''}`} />
          ))}
        </div>

        <div className="pb-add-section-label">Mega Ball (1–25)</div>
        <div className="pb-balls-input-row">
          <input type="text" inputMode="numeric" value={mb} onChange={e => setMb(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="MB" className={`pb-ball-input pb-ball-input-red ${mb && (Number(mb) < 1 || Number(mb) > 25) ? 'invalid' : ''}`} />
        </div>

        {sorted && mb && (
          <div className="pb-add-preview">
            <span className="pb-add-preview-label">Preview:</span>
            <div className="pb-preview-balls">
              {sorted.map(n => <span key={n} className="pb-ball pb-ball-white">{n}</span>)}
              <span className="pb-ball pb-ball-red">{mb}</span>
            </div>
          </div>
        )}

        {errMsg && <div className="pb-add-err">⚠ {errMsg}</div>}
        {status === 'ok' && <div className="pb-add-ok">✅ Draw saved successfully!</div>}
        {saveNote && <div className="pb-add-err">⚠ {saveNote}</div>}

        <button className="pb-add-btn" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : '💾 Save Draw'}
        </button>
      </div>

      {draws.length > 0 && (
        <div className="pb-add-recent">
          <div className="pb-add-recent-label">Recent Draws</div>
          {[...draws].reverse().slice(0, 8).map(d => (
            <div key={d.id} className="pb-add-recent-row">
              <span className="pb-add-recent-id">#{d.id}</span>
              {d.date && <span className="pb-add-recent-date">{d.date}</span>}
              <span className="pb-preview-balls">
                {d.numbers.map(n => <span key={n} className="pb-ball-sm">{n}</span>)}
                <span className="pb-ball-sm-red">{d.mb}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
