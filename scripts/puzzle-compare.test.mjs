import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePuzzleComparisons } from '../src/utils/puzzleCompare.js'

const image = [13, 10, 11, 9, 17, 18, 21, 19, 25, 29, 33, 2, 40, 44, 1, 42, 39, 24]
const values = image.map(number => ({ number, seedCount: number === 24 ? 4 : 5 }))
const find = (analysis, formula, predicate = () => true) => analysis.matches.find(match => match.formula === formula && predicate(match))

test('reproduces supplied image calculations with count coordinates and honest near matches', () => {
  const analysis = analyzePuzzleComparisons(values)
  assert.ok(find(analysis, '40 + 5s [R3C1] = 45', match => match.countCell.index === 12))
  assert.ok(find(analysis, '44 + 1 = 45', match => match.shape === 'Horizontal' && match.status === 'output'))
  assert.ok(find(analysis, '44 - 19 = 25', match => match.status === 'exact' && match.target.index === 8))
  assert.ok(find(analysis, '11 + 9 + 5s [R1C3] = 25', match => match.status === 'exact' && match.target.index === 8))
  assert.ok(!find(analysis, '13 + (4 + 0) + 5s [R1C1] = 22'))
  assert.ok(!find(analysis, '21 - 2 = 19'))
  assert.ok(!find(analysis, '40 - 2 = 38'))
  assert.ok(find(analysis, '18 + 4s [R3C6] = 22') === undefined)
  assert.ok(find(analysis, '2 + 4s [R3C6] = 6'))
  assert.ok(analysis.matches.every(match => match.output >= 1 && match.output <= 45))
})

test('keeps full forms and digit sums, source counts, exact and one-off labels distinct', () => {
  const analysis = analyzePuzzleComparisons([{ n: 40, seedCount: 5 }, { n: 4, seedCount: 2 }, { n: 45, seedCount: 1 }])
  assert.ok(find(analysis, '40 + 4 = 44', match => match.status === 'near' && match.difference === 1))
  assert.ok(!find(analysis, '40 + 4 + 1s [R1C3] = 45', match => !match.targetUsesCount))
  assert.ok(find(analysis, '(4 + 0) + 4 + 2s [R1C2] = 10'))
  assert.ok(analysis.matches.filter(match => match.status === 'exact').every(match => match.output === match.targetValue))
})

test('compares neighboring pair plus count with the target cell number plus its own count', () => {
  const analysis = analyzePuzzleComparisons(values)
  const match = find(analysis, '21 + 19 + 5s [R3C1] = 45',
    match => match.status === 'exact' && match.target.index === 12)
  assert.ok(match)
  assert.deepEqual(match.operands.map(cell => cell.index), [6, 7])
  assert.equal(match.countCell.index, 12)
  assert.equal(match.target.number, 40)
  assert.equal(match.targetValue, 45)
  assert.equal(match.targetFormula, '40 + 5s [R3C1] = 45')
  assert.equal(match.targetUsesCount, true)
  assert.equal(match.difference, 0)
  assert.ok(find(analysis, '21 + 19 + 5s [R2C1] = 45',
    match => match.status === 'exact' && match.target.index === 12 && match.targetUsesCount))
  assert.ok(find(analysis, '21 + 19 = 40',
    match => match.status === 'exact' && match.target.index === 12 && !match.targetUsesCount))
  assert.ok(find(analysis, '21 + 19 + 5s [R2C1] = 45',
    match => match.status === 'near' && match.target.number === 44 && !match.targetUsesCount))

  const changed = values.map(item => ({ ...item, seedCount: item.number === 40 ? 4 : item.seedCount }))
  const near = find(analyzePuzzleComparisons(changed), '21 + 19 + 5s [R2C1] = 45',
    match => match.target.index === 12 && match.targetUsesCount)
  assert.equal(near.status, 'near')
  assert.equal(near.targetValue, 44)
  assert.equal(near.difference, -1)
  const absentCount = values.map(item => ({ ...item, seedCount: item.number === 40 ? 0 : item.seedCount }))
  assert.ok(!analyzePuzzleComparisons(absentCount).matches.some(match => match.target?.index === 12 && match.targetUsesCount))
})

test('rejects diagonal 9/25 operands but keeps touching 11/9 and 11/25 pairs', () => {
  const analysis = analyzePuzzleComparisons(values)
  const pairMatches = (a, b) => analysis.matches.filter(match =>
    match.operands.length === 2 && match.operands.some(cell => cell.index === a) && match.operands.some(cell => cell.index === b))
  assert.deepEqual(pairMatches(3, 8), [])
  assert.ok(pairMatches(2, 3).some(match => match.target?.index === 8 && match.status === 'exact'))
  assert.ok(pairMatches(2, 8).some(match => match.target?.index === 3))
})

test('prioritizes whole numbers, then digit sums, and only then any count dependency', () => {
  const analysis = analyzePuzzleComparisons(values)
  const main = find(analysis, '21 + 19 = 40', match => match.target?.index === 12)
  const digits = find(analysis, '44 - (1 + 9) = 34')
  const targetOnly = analyzePuzzleComparisons([{ n: 10, seedCount: 2 }, { n: 5, seedCount: 2 }, { n: 14, seedCount: 1 }])
  const targetCount = find(targetOnly, '10 + 5 = 15', match => match.target?.number === 14 && match.targetUsesCount)
  const count = find(analysis, '(2 + 9) - (2 + 5) + 5s [R2C3] = 9', match => match.target?.number === 9)
  assert.equal(main?.priority, 'main')
  assert.equal(digits?.priority, 'digits')
  assert.equal(targetCount?.priority, 'count')
  assert.equal(count?.priority, 'count')
  const priority = { main: 0, digits: 1, count: 2 }
  for (const list of [analysis.matches, analysis.results]) {
    assert.ok(list.every((item, index) => !index || priority[list[index - 1].priority] <= priority[item.priority]))
  }
  const pair25And29 = analysis.matches.filter(match =>
    match.operands.length === 2 && match.operands[0].number === 25 && match.operands[1].number === 29 && match.output === 9)
  assert.ok(pair25And29.length)
  assert.ok(pair25And29.every(match => match.priority === 'count'))
  assert.ok(analysis.results.every(result =>
    result.priority === analysis.matches.find(match => match.output === result.number).priority))
})

test('does not wrap triples, bridge gaps, mutate ordering or invent targets', () => {
  const input = Array.from({ length: 8 }, (_, index) => ({ n: index + 1, seedCount: 1 }))
  const before = structuredClone(input)
  const analysis = analyzePuzzleComparisons(input)
  assert.deepEqual(input, before)
  const adjacent = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.column - b.column) === 1
  for (const match of [...analysis.matches, ...analyzePuzzleComparisons(values).matches]) {
    if (match.operands.length === 2) assert.ok(adjacent(...match.operands), match.formula)
    if (match.target) assert.ok(match.operands.some(cell => adjacent(cell, match.target)), match.formula)
    if (!match.target && match.countCell) {
      assert.ok(match.countCell.index === match.operands[0].index || adjacent(match.operands[0], match.countCell))
    }
  }
  assert.equal(new Set(analysis.matches.map(match => match.key)).size, analysis.matches.length)
  assert.deepEqual(analyzePuzzleComparisons([]), { cells: [], matches: [], results: [] })
  assert.deepEqual(analyzePuzzleComparisons(input), analysis)
})
