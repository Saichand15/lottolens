import { useState, useEffect, useMemo } from 'react'
import { fetchAllDraws } from '../lib/supabase'
import './History.css'

export default function History() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => { fetchAllDraws().then(setDraws).finally(() => setLoading(false)) }, [])

  const filtered = useMemo(() => {
    const q = search.trim()
    let result = [...draws]
    if (q) {
      const nums = q.split(/[\s,]+/).map(Number).filter(Boolean)
      if (nums.length) {
        result = result.filter(d => nums.every(n => d.numbers.includes(n)))
      }
    }
    return sortDir === 'desc' ? result.reverse() : result
  }, [draws, search, sortDir])

  if (loading) return <div className="page-loading"><div className="spinner"/><span>Loading…</span></div>

  return (
    <div className="history-page">
      <div className="hist-header">
        <div>
          <h1 className="hist-title">History</h1>
          <p className="hist-sub">{draws.length} draws total · {filtered.length} shown</p>
        </div>
        <div className="hist-controls">
          <input
            className="search-input"
            placeholder="Filter by number(s)… e.g. 15 or 3,13"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className="sort-btn"
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          >
            {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
          </button>
        </div>
      </div>

      <div className="hist-table-wrap">
        <table className="hist-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Draw</th>
              <th>P1</th>
              <th>P2</th>
              <th>P3</th>
              <th>P4</th>
              <th>P5</th>
              <th>Sum</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => {
              const sum = d.numbers.reduce((a, b) => a + b, 0)
              const searchNums = search.split(/[\s,]+/).map(Number).filter(Boolean)
              return (
                <tr key={d.id} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                  <td className="td-idx">{filtered.length - i}</td>
                  <td className="td-id">D{d.id}</td>
                  {d.numbers.map((n, pos) => (
                    <td key={pos} className={`td-num ${searchNums.includes(n) ? 'highlighted' : ''}`}>
                      <span className="ball-hist">{n}</span>
                    </td>
                  ))}
                  <td className="td-sum">{sum}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
