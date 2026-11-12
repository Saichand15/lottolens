import { computeLaserHits } from './predictionEngine.js'

export function splitPairDigits(n) {
  const text = String(Math.abs(Math.round(Number(n) || 0))).padStart(2, '0')
  return {
    tens: +text[0],
    ones: +text[text.length - 1],
    digits: text.split('').map(Number),
  }
}

function calcDigitRecipesForPair(aRaw, bRaw) {
  const aNum = Math.round(Number(aRaw))
  const bNum = Math.round(Number(bRaw))
  if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return []

  const a = Math.min(aNum, bNum)
  const b = Math.max(aNum, bNum)
  const A = splitPairDigits(a)
  const B = splitPairDigits(b)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)

  return [
    { label: `${a} + ${b}`, value: a + b },
    { label: `${a} + ${b} - 1`, value: a + b - 1 },
    { label: `${a} + ${b} + 1`, value: a + b + 1 },
    { label: `${A.tens} + ${A.ones} + ${B.tens} + ${B.ones}`, value: A.tens + A.ones + B.tens + B.ones },
    { label: `${A.tens} + ${B.tens} + ${A.ones}`, value: A.tens + B.tens + A.ones },
    { label: `${A.tens} + ${B.ones}`, value: A.tens + B.ones },
    { label: `${A.ones} + ${B.tens}`, value: A.ones + B.tens },
    { label: `${A.ones} + ${B.ones}`, value: A.ones + B.ones },
    { label: `${b} - ${A.ones}`, value: b - A.ones },
    { label: `${b} - ${A.tens}`, value: b - A.tens },
    { label: `${a} - ${B.ones} - ${B.tens}`, value: a - B.ones - B.tens },
    { label: `${b} - ${A.ones} - ${A.tens}`, value: b - A.ones - A.tens },
    { label: `${b} - ${a}`, value: b - a },
    { label: `${b} + ${A.ones} + ${A.tens}`, value: b + A.ones + A.tens },
    { label: `${a} + ${B.ones} + ${B.tens}`, value: a + B.ones + B.tens },
    { label: `${a} + ${B.tens}`, value: a + B.tens },
    { label: `${b} + ${A.tens}`, value: b + A.tens },
    { label: `${b} + ${A.ones}`, value: b + A.ones },
    { label: `${a} + ${B.ones}`, value: a + B.ones },
    { label: `${B.ones} + ${A.ones} + ${A.tens}`, value: B.ones + A.ones + A.tens },
    { label: `${hi} - ${lo}`, value: hi - lo },
    { label: `${hi} - ${lo} - 1`, value: hi - lo - 1 },
    { label: `${hi} - ${lo} + 1`, value: hi - lo + 1 },
    { label: `${hi} + ${lo}`, value: hi + lo },
  ].filter(r => Number.isFinite(r.value) && r.value >= 1)
}

function calcDigitRecipesForTriple(aRaw, bRaw, cRaw) {
  const nums = [aRaw, bRaw, cRaw].map(n => Math.round(Number(n))).filter(Number.isFinite).sort((x, y) => x - y)
  if (nums.length < 3) return []

  const [a, b, c] = nums
  const A = splitPairDigits(a)
  const B = splitPairDigits(b)
  const C = splitPairDigits(c)

  return [
    { label: `${a} + ${b} + ${c}`, value: a + b + c },
    { label: `${a} + ${b} + ${c} - 1`, value: a + b + c - 1 },
    { label: `${a} + ${b} + ${c} + 1`, value: a + b + c + 1 },
    { label: `${c} - ${b} - ${a}`, value: c - b - a },
    { label: `${c} - ${b} + ${a}`, value: c - b + a },
    { label: `${c} - ${A.ones} - ${B.ones}`, value: c - A.ones - B.ones },
    { label: `${c} + ${A.ones} + ${B.ones}`, value: c + A.ones + B.ones },
    { label: `${A.tens} + ${B.ones} + ${C.ones}`, value: A.tens + B.ones + C.ones },
    { label: `${A.ones} + ${B.ones} + ${C.ones}`, value: A.ones + B.ones + C.ones },
    { label: `${a} + ${B.tens} + ${C.tens}`, value: a + B.tens + C.tens },
    { label: `${b} - ${A.ones} - ${C.tens}`, value: b - A.ones - C.tens },
  ].filter(r => Number.isFinite(r.value) && r.value >= 1)
}

