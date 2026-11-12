import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePuzzleLShapes } from '../src/utils/puzzleLShapes.js'
import { buildPuzzleBoxes } from '../src/utils/puzzleCapture.js'
import { buildAsOfPuzzleReference, backtestPuzzleHistory } from './backtest-puzzle-l-shapes.mjs'

const box = (seed, numbers) => ({ seed, values: numbers.map(n => ({ n })) })
const resultFor = (number, boxes) => analyzePuzzleLShapes(boxes).find(result => result.number === number)

test('matches the supplied 34, 43, 36 L with exact cell coordinates', () => {
  const numbers = [13, 15, 14, 10, 28, 30, 20, 22, 6, 23, 5, 34, 35, 4, 37, 40, 36, 43, 39, 2]
  const before = [...numbers]
  const result = resultFor(36, [box(30, numbers)])
  const match = result.matches.find(match => match.formulas.includes('43 - (3 + 4) = 36'))
  assert.deepEqual(match.target, { number: 36, row: 3, column: 5 })
  assert.deepEqual(match.operands.map(cell => cell.number).sort((a, b) => a - b), [34, 43])
  assert.deepEqual(numbers, before)
})

test('finds all eight rotated/reflected orientations, including an incomplete last row', () => {
  for (const row of [0, 1]) {
    for (const column of [0, 1]) {
      for (const swap of [false, true]) {
        const numbers = Array(8).fill(999)
        numbers[row * 6 + column] = 43
        numbers[(1 - row) * 6 + column] = swap ? 36 : 34
        numbers[row * 6 + 1 - column] = swap ? 34 : 36
        const result = resultFor(36, [box(1, numbers)])
        assert.ok(result?.matches.some(match => match.formulas.includes('43 - (3 + 4) = 36')))
      }
    }
  }
})

test('supports whole numbers, either digit sum, both digit sums and both subtraction orders', () => {
  for (const [a, b, target, expression] of [
    [34, 2, 36, '34 + 2 = 36'],
    [43, 7, 36, '43 - 7 = 36'],
    [7, 43, 36, '43 - 7 = 36'],
    [43, 29, 36, '(4 + 3) + 29 = 36'],
    [29, 43, 36, '29 + (4 + 3) = 36'],
    [43, 34, 14, '(4 + 3) + (3 + 4) = 14'],
  ]) {
    const result = resultFor(target, [box(1, [target, a, 999, 999, 999, 999, b])])
    assert.ok(result?.matches.some(match => match.formulas.includes(expression)), expression)
  }
})

test('does not treat row wrapping, straight lines, gapped cells or absent targets as L matches', () => {
  const fixtures = [
    [43, 34, 36],
    [43, 999, 36, 999, 999, 999, 999, 999, 999, 999, 999, 999, 34],
    [999, 999, 999, 999, 999, 43, 36, 999, 999, 999, 999, 34],
    [43, 35, 999, 999, 999, 999, 34],
  ]
  for (const numbers of fixtures) {
    const result = resultFor(36, [box(1, numbers)])
    assert.ok(!result?.matches.some(match => match.formulas.includes('43 - (3 + 4) = 36')))
  }
})

test('counts unique numeric pairs, not repeated formulas or the same pair in multiple seed boxes', () => {
  const first = box(1, [43, 36, 999, 999, 999, 999, 34])
  const duplicate = box(2, [43, 36, 999, 999, 999, 999, 34])
  const singlePair = resultFor(36, [first, duplicate])
  assert.equal(singlePair.pairCount, 1)
  assert.equal(singlePair.seedCount, 2)
  assert.equal(singlePair.matchCount, 2)
  assert.equal(singlePair.strong, false)
  const strong = resultFor(36, [first, duplicate, box(3, [30, 36, 999, 999, 999, 999, 6])])
  assert.equal(strong.pairCount, 2)
  assert.equal(strong.seedCount, 3)
  assert.equal(strong.strong, true)
  for (const match of strong.matches) {
    assert.equal(new Set(match.formulas).size, match.formulas.length)
  }
  const twoFormulas = resultFor(14, [box(1, [23, 14, 999, 999, 999, 999, 9])])
  assert.equal(twoFormulas.pairCount, 1)
  assert.equal(twoFormulas.matchCount, 1)
  assert.equal(twoFormulas.strong, false)
  assert.deepEqual(new Set(twoFormulas.matches[0].formulas), new Set(['23 - 9 = 14', '(2 + 3) + 9 = 14']))
  assert.deepEqual(analyzePuzzleLShapes([box(1, [43, 34]), box(2, [36])]), [])
})

