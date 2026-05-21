import { useState, useEffect } from 'react'
import { fetchAllMMDraws } from '../../lib/supabase'
import '../powerball/PBHistory.css'

export default function MMHistory() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 30

  useEffect(() => {
    fetchAllMMDraws()
      .then(d => setDraws([...d].reverse()))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>
  if (error) return <div className="page-error">⚠ {error}</div>

  const filtered = search.trim()
    ? draws.filter(d => d.numbers.some(n => String(n).includes(search.trim())) || String(d.mb).includes(search.trim()) || String(d.id).includes(search.trim()))
    : draws

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div className="pb-history">
      <div className="pb-hist-header">
        <div>
          <h1 className="pb-hist-title">🟡 Mega Millions History</h1>
          <p className="pb-hist-sub">{draws.length} total draws</p>
        </div>
        <input className="pb-hist-search" placeholder="Search number or draw #…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {filtered.length === 0 ? <div className="pb-hist-empty">No draws match your search.</div> : (
        <>
          <div className="pb-hist-table">
            <div className="pb-hist-thead">
              <span>Draw #</span>
              <span>Date</span>
              <span className="pb-hist-nums-col">White Balls</span>
              <span>MB</span>
              <span>Sum</span>
            </div>
            {paginated.map(d => (
              <div key={d.id} className="pb-hist-row">
                <span className="pb-hist-id">#{d.id}</span>
                <span className="pb-hist-date">{d.date || '—'}</span>
                <span className="pb-hist-nums">
                  {d.numbers.map(n => <span key={n} className={`pb-ball-sm ${search && String(n) === search.trim() ? 'pb-ball-sm-match' : ''}`}>{n}</span>)}
                </span>
                <span className={`pb-ball-sm-red ${search && String(d.mb) === search.trim() ? 'pb-ball-sm-match-red' : ''}`}>{d.mb}</span>
                <span className="pb-hist-sum">{d.numbers.reduce((a, b) => a + b, 0)}</span>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pb-hist-pagination">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>←</button>
              <span>Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
