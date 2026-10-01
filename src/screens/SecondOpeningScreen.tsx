import { useState } from 'react'
import { Header } from '../components/common/Header'
import { SelectField } from '../components/common/SelectField'
import { SelectionSheet } from '../components/common/SelectionSheet'
import type { Screen, SquadPlayer } from '../types/match'

export interface SecondOpeningScreenProps {
  teamOne: string
  teamTwo: string
  overs: string
  firstBattingHome: boolean
  battingRoster: SquadPlayer[]
  bowlingRoster: SquadPlayer[]
  openingStriker: string
  openingNonStriker: string
  openingBowler: string
  setOpeningStriker: (value: string) => void
  setOpeningNonStriker: (value: string) => void
  setOpeningBowler: (value: string) => void
  beginSecondInnings: () => void
  playerMessage: string
  setScreen: (screen: Screen) => void
}

export function SecondOpeningScreen({
  teamOne,
  teamTwo,
  overs,
  firstBattingHome,
  battingRoster,
  bowlingRoster,
  openingStriker,
  openingNonStriker,
  openingBowler,
  setOpeningStriker,
  setOpeningNonStriker,
  setOpeningBowler,
  beginSecondInnings,
  playerMessage,
  setScreen,
}: SecondOpeningScreenProps) {
  const [selecting, setSelecting] = useState<'striker' | 'nonStriker' | 'bowler' | null>(null)
  const battingTeam = firstBattingHome ? teamTwo : teamOne
  const bowlingTeam = firstBattingHome ? teamOne : teamTwo

  const getLabel = (name: string, players: SquadPlayer[]) =>
    players.find((p) => p.name === name)
      ? `${name} · ${players.find((p) => p.name === name)?.hand}-hand`
      : ''

  return (
    <div className="app-shell second-opening-screen">
      <Header title="Second innings" onBack={() => setScreen('innings-break')} />
      <main className="opening-content">
        <div className="opening-intro">
          <span className="home-kicker">
            {battingTeam} chase · {overs} overs
          </span>
          <h2>Choose the opening pair</h2>
          <p>
            {battingTeam} needs {battingRoster.length ? 'their target' : 'a target'} while{' '}
            {bowlingTeam} starts with this bowler.
          </p>
        </div>
        <section className="opening-panel">
          <div className="sheet-title">
            Opening batters <span>{battingTeam}</span>
          </div>
          <SelectField
            label="Striker"
            value={getLabel(openingStriker, battingRoster)}
            onClick={() => setSelecting('striker')}
            placeholder="Select striker"
          />
          <SelectField
            label="Non-striker"
            value={getLabel(openingNonStriker, battingRoster)}
            onClick={() => setSelecting('nonStriker')}
            placeholder="Select non-striker"
          />
        </section>
        <section className="opening-panel">
          <div className="sheet-title">
            Opening bowler <span>{bowlingTeam}</span>
          </div>
          <SelectField
            label="Bowler"
            value={getLabel(openingBowler, bowlingRoster)}
            onClick={() => setSelecting('bowler')}
            placeholder="Select opening bowler"
          />
        </section>
        {playerMessage && <p className="form-message">{playerMessage}</p>}
        <button className="primary-button wide-button" onClick={beginSecondInnings}>
          Start chase <span>→</span>
        </button>
      </main>
      {selecting === 'striker' && (
        <SelectionSheet
          title="Select striker"
          options={battingRoster}
          onSelect={(name) => {
            setOpeningStriker(name)
            setSelecting(null)
          }}
        />
      )}
      {selecting === 'nonStriker' && (
        <SelectionSheet
          title="Select non-striker"
          options={battingRoster}
          onSelect={(name) => {
            setOpeningNonStriker(name)
            setSelecting(null)
          }}
        />
      )}
      {selecting === 'bowler' && (
        <SelectionSheet
          title="Select bowler"
          options={bowlingRoster}
          onSelect={(name) => {
            setOpeningBowler(name)
            setSelecting(null)
          }}
        />
      )}
    </div>
  )
}

export default SecondOpeningScreen
