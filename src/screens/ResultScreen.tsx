import { useState } from 'react'
import { Header } from '../components/common/Header'
import { InningsCharts } from '../components/scoring/InningsCharts'
import type { MatchResult, PlayerOfMatch, ScoreState } from '../types/match'
import { downloadScorecard } from '../services/exportService'

export interface ResultScreenProps {
  result: MatchResult
  teamOne: string
  teamTwo: string
  firstBattingHome: boolean
  firstInningsScore: ScoreState | null
  score: ScoreState | null
  onPlayerOfMatch: (player: PlayerOfMatch) => void
  onNewMatch: () => void
  onBack?: () => void
}

export function ResultScreen({
  result,
  teamOne,
  teamTwo,
  firstBattingHome,
  firstInningsScore,
  score,
  onPlayerOfMatch,
  onNewMatch,
  onBack,
}: ResultScreenProps) {
  const firstTeam = firstBattingHome ? teamOne : teamTwo
  const secondTeam = firstBattingHome ? teamTwo : teamOne
  const firstScore = firstInningsScore?.runs ?? 0
  const secondScore = score?.runs ?? 0
  const playerCandidates = [
    ...(firstInningsScore?.battingStats ?? []).map((player) => ({
      name: player.name,
      runs: player.runs,
      wickets: 0,
      team: firstTeam,
      reason: `${player.runs} runs`,
    })),
    ...(score?.battingStats ?? []).map((player) => ({
      name: player.name,
      runs: player.runs,
      wickets: 0,
      team: secondTeam,
      reason: `${player.runs} runs`,
    })),
    ...(firstInningsScore?.bowlerStats ?? []).map((bowler) => ({
      name: bowler.name,
      runs: 0,
      wickets: bowler.wickets,
      team: secondTeam,
      reason: `${bowler.wickets} wickets`,
    })),
    ...(score?.bowlerStats ?? []).map((bowler) => ({
      name: bowler.name,
      runs: 0,
      wickets: bowler.wickets,
      team: firstTeam,
      reason: `${bowler.wickets} wickets`,
    })),
  ]
  const manOfMatch = playerCandidates
    .filter((player) => player.runs > 0 || player.wickets > 0)
    .sort(
      (a, b) =>
        b.runs + b.wickets * 20 - (a.runs + a.wickets * 20) ||
        b.wickets - a.wickets ||
        b.runs - a.runs,
    )[0]
  const [selectedPlayer, setSelectedPlayer] = useState(manOfMatch?.name ?? '')
  const [playerOfMatchSaved, setPlayerOfMatchSaved] = useState(false)
  const selectedPlayerData =
    playerCandidates.find((player) => player.name === selectedPlayer) ?? manOfMatch

  function handleDownloadScorecard() {
    downloadScorecard({
      result,
      teamOne,
      teamTwo,
      firstBattingHome,
      firstInningsScore,
      score,
      selectedPlayerData,
    })
  }

  return (
    <div className="app-shell result-screen">
      <Header title="Match result" onBack={onBack} />
      <main className="result-content">
        <span className="home-kicker">Match Complete</span>
        <div className="result-icon">✓</div>
        <h2>{result.winner === 'Match Drawn' ? result.winner : `${result.winner} won`}</h2>
        {result.margin && <p>by {result.margin}</p>}
        <section className="match-summary">
          <span>Match summary</span>
          <div>
            <strong>{firstTeam}</strong>
            <b>
              {firstScore}/{firstInningsScore?.wickets ?? 0}
            </b>
            <small>
              {firstInningsScore
                ? `${Math.floor(firstInningsScore.balls / 6)}.${firstInningsScore.balls % 6} overs`
                : ''}
            </small>
          </div>
          <div>
            <strong>{secondTeam}</strong>
            <b>
              {secondScore}/{score?.wickets ?? 0}
            </b>
            <small>
              {score
                ? `${Math.floor(score.balls / 6)}.${score.balls % 6} overs`
                : ''}
            </small>
          </div>
        </section>
        <InningsCharts
          firstInningsScore={firstInningsScore}
          secondInningsScore={score}
          firstTeam={firstTeam}
          secondTeam={secondTeam}
        />
        {playerCandidates.length > 0 && (
          <section className="player-award-picker">
            <span className="section-kicker">Player of the Match</span>
            <select
              value={selectedPlayer}
              onChange={(event) => {
                setSelectedPlayer(event.target.value)
                setPlayerOfMatchSaved(false)
              }}
            >
              {playerCandidates
                .filter((player) => player.runs > 0 || player.wickets > 0)
                .map((player) => (
                  <option key={`${player.team}-${player.name}`} value={player.name}>
                    {player.name} · {player.reason}
                  </option>
                ))}
            </select>
            {selectedPlayerData && (
              <>
                <small>
                  {selectedPlayerData.team} · {selectedPlayerData.reason}
                </small>
                <button
                  className="primary-button wide-button"
                  onClick={() => {
                    onPlayerOfMatch({
                      name: selectedPlayerData.name,
                      team: selectedPlayerData.team,
                      reason: selectedPlayerData.reason,
                    })
                    setPlayerOfMatchSaved(true)
                  }}
                >
                  {playerOfMatchSaved
                    ? 'Player of the Match saved'
                    : 'Save Player of the Match'}
                </button>
              </>
            )}
          </section>
        )}
        {manOfMatch && (
          <section className="man-of-match">
            <span>Suggested Player of the Match</span>
            <strong>{manOfMatch.name}</strong>
            <small>
              {manOfMatch.team} · {manOfMatch.reason}
            </small>
          </section>
        )}
        <button
          className="primary-button wide-button"
          onClick={handleDownloadScorecard}
        >
          Download scorecard PDF <span>↓</span>
        </button>
        <button className="secondary-button wide-button" onClick={onNewMatch}>
          New match <span>↗</span>
        </button>
      </main>
    </div>
  )
}

export default ResultScreen
