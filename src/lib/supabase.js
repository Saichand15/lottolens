import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jumllemfwsjoocmukvux.supabase.co'
const SUPABASE_KEY = 'sb_publishable_iAtZsTTRgW5gJV39s4bf_A_6FgO1QM0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Wrap any Supabase query with a hard timeout so the UI never hangs waiting
// for a DNS/network failure. ms=3000 means pages load from local JSON in <100ms.
async function sbQuery(queryFn, ms = 3000) {
  return Promise.race([
    queryFn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase timeout')), ms)
    )
  ])
}

// ─── DRAWS (Lucky Day Lotto) ──────────────────────────────────────────────────
// Strategy: load local all_draws.json first (always available + up-to-date),
// then merge any Supabase rows, then merge localStorage manual entries.
// This way the app works fully offline / when Supabase is unreachable.

let _drawsCache = null
const DRAWS_LOCAL_KEY = 'lotto_draws_manual_v1'

function normalizeDrawRow(raw) {
  const id = Number(raw?.id ?? raw?.draw_number)
  if (!id || id < 1) return null
  const numbers = Array.isArray(raw?.numbers)
    ? raw.numbers.map(Number)
    : [raw?.n1, raw?.n2, raw?.n3, raw?.n4, raw?.n5].map(Number)
  if (numbers.length !== 5 || numbers.some(n => !n || n < 1 || n > 45)) return null
  if (new Set(numbers).size !== 5) return null
  return { id, numbers: [...numbers].sort((a, b) => a - b) }
}

function readLocalDraws() {
  if (!canUseLocalStorage()) return []
  try {
    const raw = window.localStorage.getItem(DRAWS_LOCAL_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map(normalizeDrawRow).filter(Boolean)
  } catch { return [] }
}

function writeLocalDraws(draws) {
  if (!canUseLocalStorage()) return
  try { window.localStorage.setItem(DRAWS_LOCAL_KEY, JSON.stringify(draws)) } catch {}
}

function mergeDraws(...drawLists) {
  const map = new Map()
  drawLists.flat().forEach(d => {
    const n = normalizeDrawRow(d)
    if (n) map.set(n.id, n)
  })
  return [...map.values()].sort((a, b) => a.id - b.id)
}

export async function fetchAllDraws() {
  if (_drawsCache) return _drawsCache

  // 1) Local JSON file (always bundled, always up-to-date)
  let fileDraws = []
  try {
    const res = await fetch('/all_draws.json')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        // all_draws.json is array-of-arrays: [[n1,n2,n3,n4,n5], ...]
        fileDraws = data.map((nums, i) => ({ id: i + 1, numbers: [...nums].sort((a,b)=>a-b) }))
      }
    }
  } catch {}

  // 2) Supabase (best-effort — 3s timeout, fails gracefully if unreachable)
  let supabaseDraws = []
  try {
    const { data, error } = await sbQuery(() =>
      supabase.from('draws').select('draw_number,n1,n2,n3,n4,n5').order('draw_number', { ascending: true })
    )
    if (!error && Array.isArray(data)) {
      supabaseDraws = data.map(r => ({
        id: r.draw_number,
        numbers: [r.n1, r.n2, r.n3, r.n4, r.n5]
      }))
    }
  } catch {}

  // 3) localStorage manual entries (survive page refresh)
  const localDraws = readLocalDraws()

  _drawsCache = mergeDraws(fileDraws, supabaseDraws, localDraws)
  return _drawsCache
}

export function invalidateDrawsCache() {
  _drawsCache = null
}

export async function fetchLatestDraw() {
  const all = await fetchAllDraws()
  if (!all.length) throw new Error('No draws available')
  return all[all.length - 1]
}

export async function insertDraw(drawNumber, numbers) {
  const normalized = normalizeDrawRow({ id: drawNumber, numbers })
  if (!normalized) throw new Error('Invalid draw payload.')

  // Merge into cache + localStorage immediately so UI updates without reload
  const current = _drawsCache || await fetchAllDraws()
  _drawsCache = mergeDraws(current, [normalized])
  writeLocalDraws(_drawsCache)

  // Best-effort Supabase save (3s timeout)
  const [n1, n2, n3, n4, n5] = normalized.numbers
  let supabaseSaved = true
  let supabaseError = null
  try {
    const { error } = await sbQuery(() =>
      supabase.from('draws').upsert({ draw_number: normalized.id, n1, n2, n3, n4, n5 }, { onConflict: 'draw_number' })
    )
    if (error) { supabaseSaved = false; supabaseError = error.message }
  } catch (e) { supabaseSaved = false; supabaseError = e.message }

  return { supabaseSaved, supabaseError }
}

