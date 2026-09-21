import { Header } from '../components/common/Header'
import type { ScoreState } from '../types/match'

export interface InningsBreakScreenProps {
  teamOne: string
  teamTwo: string
  overs: string
  firstBattingHome: boolean
  firstInningsScore: ScoreState
  startSecondInnings: () => void
}

export function InningsBreakScreen({
  teamOne,
  teamTwo,
  overs,
  firstBattingHome,
  firstInningsScore,
  startSecondInnings,
}: InningsBreakScreenProps) {
  const battingTeam = firstBattingHome ? teamOne : teamTwo
  const chasingTeam = firstBattingHome ? teamTwo : teamOne
  return (
    <div className="app-shell innings-break-screen">
      <Header title="Innings break" />
      <main className="break-content">
        <span className="home-kicker">First innings complete</span>
        <h2>
          {chasingTeam} needs {firstInningsScore.runs + 1} runs to win
        </h2>
        <p>Target set in {overs} overs.</p>
        <div className="break-score">
          <span>{battingTeam}</span>
          <strong>
            {firstInningsScore.runs}/{firstInningsScore.wickets}
          </strong>
          <small>
            {Math.floor(firstInningsScore.balls / 6)}.
            {firstInningsScore.balls % 6} overs
          </small>
        </div>
        <div className="target-card">
          <span>Chase target</span>
          <strong>{firstInningsScore.runs + 1}</strong>
          <small>{chasingTeam} starts next</small>
        </div>
        <button
          className="primary-button wide-button"
          onClick={startSecondInnings}
        >
          Set up {chasingTeam} innings <span>→</span>
        </button>
      </main>
    </div>
  )
}

export default InningsBreakScreen
