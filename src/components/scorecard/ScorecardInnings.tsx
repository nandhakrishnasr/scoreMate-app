import { useState } from 'react'
import type { ScoreState } from '../../types/match'
import { DetailedScorecardInnings } from './DetailedScorecardInnings'

export interface ScorecardInningsProps {
  score: ScoreState
  teamName: string
  current?: boolean
  overs?: number
}

export function ScorecardInnings({
  score,
  teamName,
  current = false,
  overs = 8,
}: ScorecardInningsProps) {
  const [expanded, setExpanded] = useState(current)
  const inningsOvers = Math.max(1, score.maxOvers ?? overs)
  const runRate = score.balls ? (score.runs / (score.balls / 6)).toFixed(2) : '0.00'
  const ballsRemaining = Math.max(0, inningsOvers * 6 - score.balls)
  const requiredRunRate =
    score.target && ballsRemaining
      ? (Math.max(0, score.target - score.runs) / (ballsRemaining / 6)).toFixed(2)
      : null
  const falls = score.fallOfWickets ?? []

  return (
    <section
      className={`scorecard-innings accordion-innings ${expanded ? 'expanded' : 'collapsed'}`}
    >
      <button
        className="innings-accordion"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>
          <small>{current ? 'Current innings' : 'Previous innings'}</small>
          <strong>{teamName}</strong>
        </span>
        <span>
          <b>
            {score.runs}/{score.wickets}
          </b>
          <small>
            {Math.floor(score.balls / 6)}.{score.balls % 6} ov
          </small>
        </span>
        <span className="accordion-chevron">{expanded ? '⌃' : '⌄'}</span>
      </button>
      {expanded && (
        <div className="accordion-scorecard-body">
          <div className="scorecard-metrics">
            <div>
              <span>Run rate</span>
              <strong>{runRate}</strong>
            </div>
            {requiredRunRate && (
              <div>
                <span>Required RR</span>
                <strong>{requiredRunRate}</strong>
              </div>
            )}
            <div>
              <span>Overs</span>
              <strong>
                {Math.floor(score.balls / 6)}.{score.balls % 6}/{inningsOvers}
              </strong>
            </div>
          </div>
          <DetailedScorecardInnings score={score} teamName={teamName} current />
          <section className="fall-of-wickets">
            <h3>Fall of wickets</h3>
            {falls.length ? (
              falls.map((fall) => (
                <div key={`${teamName}-${fall.wicket}`}>
                  <span>{fall.wicket}</span>
                  <strong>{fall.batter}</strong>
                  <b>{fall.score}</b>
                  <small>{fall.dismissal ?? 'Out'}</small>
                </div>
              ))
            ) : (
              <p className="empty-copy">No wickets yet.</p>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

export default ScorecardInnings
