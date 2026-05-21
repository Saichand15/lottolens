import {
  pbBuildFreqMap,
  pbBuildTransitionMatrix,
  pbBuildCoOccurrence,
  pbGetCoOcc,
  pbGetHotCold,
  pbAnalyzeZones,
  pbBuildPositionFreq,
  pbGetSenders,
  pbGetReceivers,
  pbFindLegendaryChains,
  pbCheckTripleCoOcc,
  pbComputeLaserHits,
  pbAnalyzeOddEven,
  pbAnalyzeSums
} from './pbEngine'

export const MM_MAIN_MAX = 70
export const MM_BALL_MAX = 25

function toPBShape(draws = []) {
  return draws.map(d => ({ ...d, pb: d.mb }))
}

export function mmBuildFreqMap(draws) {
  return pbBuildFreqMap(draws)
}

export function mmBuildMBFreqMap(draws) {
  const freq = {}
  draws.forEach(d => { if (d.mb) freq[d.mb] = (freq[d.mb] || 0) + 1 })
  return freq
}

export function mmBuildGapMap(draws) {
  const gaps = {}
  for (let n = 1; n <= MM_MAIN_MAX; n++) gaps[n] = draws.length
  draws.forEach((d, i) => {
    d.numbers.forEach(n => { gaps[n] = draws.length - 1 - i })
  })
  return gaps
}

export function mmBuildMBGapMap(draws) {
  const gaps = {}
  for (let n = 1; n <= MM_BALL_MAX; n++) gaps[n] = draws.length
  draws.forEach((d, i) => {
    if (d.mb) gaps[d.mb] = draws.length - 1 - i
  })
  return gaps
}

export function mmBuildTransitionMatrix(draws) {
  return pbBuildTransitionMatrix(draws)
}

export function mmBuildCoOccurrence(draws) {
  return pbBuildCoOccurrence(draws)
}

export function mmGetCoOcc(co, a, b) {
  return pbGetCoOcc(co, a, b)
}

export function mmGetHotCold(draws, lastN = 20) {
  return pbGetHotCold(draws, lastN)
}

export function mmGetHotColdMB(draws, lastN = 20) {
  const recent = draws.slice(-lastN)
  const freq = mmBuildMBFreqMap(recent)
  const all = []
  for (let n = 1; n <= MM_BALL_MAX; n++) all.push({ number: n, count: freq[n] || 0 })
  all.sort((a, b) => b.count - a.count)
  return { hot: all.slice(0, 5), cold: all.slice(-5).reverse() }
}

export function mmAnalyzeZones(draws) {
  const zones = [
    { label: '1–10', min: 1, max: 10 },
    { label: '11–20', min: 11, max: 20 },
    { label: '21–30', min: 21, max: 30 },
    { label: '31–40', min: 31, max: 40 },
    { label: '41–50', min: 41, max: 50 },
    { label: '51–60', min: 51, max: 60 },
    { label: '61–70', min: 61, max: 70 }
  ]
  const sample = draws.slice(-20)
  const denom = sample.length || 1
  return zones.map(z => {
    const count = sample.reduce((sum, d) => sum + d.numbers.filter(n => n >= z.min && n <= z.max).length, 0)
    return { ...z, count, avg: +(count / denom).toFixed(2) }
  })
}

export function mmBuildPositionFreq(draws) {
  return pbBuildPositionFreq(draws)
}

export function mmGetSenders(draws, targetDrawIdx, targetNumber, matrix) {
  return pbGetSenders(draws, targetDrawIdx, targetNumber, matrix)
}

export function mmGetReceivers(draws, targetDrawIdx, targetNumber, matrix) {
  return pbGetReceivers(draws, targetDrawIdx, targetNumber, matrix)
}

export function mmGetNumberAppearances(draws, number) {
  return draws
    .map((d, i) => ({ drawIdx: i, drawNum: d.id, numbers: d.numbers, mb: d.mb }))
    .filter(d => d.numbers.includes(number))
}

export function mmFindLegendaryChains(draws) {
  return pbFindLegendaryChains(draws)
}

export function mmCheckTripleCoOcc(draws, a, b, c) {
  return pbCheckTripleCoOcc(draws, a, b, c)
}

