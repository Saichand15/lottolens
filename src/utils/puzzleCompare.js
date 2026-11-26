import { numberForms } from './puzzleLShapes.js'

const COLUMNS = 6
const STATUS_ORDER = { exact: 0, near: 1, output: 2 }
const PRIORITY_ORDER = { main: 0, digits: 1, count: 2 }

function areAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.column - b.column) === 1
}

export function analyzePuzzleComparisons(values, maxNumber = 45) {
  const cells = values.map((item, index) => ({
    number: item.number ?? item.n,
    count: item.seedCount,
    index,
    row: Math.floor(index / COLUMNS) + 1,
    column: index % COLUMNS + 1,
  }))
  const edges = []
  cells.forEach((cell, index) => {
    if (cell.column < COLUMNS && cells[index + 1]) {
      edges.push({ indices: [index, index + 1], shape: 'Horizontal' })
    }
    if (cells[index + COLUMNS]) edges.push({ indices: [index, index + COLUMNS], shape: 'Vertical' })
  })
  const triples = new Map()
  cells.forEach((pivot, index) => {
    const neighbors = [index - COLUMNS, index + COLUMNS]
    if (pivot.column > 1) neighbors.push(index - 1)
    if (pivot.column < COLUMNS) neighbors.push(index + 1)
    const valid = neighbors.filter(i => cells[i])
    for (let a = 0; a < valid.length; a++) {
      for (let b = a + 1; b < valid.length; b++) {
        const indices = [index, valid[a], valid[b]].sort((x, y) => x - y)
        const shape = cells[valid[a]].row === cells[valid[b]].row || cells[valid[a]].column === cells[valid[b]].column
          ? 'Straight' : 'L shape'
        triples.set(indices.join(','), { indices, shape })
      }
    }
  })
  const matches = []
  function addCountOutput(cell, countCell, shape) {
    if (!(countCell.count > 0)) return
    for (const form of numberForms(cell.number)) {
      const output = form.value + countCell.count
      if (output < 1 || output > maxNumber) continue
      const formula = `${form.label} + ${countCell.count}s [R${countCell.row}C${countCell.column}] = ${output}`
      matches.push({
        key: `count:${cell.index}:${countCell.index}:${formula}`,
        operands: [cell],
        target: null, output, formula, countCell, shape, status: 'output', difference: null, priority: 'count',
      })
    }
  }
  function calculate(indices, shape, targetIndex = null) {
    const operands = indices.map(index => cells[index])
    const target = targetIndex == null ? null : cells[targetIndex]
    const counts = [{ value: 0, label: '', cell: null }]
    operands.forEach(cell => {
      if (cell.count > 0) counts.push({ value: cell.count, label: ` + ${cell.count}s [R${cell.row}C${cell.column}]`, cell })
    })
    const targetForms = [{ value: target?.number, usesCount: false }]
    if (target?.count > 0) {
      targetForms.push({ value: target.number + target.count, usesCount: true })
    }
    const seen = new Set()
    for (const left of numberForms(operands[0].number)) {
      for (const right of numberForms(operands[1].number)) {
        const recipes = [
          { value: left.value + right.value, label: `${left.label} + ${right.label}` },
          { value: left.value - right.value, label: `${left.label} - ${right.label}` },
          { value: right.value - left.value, label: `${right.label} - ${left.label}` },
        ]
        for (const recipe of recipes) {
          for (const targetForm of targetForms) {
            const applicableCounts = targetForm.usesCount
              ? [...counts, { value: target.count, label: ` + ${target.count}s [R${target.row}C${target.column}]`, cell: target }]
              : counts
            for (const count of applicableCounts) {
              const output = recipe.value + count.value
              if (output < 1 || output > maxNumber) continue
              const difference = target ? targetForm.value - output : null
              if (target && Math.abs(difference) > 1) continue
              const formula = `${recipe.label}${count.label} = ${output}`
              const formulaKey = `${targetForm.usesCount}:${formula}`
              if (seen.has(formulaKey)) continue
              seen.add(formulaKey)
              const status = target ? difference === 0 ? 'exact' : 'near' : 'output'
              const targetFormula = targetForm.usesCount
                ? `${target.number} + ${target.count}s [R${target.row}C${target.column}] = ${targetForm.value}`
                : null
              matches.push({
                key: `${shape}:${indices.join(',')}:${targetIndex}:${formulaKey}`,
                operands, target, output, formula, countCell: count.cell, shape, status, difference,
                targetValue: targetForm.value, targetFormula, targetUsesCount: targetForm.usesCount,
                priority: count.cell || targetForm.usesCount ? 'count'
                  : left.value !== operands[0].number || right.value !== operands[1].number ? 'digits' : 'main',
              })
            }
          }
        }
      }
    }
  }
  cells.forEach(cell => addCountOutput(cell, cell, 'Cell + own count'))
  edges.forEach(({ indices, shape }) => {
    calculate(indices, shape)
    addCountOutput(cells[indices[0]], cells[indices[1]], shape)
    addCountOutput(cells[indices[1]], cells[indices[0]], shape)
  })
  triples.forEach(({ indices, shape }) => {
    indices.forEach(target => {
      const operands = indices.filter(index => index !== target)
      if (areAdjacent(cells[operands[0]], cells[operands[1]])) calculate(operands, shape, target)
    })
  })
  matches.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.output - b.output || a.key.localeCompare(b.key))
  const totals = new Map()
  matches.forEach(match => {
    const result = totals.get(match.output) || { number: match.output, exact: 0, near: 0, output: 0, priority: match.priority }
    result[match.status]++
    totals.set(match.output, result)
  })
  return { cells, matches, results: [...totals.values()].sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.exact - a.exact || b.near - a.near || a.number - b.number) }
}
