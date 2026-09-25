import { useState, useRef, type ChangeEvent } from 'react'
import Icon from '../components/Icon'
import { Header } from '../components/common/Header'
import { BottomNav } from '../components/common/BottomNav'
import type { CompletedMatch, Screen, TeamStat } from '../types/match'
import { loadTeamImages, saveTeamImages } from '../services/storageService'
import { aggregateTeamStats, getInitials } from '../services/statsService'
import { useTeamStats } from '../hooks/useDatabaseStats'
import { filterTeams } from '../utils/search'

export interface TeamsScreenProps {
  matches: CompletedMatch[]
  stats?: TeamStat[]
  setScreen: (screen: Screen) => void
}

export function TeamsScreen({ matches, stats: propStats, setScreen }: TeamsScreenProps) {
  const dbStats = useTeamStats()
  const stats = propStats ?? dbStats
  const teamStats = stats.length > 0 ? stats : aggregateTeamStats(matches)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [selectedOpponent, setSelectedOpponent] = useState('')
  const [teamHistoryIndex, setTeamHistoryIndex] = useState(0)
  const [teamImages, setTeamImages] = useState<Record<string, string>>(loadTeamImages())
  const [search, setSearch] = useState('')
  const teamImageInput = useRef<HTMLInputElement | null>(null)
  const selectedTeamStat = teamStats.find((team) => team.name === selectedTeam) ?? null
  const opponents = selectedTeam
    ? Array.from(
        new Set(
          matches
            .filter((match) => match.teamOne === selectedTeam || match.teamTwo === selectedTeam)
            .map((match) => (match.teamOne === selectedTeam ? match.teamTwo : match.teamOne)),
        ),
      ).sort()
    : []
  const selectedMatches = matches
    .filter(
      (match) =>
        (match.teamOne === selectedTeam || match.teamTwo === selectedTeam) &&
        (!selectedOpponent ||
          match.teamOne === selectedOpponent ||
          match.teamTwo === selectedOpponent),
    )
    .sort((a, b) => {
      const timeA = Date.parse(a.savedAt)
      const timeB = Date.parse(b.savedAt)
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA)
    })
  const selectedMatch = selectedMatches[teamHistoryIndex] ?? selectedMatches[0] ?? null
  const filteredTeams = filterTeams(teamStats, search)

  const showHistoryCarousel = selectedMatches.length > 1
  const goTeamHistoryPrev = () => {
    if (selectedMatches.length <= 1) return
    setTeamHistoryIndex((index) => (index === 0 ? selectedMatches.length - 1 : index - 1))
  }
  const goTeamHistoryNext = () => {
    if (selectedMatches.length <= 1) return
    setTeamHistoryIndex((index) => (index + 1) % selectedMatches.length)
  }

  function handleTeamImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !selectedTeam) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = String(reader.result ?? '')
      const nextImages = { ...teamImages, [selectedTeam]: image }
      setTeamImages(nextImages)
      saveTeamImages(nextImages)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="app-shell teams-screen">
      <Header title="Teams" onBack={() => setScreen('setup')} />
      <main className="history-content">
        <div className="search-bar">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search teams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <section className="team-stats-grid">
          {filteredTeams.length === 0 ? (
            <section className="empty-state">
              <div className="empty-icon">
                <Icon name="users" size={32} />
              </div>
              <h2>{search ? 'No teams found' : 'No team records yet'}</h2>
              <p>{search ? 'Try a different search term.' : 'Finished matches will appear here.'}</p>
            </section>
          ) : (
            filteredTeams.map((team) => (
              <button
                key={team.name}
                className="team-stat-card"
                onClick={() => {
                  setSelectedTeam(team.name)
                  setSelectedOpponent('')
                  setTeamHistoryIndex(0)
                }}
              >
                <div className="team-stat-head">
                  <span>{team.name}</span>
                  <small>{team.played} played</small>
                </div>
                <div className="team-stat-row">
                  <b>{team.wins}</b>
                  <span>
                    <Icon name="trending-up" size={16} />
                    Wins
                  </span>
                </div>
                <div className="team-stat-row">
                  <b>{team.losses}</b>
                  <span>
                    <Icon name="trending-down" size={16} />
                    Losses
                  </span>
                </div>
                <div className="team-stat-row">
                  <b>{team.draws}</b>
                  <span>
                    <Icon name="minus" size={16} />
                    Draws
                  </span>
                </div>
                <div className="team-stat-row">
                  <b>{team.played}</b>
                  <span>
                    <Icon name="calendar-check" size={16} />
                    Played
                  </span>
                </div>
              </button>
            ))
          )}
        </section>
        {selectedTeamStat && (
          <div className="team-modal-backdrop" onClick={() => setSelectedTeam(null)}>
            <section
              className="team-stat-detail"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="team-stat-detail-head">
                <span className="team-avatar-wrap">
                  <span className="team-avatar large" aria-hidden="true">
                    {teamImages[selectedTeamStat.name] ? (
                      <img
                        className="avatar-image"
                        src={teamImages[selectedTeamStat.name]}
                        alt=""
                      />
                    ) : (
                      getInitials(selectedTeamStat.name)
                    )}
                  </span>
                  <button
                    className="avatar-edit-button"
                    title="Upload team picture"
                    onClick={() => teamImageInput.current?.click()}
                  >
                    <Icon name="pencil" label="Upload team picture" />
                  </button>
                  <input
                    ref={teamImageInput}
                    type="file"
                    accept="image/*"
                    className="avatar-file-input"
                    onChange={handleTeamImageUpload}
                  />
                </span>
                <div>
                  <span className="section-kicker">Team profile</span>
                  <h3>{selectedTeamStat.name}</h3>
                </div>
              </div>
              <div className="team-stat-detail-grid">
                <div>
                  <span>Played</span>
                  <b>{selectedTeamStat.played}</b>
                </div>
                <div>
                  <span>Wins</span>
                  <b>{selectedTeamStat.wins}</b>
                </div>
                <div>
                  <span>Losses</span>
                  <b>{selectedTeamStat.losses}</b>
                </div>
                <div>
                  <span>Draws</span>
                  <b>{selectedTeamStat.draws}</b>
                </div>
              </div>
              <div className="head-to-head">
                <span className="section-kicker">Head to head</span>
                <select
                  aria-label="Filter opponent"
                  value={selectedOpponent}
                  onChange={(event) => {
                    setSelectedOpponent(event.target.value)
                    setTeamHistoryIndex(0)
                  }}
                >
                  <option value="">All opponents</option>
                  {opponents.map((opponent) => (
                    <option key={opponent} value={opponent}>
                      {opponent}
                    </option>
                  ))}
                </select>
              </div>
              <div className="team-match-list">
                <span className="section-kicker">
                  {selectedOpponent
                    ? `${selectedTeam} vs ${selectedOpponent}`
                    : 'Match history'}
                </span>
                {selectedMatches.length === 0 ? (
                  <p className="empty-copy">No matches found.</p>
                ) : (
                  <>
                    {showHistoryCarousel && (
                      <div className="team-carousel-controls">
                        <button
                          className="team-carousel-arrow"
                          onClick={goTeamHistoryPrev}
                        >
                          ‹
                        </button>
                        <button
                          className="team-carousel-arrow"
                          onClick={goTeamHistoryNext}
                        >
                          ›
                        </button>
                      </div>
                    )}
                    {selectedMatch && (
                      <section className="team-match-row" key={selectedMatch.id}>
                        <span>{new Date(selectedMatch.savedAt).toLocaleString()}</span>
                        <strong>
                          {selectedMatch.teamOne} vs {selectedMatch.teamTwo}
                        </strong>
                        <em>
                          {selectedMatch.result.winner === 'Match Drawn'
                            ? 'Match Drawn'
                            : `${selectedMatch.result.winner} won`}
                        </em>
                        <small>{selectedMatch.result.margin}</small>
                      </section>
                    )}
                  </>
                )}
              </div>
              <button
                className="close-player-popup"
                aria-label="Close"
                onClick={() => setSelectedTeam(null)}
              >
                <Icon name="x" size={16} />
              </button>
            </section>
          </div>
        )}
      </main>
      <BottomNav active="teams" setScreen={setScreen} />
    </div>
  )
}

export default TeamsScreen