export function mmPostMortem(draws, prevDraw, resultDraw) {
  const matrix = mmBuildTransitionMatrix(draws)
  const bonds = []
  prevDraw.numbers.forEach(seed => {
    resultDraw.numbers.forEach(result => {
      const count = (matrix[seed] && matrix[seed][result]) || 0
      if (count > 0) bonds.push({ seed, result, count })
    })
  })
  bonds.sort((a, b) => b.count - a.count)
  return { fired: bonds.length, total: 25, bonds }
}

export function mmComputeLaserHits(displayDraws, colIdx, rowNum, maxNumber = MM_MAIN_MAX) {
  return pbComputeLaserHits(displayDraws, colIdx, rowNum, maxNumber)
}

export function mmComputeFullPrediction(draws, windowSize = 50) {
  if (!draws || draws.length < 2) return null
  const N = draws.length
  const seeds = draws[N - 1].numbers.slice().sort((a, b) => a - b)
  const seedSet = new Set(seeds)

  const trans = {}, seedCount = {}
  for (let i = 0; i < N - 1; i++) {
    draws[i].numbers.forEach(from => {
      if (!trans[from]) trans[from] = {}
      seedCount[from] = (seedCount[from] || 0) + 1
      draws[i + 1].numbers.forEach(to => { trans[from][to] = (trans[from][to] || 0) + 1 })
    })
  }

  const wStart = Math.max(0, N - windowSize - 1)
  const t50 = {}, sc50 = {}
  for (let i = wStart; i < N - 1; i++) {
    draws[i].numbers.forEach(from => {
      if (!t50[from]) t50[from] = {}
      sc50[from] = (sc50[from] || 0) + 1
      draws[i + 1].numbers.forEach(to => { t50[from][to] = (t50[from][to] || 0) + 1 })
    })
  }

  const appear = {}, lastSeen = {}
  for (let n = 1; n <= MM_MAIN_MAX; n++) { appear[n] = 0; lastSeen[n] = -1 }
  draws.forEach((d, i) => d.numbers.forEach(n => { appear[n]++; lastSeen[n] = i }))
  const gap = {}
  for (let n = 1; n <= MM_MAIN_MAX; n++) gap[n] = N - 1 - lastSeen[n]

  const co = mmBuildCoOccurrence(draws)

  const laserDirect = {}, laserCorner = {}, laserBeamSources = {}
  for (let n = 1; n <= MM_MAIN_MAX; n++) {
    laserDirect[n] = 0
    laserCorner[n] = 0
    laserBeamSources[n] = { direct: [], corner: [] }
  }

  seeds.forEach(seed => {
    for (let step = 1; step <= 20; step++) {
      const ne = seed - step
      if (ne >= 1) {
        laserDirect[ne]++
        laserBeamSources[ne].direct.push({ seed, dir: 'NE', step })
        if (ne - 1 >= 1) { laserCorner[ne - 1]++; laserBeamSources[ne - 1].corner.push({ seed, dir: 'NE', step, via: ne }) }
        if (ne + 1 <= MM_MAIN_MAX) { laserCorner[ne + 1]++; laserBeamSources[ne + 1].corner.push({ seed, dir: 'NE', step, via: ne }) }
      }
      const se = seed + step
      if (se <= MM_MAIN_MAX) {
        laserDirect[se]++
        laserBeamSources[se].direct.push({ seed, dir: 'SE', step })
        if (se - 1 >= 1) { laserCorner[se - 1]++; laserBeamSources[se - 1].corner.push({ seed, dir: 'SE', step, via: se }) }
        if (se + 1 <= MM_MAIN_MAX) { laserCorner[se + 1]++; laserBeamSources[se + 1].corner.push({ seed, dir: 'SE', step, via: se }) }
      }
    }
  })

  const transScore = {}, w50Score = {}
  for (let n = 1; n <= MM_MAIN_MAX; n++) { transScore[n] = 0; w50Score[n] = 0 }
  seeds.forEach(seed => {
    const sc = seedCount[seed] || 1
    Object.entries(trans[seed] || {}).forEach(([to, cnt]) => { transScore[+to] += cnt / sc * 100 })
    const sc5 = sc50[seed] || 1
    Object.entries(t50[seed] || {}).forEach(([to, cnt]) => { w50Score[+to] += cnt / sc5 * 100 })
  })

  const coScore = {}
  for (let n = 1; n <= MM_MAIN_MAX; n++) {
    coScore[n] = seeds.reduce((sum, seed) => sum + mmGetCoOcc(co, n, seed), 0)
  }

  const maxLaserD = Math.max(...Object.values(laserDirect), 1)
  const maxLaserC = Math.max(...Object.values(laserCorner), 1)
  const maxTrans = Math.max(...Object.values(transScore), 1)
  const maxW50 = Math.max(...Object.values(w50Score), 1)
  const maxFreq = Math.max(...Object.values(appear), 1)
  const maxGap = Math.min(Math.max(...Object.values(gap), 1), 80)
  const maxCo = Math.max(...Object.values(coScore), 1)

  const W_LASER = 0.28, W_CORNER = 0.14, W_TRANS = 0.23, W_W50 = 0.18, W_GAP = 0.07, W_FREQ = 0.03, W_CO = 0.07

  const results = []
  for (let n = 1; n <= MM_MAIN_MAX; n++) {
    if (seedSet.has(n)) continue
    const lD = laserDirect[n] / maxLaserD * 100
    const lC = laserCorner[n] / maxLaserC * 100
    const tr = transScore[n] / maxTrans * 100
    const w5 = w50Score[n] / maxW50 * 100
    const fr = appear[n] / maxFreq * 100
    const gp = Math.min(gap[n], 80) / maxGap * 100
    const coN = coScore[n] / maxCo * 100
    const final = +(W_LASER * lD + W_CORNER * lC + W_TRANS * tr + W_W50 * w5 + W_GAP * gp + W_FREQ * fr + W_CO * coN).toFixed(1)

    results.push({
      number: n,
      score: final,
      laserDirect: laserDirect[n],
      laserCorner: laserCorner[n],
      directSeeds: [...new Set(laserBeamSources[n].direct.map(b => b.seed))],
      cornerSeeds: [...new Set(laserBeamSources[n].corner.map(b => b.seed))],
      transScore: +tr.toFixed(1),
      w50Score: +w5.toFixed(1),
      coScore: coScore[n],
      freq: +(appear[n] / N * 100).toFixed(1),
      gap: gap[n]
    })
  }

  results.sort((a, b) => b.score - a.score)
  const maxScore = results[0]?.score || 1
  results.forEach(r => {
    r.tier = r.score >= maxScore * 0.80 ? 'hot' : r.score >= maxScore * 0.60 ? 'warm' : 'cold'
  })

  return { results, seeds, nextDrawNum: N + 1, drawNum: N, generatedAt: new Date().toISOString() }
}

