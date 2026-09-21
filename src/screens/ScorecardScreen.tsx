import { Header } from '../components/common/Header'
import { ScorecardInnings } from '../components/scorecard/ScorecardInnings'
import type { ScoreState } from '../types/match'

export interface ScorecardScreenProps {
  score: ScoreState
  firstInningsScore: ScoreState | null
  currentTeamName: string
  firstTeamName: string
  overs: number
  onBack: () => void
}

export function ScorecardScreen({
  score,
  firstInningsScore,
  currentTeamName,
  firstTeamName,
  overs,
  onBack,
}: ScorecardScreenProps) {
  void overs
  return (
    <div className="app-shell scorecard-screen">
      <Header title="Scorecard" onBack={onBack} />
      <main className="scorecard-content">
        <ScorecardInnings score={score} teamName={currentTeamName} current />
        <>
          {firstInningsScore && firstInningsScore !== score && (
            <section className="previous-innings">
              <div className="previous-innings-heading">
                <span>Previous innings</span>
                <strong>{firstTeamName}</strong>
                <b>
                  {firstInningsScore.runs}/{firstInningsScore.wickets}
                </b>
              </div>
              <ScorecardInnings score={firstInningsScore} teamName={firstTeamName} />
            </section>
          )}
        </>
      </main>
    </div>
  )
}

export default ScorecardScreen