test('agrees with an exhaustive three-cell oracle without changing the displayed order', () => {
  const numbers = [13, 15, 14, 10, 28, 30, 20, 22, 6, 23, 5, 34, 35, 4, 37, 40, 36, 43, 39, 2]
  const source = box(30, numbers)
  const original = structuredClone(source)
  const expected = []
  const forms = n => [n, [...String(n)].reduce((sum, digit) => sum + Number(digit), 0)]
  for (let a = 0; a < numbers.length; a++) {
    for (let b = a + 1; b < numbers.length; b++) {
      for (let c = b + 1; c < numbers.length; c++) {
        const indices = [a, b, c]
        const rows = indices.map(i => Math.floor(i / 6))
        const columns = indices.map(i => i % 6)
        if (Math.max(...rows) - Math.min(...rows) !== 1 || Math.max(...columns) - Math.min(...columns) !== 1) continue
        for (const target of indices) {
          const pair = indices.filter(i => i !== target)
          const matches = forms(numbers[pair[0]]).some(x => forms(numbers[pair[1]]).some(y =>
            [x + y, x - y, y - x].includes(numbers[target])
          ))
          if (matches) expected.push(`${target}:${pair.join(',')}`)
        }
      }
    }
  }
  const actual = analyzePuzzleLShapes([source]).flatMap(result => result.matches.map(match => {
    const index = cell => (cell.row - 1) * 6 + cell.column - 1
    return `${index(match.target)}:${match.operands.map(index).sort((a, b) => a - b).join(',')}`
  }))
  assert.deepEqual(actual.sort(), expected.sort())
  assert.equal(new Set(actual).size, actual.length)
  assert.deepEqual(source, original)
})

test('handles empty boxes and ranks strongest results first deterministically', () => {
  assert.deepEqual(analyzePuzzleLShapes([]), [])
  assert.deepEqual(analyzePuzzleLShapes([box(1, [])]), [])
  const boxes = [box(1, [43, 36, 999, 999, 999, 999, 34]), box(2, [30, 36, 999, 999, 999, 999, 6])]
  const results = analyzePuzzleLShapes(boxes)
  assert.deepEqual(results, analyzePuzzleLShapes(boxes))
  assert.ok(results.every((result, index) => !index || results[index - 1].pairCount >= result.pairCount))
})

test('as-of predictions use the same boxes as the UI at that historical cutoff', () => {
  const history = Array.from({ length: 105 }, (_, i) => Array.from({ length: 5 }, (_, j) => (i * 7 + j * 8) % 45 + 1).sort((a, b) => a - b))
  const window = history.slice(-100)
  const boxes = buildPuzzleBoxes(window, window.length - 1, { NE: true, NW: true, SE: true, SW: true }, history.slice(-5))
  const expected = analyzePuzzleLShapes(boxes).filter(result => result.number >= 1 && result.number <= 45)
  assert.deepEqual(buildAsOfPuzzleReference(history), expected)
})

test('changing the next draw cannot change its predicted candidates', () => {
  const history = Array.from({ length: 100 }, (_, i) => Array.from({ length: 5 }, (_, j) => (i * 7 + j * 8) % 45 + 1))
  const first = backtestPuzzleHistory([...history, [1, 2, 3, 4, 5]], 101, 1)
  const second = backtestPuzzleHistory([...history, [41, 42, 43, 44, 45]], 101, 1)
  for (const method of Object.keys(first.rows[0].methods)) {
    assert.deepEqual(first.rows[0].methods[method].candidates, second.rows[0].methods[method].candidates)
  }
  assert.equal(first.rows[0].sourceDraw, 100)
  assert.equal(first.rows[0].nextDraw, 101)
  assert.throws(() => backtestPuzzleHistory(history, 101, 1), /End draw/)
  assert.throws(() => backtestPuzzleHistory([...history, [1, 2, 3, 4, 5]], 101, 0), /Count/)
})
