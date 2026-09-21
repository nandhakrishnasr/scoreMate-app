import Icon from '../components/Icon'
import { Header } from '../components/common/Header'
import { PlayerRow } from '../components/common/PlayerRow'
import { SelectionSheet } from '../components/common/SelectionSheet'
import { ScoringSheet } from '../components/scoring/ScoringSheet'
import { ConfirmModal } from '../components/modals/ConfirmModal'
import { countMaidens } from '../services/exportService'
import { useMatch } from '../context/MatchContext'
import type { ScoreState, Screen, SquadPlayer } from '../types/match'

export interface LiveScreenProps {
  score: ScoreState
  teamOne: string
  teamTwo: string
  firstBattingHome: boolean
  overs: number
  overNumber: number
  ballNumber: number
  inningsNumber: 1 | 2
  target: number | null
  maxBalls: number
  battingRoster: SquadPlayer[]
  bowlingRoster: SquadPlayer[]
  milestone: string
  shareImage: string | null
  shareLiveUpdate: () => void
  setScreen: (screen: Screen) => void
  /** Called when the user confirms "End Match" (abandons the match) */
  onEndMatch: () => void
  /** Called when the user taps the header Back button (triggers leave confirmation) */
  onLeaveMatch: () => void
  /** Lifted from local state — controlled by App.tsx so global Back can dismiss it */
  endMatchPending: boolean
  onEndMatchPendingChange: (value: boolean) => void
  /** true while endMatch's IndexedDB write is in flight */
  isEndingMatch: boolean
  /** Non-null when endMatch persistence failed */
  endMatchError: string | null
  /** true while finishMatch's IndexedDB write is in flight */
  isFinishing: boolean
  /** Non-null when finishMatch persistence failed */
  finishError: string | null
  /** Re-triggers the finishMatch IndexedDB write after a failure */
  onRetryFinishMatch: () => void
}

