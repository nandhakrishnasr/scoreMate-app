import { useState, useEffect } from 'react'
import Icon from '../components/Icon.tsx'
import { Header } from '../components/common/Header.tsx'
import { PlayerRow } from '../components/common/PlayerRow.tsx'
import { InningsCharts } from '../components/scoring/InningsCharts.tsx'
import type { LiveMatchSnapshot } from '../types/match.ts'
import { createLiveBroadcastChannel, decodeLiveMatchFromUrl } from '../services/liveShareService.ts'

export interface LiveViewerScreenProps {
  initialSnapshot: LiveMatchSnapshot
  onExit: () => void
}

export function LiveViewerScreen({ initialSnapshot, onExit }: LiveViewerScreenProps) {
  const [snapshot, setSnapshot] = useState<LiveMatchSnapshot>(initialSnapshot)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importInput, setImportInput] = useState('')

  // Listen to live broadcast channel for instant real-time updates
  useEffect(() => {
    const channel = createLiveBroadcastChannel((updated) => {
      if (updated.id === snapshot.id || (updated.teamOne === snapshot.teamOne && updated.teamTwo === snapshot.teamTwo)) {
        setSnapshot(updated)
        setLastUpdated(new Date())
      }
    })

    // Also listen to hashchange if URL is updated
    const handleHashChange = () => {
      const decoded = decodeLiveMatchFromUrl()
      if (decoded) {
        setSnapshot(decoded)
        setLastUpdated(new Date())
      }
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      channel.close()
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [snapshot.id, snapshot.teamOne, snapshot.teamTwo])

  const score = snapshot.score
  const battingTeam =
    snapshot.inningsNumber === 1
      ? snapshot.firstBattingHome
        ? snapshot.teamOne
        : snapshot.teamTwo
      : snapshot.firstBattingHome
        ? snapshot.teamTwo
        : snapshot.teamOne

  const overs = snapshot.overs
  const overNumber = Math.floor(score.balls / 6)
  const ballNumber = score.balls % 6

  function handleManualUpdate() {
    if (!importInput.trim()) return
    const decoded = decodeLiveMatchFromUrl(importInput.trim())
    if (decoded) {
      setSnapshot(decoded)
      setLastUpdated(new Date())
      setShowImportDialog(false)
      setImportInput('')
    } else {
      window.alert('Invalid live match link. Please paste a valid ScoreMate live URL.')
    }
  }

  return (
    <div className="app-shell live-viewer-shell">
      <Header
        title={`${snapshot.teamOne} vs ${snapshot.teamTwo}`}
        onBack={onExit}
        action="🏠"
        onAction={onExit}
      />

      <main className="live-content viewer-content">
        {/* Live Broadcast Status Banner */}
        <div className="viewer-live-banner">
          <div className="live-broadcast-pill">
            <span className="live-pulse-dot" />
            <span>LIVE SPECTATOR MODE</span>
          </div>
          <span className="viewer-last-time">
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* Hero Scorecard */}
        <section className="score-card viewer-score-card">
          <div>
            <span className="eyebrow">
              {snapshot.inningsNumber === 1
                ? `${battingTeam}, 1st innings`
                : `${battingTeam}, chase`}
              {snapshot.venue ? ` · ${snapshot.venue}` : ''}
            </span>
            <strong className="score">
              {score.runs} - {score.wickets}
            </strong>
            <span className="score-muted">
              ({overNumber}.{ballNumber}/{overs} ov)
            </span>
            {score.freeHit && <span className="free-hit-status">Free hit</span>}
            {snapshot.target && !score.inningsComplete && (
              <span className="target-status">
                Need {Math.max(0, snapshot.target - score.runs)} runs from {Math.max(0, overs * 6 - score.balls)} balls
              </span>
            )}
            {score.inningsComplete && (
              <span className="innings-status">Innings complete</span>
            )}
          </div>
          <div className="crr">
            <span>{snapshot.target && !score.inningsComplete ? 'RRR' : 'CRR'}</span>
            <strong>
              {snapshot.target && !score.inningsComplete && score.balls < overs * 6
                ? (
                    Math.max(0, snapshot.target - score.runs) /
                    ((overs * 6 - score.balls) / 6)
                  ).toFixed(2)
                : score.balls
                  ? (score.runs / (score.balls / 6)).toFixed(2)
                  : '0.00'}
            </strong>
          </div>
        </section>

        {/* Live Batters at the Crease */}
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
          {score.nonStriker?.name && <PlayerRow player={score.nonStriker} />}
        </section>

        {/* Live Bowler Figures */}
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
              {Math.floor((score.bowler.balls ?? 0) / 6)}.{(score.bowler.balls ?? 0) % 6}
            </span>
            <span>{score.bowler.maidens ?? 0}</span>
            <span>{score.bowler.runs ?? 0}</span>
            <span>{score.bowler.wickets ?? 0}</span>
            <span>
              {(score.bowler.balls ?? 0) > 0
                ? ((score.bowler.runs ?? 0) / ((score.bowler.balls ?? 0) / 6)).toFixed(1)
                : '0.0'}
            </span>
          </div>
        </section>

        {/* Current Over Deliveries Ticker */}
        <section className="over-card">
          <span>This over:</span>
          <div className="over-balls">
            {score.currentOver?.length ? (
              score.currentOver.map((delivery, index) => (
                <i
                  key={`${delivery.label}-${index}`}
                  className={delivery.legal ? 'filled' : 'extra-ball'}
                >
                  {delivery.label}
                </i>
              ))
            ) : (
              <em>No deliveries in this over yet</em>
            )}
          </div>
        </section>

        {/* Visual Analytics: Wagon Wheel & Pitch Heatmap */}
        <InningsCharts
          firstInningsScore={snapshot.firstInningsScore || score}
          secondInningsScore={snapshot.firstInningsScore ? score : null}
          firstTeam={snapshot.teamOne}
          secondTeam={snapshot.teamTwo}
        />

        {/* Spectator Controls */}
        <div className="viewer-actions-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowImportDialog(true)}
          >
            <Icon name="link" size={16} />
            Paste Latest Live Link
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onExit}
          >
            Open Full Scorer App
          </button>
        </div>

        {/* Import Link Modal */}
        {showImportDialog && (
          <div className="settings-backdrop" role="dialog" aria-modal="true">
            <div className="settings-modal">
              <div className="shot-tracker-header">
                <div>
                  <span className="section-kicker">Update Stream</span>
                  <h3>Paste Live Link</h3>
                </div>
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setShowImportDialog(false)}
                >
                  ✕
                </button>
              </div>
              <p className="live-share-sub">
                If the scorer shared an updated link via WhatsApp or chat, paste it here:
              </p>
              <input
                type="text"
                placeholder="https://...#live=..."
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                className="live-url-input full-width"
              />
              <div className="shot-tracker-actions">
                <button
                  type="button"
                  className="primary-button wide-button"
                  onClick={handleManualUpdate}
                >
                  Load Update ✓
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowImportDialog(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default LiveViewerScreen
