const COLUMNS = 6

export function numberForms(number) {
  const digits = String(number).split('').map(Number)
  const sum = digits.reduce((total, digit) => total + digit, 0)
  const forms = [{ value: number, label: String(number) }]
  if (sum !== number) forms.push({ value: sum, label: `(${digits.join(' + ')})` })
  return forms
}

function matchingFormulas(a, b, target) {
  const formulas = new Set()
  for (const left of numberForms(a)) {
    for (const right of numberForms(b)) {
      if (left.value + right.value === target) {
        formulas.add(`${left.label} + ${right.label} = ${target}`)
      }
      if (left.value - right.value === target) {
        formulas.add(`${left.label} - ${right.label} = ${target}`)
      }
      if (right.value - left.value === target) {
        formulas.add(`${right.label} - ${left.label} = ${target}`)
      }
    }
  }
  return [...formulas]
}

export function analyzePuzzleLShapes(boxes) {
  const results = new Map()
  for (const { seed, values } of boxes) {
    const cells = values.map(({ n }, index) => ({
      number: n,
      row: Math.floor(index / COLUMNS) + 1,
      column: index % COLUMNS + 1,
    }))
    cells.forEach((pivot, index) => {
      for (const vertical of [-1, 1]) {
        for (const horizontal of [-1, 1]) {
          const column = pivot.column + horizontal
          if (column < 1 || column > COLUMNS) continue
          const alongRow = cells[index + horizontal]
          const alongColumn = cells[index + vertical * COLUMNS]
          if (!alongRow || !alongColumn) continue

          // Every adjacent L has one right-angle pivot; any of its cells can be the result.
          const shape = [pivot, alongRow, alongColumn]
          shape.forEach((target, targetIndex) => {
            const operands = shape.filter((_, i) => i !== targetIndex)
            const formulas = matchingFormulas(operands[0].number, operands[1].number, target.number)
            if (!formulas.length) return
            const pairKey = operands.map(cell => cell.number).sort((a, b) => a - b).join(',')
            if (!results.has(target.number)) {
              results.set(target.number, { number: target.number, pairs: new Set(), seeds: new Set(), matches: [] })
            }
            const result = results.get(target.number)
            result.pairs.add(pairKey)
            result.seeds.add(seed)
            result.matches.push({
              seed,
              target,
              operands,
              formulas,
              key: `${seed}:${index}:${vertical}:${horizontal}:${targetIndex}`,
            })
          })
        }
      }
    })
  }
  return [...results.values()]
    .map(({ number, pairs, seeds, matches }) => ({
      number,
      pairCount: pairs.size,
      seedCount: seeds.size,
      matchCount: matches.length,
      strong: pairs.size >= 2,
      matches,
    }))
    .sort((a, b) => b.pairCount - a.pairCount || b.seedCount - a.seedCount || b.matchCount - a.matchCount || a.number - b.number)
}
