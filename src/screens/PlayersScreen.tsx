import { useState } from 'react'
import Icon from '../components/Icon'
import { Choice } from '../components/common/Choice'
import { FieldLabel } from '../components/common/FieldLabel'
import { Header } from '../components/common/Header'
import { validatePlayerName, validateSquadsReady } from '../utils/validation'
import type { Screen, SquadPlayer } from '../types/match'

export interface PlayersScreenProps {
  teamOne: string
  teamTwo: string
  overs: string
  venue: string
  competition: string
  tossWinner: 'host' | 'visitor' | null
  teamSize: string
  homePlayers: SquadPlayer[]
  visitorPlayers: SquadPlayer[]
  setHomePlayers: (value: SquadPlayer[] | ((items: SquadPlayer[]) => SquadPlayer[])) => void
  setVisitorPlayers: (value: SquadPlayer[] | ((items: SquadPlayer[]) => SquadPlayer[])) => void
  openingStriker: string
  openingNonStriker: string
  openingBowler: string
  setOpeningStriker: (value: string) => void
  setOpeningNonStriker: (value: string) => void
  setOpeningBowler: (value: string) => void
  beginInnings: () => void
  setScreen: (screen: Screen) => void
}

export function PlayersScreen(props: PlayersScreenProps) {
  const teamLimit = Number(props.teamSize) || 11

  const [playerTeam, setPlayerTeam] = useState<'home' | 'visitor' | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<{ team: 'home' | 'visitor'; index: number } | null>(null)
  const [playerDraft, setPlayerDraft] = useState('')
  const [playerHand, setPlayerHand] = useState<'Right' | 'Left'>('Right')
  const [playerMessage, setPlayerMessage] = useState('')

  function handleBeginInnings() {
    const homeTeam = props.teamOne || 'Host Team'
    const visitorTeam = props.teamTwo || 'Visitor Team'
    const ready = validateSquadsReady(
      props.homePlayers,
      props.visitorPlayers,
      teamLimit,
      homeTeam,
      visitorTeam
    )
    if (!ready.isValid) {
      setPlayerMessage(ready.error)
      return
    }
    setPlayerMessage('')
    props.beginInnings()
  }

  function openPlayerForm(team: 'home' | 'visitor', currentPlayer?: SquadPlayer, index?: number) {
    const players = team === 'home' ? props.homePlayers : props.visitorPlayers
    if (!currentPlayer && players.length >= teamLimit) return
    setPlayerTeam(team)
    setEditingPlayer(currentPlayer && index !== undefined ? { team, index } : null)
    setPlayerDraft(currentPlayer?.name ?? '')
    setPlayerHand(currentPlayer?.hand ?? 'Right')
    setPlayerMessage('')
  }

  function closePlayerForm() {
    setPlayerTeam(null)
    setEditingPlayer(null)
    setPlayerMessage('')
  }

  function addPlayer() {
    if (!playerTeam) return
    const currentSquad = playerTeam === 'home' ? props.homePlayers : props.visitorPlayers
    const opposingSquad = playerTeam === 'home' ? props.visitorPlayers : props.homePlayers

    const validation = validatePlayerName(
      playerDraft,
      currentSquad,
      opposingSquad,
      editingPlayer?.index
    )

    if (!validation.isValid) {
      setPlayerMessage(validation.error)
      return
    }

    const normalizedName = validation.normalized

    if (editingPlayer) {
      const updateTeam = editingPlayer.team === 'home' ? props.setHomePlayers : props.setVisitorPlayers
      updateTeam((items) =>
        items.map((player, index) =>
          index === editingPlayer.index ? { ...player, name: normalizedName, hand: playerHand } : player
        )
      )
    } else {
      if (currentSquad.length >= teamLimit) {
        setPlayerMessage('This team has reached its player limit.')
        return
      }
      const player = { name: normalizedName, hand: playerHand }
      if (playerTeam === 'home') props.setHomePlayers((items) => [...items, player])
      else props.setVisitorPlayers((items) => [...items, player])
    }
    setPlayerTeam(null)
    setEditingPlayer(null)
    setPlayerMessage('')
  }

  function removePlayer(team: 'home' | 'visitor', index: number) {
    const setPlayers = team === 'home' ? props.setHomePlayers : props.setVisitorPlayers
    const removedName = (team === 'home' ? props.homePlayers : props.visitorPlayers)[index]?.name
    setPlayers((items) => items.filter((_, itemIndex) => itemIndex !== index))

    if (removedName === props.openingStriker) props.setOpeningStriker('')
    if (removedName === props.openingNonStriker) props.setOpeningNonStriker('')
    if (removedName === props.openingBowler) props.setOpeningBowler('')
  }

  const renderTeam = (
    team: 'home' | 'visitor',
    name: string,
    players: SquadPlayer[]
  ) => (
    <>
      {team === 'home' && (props.venue || props.competition) && (
        <section className="advanced-summary players-match-details">
          {props.venue && (
            <div>
              <span>
                <Icon name="map-pin" size={16} />
                Venue
              </span>
              <strong>{props.venue}</strong>
            </div>
          )}
          {props.competition && (
            <div>
              <span>
                <Icon name="trophy" size={16} />
                Competition
              </span>
              <strong>{props.competition}</strong>
            </div>
          )}
        </section>
      )}
      <section className="squad-card">
        <div className="squad-heading">
          <div>
            <span className="section-kicker">
              {team === 'home' ? 'Home team' : 'Visitor team'}
            </span>
            <h3>{name || (team === 'home' ? 'Home Team' : 'Visitor Team')}</h3>
          </div>
          <span className="player-count">
            {players.length}/{teamLimit}
          </span>
        </div>
        <div className="player-list">
          {players.map((player, index) => (
            <div className="squad-player" key={`${player.name}-${index}`}>
              <span className="player-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <strong>{player.name}</strong>
              <em>
                <Icon name="hand" size={16} />
                {player.hand}-hand
              </em>
              <div className="player-actions">
                <button
                  className="player-action edit"
                  onClick={() => openPlayerForm(team, player, index)}
                  aria-label={`Edit ${player.name}`}
                >
                  <Icon
                    name="pencil"
                    size={16}
                    label={`Edit ${player.name}`}
                  />
                </button>
                <button
                  className="player-action remove"
                  onClick={() => removePlayer(team, index)}
                  aria-label={`Remove ${player.name}`}
                >
                  <Icon
                    name="trash-2"
                    size={16}
                    label={`Remove ${player.name}`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          className="add-player-button"
          onClick={() => openPlayerForm(team)}
          disabled={players.length >= teamLimit}
        >
          <Icon name="user-plus" size={17} /> Add player
        </button>
      </section>
    </>
  )

  return (
    <div className="app-shell players-screen">
      <Header title="Team players" onBack={() => props.setScreen('match-options')} />
      <main className="players-content">
        <div className="players-intro">
          <span className="home-kicker">
            {props.overs} overs · Match squad
          </span>
          <h2>Build both teams</h2>
          <p>
            Add up to {teamLimit} players per team. Batting hand helps identify
            each player.
          </p>
        </div>
        <div className="compact-summary">
          <span>
            {props.teamOne} vs {props.teamTwo}
          </span>
          <strong>
            {props.tossWinner
              ? `${
                  props.tossWinner === 'host' ? props.teamOne : props.teamTwo
                } won toss`
              : 'Toss not recorded'}
          </strong>
        </div>
        {renderTeam('home', props.teamOne, props.homePlayers)}
        {renderTeam('visitor', props.teamTwo, props.visitorPlayers)}
        {playerMessage && (
          <p className="form-message">{playerMessage}</p>
        )}
        <button
          className="primary-button wide-button"
          onClick={handleBeginInnings}
        >
          Start innings <span>→</span>
        </button>
      </main>
      {playerTeam && (
        <div className="modal-backdrop">
          <section className="player-modal">
            <button className="modal-close" onClick={closePlayerForm}>
              ×
            </button>
            <span className="section-kicker">
              {playerTeam === 'home' ? props.teamOne : props.teamTwo}
            </span>
            <h3>{editingPlayer ? 'Edit player' : 'Add player'}</h3>
            <label>
              Player name
              <input
                autoFocus
                placeholder="Enter player name"
                value={playerDraft}
                onChange={(e) => setPlayerDraft(e.target.value)}
              />
            </label>
            <FieldLabel text="Batting hand" />
            <div className="choice-card modal-choice">
              <Choice
                checked={playerHand === 'Right'}
                label="Right hand"
                onClick={() => setPlayerHand('Right')}
              />
              <Choice
                checked={playerHand === 'Left'}
                label="Left hand"
                onClick={() => setPlayerHand('Left')}
              />
            </div>
            <button
              className="primary-button wide-button"
              onClick={addPlayer}
            >
              Add player
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

export default PlayersScreen
