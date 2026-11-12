import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { buildPuzzleBoxes } from '../src/utils/puzzleCapture.js'
import { analyzePuzzleLShapes } from '../src/utils/puzzleLShapes.js'

const WINDOW = 100
const DIRECTIONS = { NE: true, NW: true, SE: true, SW: true }

export function buildAsOfPuzzleReference(history) {
  if (!history.length) throw new Error('At least one completed draw is required.')
  const window = history.slice(-WINDOW)
  const boxes = buildPuzzleBoxes(window, window.length - 1, DIRECTIONS, history.slice(-5))
  return analyzePuzzleLShapes(boxes).filter(result => result.number >= 1 && result.number <= 45)
}

function summarize(rows) {
  return {
    draws: rows.length,
    from: rows[0].nextDraw,
    through: rows.at(-1).nextDraw,
    methods: Object.keys(rows[0].methods).map(method => {
      const candidates = rows.reduce((sum, row) => sum + row.methods[method].candidates.length, 0)
      const hits = rows.reduce((sum, row) => sum + row.methods[method].hits.length, 0)
      const histogram = Array(6).fill(0)
      rows.forEach(row => histogram[row.methods[method].hits.length]++)
      return {
        method,
        averageCandidates: +(candidates / rows.length).toFixed(2),
        hits,
        expectedHitsByChance: +(candidates * 5 / 45).toFixed(2),
        averageHits: +(hits / rows.length).toFixed(3),
        drawsWithZeroThroughFiveHits: histogram,
      }
    }),
  }
}

export function backtestPuzzleHistory(draws, end, count) {
  if (!Number.isInteger(end) || end > draws.length || end <= WINDOW) {
    throw new Error(`End draw must be an integer between ${WINDOW + 1} and ${draws.length}.`)
  }
  if (!Number.isInteger(count) || count < 1) throw new Error('Count must be a positive integer.')
  if (draws.some(draw => !Array.isArray(draw) || draw.length !== 5 || new Set(draw).size !== 5 ||
    draw.some(n => !Number.isInteger(n) || n < 1 || n > 45))) {
    throw new Error('Every draw must contain five distinct integers from 1 to 45.')
  }

  const rows = []
  for (let nextIndex = Math.max(WINDOW, end - count); nextIndex < end; nextIndex++) {
    // Neither beam geometry nor the recent-draw filter can see the next draw.
    const history = draws.slice(0, nextIndex)
    const results = buildAsOfPuzzleReference(history)
    const frequencies = Array.from({ length: 45 }, (_, i) => ({ number: i + 1, count: 0 }))
    history.slice(-WINDOW).forEach(draw => draw.forEach(n => frequencies[n - 1].count++))
    frequencies.sort((a, b) => b.count - a.count || a.number - b.number)
    const candidates = {
      lShapeTop5: results.slice(0, 5).map(result => result.number),
      lShapeTop10: results.slice(0, 10).map(result => result.number),
      allStrong: results.filter(result => result.strong).map(result => result.number),
      frequencyTop5: frequencies.slice(0, 5).map(result => result.number),
    }
    const actual = draws[nextIndex]
    const methods = Object.fromEntries(Object.entries(candidates).map(([method, numbers]) => [
      method, { candidates: numbers, hits: numbers.filter(n => actual.includes(n)) },
    ]))
    rows.push({
      sourceDraw: nextIndex,
      nextDraw: nextIndex + 1,
      actual,
      methods,
      matchedEvidence: results.flatMap((result, index) => actual.includes(result.number) ? [{
        number: result.number,
        rank: index + 1,
        distinctPairs: result.pairCount,
        example: result.matches[0],
      }] : []),
    })
  }
  const split = Math.floor(rows.length / 2)
  return {
    rules: {
      window: WINDOW,
      directions: DIRECTIONS,
      strongThreshold: 2,
      target: 'The immediately following draw, never included in the calculation.',
      chanceBaseline: 'For a fair 5/45 draw, a k-number candidate set has 5*k/45 expected hits.',
      tuning: 'Fixed current UI rules; no optimization against these outcomes.',
    },
    summary: summarize(rows),
    earlierHalf: split ? summarize(rows.slice(0, split)) : null,
    laterHalf: split ? summarize(rows.slice(split)) : null,
    rows,
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    file: { type: 'string', default: fileURLToPath(new URL('../public/all_draws.json', import.meta.url)) },
    end: { type: 'string' },
    count: { type: 'string', default: '200' },
    output: { type: 'string' },
  } })
  const draws = JSON.parse(await readFile(values.file, 'utf8'))
  const keys = draws.map(draw => [...draw].sort((a, b) => a - b).join(','))
  let repeatedTail = 0
  for (let length = 2; length <= Math.floor(keys.length / 2); length++) {
    if (keys.slice(-length).every((key, index) => key === keys[keys.length - length * 2 + index])) {
      repeatedTail = length
      break
    }
  }
  const end = values.end === undefined ? draws.length - repeatedTail : Number(values.end)
  const audit = { loadedDraws: draws.length, consecutiveRepeatedTail: repeatedTail, evaluatedThrough: end }
  if (repeatedTail) {
    console.warn(`WARNING: the last ${repeatedTail} draws exactly repeat the preceding block. Default evaluation excludes that tail; the source file is unchanged.`)
  }
  const report = { audit, ...backtestPuzzleHistory(draws, end, Number(values.count)) }
  if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({
    audit,
    summary: report.summary,
    earlierHalf: report.earlierHalf,
    laterHalf: report.laterHalf,
    recentComparisons: report.rows.slice(-5),
    example36: report.rows.findLast(row => row.matchedEvidence.some(match => match.number === 36)),
  }, null, 2))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
