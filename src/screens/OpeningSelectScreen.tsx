import { useState } from 'react'
import { Header } from '../components/common/Header'
import { SelectField } from '../components/common/SelectField'
import { SelectionSheet } from '../components/common/SelectionSheet'
import type { Screen, SquadPlayer } from '../types/match'

export interface OpeningSelectScreenProps {
  teamOne: string
  teamTwo: string
  overs: string
  tossWinner: 'host' | 'visitor' | null
  decision: 'bat' | 'bowl'
  homePlayers: SquadPlayer[]
  visitorPlayers: SquadPlayer[]
  openingStriker: string
  openingNonStriker: string
  openingBowler: string
  setOpeningStriker: (value: string) => void
  setOpeningNonStriker: (value: string) => void
  setOpeningBowler: (value: string) => void
  beginInnings: () => void
  playerMessage: string
  setScreen: (screen: Screen) => void
}

export function OpeningSelectScreen(props: OpeningSelectScreenProps) {
  const [selecting, setSelecting] = useState<'striker' | 'nonStriker' | 'bowler' | null>(null)
  const battingIsHome =
    (props.tossWinner === 'host' && props.decision === 'bat') ||
    (props.tossWinner === 'visitor' && props.decision === 'bowl')
  const battingPlayers = battingIsHome ? props.homePlayers : props.visitorPlayers
  const bowlingPlayers = battingIsHome ? props.visitorPlayers : props.homePlayers
  const battingTeam = battingIsHome ? props.teamOne : props.teamTwo
  const bowlingTeam = battingIsHome ? props.teamTwo : props.teamOne

  const getLabel = (name: string, players: SquadPlayer[]) =>
    players.find((p) => p.name === name)
      ? `${name} · ${players.find((p) => p.name === name)?.hand}-hand`
      : ''

  return (
    <div className="app-shell opening-select-screen">
      <Header title="Opening lineup" onBack={() => props.setScreen('roster')} />
      <main className="opening-content">
        <div className="opening-intro">
          <span className="home-kicker">
            {battingTeam} batting first · {props.overs} overs
          </span>
          <h2>Choose the opening pair</h2>
          <p>Select the two batters and the bowler for the first delivery.</p>
        </div>
        <section className="opening-selects">
          <div className="sheet-title">
            Opening batters <span>{battingTeam}</span>
          </div>
          <SelectField
            label="Striker"
            value={getLabel(props.openingStriker, battingPlayers)}
            onClick={() => setSelecting('striker')}
            placeholder="Select striker"
          />
          <SelectField
            label="Non-striker"
            value={getLabel(props.openingNonStriker, battingPlayers)}
            onClick={() => setSelecting('nonStriker')}
            placeholder="Select non-striker"
          />
        </section>
        <section className="opening-selects">
          <div className="sheet-title">
            Opening bowler <span>{bowlingTeam}</span>
          </div>
          <SelectField
            label="Bowler"
            value={getLabel(props.openingBowler, bowlingPlayers)}
            onClick={() => setSelecting('bowler')}
            placeholder="Select opening bowler"
          />
        </section>
        {props.playerMessage && <p className="form-message">{props.playerMessage}</p>}
        <button className="primary-button wide-button" onClick={props.beginInnings}>
          Start innings <span>→</span>
        </button>
      </main>
      {selecting === 'striker' && (
        <SelectionSheet
          title="Select striker"
          options={battingPlayers}
          onSelect={(name) => {
            props.setOpeningStriker(name)
            setSelecting(null)
          }}
        />
      )}
      {selecting === 'nonStriker' && (
        <SelectionSheet
          title="Select non-striker"
          options={battingPlayers}
          onSelect={(name) => {
            props.setOpeningNonStriker(name)
            setSelecting(null)
          }}
        />
      )}
      {selecting === 'bowler' && (
        <SelectionSheet
          title="Select bowler"
          options={bowlingPlayers}
          onSelect={(name) => {
            props.setOpeningBowler(name)
            setSelecting(null)
          }}
        />
      )}
    </div>
  )
}

export default OpeningSelectScreen
