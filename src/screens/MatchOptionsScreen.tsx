import { useState } from 'react'
import { FieldLabel } from '../components/common/FieldLabel'
import { Header } from '../components/common/Header'
import type { Screen } from '../types/match'

export interface MatchOptionsScreenProps {
  teamOne: string
  teamTwo: string
  overs: string
  teamSize: string
  lastManBatting: boolean
  venue: string
  competition: string
  message: string
  setOvers: (value: string) => void
  setTeamSize: (value: string) => void
  setLastManBatting: (value: boolean) => void
  setVenue: (value: string) => void
  setCompetition: (value: string) => void
  startMatch: () => void
  setScreen: (screen: Screen) => void
}

export function MatchOptionsScreen(props: MatchOptionsScreenProps) {
  const [advanced, setAdvanced] = useState(Boolean(props.venue || props.competition))
  return (
    <div className="app-shell setup-shell match-options-screen">
      <Header title="Match settings" onBack={() => props.setScreen('setup')} />
      <main className="setup-content">
        <div className="home-intro">
          <span className="home-kicker">
            {props.teamOne || 'Host Team'} vs {props.teamTwo || 'Visitor Team'}
          </span>
          <h2>Set match rules</h2>
          <p>Choose the format before building your squads.</p>
        </div>
        <FieldLabel text="Players per team" />
        <div className="input-card single">
          <input
            aria-label="Players per team"
            type="number"
            min="2"
            max="25"
            value={props.teamSize}
            onChange={(e) => props.setTeamSize(e.target.value)}
          />
        </div>
        <label className="toggle-card">
          <input
            type="checkbox"
            checked={props.lastManBatting}
            onChange={(e) => props.setLastManBatting(e.target.checked)}
          />
          <span className="toggle-mark" />
          <span>
            <strong>Last man batting</strong>
            <small>Allow one batter to continue after the next wicket.</small>
          </span>
        </label>
        <div className="overs-heading">
          <FieldLabel text="Overs" />
          <output>{props.overs}</output>
        </div>
        <div className="overs-card">
          <input
            aria-label="Number of overs"
            type="range"
            min="1"
            max="50"
            value={props.overs}
            onChange={(e) => props.setOvers(e.target.value)}
          />
          <div className="range-labels">
            <span>1</span>
            <span>50 max</span>
          </div>
        </div>
        <button
          className="advanced-link"
          onClick={() => setAdvanced(!advanced)}
        >
          {advanced ? 'Hide advanced settings' : 'Advanced settings'}{' '}
          <span>{advanced ? '⌃' : '⌄'}</span>
        </button>
        {advanced && (
          <div className="input-card advanced-fields">
            <input
              placeholder="Match venue (optional)"
              value={props.venue}
              onChange={(e) => props.setVenue(e.target.value)}
            />
            <input
              placeholder="Competition (optional)"
              value={props.competition}
              onChange={(e) => props.setCompetition(e.target.value)}
            />
          </div>
        )}
        {props.message && <p className="form-message">{props.message}</p>}
        <div className="setup-actions">
          <button className="primary-button" onClick={props.startMatch}>
            Build squads <span>→</span>
          </button>
        </div>
      </main>
    </div>
  )
}

export default MatchOptionsScreen
