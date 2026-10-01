import { useState } from 'react'
import Icon from '../components/Icon'
import { Header } from '../components/common/Header'
import { ConfirmModal } from '../components/modals/ConfirmModal'
import type { ScoreState } from '../types/match'

export interface InningsBreakScreenProps {
  teamOne: string
  teamTwo: string
  overs: string
  firstBattingHome: boolean
  firstInningsScore: ScoreState
  startSecondInnings: () => void
  onEndMatch?: () => void
}

export function InningsBreakScreen({
  teamOne,
  teamTwo,
  overs,
  firstBattingHome,
  firstInningsScore,
  startSecondInnings,
  onEndMatch,
}: InningsBreakScreenProps) {
  const [endMatchPending, setEndMatchPending] = useState(false)
  const battingTeam = firstBattingHome ? teamOne : teamTwo
  const chasingTeam = firstBattingHome ? teamTwo : teamOne
  return (
    <div className="app-shell innings-break-screen">
      <Header title="Innings break" onBack={onEndMatch ? () => setEndMatchPending(true) : undefined} />
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
        {onEndMatch && (
          <button
            className="end-match-button"
            onClick={() => setEndMatchPending(true)}
            style={{ marginTop: '12px' }}
          >
            <Icon name="x" size={15} />
            End Match
          </button>
        )}
      </main>
      {endMatchPending && onEndMatch && (
        <ConfirmModal
          title="End this match?"
          message="The match will be marked as abandoned. This cannot be undone."
          confirmLabel="End Match"
          cancelLabel="Continue Match"
          onCancel={() => setEndMatchPending(false)}
          onConfirm={() => {
            setEndMatchPending(false)
            onEndMatch()
          }}
        />
      )}
    </div>
  )
}

export default InningsBreakScreen
