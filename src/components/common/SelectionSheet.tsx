import type { SquadPlayer } from '../../types/match'

export interface SelectionSheetProps {
  title: string
  options: SquadPlayer[]
  onSelect: (name: string) => void
}

export function SelectionSheet({ title, options, onSelect }: SelectionSheetProps) {
  return (
    <div className="scoring-backdrop">
      <section className="scoring-sheet selection-sheet">
        <div className="sheet-handle-pill">
          <span>{title}</span>
        </div>
        <div className="selection-list">
          {options.map((player) => (
            <button key={player.name} onClick={() => onSelect(player.name)}>
              <div className="selection-item-info">
                <strong>{player.name}</strong>
                <span>{player.hand}-hand</span>
              </div>
              <span className="selection-item-check">✓</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default SelectionSheet