export function LiveScreen({
  score,
  teamOne,
  teamTwo,
  firstBattingHome,
  overs,
  overNumber,
  ballNumber,
  inningsNumber,
  target,
  milestone,
  shareImage,
  shareLiveUpdate,
  setScreen,
  maxBalls,
  battingRoster,
  bowlingRoster,
  onEndMatch,
  onLeaveMatch,
  endMatchPending,
  onEndMatchPendingChange,
  isEndingMatch,
  endMatchError,
  isFinishing,
  finishError,
  onRetryFinishMatch,
}: LiveScreenProps) {
  const { scoring } = useMatch()

  const inningsOver = score.balls >= maxBalls || score.inningsComplete
  const battingTeam =
    inningsNumber === 1
      ? firstBattingHome
        ? teamOne
        : teamTwo
      : firstBattingHome
        ? teamTwo
        : teamOne
  const availableBatters = battingRoster.filter(
    (player) =>
      player.name !== score.striker.name &&
      player.name !== score.nonStriker.name &&
      !score.dismissedBatters.includes(player.name)
  )
  const availableBowlers = bowlingRoster.filter(
    (player) => player.name !== score.bowler.name
  )

  return (
    <div className="app-shell live-shell">
      <Header
        title={`${teamOne} vs ${teamTwo}`}
        onBack={onLeaveMatch}
        action="▱"
        onAction={() => setScreen('scorecard')}
      />
      {milestone && (
        <div className="milestone-toast" role="status">
          {milestone}
        </div>
      )}
      <main className="live-content">
        <section className="score-card">
          <div>
            <span className="eyebrow">
              {inningsNumber === 1
                ? `${battingTeam}, 1st innings`
                : `${battingTeam}, chase`}
            </span>
            <strong className="score">
              {score.runs} - {score.wickets}
            </strong>
            <span className="score-muted">
              ({overNumber}.{ballNumber}/{overs})
            </span>
            {score.freeHit && <span className="free-hit-status">Free hit</span>}
            {score.inningsComplete && (
              <span className="innings-status">Innings complete</span>
            )}
            {target && !score.inningsComplete && (
              <span className="target-status">
                Need {Math.max(0, target - score.runs)} runs to win
              </span>
            )}
          </div>
          <div className="crr">
            <span>{target && !score.inningsComplete ? 'RRR' : 'CRR'}</span>
            <strong>
              {target && !score.inningsComplete && score.balls < maxBalls
                ? (
                    Math.max(0, target - score.runs) /
                    ((maxBalls - score.balls) / 6)
                  ).toFixed(2)
                : score.balls
                  ? (score.runs / (score.balls / 6)).toFixed(2)
                  : '0.00'}
            </strong>
          </div>
        </section>
        <section className="partnership-card">
          <div>
            <span>Partnership</span>
            <strong>{score.partnership?.runs ?? 0}</strong>
            <small>{score.partnership?.balls ?? 0} balls</small>
          </div>
          <b>
            {score.striker.name} &amp; {score.nonStriker.name}
          </b>
        </section>
        <section className="batting-card">
          <div className="table-head">
            <span>Batsman</span>
            <span>R</span>
            <span>B</span>
            <span>4s</span>
            <span>6s</span>
            <span>SR</span>
          </div>
          <PlayerRow player={score.striker} active />
          {score.nonStriker.name && <PlayerRow player={score.nonStriker} />}
        </section>
        <section className="bowler-card">
          <div className="table-head">
            <span>Bowler</span>
            <span>O</span>
            <span>M</span>
            <span>R</span>
            <span>W</span>
            <span>ER</span>
          </div>
          <div className="player-row">
            <span>{score.bowler.name}</span>
            <span>
              {Math.floor(score.bowler.balls / 6)}.{score.bowler.balls % 6}
            </span>
            <span>{countMaidens(score, score.bowler.name)}</span>
            <span>{score.bowler.runs}</span>
            <span>{score.bowler.wickets}</span>
            <span>
              {score.bowler.balls
                ? (score.bowler.runs / (score.bowler.balls / 6)).toFixed(1)
                : '0.0'}
            </span>
          </div>
        </section>
        <section className="over-card">
          <span>This over:</span>
          <div className="over-balls">
            {score.currentOver.length ? (
              score.currentOver.map((delivery, index) => (
                <i
                  key={`${delivery.label}-${index}`}
                  className={delivery.legal ? 'filled' : 'extra-ball'}
                >
                  {delivery.label}
                </i>
              ))
            ) : (
              <em>No deliveries yet</em>
            )}
          </div>
          {shareImage && !score.currentOver.length && (
            <button className="share-update-button" onClick={shareLiveUpdate}>
              <Icon name="upload-cloud" size={16} />
              Share update
            </button>
          )}
        </section>
        <section className="scoring-panel">
          <div className="action-column">
            <button onClick={scoring.undo}>
              <Icon name="undo" size={18} variant="white" />
              Undo
            </button>
            <button
              onClick={scoring.swapBatters}
              disabled={inningsOver || !score.nonStriker.name}
            >
              Swap batters
            </button>
            <button
              onClick={() => scoring.setScoringModal('runs')}
              disabled={inningsOver}
            >
              5, 7
            </button>
            <button
              onClick={() => scoring.setScoringModal('wicket')}
              className="out-button"
              disabled={inningsOver}
            >
              Out
            </button>
          </div>
          <div className="run-grid">
            {[0, 1, 2, 3].map((run) => (
              <button
                key={run}
                onClick={() => scoring.addBall('runs', run)}
                disabled={inningsOver}
              >
                {run}
              </button>
            ))}
            <button
              onClick={() => scoring.addBall('runs', 4, '4')}
              disabled={inningsOver}
            >
              {score.freeHit ? '4 FH' : '4'}
            </button>
            <button
              onClick={() => scoring.addBall('runs', 6, '6')}
              disabled={inningsOver}
            >
              {score.freeHit ? '6 FH' : '6'}
            </button>
            <button
              onClick={() => scoring.setScoringModal('wide')}
              disabled={inningsOver}
            >
              WD
            </button>
            <button
              onClick={() => scoring.setScoringModal('noBall')}
              disabled={inningsOver}
            >
              NB
            </button>
            <button
              onClick={() => scoring.setScoringModal('bye')}
              disabled={inningsOver}
            >
              BYE
            </button>
            <button
              onClick={() => scoring.setScoringModal('legBye')}
              disabled={inningsOver}
            >
              LB
            </button>
          </div>
        </section>

        {/* Terminal persistence states */}
        {isFinishing && (
          <p className="form-message" role="status" style={{ textAlign: 'center', padding: '8px 0' }}>
            Saving match result…
          </p>
        )}
        {finishError && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p className="form-error">{finishError}</p>
            <button className="secondary-button" onClick={onRetryFinishMatch} style={{ marginTop: '6px' }}>
              Try again
            </button>
          </div>
        )}
        {isEndingMatch && (
          <p className="form-message" role="status" style={{ textAlign: 'center', padding: '8px 0' }}>
            Ending match…
          </p>
        )}
        {endMatchError && (
          <p className="form-error" style={{ textAlign: 'center', padding: '8px 0' }}>
            {endMatchError}
          </p>
        )}

        <button
          className="end-match-button"
          onClick={() => onEndMatchPendingChange(true)}
          disabled={isEndingMatch || isFinishing}
        >
          <Icon name="x" size={15} />
          End Match
        </button>
        {scoring.scoringModal && (
          <ScoringSheet
            modal={scoring.scoringModal}
            addBall={scoring.addBall}
            close={() => scoring.setScoringModal(null)}
            selectWicket={scoring.selectWicket}
            freeHit={Boolean(score.freeHit)}
            strikerName={score.striker.name}
            nonStrikerName={score.nonStriker.name}
            onRetireBatter={scoring.retireBatter}
          />
        )}
        {scoring.wicketDetails && (
          <SelectionSheet
            title={
              scoring.wicketDetails.type === 'Caught' ||
              scoring.wicketDetails.type === 'Caught Behind'
                ? 'Who took the catch?'
                : scoring.wicketDetails.type === 'Stumped'
                  ? 'Who completed the stumping?'
                  : 'Who helped with the run out?'
            }
            options={
              scoring.wicketDetails.type === 'Caught' ||
              scoring.wicketDetails.type === 'Caught Behind'
                ? bowlingRoster.filter(
                    (player) => player.name !== score.bowler.name
                  )
                : bowlingRoster
            }
            onSelect={scoring.selectWicketHelper}
          />
        )}
        {scoring.nextBatterOpen && (
          <SelectionSheet
            title="Select next batter"
            options={availableBatters}
            onSelect={scoring.chooseNextBatter}
          />
        )}
        {scoring.nextBowlerOpen && (
          <SelectionSheet
            title="Select next bowler"
            options={
              availableBowlers.length ? availableBowlers : bowlingRoster
            }
            onSelect={scoring.chooseNextBowler}
          />
        )}
      </main>
      {endMatchPending && (
        <ConfirmModal
          title="End this match?"
          message="The match will be marked as abandoned. This cannot be undone."
          confirmLabel="End Match"
          cancelLabel="Continue Scoring"
          onCancel={() => onEndMatchPendingChange(false)}
          onConfirm={onEndMatch}
        />
      )}
    </div>
  )
}
