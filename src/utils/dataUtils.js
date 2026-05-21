// Transition matrix: how often does each number follow another
export function buildTransitionMatrix(draws) {
  const N = draws.length
  const trans = {}
  const count = {}
  for (let i = 0; i < N - 1; i++) {
    draws[i].forEach(from => {
      if (!trans[from]) trans[from] = {}
      count[from] = (count[from] || 0) + 1
      draws[i + 1].forEach(to => {
        trans[from][to] = (trans[from][to] || 0) + 1
      })
    })
  }
  const rates = {}
  Object.entries(trans).forEach(([from, tos]) => {
    rates[+from] = {}
    Object.entries(tos).forEach(([to, cnt]) => {
      rates[+from][+to] = +(cnt / count[+from] * 100).toFixed(1)
    })
  })
  return { rates, count, raw: trans }
}

// Co-occurrence: same draw
export function buildCoOccurrence(draws, maxNumber = 45) {
  const coOccur = {}
  const appearances = {}
  for (let n = 1; n <= maxNumber; n++) { coOccur[n] = {}; appearances[n] = 0 }
  draws.forEach(draw => {
    draw.forEach(n => { appearances[n]++ })
    for (let i = 0; i < draw.length; i++) {
      for (let j = i + 1; j < draw.length; j++) {
        const a = draw[i], b = draw[j]
        coOccur[a][b] = (coOccur[a][b] || 0) + 1
        coOccur[b][a] = (coOccur[b][a] || 0) + 1
      }
    }
  })
  const friends = {}
  for (let n = 1; n <= maxNumber; n++) {
    friends[n] = Object.entries(coOccur[n])
      .map(([m, cnt]) => ({
        num: +m, count: cnt,
        rate: appearances[n] ? +(cnt / appearances[n] * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
  }
  return { friends, appearances, coOccur }
}

// Gap map
export function buildGapMap(draws, maxNumber = 45) {
  const N = draws.length
  const gaps = {}
  for (let n = 1; n <= maxNumber; n++) {
    let lastSeen = -1
    for (let i = N - 1; i >= 0; i--) {
      if (draws[i].includes(n)) { lastSeen = i; break }
    }
    gaps[n] = lastSeen === -1 ? N : N - 1 - lastSeen
  }
  return gaps
}

// Light-theme row color (blue=recent, red=overdue)
export function gapToRowColor(gap) {
  const t = Math.min(gap / 35, 1)
  const r = Math.round(220 + t * 35)
  const g = Math.round(230 - t * 60)
  const b = Math.round(255 - t * 120)
  return `rgba(${r},${g},${b},0.55)`
}

// All appearances
export function getNumberAppearances(draws, number) {
  return draws.reduce((acc, draw, idx) => {
    if (draw.includes(number)) {
      acc.push({ drawIdx: idx, drawNum: idx + 1, coNumbers: draw.filter(n => n !== number) })
    }
    return acc
  }, [])
}

// Senders (what came in prev draw)
export function getSenders(draws, globalDrawIdx, number, transMatrix) {
  if (globalDrawIdx <= 0) return []
  return draws[globalDrawIdx - 1].map(n => ({
    num: n,
    rate: transMatrix?.rates?.[n]?.[number] || 0
  })).sort((a, b) => b.rate - a.rate)
}

// Receivers (what came in next draw)
export function getReceivers(draws, globalDrawIdx, number, transMatrix) {
  if (globalDrawIdx >= draws.length - 1) return []
  return draws[globalDrawIdx + 1].map(n => ({
    num: n,
    rate: transMatrix?.rates?.[number]?.[n] || 0
  })).sort((a, b) => b.rate - a.rate)
}

// Prev/Next column frequency:
// Across ALL appearances of `number`, what numbers appeared most often
// in the previous draw (prev) and the next draw (next)?
export function getPrevNextFrequency(draws, number) {
  const prev = {}, next = {}
  let total = 0
  draws.forEach((draw, i) => {
    if (!draw.includes(number)) return
    total++
    if (i > 0) draws[i - 1].forEach(n => { prev[n] = (prev[n] || 0) + 1 })
    if (i < draws.length - 1) draws[i + 1].forEach(n => { next[n] = (next[n] || 0) + 1 })
  })
  const toArr = obj => Object.entries(obj)
    .map(([n, c]) => ({ num: +n, count: c, rate: +(c / total * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  return { prev: toArr(prev), next: toArr(next), total }
}