export function buildTouchDigitOverlap(laserHits, activeDir, recentDraws = []) {
  if (!laserHits?.cornerTouch) return null

  const touched = new Set()
  ;['NE', 'NW', 'SE', 'SW'].forEach(dir => {
    if (!activeDir?.[dir]) return
    const ct = laserHits.cornerTouch?.[dir] || []
    ct.filter(x => x.appeared).forEach(x => touched.add(x.number))
  })

  const nums = [...touched].sort((a, b) => a - b)
  if (nums.length < 2) return { nums, common: [], exact: [], ranked: [], pairCount: 0, tripleCount: 0, strong: [] }

  const recentSets = recentDraws.map(draw => new Set(Array.isArray(draw) ? draw : draw?.numbers || []))

  const tally = {}
  let pairCount = 0
  let tripleCount = 0
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      pairCount++
      const a = nums[i]
      const b = nums[j]
      const pairKey = `${a}-${b}`
      const recipes = calcDigitRecipesForPair(a, b)

      recipes.forEach(({ label, value }) => {
        if (!tally[value]) tally[value] = { pairs: new Set(), triples: new Set(), total: 0, labels: [] }
        tally[value].pairs.add(pairKey)
        tally[value].total += 1
        const tag = `${a},${b}: ${label}`
        if (!tally[value].labels.includes(tag)) tally[value].labels.push(tag)
      })
    }
  }

  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      for (let k = j + 1; k < nums.length; k++) {
        tripleCount++
        const a = nums[i]
        const b = nums[j]
        const c = nums[k]
        const tripleKey = `${a}-${b}-${c}`
        const recipes = calcDigitRecipesForTriple(a, b, c)

        recipes.forEach(({ label, value }) => {
          if (!tally[value]) tally[value] = { pairs: new Set(), triples: new Set(), total: 0, labels: [] }
          tally[value].triples.add(tripleKey)
          tally[value].total += 1
          const tag = `${a},${b},${c}: ${label}`
          if (!tally[value].labels.includes(tag)) tally[value].labels.push(tag)
        })
      }
    }
  }

  const recentByValue = {}
  recentSets.forEach((set, idx) => {
    set.forEach(n => {
      if (!recentByValue[n]) recentByValue[n] = { count: 0, draws: [] }
      recentByValue[n].count += 1
      recentByValue[n].draws.push(recentDraws[idx]?.id || recentDraws.length - idx)
    })
  })

  const ranked = Object.entries(tally)
    .map(([n, info]) => ({
      n: +n,
      pairCount: info.pairs.size,
      tripleCount: info.triples?.size || 0,
      total: info.total,
      recentCount: recentByValue[n]?.count || 0,
      recentDraws: recentByValue[n]?.draws || [],
      pairs: [...info.pairs].sort(),
      triples: [...(info.triples || new Set())].sort(),
      labels: info.labels,
    }))
    .sort((a, b) => b.recentCount - a.recentCount || (b.pairCount + b.tripleCount) - (a.pairCount + a.tripleCount) || b.total - a.total || a.n - b.n)

  return {
    nums,
    pairCount,
    tripleCount,
    ranked,
    common: ranked.filter(r => r.pairCount >= 2),
    exact: ranked.filter(r => r.pairCount >= 2 && r.recentCount > 0),
    strong: ranked.filter(r => r.pairCount + r.tripleCount >= 3),
  }
}

export function getCapturePool(touchData) {
  return (touchData?.exact?.length ? touchData.exact : touchData?.common || []).slice(0, 20)
}

export function rankRepeatCaptures(items) {
  return items
    .map(item => ({
      ...item,
      seedCount: (item.seeds || []).length,
      avgStrength: item.hitCount ? +(item.totalStrength / item.hitCount).toFixed(2) : 0,
    }))
    .sort((a, b) => b.seedCount - a.seedCount || b.hitCount - a.hitCount || b.avgStrength - a.avgStrength || a.number - b.number)
}

export function buildPuzzleBoxes(draws, colIdx, activeDir, recentDraws) {
  return draws[colIdx].map(seed => {
    const touchData = buildTouchDigitOverlap(computeLaserHits(draws, colIdx, seed), activeDir, recentDraws)
    const values = rankRepeatCaptures(getCapturePool(touchData).map(item => ({
      ...item,
      number: item.n,
      seeds: [seed],
      hitCount: 1,
      totalStrength: (item.pairCount || 0) + (item.tripleCount || 0) + (item.recentCount || 0),
    })))
    return { seed, values, touched: touchData?.nums || [] }
  })
}
