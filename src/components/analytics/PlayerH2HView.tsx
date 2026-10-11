import { useState, useMemo } from 'react'
import type { CompletedMatch, PlayerStat } from '../../types/match.ts'
import {
  getPlayerHeadToHeadByTeam,
  getPlayerRecentMatchLog,
  getPlayerMilestoneBadges,
} from '../../services/playerAnalyticsService.ts'

export interface PlayerH2HViewProps {
  playerName: string
  playerStat: PlayerStat
  matches: CompletedMatch[]
}

export function PlayerH2HView({ playerName, playerStat, matches }: PlayerH2HViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'opponents' | 'log'>('opponents')

  const opponentRecords = useMemo(() => {
    return getPlayerHeadToHeadByTeam(playerName, matches)
  }, [playerName, matches])

  const matchLogs = useMemo(() => {
    return getPlayerRecentMatchLog(playerName, matches, 8)
  }, [playerName, matches])

  const badges = useMemo(() => {
    return getPlayerMilestoneBadges(playerStat)
  }, [playerStat])

  return (
    <div className="player-career-analytics">
      {/* Milestone Badges Carousel */}
      <div className="milestones-section">
        <span className="section-kicker">Career Milestones</span>
        <div className="milestone-badges-row">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={`milestone-badge-card ${badge.earned ? 'earned' : 'locked'}`}
              title={`${badge.title}: ${badge.desc} (${badge.progress})`}
            >
              <span className="badge-icon">{badge.icon}</span>
              <div className="badge-meta">
                <strong>{badge.title}</strong>
                <small>{badge.earned ? 'Unlocked' : badge.progress || 'In progress'}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="career-sub-tabs">
        <button
          type="button"
          className={`sub-tab-btn ${activeSubTab === 'opponents' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('opponents')}
        >
          ⚔️ Opponents ({opponentRecords.length})
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeSubTab === 'log' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('log')}
        >
          📜 Match Log ({matchLogs.length})
        </button>
      </div>

      {/* Opponents Breakdown Table */}
      {activeSubTab === 'opponents' && (
        <div className="opponents-table-wrap">
          {opponentRecords.length === 0 ? (
            <p className="empty-subtext">No opponent records available yet.</p>
          ) : (
            <div className="opponents-list">
              {opponentRecords.map((opp) => (
                <div key={opp.opponentTeam} className="opponent-card">
                  <div className="opp-card-head">
                    <strong>vs {opp.opponentTeam}</strong>
                    <span>{opp.matches} {opp.matches === 1 ? 'match' : 'matches'}</span>
                  </div>
                  <div className="opp-stats-row">
                    <div className="opp-metric">
                      <span>Runs</span>
                      <b>{opp.runs}</b>
                    </div>
                    <div className="opp-metric">
                      <span>Avg</span>
                      <b>{opp.battingAvg}</b>
                    </div>
                    <div className="opp-metric">
                      <span>SR</span>
                      <b>{opp.strikeRate}</b>
                    </div>
                    <div className="opp-metric">
                      <span>Best</span>
                      <b>{opp.best}</b>
                    </div>
                    <div className="opp-metric">
                      <span>Wkts</span>
                      <b>{opp.wickets}</b>
                    </div>
                    <div className="opp-metric">
                      <span>Econ</span>
                      <b>{opp.economy}</b>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chronological Match Log */}
      {activeSubTab === 'log' && (
        <div className="match-logs-list">
          {matchLogs.length === 0 ? (
            <p className="empty-subtext">No individual match performances recorded yet.</p>
          ) : (
            matchLogs.map((log) => (
              <div key={log.matchId} className="match-log-card">
                <div className="log-top">
                  <div>
                    <strong>vs {log.opponent}</strong>
                    <small>{log.date}</small>
                  </div>
                  <span className="log-result-tag">{log.winner}</span>
                </div>
                <div className="log-pills">
                  {log.batting ? (
                    <span className="perf-pill bat">
                      🏏 <b>{log.batting.runs}</b> ({log.batting.balls}b)
                      {log.batting.notOut ? '*' : ''}
                      {log.batting.fours > 0 && ` · ${log.batting.fours}×4`}
                      {log.batting.sixes > 0 && ` · ${log.batting.sixes}×6`}
                    </span>
                  ) : (
                    <span className="perf-pill muted">Did not bat</span>
                  )}
                  {log.bowling && log.bowling.overs !== '0.0' ? (
                    <span className="perf-pill bowl">
                      🎯 <b>{log.bowling.wickets}/{log.bowling.runs}</b> in {log.bowling.overs} ov
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default PlayerH2HView
