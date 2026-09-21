import { useState } from 'react'
import type { ScoreState } from '../../types/match'
import { countMaidens } from '../../services/exportService'

export interface DetailedScorecardInningsProps {
  score: ScoreState
  teamName: string
  current?: boolean
}

export function DetailedScorecardInnings({
  score,
  teamName,
  current = false,
}: DetailedScorecardInningsProps) {
  const [tab, setTab] = useState<'scoreboard' | 'overs'>('scoreboard')
  const bowlers = score.bowlerStats.some(
    (bowler) =>
      bowler.name === score.bowler.name &&
      bowler.balls === score.bowler.balls &&
      bowler.runs === score.bowler.runs &&
      bowler.wickets === score.bowler.wickets,
  )
    ? score.bowlerStats
    : [...score.bowlerStats, score.bowler]
  const overHistory = score.overHistory ?? []
  const currentOver = score.currentOver.length
    ? [
        {
          number: overHistory.length + 1,
          bowler: score.bowler.name,
          runs: score.currentOver.reduce(
            (total, delivery) => total + (delivery.runs ?? 0),
            0,
          ),
          deliveries: score.currentOver,
        },
      ]
    : []
  const overs = [...overHistory, ...currentOver]

  return (
    <section className={`scorecard-innings ${current ? 'current-innings' : ''}`}>
      <div className="scorecard-heading">
        <div>
          <span className="home-kicker">{teamName}{current ? '' : ' · 1st innings'}</span>
          <h2>
            {score.runs}/{score.wickets}
          </h2>
        </div>
        <span>
          {Math.floor(score.balls / 6)}.{score.balls % 6} overs
        </span>
      </div>
      <div className="scorecard-tabs">
        <button
          className={tab === 'scoreboard' ? 'active' : ''}
          onClick={() => setTab('scoreboard')}
        >
          Scoreboard
        </button>
        <button
          className={tab === 'overs' ? 'active' : ''}
          onClick={() => setTab('overs')}
        >
          Overs
        </button>
      </div>
      {tab === 'scoreboard' ? (
        <>
          <section className="scorecard-table">
            <div className="scorecard-row scorecard-header">
              <span>Batter</span>
              <span>Status</span>
              <span>R</span>
              <span>B</span>
              <span>4s</span>
              <span>6s</span>
              <span>SR</span>
            </div>
            {score.battingStats.map((player) => (
              <div
                className={`scorecard-row ${player.out ? 'dismissed' : ''}`}
                key={`${teamName}-${player.name}`}
              >
                <strong>{player.name}</strong>
                <span>
                  {player.out
                    ? player.dismissal ?? 'Out'
                    : player.name === score.striker.name ||
                        player.name === score.nonStriker.name
                      ? 'Not out'
                      : 'Yet to bat'}
                </span>
                <span>{player.runs}</span>
                <span>{player.balls}</span>
                <span>{player.fours}</span>
                <span>{player.sixes}</span>
                <span>
                  {player.balls
                    ? ((player.runs / player.balls) * 100).toFixed(2)
                    : '0.00'}
                </span>
              </div>
            ))}
          </section>
          <section className="bowler-scorecard">
            <div className="scorecard-row scorecard-header bowler-row">
              <span>Bowler</span>
              <span>O</span>
              <span>M</span>
              <span>R</span>
              <span>W</span>
              <span>ER</span>
            </div>
            {bowlers.map((bowler) => (
              <div
                className="scorecard-row bowler-row"
                key={`${teamName}-${bowler.name}`}
              >
                <strong>{bowler.name}</strong>
                <span>
                  {Math.floor(bowler.balls / 6)}.{bowler.balls % 6}
                </span>
                <span>{countMaidens(score, bowler.name)}</span>
                <span>{bowler.runs}</span>
                <span>{bowler.wickets}</span>
                <span>
                  {bowler.balls
                    ? (bowler.runs / (bowler.balls / 6)).toFixed(1)
                    : '0.0'}
                </span>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="overs-list">
          {overs.length ? (
            overs.map((over) => (
              <article
                className="over-summary"
                key={`${teamName}-${over.number}`}
              >
                <div className="over-summary-head">
                  <strong>Over {over.number}</strong>
                  <span>{over.bowler}</span>
                  <b>{over.runs} runs</b>
                </div>
                <div className="over-summary-balls">
                  {over.deliveries.map((delivery, index) => (
                    <i
                      className={delivery.legal ? '' : 'extra-ball'}
                      key={`${delivery.label}-${index}`}
                    >
                      {delivery.label}
                    </i>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p className="empty-copy">No overs recorded yet.</p>
          )}
        </section>
      )}
    </section>
  )
}

export default DetailedScorecardInnings