export function mmPredictMegaBall(draws) {
  if (!draws || draws.length < 2) return []
  const N = draws.length
  const mbFreq = {}, mbLastSeen = {}
  for (let n = 1; n <= MM_BALL_MAX; n++) { mbFreq[n] = 0; mbLastSeen[n] = -1 }
  draws.forEach((d, i) => {
    if (d.mb) { mbFreq[d.mb]++; mbLastSeen[d.mb] = i }
  })
  const mbGap = {}
  for (let n = 1; n <= MM_BALL_MAX; n++) mbGap[n] = N - 1 - mbLastSeen[n]

  const mbTrans = {}
  for (let i = 1; i < N; i++) {
    const from = draws[i - 1].mb
    const to = draws[i].mb
    if (from && to) {
      if (!mbTrans[from]) mbTrans[from] = {}
      mbTrans[from][to] = (mbTrans[from][to] || 0) + 1
    }
  }

  const lastMB = draws[N - 1].mb
  const scores = []
  for (let n = 1; n <= MM_BALL_MAX; n++) {
    const transScore = lastMB ? (mbTrans[lastMB]?.[n] || 0) * 3 : 0
    const gapBonus = mbGap[n] > 10 ? mbGap[n] * 1.5 : mbGap[n] > 5 ? mbGap[n] : 0
    const freqScore = mbFreq[n]
    scores.push({ number: n, score: +(transScore + gapBonus + freqScore).toFixed(1), gap: mbGap[n], freq: mbFreq[n] })
  }
  return scores.sort((a, b) => b.score - a.score)
}

export function mmAnalyzeOddEven(draws) {
  return pbAnalyzeOddEven(toPBShape(draws))
}

export function mmAnalyzeSums(draws) {
  return pbAnalyzeSums(draws)
}
