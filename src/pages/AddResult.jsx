import { useState, useEffect } from 'react'
import { fetchAllDraws, insertDraw } from '../lib/supabase'
import { postMortem, predictNextDraw } from '../utils/predictionEngine'
import './AddResult.css'

export default function AddResult() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [numbers, setNumbers] = useState(['', '', '', '', ''])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => { fetchAllDraws().then(setDraws).finally(() => setLoading(false)) }, [])

  const latest = draws[draws.length - 1]
  const nextId = latest ? latest.id + 1 : 1

  function handleChange(i, val) {
    const next = [...numbers]
    next[i] = val.replace(/\D/, '').slice(0, 2)
    setNumbers(next)
    // Preview post-mortem when all 5 filled
    const parsed = next.map(Number).filter(n => n >= 1 && n <= 45)
    if (parsed.length === 5 && latest) {
      const pm = postMortem(draws, latest, { numbers: parsed })
      setPreview(pm)
    } else {
      setPreview(null)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const nums = numbers.map(Number)
    if (nums.some(n => !n || n < 1 || n > 45)) {
      setError('All 5 numbers must be between 1 and 45.')
      return
    }
    if (new Set(nums).size !== 5) {
      setError('Numbers must be unique.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await insertDraw(nextId, nums)
      setSuccess(true)
      setNumbers(['', '', '', '', ''])
      setPreview(null)
      const updated = await fetchAllDraws()
      setDraws(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner"/><span>Loading…</span></div>

  const prediction = latest ? predictNextDraw(draws, latest.numbers).slice(0, 5) : []

  return (
    <div className="add-result-page">
      <h1 className="ar-title">Add Result</h1>

      {/* Prediction reminder */}
      {latest && (
        <div className="prediction-reminder">
          <div className="pr-label">D{latest.id} seeds → D{nextId} top prediction</div>
          <div className="pr-balls">
            {prediction.map(({ number, score }) => (
              <div key={number} className="pr-ball-wrap">
                <span className="ball-pred">{number}</span>
                <span className="pr-score">{score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {success && (
        <div className="success-banner">
          ✅ D{nextId - 1} added successfully! Database updated.
          <button className="btn-dismiss" onClick={() => setSuccess(false)}>×</button>
        </div>
      )}

      <div className="ar-form-card">
        <div className="ar-form-title">Enter D{nextId} Result</div>
        <form className="ar-form" onSubmit={handleSubmit}>
          <div className="number-inputs">
            {numbers.map((v, i) => (
              <div key={i} className="num-input-wrap">
                <label>P{i + 1}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="num-input"
                  value={v}
                  onChange={e => handleChange(i, e.target.value)}
                  placeholder="—"
                  maxLength={2}
                />
              </div>
            ))}
          </div>

          {error && <div className="form-error">⚠ {error}</div>}

          <button type="submit" className="btn-save" disabled={saving}>
            {saving ? 'Saving…' : `Save D${nextId}`}
          </button>
        </form>
      </div>

      {/* Live post-mortem preview */}
      {preview && (
        <div className="postmortem-card">
          <h2>Post-Mortem Preview</h2>
          <p className="pm-summary">
            <strong>{preview.fired} / 25</strong> seed→result bonds fired
            {preview.fired >= 20 ? ' 🔥 Excellent!' : preview.fired >= 15 ? ' ✅ Good' : preview.fired >= 10 ? ' 🟡 Average' : ' 🔴 Low'}
          </p>
          <div className="bond-list">
            {preview.bonds.slice(0, 10).map(({ seed, result, count }) => (
              <div key={`${seed}-${result}`} className="bond-row">
                <span className="bond-seed">{seed}</span>
                <span className="bond-arrow">→</span>
                <span className="bond-result">{result}</span>
                <span className="bond-count">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent draws */}
      <div className="recent-section">
        <h2>Last 5 Draws</h2>
        {draws.slice(-5).reverse().map(d => (
          <div key={d.id} className="recent-row">
            <span className="rr-id">D{d.id}</span>
            <div className="rr-balls">
              {d.numbers.map(n => <span key={n} className="ball-sm-r">{n}</span>)}
            </div>
            <span className="rr-sum">Σ{d.numbers.reduce((a,b)=>a+b,0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
