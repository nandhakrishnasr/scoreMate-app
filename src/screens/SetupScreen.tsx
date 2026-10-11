import { useState } from 'react'
import { BottomNav } from '../components/common/BottomNav'
import { Choice } from '../components/common/Choice'
import { FieldLabel } from '../components/common/FieldLabel'
import { Header } from '../components/common/Header'
import type { Screen } from '../types/match'
import coinHeads from '../assets/coin-heads.png'
import coinTails from '../assets/coin-tails.png'

export interface SetupScreenProps {
  teamOne: string
  teamTwo: string
  setTeamOne: (value: string) => void
  setTeamTwo: (value: string) => void
  tossCaller: 'host' | 'visitor' | null
  setTossCaller: (value: 'host' | 'visitor' | null) => void
  tossCall: 'Heads' | 'Tails' | null
  setTossCall: (value: 'Heads' | 'Tails' | null) => void
  tossWinner: 'host' | 'visitor' | null
  setTossWinner: (value: 'host' | 'visitor' | null) => void
  decision: 'bat' | 'bowl'
  setDecision: (value: 'bat' | 'bowl') => void
  message: string
  startMatch: () => void
  setScreen: (screen: Screen) => void
}

export function SetupScreen(props: SetupScreenProps) {
  const [coinResult, setCoinResult] = useState<'Heads' | 'Tails' | null>(null)
  const [coinFlipping, setCoinFlipping] = useState(false)
  const [targetFace, setTargetFace] = useState<'Heads' | 'Tails'>('Heads')
  const [flipCount, setFlipCount] = useState(0)
  const [tossMessage, setTossMessage] = useState('')

  function flipCoin() {
    if (coinFlipping) return
    if (!props.tossCaller || !props.tossCall) {
      setTossMessage('Choose the caller and their Heads or Tails call first.')
      return
    }
    setTossMessage('')
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails'
    setTargetFace(result)
    setCoinFlipping(true)
    setFlipCount((prev) => prev + 1)
    window.setTimeout(() => {
      setCoinResult(result)
      props.setTossWinner(
        result === props.tossCall
          ? props.tossCaller
          : props.tossCaller === 'host'
            ? 'visitor'
            : 'host',
      )
      setCoinFlipping(false)
    }, 1100)
  }

  function updateTossCaller(caller: 'host' | 'visitor') {
    props.setTossCaller(caller)
    if (coinResult && props.tossCall) {
      props.setTossWinner(
        coinResult === props.tossCall
          ? caller
          : caller === 'host'
            ? 'visitor'
            : 'host',
      )
    }
  }

  function updateTossCall(call: 'Heads' | 'Tails') {
    props.setTossCall(call)
    if (coinResult && props.tossCaller) {
      props.setTossWinner(
        coinResult === call
          ? props.tossCaller
          : props.tossCaller === 'host'
            ? 'visitor'
            : 'host',
      )
    }
  }

  return (
    <div className="app-shell setup-shell">
      <Header
        title={
          <>
            <strong>Score</strong>Mate
          </>
        }
      />
      <main className="setup-content">
        <div className="home-intro">
          <span className="home-kicker">Street cricket, scored cleanly</span>
          <h2>Set up a match</h2>
        </div>
        <div className="team-matchup">
          <input
            autoFocus
            aria-label="Host team"
            placeholder="Host Team"
            value={props.teamOne}
            onChange={(e) => props.setTeamOne(e.target.value)}
          />
          <span>VS</span>
          <input
            aria-label="Visitor team"
            placeholder="Visitor Team"
            value={props.teamTwo}
            onChange={(e) => props.setTeamTwo(e.target.value)}
          />
        </div>
        <section className="toss-card">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Toss simulator</span>
              <h3>Call the toss</h3>
            </div>
            <button
              type="button"
              className={`coin-3d-wrapper ${coinFlipping ? `flipping-to-${targetFace.toLowerCase()}` : (coinResult ?? 'Heads').toLowerCase()}`}
              onClick={flipCoin}
              aria-label="Flip coin"
              disabled={coinFlipping}
              title="Tap to flip coin"
            >
              <div className="coin-3d-inner" key={flipCount}>
                <div className="coin-side coin-heads">
                  <img src={coinHeads} alt="Heads" />
                </div>
                <div className="coin-side coin-tails">
                  <img src={coinTails} alt="Tails" />
                </div>
              </div>
            </button>
          </div>
          <FieldLabel text="Who is calling?" />
          <div className="choice-card toss-caller">
            <Choice
              checked={props.tossCaller === 'host'}
              label={props.teamOne || 'Host Team'}
              onClick={() => updateTossCaller('host')}
            />
            <Choice
              checked={props.tossCaller === 'visitor'}
              label={props.teamTwo || 'Visitor Team'}
              onClick={() => updateTossCaller('visitor')}
            />
          </div>
          <FieldLabel text="Call" />
          <div className="choice-card toss-call">
            <Choice
              checked={props.tossCall === 'Heads'}
              label="Heads"
              onClick={() => updateTossCall('Heads')}
            />
            <Choice
              checked={props.tossCall === 'Tails'}
              label="Tails"
              onClick={() => updateTossCall('Tails')}
            />
          </div>
          <button
            className="flip-button"
            onClick={flipCoin}
            disabled={coinFlipping}
          >
            {coinFlipping
              ? 'Flipping...'
              : coinResult
                ? `${coinResult} · Flip again`
                : 'Run the toss'}{' '}
            <span>↗</span>
          </button>
          {coinResult && props.tossWinner && (
            <p className="coin-result">
              {coinResult} —{' '}
              <strong>
                {props.tossWinner === 'host'
                  ? props.teamOne || 'Host Team'
                  : props.teamTwo || 'Visitor Team'}{' '}
                won the toss
              </strong>
            </p>
          )}
          {tossMessage && <p className="toss-message">{tossMessage}</p>}
        </section>
        <FieldLabel text="Opted to" />
        <div className="choice-card">
          <Choice
            checked={props.decision === 'bat'}
            label="Bat"
            onClick={() => props.setDecision('bat')}
          />
          <Choice
            checked={props.decision === 'bowl'}
            label="Bowl"
            onClick={() => props.setDecision('bowl')}
          />
        </div>
        {props.message && <p className="form-message">{props.message}</p>}
        <div className="setup-actions">
          <button className="primary-button" onClick={props.startMatch}>
            Match settings <span>→</span>
          </button>
        </div>
      </main>
      <BottomNav active="new" setScreen={props.setScreen} />
    </div>
  )
}

export default SetupScreen
