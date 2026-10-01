import { useRef, useState } from 'react'
import { useScoring } from './useScoring'
import { ACTIVE_MATCH_KEY } from '../services/storageService'
import { createLiveScoreImage } from '../services/canvasService'
import { emptyPlayer } from '../services/scoringEngine'
import { matchRepository } from '../services/repositories/matchRepository.ts'
import { generateUUID } from '../utils/uuid'
import { firebaseAuth } from '../services/firebase'
import { syncService } from '../services/syncService.ts'
import type { PersistedMatchRecord } from '../types/database.ts'
import type { MatchState } from '../context/MatchContext'
import type { CompletedMatch, MatchResult, ScoreState } from '../types/match'
import { validateTeamMatchup, validateOpeningSelection } from '../utils/validation'

export function useMatchCoordinator(matchState: MatchState) {
  const {
    matchId,
    setMatchId,
    teamOne,
    teamTwo,
    overs,
    teamSize,
    lastManBatting,
    tossWinner,
    decision,
    homePlayers,
    visitorPlayers,
    openingStriker,
    openingNonStriker,
    openingBowler,
    score,
    history,
    inningsNumber,
    firstBattingHome,
    firstInningsScore,
    battingRoster,
    bowlingRoster,
    setScreen,
    setTeamOne,
    setTeamTwo,
    setOvers,
    setTeamSize,
    setLastManBatting,
    setVenue,
    setCompetition,
    setTossCaller,
    setTossCall,
    setTossWinner,
    setDecision,
    setHomePlayers,
    setVisitorPlayers,
    setOpeningStriker,
    setOpeningNonStriker,
    setOpeningBowler,
    setScore,
    setHistory,
    setCompletedMatches,
    setInningsNumber,
    setFirstBattingHome,
    setFirstInningsScore,
    setMatchResult,
    setBattingRoster,
    setBowlingRoster,
    setMessage,
    flushPending,
  } = matchState

  const [playerMessage, setPlayerMessage] = useState('')
  const [milestone, setMilestone] = useState('')
  const [shareImage, setShareImage] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Terminal persistence state — exposed so LiveScreen can show loading / error
  // ---------------------------------------------------------------------------
  const [isFinishing, setIsFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  // Stores the finalScore snapshot so retryFinishMatch() can replay the write
  const pendingFinalScoreRef = useRef<ScoreState | null>(null)

  const maxBalls = Math.max(1, Number(overs) || 8) * 6
  const overNumber = score ? Math.floor(score.balls / 6) : 0
  const ballNumber = score ? score.balls % 6 : 0

  // ---------------------------------------------------------------------------
  // resetMatchState — shared helper called after successful terminal persistence.
  // Clears all active-match state and navigates to Setup.
  // ---------------------------------------------------------------------------
  function resetMatchState() {
    setMatchId(null)
    setTeamOne('')
    setTeamTwo('')
    setOvers('8')
    setTeamSize('11')
    setLastManBatting(false)
    setVenue('')
    setCompetition('')
    setTossCaller(null)
    setTossCall(null)
    setTossWinner(null)
    setDecision('bat')
    setHomePlayers([])
    setVisitorPlayers([])
    setOpeningStriker('')
    setOpeningNonStriker('')
    setOpeningBowler('')
    setScore(null)
    setHistory([])
    setInningsNumber(1)
    setFirstBattingHome(true)
    setFirstInningsScore(null)
    setMatchResult(null)
    scoring.resetModals()
    setBattingRoster([])
    setBowlingRoster([])
    setMessage('')
    setMilestone('')
    setShareImage(null)
    setScreen('setup')
  }

  const scoring = useScoring({
    score,
    setScore,
    history,
    setHistory,
    maxBalls,
    lastManBatting,
    battingRoster,
    inningsNumber,
    firstInningsScore,
    teamOne,
    teamTwo,
    onFirstInningsComplete: (completedScore) => {
      setFirstInningsScore(completedScore)
      setScreen('innings-break')
    },
    onSecondInningsComplete: finishMatch,
    createShareImage: createLiveScoreImage,
    onShareImage: setShareImage,
  })

  function startMatch() {
    const matchup = validateTeamMatchup(teamOne, teamTwo)
    if (!matchup.isValid) {
      setMessage(matchup.error)
      return
    }
    setMessage('')
    setTeamOne(matchup.teamOne)
    setTeamTwo(matchup.teamTwo)
    if (!matchId) {
      const newId = generateUUID()
      setMatchId(newId)
    }
    setScreen('match-options')
  }

  function continueToRoster() {
    if (!teamSize || Number(teamSize) < 2 || Number(teamSize) > 25) {
      setMessage('Choose between 2 and 25 players per team.')
      return
    }
    setMessage('')
    setScreen('roster')
  }

  function beginInnings() {
    const battingIsHome =
      (tossWinner === 'host' && decision === 'bat') ||
      (tossWinner === 'visitor' && decision === 'bowl')
    const battingPlayers = battingIsHome ? homePlayers : visitorPlayers
    const bowlingPlayers = battingIsHome ? visitorPlayers : homePlayers
    const validation = validateOpeningSelection(
      openingStriker,
      openingNonStriker,
      openingBowler,
      battingPlayers,
      bowlingPlayers
    )
    if (!validation.isValid) {
      setPlayerMessage(validation.error)
      return
    }
    setPlayerMessage('')
    setBattingRoster(battingPlayers)
    setBowlingRoster(bowlingPlayers)
    setFirstBattingHome(battingIsHome)
    setInningsNumber(1)
    setScore({
      runs: 0,
      wickets: 0,
      balls: 0,
      striker: emptyPlayer(openingStriker),
      nonStriker: emptyPlayer(openingNonStriker),
      bowler: { name: openingBowler, balls: 0, runs: 0, wickets: 0 },
      currentOver: [],
      overHistory: [],
      fallOfWickets: [],
      maxOvers: Number(overs) || 8,
      partnership: {
        runs: 0,
        balls: 0,
        batters: [openingStriker, openingNonStriker],
      },
      freeHit: false,
      wicketStreak: 0,
      dismissedBatters: [],
      inningsComplete: false,
      battingStats: [
        emptyPlayer(openingStriker),
        emptyPlayer(openingNonStriker),
      ],
      bowlerStats: [{ name: openingBowler, balls: 0, runs: 0, wickets: 0 }],
    })
    setHistory([])
    setScreen('live')
  }

  function startSecondInnings() {
    setScreen('second-opening')
    setPlayerMessage('')
    setOpeningStriker('')
    setOpeningNonStriker('')
    setOpeningBowler('')
  }

  function beginSecondInnings() {
    const battingPlayers = firstBattingHome ? visitorPlayers : homePlayers
    const bowlingPlayers = firstBattingHome ? homePlayers : visitorPlayers
    const validation = validateOpeningSelection(
      openingStriker,
      openingNonStriker,
      openingBowler,
      battingPlayers,
      bowlingPlayers
    )
    if (!validation.isValid) {
      setPlayerMessage(validation.error)
      return
    }
    setPlayerMessage('')
    setBattingRoster(battingPlayers)
    setBowlingRoster(bowlingPlayers)
    setInningsNumber(2)
    setScore({
      runs: 0,
      wickets: 0,
      balls: 0,
      striker: emptyPlayer(openingStriker),
      nonStriker: emptyPlayer(openingNonStriker),
      bowler: { name: openingBowler, balls: 0, runs: 0, wickets: 0 },
      currentOver: [],
      overHistory: [],
      fallOfWickets: [],
      maxOvers: Number(overs) || 8,
      target: (firstInningsScore?.runs ?? 0) + 1,
      partnership: {
        runs: 0,
        balls: 0,
        batters: [openingStriker, openingNonStriker],
      },
      freeHit: false,
      wicketStreak: 0,
      dismissedBatters: [],
      inningsComplete: false,
      battingStats: [
        emptyPlayer(openingStriker),
        emptyPlayer(openingNonStriker),
      ],
      bowlerStats: [{ name: openingBowler, balls: 0, runs: 0, wickets: 0 }],
    })
    setHistory([])
    scoring.resetModals()
    setScreen('live')
  }

  // ---------------------------------------------------------------------------
  // finishMatch — called when second innings completes (natural completion)
  //
  // Sequence:
  //   1. Build the completed record from the current state snapshot
  //   2. setIsFinishing(true) — live screen shows "Saving match result…"
  //   3. await matchRepository.saveMatch(completedRecord) — explicit IndexedDB write
  //   4. On success:
  //      a. flushPending() — cancels any queued debounce write that would
  //         overwrite the completed record with an in_progress snapshot
  //      b. Clear matchId and active-match localStorage key
  //      c. Commit result objects to React state
  //      d. Navigate to result screen
  //   5. On failure:
  //      a. setFinishError() — live screen shows error + retry button
  //      b. matchId is unchanged — match remains in_progress and fully recoverable
  // ---------------------------------------------------------------------------
  function finishMatch(finalScore: ScoreState) {
    const target = (firstInningsScore?.runs ?? 0) + 1
    const chaseTeam = firstBattingHome ? teamTwo : teamOne
    const firstTeam = firstBattingHome ? teamOne : teamTwo
    const currentMatchId = matchId || generateUUID()

    const resultObj: MatchResult =
      finalScore.runs === target - 1
        ? { winner: 'Match Tied', margin: '' }
        : finalScore.runs >= target
          ? {
              winner: chaseTeam,
              margin: `${Math.max(0, (lastManBatting ? battingRoster.length : Math.max(0, battingRoster.length - 1)) - finalScore.wickets)} wickets to spare`,
            }
          : {
              winner: firstTeam,
              margin: `${Math.max(0, target - 1 - finalScore.runs)} runs`,
            }

    const completed: CompletedMatch = {
      id: currentMatchId,
      savedAt: new Date().toISOString(),
      teamOne,
      teamTwo,
      firstBattingHome,
      firstInningsScore,
      secondInningsScore: finalScore,
      result: resultObj,
      venue: matchState.venue,
      competition: matchState.competition,
    }

    const completedRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: currentMatchId,
      status: 'completed',
      ownerUid: firebaseAuth.currentUser?.uid ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      teamOne,
      teamTwo,
      overs,
      teamSize,
      lastManBatting,
      venue: matchState.venue,
      competition: matchState.competition,
      tossCaller: matchState.tossCaller,
      tossCall: matchState.tossCall,
      tossWinner: matchState.tossWinner,
      decision: matchState.decision,
      homePlayers,
      visitorPlayers,
      openingStriker,
      openingNonStriker,
      openingBowler,
      score: finalScore,
      history,
      inningsNumber,
      firstBattingHome,
      firstInningsScore,
      matchResult: resultObj,
      battingRoster,
      bowlingRoster,
      screen: 'result',
    }

    pendingFinalScoreRef.current = finalScore
    setIsFinishing(true)
    setFinishError(null)

    void (async () => {
      try {
        await matchRepository.saveMatch(completedRecord)
        // Cancel any queued debounce write before clearing matchId so the
        // MatchContext cleanup cannot overwrite the completed record.
        flushPending()
        void syncService.syncMatch(currentMatchId)
        // Only commit to React state after successful persistence
        setCompletedMatches((items) => [
          completed,
          ...items.filter((item) => item.id !== completed.id),
        ])
        setMatchResult(resultObj)
        setMatchId(null)
        localStorage.removeItem(ACTIVE_MATCH_KEY)
        setIsFinishing(false)
        pendingFinalScoreRef.current = null
        setScreen('result')
      } catch {
        setIsFinishing(false)
        setFinishError(
          'Could not save match result. Please check your storage and try again.',
        )
        // matchId is unchanged — match remains in_progress and recoverable
      }
    })()
  }

  /**
   * Re-runs the finishMatch IndexedDB write using the stored final score snapshot.
   * Call this when finishError is set and isFinishing is false.
   */
  function retryFinishMatch() {
    const finalScore = pendingFinalScoreRef.current
    if (!finalScore || isFinishing) return
    finishMatch(finalScore)
  }

  async function shareLiveUpdate() {
    if (!shareImage) return
    const response = await fetch(shareImage)
    const blob = await response.blob()
    const file = new File(
      [blob],
      `${teamOne}-vs-${teamTwo}-over-update.png`,
      { type: 'image/png' }
    )
    if (navigator.share && navigator.canShare?.({ files: [file] }))
      await navigator.share({
        title: `${teamOne} vs ${teamTwo}`,
        text: 'Live score update',
        files: [file],
      })
    else {
      const link = document.createElement('a')
      link.href = shareImage
      link.download = file.name
      link.click()
    }
  }

  // ---------------------------------------------------------------------------
  // endMatch — user explicitly ends the match (abandoned lifecycle)
  //
  // Sequence:
  //   1. await markMatchAbandoned — explicit IndexedDB write
  //   2. On success: reset all state and navigate to Setup
  //   3. On failure: throws — caller (App.tsx) shows error, state is NOT cleared
  //      (match remains in_progress and fully recoverable)
  // ---------------------------------------------------------------------------
  async function endMatch(): Promise<void> {
    const abandonedId = matchId
    if (abandonedId) {
      // Explicit await — do not clear state before persistence is confirmed
      await matchRepository.markMatchAbandoned(abandonedId)
      // Sync is best-effort; not blocking the user flow
      void syncService.syncMatch(abandonedId)
    }
    localStorage.removeItem(ACTIVE_MATCH_KEY)
    resetMatchState()
  }

  function startNewMatch() {
    if (matchId) {
      const abandonedId = matchId
      void matchRepository.markMatchAbandoned(abandonedId).then(() => {
        void syncService.syncMatch(abandonedId)
      })
    }
    localStorage.removeItem(ACTIVE_MATCH_KEY)
    resetMatchState()
  }

  return {
    scoring,
    maxBalls,
    overNumber,
    ballNumber,
    milestone,
    shareImage,
    shareLiveUpdate,
    playerMessage,
    startMatch,
    continueToRoster,
    beginInnings,
    startSecondInnings,
    beginSecondInnings,
    endMatch,
    startNewMatch,
    isFinishing,
    finishError,
    retryFinishMatch,
  }
}
