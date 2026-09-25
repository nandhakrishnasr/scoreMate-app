import { useState, useRef, type ChangeEvent } from 'react'
import Icon from '../components/Icon'
import { Header } from '../components/common/Header'
import { BottomNav } from '../components/common/BottomNav'
import type { CompletedMatch, PlayerStat, Screen } from '../types/match'
import { loadPlayerImages, savePlayerImages } from '../services/storageService'
import { aggregatePlayerStats, getInitials } from '../services/statsService'
import { usePlayerStats } from '../hooks/useDatabaseStats'
import { filterPlayers } from '../utils/search'


export interface PlayersStatsScreenProps {
  matches: CompletedMatch[]
  stats?: PlayerStat[]
  setScreen: (screen: Screen) => void
}

export function PlayersStatsScreen({
  matches,
  stats: propStats,
  setScreen,
}: PlayersStatsScreenProps) {
  const dbStats = usePlayerStats()
  const stats = propStats ?? dbStats
  const localPlayerStats = aggregatePlayerStats(matches)
  const playerStats = localPlayerStats.length > 0 ? localPlayerStats : stats
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [activeStatTab, setActiveStatTab] = useState<'batting' | 'bowling' | 'fielding'>('batting')
  const [playerImages, setPlayerImages] = useState<Record<string, string>>(loadPlayerImages())
  const [search, setSearch] = useState('')
  const player = playerStats.find((entry) => entry.name === selectedPlayer) ?? null
  const playerImageInput = useRef<HTMLInputElement | null>(null)
  const filteredStats = filterPlayers(playerStats, search)

  function handlePlayerImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !selectedPlayer) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = String(reader.result ?? '')
      const next = { ...playerImages, [selectedPlayer]: image }
      setPlayerImages(next)
      savePlayerImages(next)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="app-shell players-stats-screen">
      <Header title="Players" onBack={() => setScreen('setup')} />
      <main className="history-content">
        <section className="players-summary-top">
          <span className="players-total">{playerStats.length} players</span>
          <div className="search-bar">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </section>
        <section className="player-stat-grid">
          {filteredStats.length === 0 ? (
            <section className="empty-state">
              <div className="empty-icon">
                <Icon name="user-round" size={32} />
              </div>
              <h2>No player records yet</h2>
              <p>Completed matches create player stats.</p>
            </section>
          ) : (
            filteredStats.map((playerEntry) => (
              <button
                key={playerEntry.name}
                className="player-stat-card"
                onClick={() => {
                  setSelectedPlayer(playerEntry.name)
                  setActiveStatTab('batting')
                }}
              >
                <span className="player-avatar" aria-hidden="true">
                  {playerImages[playerEntry.name] ? (
                    <img
                      className="avatar-image"
                      src={playerImages[playerEntry.name]}
                      alt=""
                    />
                  ) : (
                    getInitials(playerEntry.name)
                  )}
                </span>
                <div className="player-stat-head">
                  <strong>{playerEntry.name}</strong>
                  <span>{playerEntry.matches} matches</span>
                </div>
              </button>
            ))
          )}
        </section>
        {player && (
          <div
            className="player-modal-backdrop"
            onClick={() => setSelectedPlayer(null)}
          >
            <section
              className="player-stat-detail"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="player-stat-detail-head">
                <span className="player-avatar-wrap">
                  <span className="player-avatar large" aria-hidden="true">
                    {playerImages[player.name] ? (
                      <img
                        className="avatar-image"
                        src={playerImages[player.name]}
                        alt=""
                      />
                    ) : (
                      getInitials(player.name)
                    )}
                  </span>
                  <button
                    className="avatar-edit-button"
                    title="Upload player picture"
                    onClick={() => playerImageInput.current?.click()}
                  >
                    <Icon name="pencil" label="Upload player picture" />
                  </button>
                  <input
                    ref={playerImageInput}
                    type="file"
                    accept="image/*"
                    className="avatar-file-input"
                    onChange={handlePlayerImageUpload}
                  />
                </span>
                <div>
                  <span className="section-kicker">Player profile</span>
                  <h3>{player.name}</h3>
                </div>
              </div>
              <div className="player-stat-tabs">
                <button
                  className={activeStatTab === 'batting' ? 'active' : ''}
                  onClick={() => setActiveStatTab('batting')}
                >
                  Batting
                </button>
                <button
                  className={activeStatTab === 'bowling' ? 'active' : ''}
                  onClick={() => setActiveStatTab('bowling')}
                >
                  Bowling
                </button>
                <button
                  className={activeStatTab === 'fielding' ? 'active' : ''}
                  onClick={() => setActiveStatTab('fielding')}
                >
                  Fielding
                </button>
              </div>
              {activeStatTab === 'batting' && (
                <div className="player-stat-detail-grid">
                  <div>
                    <span>Matches</span>
                    <b>{player.matches}</b>
                  </div>
                  <div>
                    <span>Innings</span>
                    <b>{player.innings}</b>
                  </div>
                  <div>
                    <span>Runs</span>
                    <b>{player.runs}</b>
                  </div>
                  <div>
                    <span>Balls</span>
                    <b>{player.balls}</b>
                  </div>
                  <div>
                    <span>Not outs</span>
                    <b>{player.notOuts}</b>
                  </div>
                  <div>
                    <span>Best</span>
                    <b>{player.best}</b>
                  </div>
                  <div>
                    <span>Average</span>
                    <b>{player.average ? player.average.toFixed(2) : '0.00'}</b>
                  </div>
                  <div>
                    <span>Strike rate</span>
                    <b>{player.strikeRate ? player.strikeRate.toFixed(2) : '0.00'}</b>
                  </div>
                  <div>
                    <span>4s</span>
                    <b>{player.fours}</b>
                  </div>
                  <div>
                    <span>6s</span>
                    <b>{player.sixes}</b>
                  </div>
                  <div>
                    <span>50s</span>
                    <b>{player.fifties}</b>
                  </div>
                  <div>
                    <span>100s</span>
                    <b>{player.hundreds}</b>
                  </div>
                  <div>
                    <span>Ducks</span>
                    <b>{player.ducks}</b>
                  </div>
                  <div>
                    <span>Outs</span>
                    <b>{player.outs}</b>
                  </div>
                </div>
              )}
              {activeStatTab === 'bowling' && (
                <div className="player-stat-detail-grid">
                  <div>
                    <span>Matches</span>
                    <b>{player.matches ?? 0}</b>
                  </div>
                  <div>
                    <span>Overs</span>
                    <b>
                      {player.bowlingBalls
                        ? `${Math.floor(player.bowlingBalls / 6)}.${player.bowlingBalls % 6}`
                        : player.overs
                          ? `${Math.floor(player.overs)}.${Math.round((player.overs % 1) * 6)}`
                          : '0.0'}
                    </b>
                  </div>
                  <div>
                    <span>Maidens</span>
                    <b>{player.maidens ?? 0}</b>
                  </div>
                  <div>
                    <span>Wickets</span>
                    <b>{player.wickets ?? 0}</b>
                  </div>
                  <div>
                    <span>Runs</span>
                    <b>{player.runsConceded ?? 0}</b>
                  </div>
                  <div>
                    <span>Economy</span>
                    <b>
                      {(() => {
                        const balls = player.bowlingBalls || Math.round((player.overs || 0) * 6)
                        const ov = balls / 6
                        if (ov > 0) return ((player.runsConceded ?? 0) / ov).toFixed(2)
                        return player.economy ? player.economy.toFixed(2) : '0.00'
                      })()}
                    </b>
                  </div>
                  <div>
                    <span>Average</span>
                    <b>
                      {(player.wickets ?? 0) > 0
                        ? ((player.runsConceded ?? 0) / player.wickets).toFixed(2)
                        : '0.00'}
                    </b>
                  </div>
                  <div>
                    <span>Strike rate</span>
                    <b>
                      {(player.wickets ?? 0) > 0
                        ? ((player.bowlingBalls || Math.round((player.overs || 0) * 6)) / player.wickets).toFixed(2)
                        : '0.00'}
                    </b>
                  </div>
                  <div>
                    <span>Wides</span>
                    <b>{player.wides ?? 0}</b>
                  </div>
                  <div>
                    <span>No balls</span>
                    <b>{player.noBalls ?? 0}</b>
                  </div>
                  <div>
                    <span>Dot balls</span>
                    <b>{player.dotBalls ?? 0}</b>
                  </div>
                </div>
              )}
              {activeStatTab === 'fielding' && (
                <div className="player-stat-detail-grid">
                  <div>
                    <span>Matches</span>
                    <b>{player.matches ?? 0}</b>
                  </div>
                  <div>
                    <span>Catches</span>
                    <b>{player.catches ?? 0}</b>
                  </div>
                  <div>
                    <span>Run outs</span>
                    <b>{player.runOuts ?? 0}</b>
                  </div>
                  <div>
                    <span>Stumpings</span>
                    <b>{player.stumpings ?? 0}</b>
                  </div>
                  <div>
                    <span>Total dismissals</span>
                    <b>{(player.catches ?? 0) + (player.runOuts ?? 0) + (player.stumpings ?? 0)}</b>
                  </div>
                </div>
              )}
              <button
                className="close-player-popup"
                aria-label="Close"
                onClick={() => setSelectedPlayer(null)}
              >
                <Icon name="x" size={16} />
              </button>
            </section>
          </div>
        )}
      </main>
      <BottomNav active="players" setScreen={setScreen} />
    </div>
  )
}

export default PlayersStatsScreen
