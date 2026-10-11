import { useState, useMemo, useEffect } from 'react'
import type { ScoreState, MatchResult, PlayerOfMatch } from '../../types/match.ts'
import {
  type PosterType,
  extractMilestoneCandidates,
  generatePlayerOfMatchPoster,
  generateMatchSummaryPoster,
  generateMilestonePoster,
  deliverPoster,
  formatOvers,
  formatEconomy,
} from '../../services/posterService.ts'

export interface PosterModalProps {
  isOpen: boolean
  onClose: () => void
  result: MatchResult
  teamOne: string
  teamTwo: string
  firstBattingHome: boolean
  firstInningsScore: ScoreState | null
  score: ScoreState | null // Second innings score
  playerOfMatch?: PlayerOfMatch | null
  venue?: string
}

export function PosterModal({
  isOpen,
  onClose,
  result,
  teamOne,
  teamTwo,
  firstBattingHome,
  firstInningsScore,
  score,
  playerOfMatch,
  venue,
}: PosterModalProps) {
  const [activeTab, setActiveTab] = useState<PosterType>('player_of_match')
  const [isSharing, setIsSharing] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)

  const firstTeam = firstBattingHome ? teamOne : teamTwo
  const secondTeam = firstBattingHome ? teamTwo : teamOne

  // Extract milestones (50s, 100s, 3+ wickets)
  const milestoneCandidates = useMemo(() => {
    return extractMilestoneCandidates({
      firstInningsScore,
      secondInningsScore: score,
      teamOne,
      teamTwo,
      firstBattingHome,
    })
  }, [firstInningsScore, score, teamOne, teamTwo, firstBattingHome])

  const [selectedMilestoneIndex, setSelectedMilestoneIndex] = useState(0)

  // Compute best player of match candidate if not explicitly saved
  const resolvedPlayerOfMatch = useMemo(() => {
    if (playerOfMatch && playerOfMatch.name) {
      return playerOfMatch
    }
    // Find highest impact player
    const allBatters = [
      ...(firstInningsScore?.battingStats ?? []).map((b) => ({ ...b, team: firstTeam })),
      ...(score?.battingStats ?? []).map((b) => ({ ...b, team: secondTeam })),
    ]
    const allBowlers = [
      ...(firstInningsScore?.bowlerStats ?? []).map((bw) => ({ ...bw, team: secondTeam })),
      ...(score?.bowlerStats ?? []).map((bw) => ({ ...bw, team: firstTeam })),
    ]

    const playerImpacts = new Map<string, { name: string; team: string; points: number; summary: string }>()

    for (const b of allBatters) {
      const cur = playerImpacts.get(b.name) || { name: b.name, team: b.team, points: 0, summary: '' }
      cur.points += b.runs
      if (b.runs > 0) cur.summary = `${b.runs} runs (${b.balls}b)`
      playerImpacts.set(b.name, cur)
    }

    for (const bw of allBowlers) {
      const cur = playerImpacts.get(bw.name) || { name: bw.name, team: bw.team, points: 0, summary: '' }
      cur.points += bw.wickets * 25
      if (bw.wickets > 0) {
        cur.summary = cur.summary ? `${cur.summary} · ${bw.wickets}/${bw.runs}` : `${bw.wickets}/${bw.runs}`
      }
      playerImpacts.set(bw.name, cur)
    }

    const sorted = [...playerImpacts.values()].sort((a, b) => b.points - a.points)
    const top = sorted[0]
    if (top) {
      return {
        name: top.name,
        team: top.team,
        reason: top.summary || 'Outstanding Performance',
      }
    }

    return {
      name: teamOne,
      team: teamOne,
      reason: 'Match Winner',
    }
  }, [playerOfMatch, firstInningsScore, score, firstTeam, secondTeam, teamOne])

  // Generate poster image data URLs on tab or selection change
  const currentPosterDataUrl = useMemo(() => {
    if (!isOpen) return ''

    if (activeTab === 'player_of_match') {
      // Find full player stats
      const firstInningsBatter = firstInningsScore?.battingStats?.find((b) => b.name === resolvedPlayerOfMatch.name)
      const secondInningsBatter = score?.battingStats?.find((b) => b.name === resolvedPlayerOfMatch.name)
      const firstInningsBowler = firstInningsScore?.bowlerStats?.find((b) => b.name === resolvedPlayerOfMatch.name)
      const secondInningsBowler = score?.bowlerStats?.find((b) => b.name === resolvedPlayerOfMatch.name)

      const runs = (firstInningsBatter?.runs ?? 0) + (secondInningsBatter?.runs ?? 0)
      const balls = (firstInningsBatter?.balls ?? 0) + (secondInningsBatter?.balls ?? 0)
      const fours = (firstInningsBatter?.fours ?? 0) + (secondInningsBatter?.fours ?? 0)
      const sixes = (firstInningsBatter?.sixes ?? 0) + (secondInningsBatter?.sixes ?? 0)
      const wickets = (firstInningsBowler?.wickets ?? 0) + (secondInningsBowler?.wickets ?? 0)
      const runsConceded = (firstInningsBowler?.runs ?? 0) + (secondInningsBowler?.runs ?? 0)
      const bowlerBalls = (firstInningsBowler?.balls ?? 0) + (secondInningsBowler?.balls ?? 0)

      return generatePlayerOfMatchPoster({
        matchSummary: {
          teamOne,
          teamTwo,
          winner: result.winner,
          margin: result.margin,
        },
        player: {
          name: resolvedPlayerOfMatch.name,
          team: resolvedPlayerOfMatch.team,
          reason: resolvedPlayerOfMatch.reason,
          runs: runs > 0 ? runs : undefined,
          balls: balls > 0 ? balls : undefined,
          fours: fours > 0 ? fours : undefined,
          sixes: sixes > 0 ? sixes : undefined,
          strikeRate: balls > 0 ? ((runs / balls) * 100).toFixed(1) : undefined,
          wickets: wickets > 0 ? wickets : undefined,
          overs: bowlerBalls > 0 ? formatOvers(bowlerBalls) : undefined,
          runsConceded: wickets > 0 || runsConceded > 0 ? runsConceded : undefined,
          economy: bowlerBalls > 0 ? formatEconomy(runsConceded, bowlerBalls) : undefined,
        },
      })
    }

    if (activeTab === 'match_summary') {
      return generateMatchSummaryPoster({
        teamOne,
        teamTwo,
        firstTeam,
        secondTeam,
        firstInningsScore,
        secondInningsScore: score,
        result,
        venue,
      })
    }

    if (activeTab === 'milestone') {
      const activeMilestone = milestoneCandidates[selectedMilestoneIndex]
      if (!activeMilestone) return ''
      return generateMilestonePoster({
        matchSummary: {
          teamOne,
          teamTwo,
        },
        milestone: activeMilestone,
      })
    }

    return ''
  }, [
    isOpen,
    activeTab,
    resolvedPlayerOfMatch,
    teamOne,
    teamTwo,
    result,
    firstTeam,
    secondTeam,
    firstInningsScore,
    score,
    venue,
    milestoneCandidates,
    selectedMilestoneIndex,
  ])

  useEffect(() => {
    if (shareFeedback) {
      const timer = setTimeout(() => setShareFeedback(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [shareFeedback])

  if (!isOpen) return null

  async function handleShare() {
    if (!currentPosterDataUrl) return
    setIsSharing(true)
    setShareFeedback(null)

    const prefix = activeTab === 'player_of_match'
      ? `potm-${resolvedPlayerOfMatch.name}`
      : activeTab === 'match_summary'
        ? `match-${teamOne}-vs-${teamTwo}`
        : `milestone-${milestoneCandidates[selectedMilestoneIndex]?.name ?? 'star'}`

    const filename = `${prefix}-scoremate-poster.png`

    try {
      await deliverPoster(currentPosterDataUrl, filename)
      setShareFeedback('Poster shared successfully!')
    } catch {
      setShareFeedback('Failed to share poster.')
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <div className="settings-backdrop poster-modal-backdrop" role="dialog" aria-modal="true">
      <div className="settings-modal poster-modal-container">
        {/* Header */}
        <div className="settings-head">
          <div className="poster-header-row">
            <div>
              <span className="section-kicker">ScoreMate Posters</span>
              <h3>Social Media Cards</h3>
            </div>
            <button
              type="button"
              className="icon-button close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Tab Selector */}
          <div className="poster-tab-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'player_of_match'}
              className={`poster-tab ${activeTab === 'player_of_match' ? 'active' : ''}`}
              onClick={() => setActiveTab('player_of_match')}
            >
              🏆 Player of Match
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'match_summary'}
              className={`poster-tab ${activeTab === 'match_summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('match_summary')}
            >
              ⚔️ Match Result
            </button>
            {milestoneCandidates.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'milestone'}
                className={`poster-tab ${activeTab === 'milestone' ? 'active' : ''}`}
                onClick={() => setActiveTab('milestone')}
              >
                ⭐ Milestones ({milestoneCandidates.length})
              </button>
            )}
          </div>

          {/* Sub-picker for milestones */}
          {activeTab === 'milestone' && milestoneCandidates.length > 1 && (
            <div className="poster-subpicker">
              <label htmlFor="milestone-select" className="subpicker-label">Select Milestone:</label>
              <select
                id="milestone-select"
                value={selectedMilestoneIndex}
                onChange={(e) => setSelectedMilestoneIndex(Number(e.target.value))}
                className="poster-select"
              >
                {milestoneCandidates.map((m, idx) => (
                  <option key={`${m.name}-${m.value}-${idx}`} value={idx}>
                    {m.name} · {m.title} ({m.value} {m.type})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Live Preview Box */}
        <div className="poster-preview-wrapper">
          {currentPosterDataUrl ? (
            <img
              src={currentPosterDataUrl}
              alt="Match Poster Preview"
              className="poster-preview-image"
            />
          ) : (
            <div className="poster-loading-placeholder">
              <span>Generating high-res card...</span>
            </div>
          )}
        </div>

        {/* Share Feedback Toast */}
        {shareFeedback && (
          <div className="poster-feedback-banner">
            {shareFeedback}
          </div>
        )}

        {/* Actions */}
        <div className="poster-modal-actions">
          <button
            type="button"
            className="primary-button poster-share-btn"
            onClick={handleShare}
            disabled={isSharing || !currentPosterDataUrl}
          >
            {isSharing ? 'Preparing...' : 'Share / Download Poster 📤'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default PosterModal
