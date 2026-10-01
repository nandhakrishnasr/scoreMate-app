import type { Player } from '../../types/match'

export interface PlayerRowProps {
  player: Player
  active?: boolean
}

export function PlayerRow({ player, active }: PlayerRowProps) {
  const strikeRate = player.balls
    ? ((player.runs / player.balls) * 100).toFixed(2)
    : '0.00'
  return (
    <div className={`player-row ${active ? 'active-player' : ''}`}>
      <span>
        {player.name}
        {active && <b>*</b>}
      </span>
      <span>{player.runs}</span>
      <span>{player.balls}</span>
      <span>{player.fours}</span>
      <span>{player.sixes}</span>
      <span>{strikeRate}</span>
    </div>
  )
}

export default PlayerRow
