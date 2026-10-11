import type { CompletedMatch } from '../../types/match.ts'
import { getTeamHeadToHeadComparison } from '../../services/playerAnalyticsService.ts'

export interface TeamH2HComparisonProps {
  teamA: string
  teamB: string
  matches: CompletedMatch[]
}

export function TeamH2HComparison({ teamA, teamB, matches }: TeamH2HComparisonProps) {
  const h2h = getTeamHeadToHeadComparison(teamA, teamB, matches)

  if (h2h.totalMatches === 0) {
    return (
      <div className="h2h-empty-state">
        <p>No head-to-head encounters recorded between {teamA} and {teamB} yet.</p>
      </div>
    )
  }

  const teamAWins = h2h.teamAWins
  const teamBWins = h2h.teamBWins
  const totalDecided = teamAWins + teamBWins || 1
  const aBarPct = Math.round((teamAWins / totalDecided) * 100)
  const bBarPct = 100 - aBarPct

  return (
    <div className="team-h2h-card">
      <div className="h2h-header">
        <div className="h2h-team-badge">
          <strong>{teamA}</strong>
          <span className="h2h-win-count">{teamAWins} Wins</span>
        </div>
        <div className="h2h-vs-center">
          <small>{h2h.totalMatches} Matches</small>
          <strong>VS</strong>
          {h2h.draws > 0 && <small>{h2h.draws} Ties</small>}
        </div>
        <div className="h2h-team-badge align-right">
          <strong>{teamB}</strong>
          <span className="h2h-win-count">{teamBWins} Wins</span>
        </div>
      </div>

      {/* Visual Tug-of-War Bar */}
      <div className="h2h-ratio-bar-wrap">
        <div
          className="h2h-ratio-bar a-side"
          style={{ width: `${Math.max(10, Math.min(90, aBarPct))}%` }}
        >
          <span>{aBarPct}%</span>
        </div>
        <div
          className="h2h-ratio-bar b-side"
          style={{ width: `${Math.max(10, Math.min(90, bBarPct))}%` }}
        >
          <span>{bBarPct}%</span>
        </div>
      </div>

      {/* Head-to-Head Key Numbers */}
      <div className="h2h-stats-grid">
        <div className="h2h-stat-box">
          <span>Highest Score</span>
          <b>{h2h.teamAHighest || '—'}</b>
        </div>
        <div className="h2h-stat-box">
          <span>Recent Form ({teamA})</span>
          <div className="h2h-form-pills">
            {h2h.recentForm.map((result, idx) => (
              <span
                key={idx}
                className={`form-pill ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'draw'}`}
              >
                {result}
              </span>
            ))}
          </div>
        </div>
        <div className="h2h-stat-box">
          <span>Highest Score</span>
          <b>{h2h.teamBHighest || '—'}</b>
        </div>
      </div>
    </div>
  )
}

export default TeamH2HComparison
