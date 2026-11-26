import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzePuzzleComparisons } from '../utils/puzzleCompare'

const statusLabel = { exact: 'Exact visible match', near: 'One-off visible match', output: 'Calculated output only' }
const priorityLabel = { main: 'Main numbers only', digits: 'Digit sums, no s count', count: 'Uses s count' }

function ComparisonPopup({ analysis, selection, onClose, label }) {
  const dialogRef = useRef(null)
  const [position, setPosition] = useState(0)
  const matches = analysis.matches.filter(match => selection.kind === 'result'
    ? match.output === selection.number
    : match.operands.some(cell => cell.index === selection.index) || match.target?.index === selection.index || match.countCell?.index === selection.index)
  const active = matches[position]
  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog ref={dialogRef} className="hg-compare-dialog" aria-labelledby="hg-compare-title"
      onCancel={event => { event.preventDefault(); onClose() }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
      <div className="hg-puzzle-toolbar">
        <h3 id="hg-compare-title">{selection.number} - {label}</h3>
        <button className="hg-history-input" onClick={onClose} autoFocus>Close</button>
      </div>
      {active ? (
        <>
          <p className={`hg-compare-status hg-compare-${active.status}`}>{statusLabel[active.status]} - {active.shape}</p>
          <p><strong>{priorityLabel[active.priority]}</strong></p>
          <code className="hg-compare-formula">{active.formula}</code>
          {active.targetFormula && <code className="hg-compare-formula">Target cell: {active.targetFormula}</code>}
          {(active.countCell || active.targetUsesCount) && <p>The s label contributes its seed count as a number. Parentheses show digit sums.</p>}
          <p>
            {active.operands.map(cell => `${cell.number} at R${cell.row}C${cell.column}`).join(' and ')}
            {active.target && `; visible result ${active.target.number} at R${active.target.row}C${active.target.column}`}
            {active.targetUsesCount && ` represents ${active.targetValue} with its own ${active.target.count}s`}
            {active.status === 'near' && `; ${active.targetUsesCount ? 'represented value' : 'visible cell'} is ${active.difference > 0 ? '+' : ''}${active.difference} from calculated ${active.output}, not an exact match.`}
          </p>
          <div className="hg-compare-navigation">
            <button disabled={!position} onClick={() => setPosition(position - 1)}>Previous</button>
            <select aria-label="Matching calculation" value={position} onChange={event => setPosition(Number(event.target.value))}>
              {matches.map((match, index) => (
                <option key={match.key} value={index}>{index + 1}. {priorityLabel[match.priority]} - {statusLabel[match.status]}: {match.formula}{match.targetFormula && `; target ${match.targetFormula}`}</option>
              ))}
            </select>
            <button disabled={position === matches.length - 1} onClick={() => setPosition(position + 1)}>Next</button>
          </div>
          <p>{position + 1} of {matches.length} calculations. Blue = operands; green = exact result; amber = one-off result. The count used is outlined.</p>
        </>
      ) : <p>No supported calculations involve this cell.</p>}
      <div className="hg-compare-grid" key={active?.key}>
        {analysis.cells.map(cell => (
          <div key={cell.index} className={`hg-compare-cell ${active?.operands.some(operand => operand.index === cell.index) || active?.countCell?.index === cell.index ? 'hg-compare-operand' : ''} ${active?.target?.index === cell.index ? `hg-compare-${active.status}` : ''}`}>
            <strong>{cell.number}</strong>
            <small className={active?.countCell?.index === cell.index || (active?.targetUsesCount && active.target.index === cell.index) ? 'hg-compare-count' : ''}>{cell.count}s</small>
            <small>R{cell.row}C{cell.column}</small>
          </div>
        ))}
      </div>
    </dialog>
  )
}

export default function PuzzleCompare({ grids }) {
  const [gridId, setGridId] = useState('capture')
  const [selection, setSelection] = useState(null)
  const grid = grids.find(item => item.id === gridId) || grids[0]
  const analysis = useMemo(() => analyzePuzzleComparisons(grid.values), [grid.values])
  useEffect(() => setSelection(null), [grid])
  return (
    <section className="hg-compare-panel" aria-label="Visual puzzle comparisons">
      <label className="hg-puzzle-draw-label">
        Values
        <select className="hg-history-input" value={grid.id} onChange={event => { setGridId(event.target.value); setSelection(null) }}>
          {grids.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <p className="hg-history-note">
        Click any cell or calculated output to see its neighboring calculations and pulsing participants.
        The two operands must share an immediate horizontal or vertical edge; the third cell touches at least one operand.
        Checks straight/L shapes without diagonal operand pairs, gaps, corner jumps or row wrapping.
        Uses whole numbers or digit sums, addition/subtraction, and optionally adds one operand's s count.
        Main numbers come first, digit sums second, and any calculation using an s count comes last, including when the target uses its count.
        A target cell is checked both as its number and as number + its own s count: 40 with 5s represents 45.
        Exact and +/-1 matches are separate. Outputs are limited to 1-45; counts are formula counts, not likelihood.
      </p>
      {!analysis.cells.length && <p>No captured values yet. Inspect gold cells in Touch, or choose an automatic grid above.</p>}
      <div className="hg-compare-grid">
        {analysis.cells.map(cell => (
          <button className="hg-compare-cell" key={cell.index}
            aria-label={`Compare ${cell.number} at row ${cell.row} column ${cell.column}`}
            onClick={() => setSelection({ kind: 'cell', number: cell.number, index: cell.index })}>
            <strong>{cell.number}</strong><small>{cell.count}s</small>
          </button>
        ))}
      </div>
      <h3>Calculated outputs</h3>
      <div className="hg-compare-results">
        {analysis.results.map(result => (
          <button className="hg-compare-cell" key={result.number} onClick={() => setSelection({ kind: 'result', number: result.number })}>
            <strong>{result.number}</strong>
            <small>Best: {priorityLabel[result.priority]}</small>
            <small>{result.exact} exact / {result.near} one-off</small>
            <small>{result.output} calculated-only</small>
          </button>
        ))}
      </div>
      {!!analysis.cells.length && !analysis.results.length && <p>No supported outputs in the 1-45 range.</p>}
      <p className="hg-history-note">Arithmetic references only. A one-off match is not an exact match or a prediction.</p>
      {selection && <ComparisonPopup key={`${selection.kind}:${selection.index ?? selection.number}`} analysis={analysis} selection={selection} label={grid.label} onClose={() => setSelection(null)} />}
    </section>
  )
}