export async function fetchDrawCount() {
  const all = await fetchAllDraws()
  return all.length
}

// ─── POWERBALL DRAWS ──────────────────────────────────────────────────────────
// Primary source: public/all_pb_draws.json (1346 draws, Oct 2015–present)
// New draws added via AddResult are merged from Supabase + localStorage
let _pbDrawsCache = null
const PB_LOCAL_KEY = 'pb_draws_manual_v1'

function toIsoDate(v) {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

function normalizePBDraw(raw) {
  const id = Number(raw?.id ?? raw?.draw_number)
  if (!id || id < 1) return null

  const numbers = Array.isArray(raw?.numbers)
    ? raw.numbers.map(Number)
    : [raw?.n1, raw?.n2, raw?.n3, raw?.n4, raw?.n5].map(Number)

  if (numbers.length !== 5 || numbers.some(n => !n || n < 1 || n > 69)) return null
  if (new Set(numbers).size !== 5) return null

  const pb = Number(raw?.pb)
  if (!pb || pb < 1 || pb > 26) return null

  return {
    id,
    numbers: [...numbers].sort((a, b) => a - b),
    pb,
    date: toIsoDate(raw?.date ?? raw?.draw_date)
  }
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalPBDraws() {
  if (!canUseLocalStorage()) return []
  try {
    const raw = window.localStorage.getItem(PB_LOCAL_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map(normalizePBDraw).filter(Boolean)
  } catch {
    return []
  }
}

function writeLocalPBDraws(draws) {
  if (!canUseLocalStorage()) return
  try {
    window.localStorage.setItem(PB_LOCAL_KEY, JSON.stringify(draws))
  } catch {
    // ignore storage quota / private mode write failures
  }
}

function mergePBDraws(...drawLists) {
  const map = new Map()
  drawLists.flat().forEach(d => {
    const n = normalizePBDraw(d)
    if (n) map.set(n.id, n)
  })
  return [...map.values()].sort((a, b) => a.id - b.id)
}

export async function fetchAllPBDraws() {
  if (_pbDrawsCache) return _pbDrawsCache

  // 1) Base file bundled with app
  let fileDraws = []
  try {
    const res = await fetch('/all_pb_draws.json')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) fileDraws = data
    }
  } catch {
    // continue with other sources
  }

  // 2) Supabase rows (3s timeout — best-effort)
  let supabaseDraws = []
  try {
    const { data, error } = await sbQuery(() =>
      supabase.from('pb_draws').select('draw_number,n1,n2,n3,n4,n5,pb,draw_date').order('draw_number', { ascending: true })
    )
    if (!error && Array.isArray(data)) {
      supabaseDraws = data.map(r => ({
        id: r.draw_number,
        numbers: [r.n1, r.n2, r.n3, r.n4, r.n5],
        pb: r.pb,
        date: r.draw_date
      }))
    }
  } catch {}

  // 3) Browser local backup (manual entries survive refresh)
  const localDraws = readLocalPBDraws()

  _pbDrawsCache = mergePBDraws(fileDraws, supabaseDraws, localDraws)
  return _pbDrawsCache
}

export function invalidatePBCache() {
  _pbDrawsCache = null
}

export async function insertPBDraw(drawNumber, numbers, pb, drawDate) {
  const normalized = normalizePBDraw({
    id: drawNumber,
    numbers,
    pb,
    date: drawDate || new Date().toISOString().split('T')[0]
  })
  if (!normalized) throw new Error('Invalid Powerball draw payload.')

  const current = _pbDrawsCache || await fetchAllPBDraws()
  _pbDrawsCache = mergePBDraws(current, [normalized])
  writeLocalPBDraws(_pbDrawsCache)

  const [n1, n2, n3, n4, n5] = normalized.numbers
  let supabaseSaved = true
  let supabaseError = null
  try {
    const { error } = await sbQuery(() =>
      supabase.from('pb_draws').upsert(
        { draw_number: normalized.id, n1, n2, n3, n4, n5, pb: normalized.pb, draw_date: normalized.date || null },
        { onConflict: 'draw_number' }
      )
    )
    if (error) {
      supabaseSaved = false
      supabaseError = error.message
    }
  } catch (e) {
    supabaseSaved = false
    supabaseError = e.message
  }

  return { supabaseSaved, supabaseError }
}

// ─── MEGA MILLIONS DRAWS ─────────────────────────────────────────────────────
// Uses current game format only: 5/70 + Mega Ball 1/25
let _mmDrawsCache = null
const MM_LOCAL_KEY = 'mm_draws_manual_v1'

function normalizeMMDraw(raw) {
  const id = Number(raw?.id ?? raw?.draw_number)
  if (!id || id < 1) return null

  const numbers = Array.isArray(raw?.numbers)
    ? raw.numbers.map(Number)
    : [raw?.n1, raw?.n2, raw?.n3, raw?.n4, raw?.n5].map(Number)

  if (numbers.length !== 5 || numbers.some(n => !n || n < 1 || n > 70)) return null
  if (new Set(numbers).size !== 5) return null

  const mb = Number(raw?.mb)
  if (!mb || mb < 1 || mb > 25) return null

  return {
    id,
    numbers: [...numbers].sort((a, b) => a - b),
    mb,
    date: toIsoDate(raw?.date ?? raw?.draw_date)
  }
}

function readLocalMMDraws() {
  if (!canUseLocalStorage()) return []
  try {
    const raw = window.localStorage.getItem(MM_LOCAL_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map(normalizeMMDraw).filter(Boolean)
  } catch {
    return []
  }
}

function writeLocalMMDraws(draws) {
  if (!canUseLocalStorage()) return
  try {
    window.localStorage.setItem(MM_LOCAL_KEY, JSON.stringify(draws))
  } catch {
    // ignore storage issues
  }
}

function mergeMMDraws(...drawLists) {
  const map = new Map()
  drawLists.flat().forEach(d => {
    const n = normalizeMMDraw(d)
    if (n) map.set(n.id, n)
  })
  return [...map.values()].sort((a, b) => a.id - b.id)
}

export async function fetchAllMMDraws() {
  if (_mmDrawsCache) return _mmDrawsCache

  let fileDraws = []
  try {
    const res = await fetch('/all_mm_draws.json')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) fileDraws = data
    }
  } catch {
    // continue with fallback sources
  }

  let supabaseDraws = []
  try {
    const { data, error } = await sbQuery(() =>
      supabase.from('mm_draws').select('draw_number,n1,n2,n3,n4,n5,mb,draw_date').order('draw_number', { ascending: true })
    )
    if (!error && Array.isArray(data)) {
      supabaseDraws = data.map(r => ({
        id: r.draw_number,
        numbers: [r.n1, r.n2, r.n3, r.n4, r.n5],
        mb: r.mb,
        date: r.draw_date
      }))
    }
  } catch {}

  const localDraws = readLocalMMDraws()
  _mmDrawsCache = mergeMMDraws(fileDraws, supabaseDraws, localDraws)
  return _mmDrawsCache
}

export function invalidateMMCache() {
  _mmDrawsCache = null
}

export async function insertMMDraw(drawNumber, numbers, mb, drawDate) {
  const normalized = normalizeMMDraw({
    id: drawNumber,
    numbers,
    mb,
    date: drawDate || new Date().toISOString().split('T')[0]
  })
  if (!normalized) throw new Error('Invalid Mega Millions draw payload.')

  const current = _mmDrawsCache || await fetchAllMMDraws()
  _mmDrawsCache = mergeMMDraws(current, [normalized])
  writeLocalMMDraws(_mmDrawsCache)

  const [n1, n2, n3, n4, n5] = normalized.numbers
  let supabaseSaved = true
  let supabaseError = null
  try {
    const { error } = await sbQuery(() =>
      supabase.from('mm_draws').upsert(
        { draw_number: normalized.id, n1, n2, n3, n4, n5, mb: normalized.mb, draw_date: normalized.date || null },
        { onConflict: 'draw_number' }
      )
    )
    if (error) {
      supabaseSaved = false
      supabaseError = error.message
    }
  } catch (e) {
    supabaseSaved = false
    supabaseError = e.message
  }

  return { supabaseSaved, supabaseError }
}
