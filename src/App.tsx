import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import MatchRouter from './components/MatchRouter'
import { LoginScreen } from './screens/LoginScreen'
import { SetupScreen } from './screens/SetupScreen'
import { MatchOptionsScreen } from './screens/MatchOptionsScreen'
import { PlayersScreen } from './screens/PlayersScreen'
import { OpeningSelectScreen } from './screens/OpeningSelectScreen'
import { InningsBreakScreen } from './screens/InningsBreakScreen'
import { SecondOpeningScreen } from './screens/SecondOpeningScreen'
import { LiveScreen } from './screens/LiveScreen'
import { ConfirmModal } from './components/modals/ConfirmModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { HistoryScreen } from './screens/HistoryScreen'
import { TeamsScreen } from './screens/TeamsScreen'
import { PlayersStatsScreen } from './screens/PlayersStatsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { ScorecardScreen } from './screens/ScorecardScreen'
import { ResultScreen } from './screens/ResultScreen'
import { MatchProvider, useMatchState } from './context/MatchContext'
import { SettingsContext } from './context/SettingsContext'
import { NavigationContext } from './context/NavigationContext'
import { useMatchCoordinator } from './hooks/useMatchCoordinator'
import { useBackNavigation } from './hooks/useBackNavigation'
import { computeBackAction, type BackState } from './services/navigationService'
import { THEME_KEY } from './services/storageService'
import { resolveInitialTheme, applyTheme, type Theme } from './utils/theme'
import { matchRepository } from './services/repositories/matchRepository'
import { toCompletedMatch } from './types/database'
import { checkAndRunAutomaticBackup } from './services/autoBackupService'
import { AuthProvider, useAuth } from './context/AuthContext'
import './index.css'

function AppContent() {
  const { status, loading } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() =>
    resolveInitialTheme(localStorage.getItem(THEME_KEY))
  )
  const matchState = useMatchState()
  const {
    screen,
    teamOne,
    teamTwo,
    overs,
    teamSize,
    lastManBatting,
    venue,
    competition,
    tossCaller,
    tossCall,
    tossWinner,
    decision,
    homePlayers,
    visitorPlayers,
    openingStriker,
    openingNonStriker,
    openingBowler,
    score,
    completedMatches,
    inningsNumber,
    firstBattingHome,
    firstInningsScore,
    matchResult,
    message,
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
    setCompletedMatches,
  } = matchState

  const {
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
  } = useMatchCoordinator(matchState)

  // ---------------------------------------------------------------------------
  // Phase 8 — Navigation / Back state
  // ---------------------------------------------------------------------------

  /** Leave-match confirmation: shown when Back is pressed on the live screen */
  const [leavePending, setLeavePending] = useState(false)
  /** End-match confirmation: lifted here so global Back handler can dismiss it */
  const [endMatchPending, setEndMatchPending] = useState(false)
  /** Loading state while endMatch awaits IndexedDB */
  const [isEndingMatch, setIsEndingMatch] = useState(false)
  /** Error surfaced when endMatch write fails */
  const [endMatchError, setEndMatchError] = useState<string | null>(null)

  // Clear end-match error when the confirm modal re-opens (user is retrying)
  useEffect(() => {
    if (endMatchPending) setEndMatchError(null)
  }, [endMatchPending])

  // Ref snapshot of volatile state — updated synchronously on every render so
  // the stable onBack callback always reads the latest values.
  const stateRef = useRef({
    screen,
    score,
    settingsOpen,
    leavePending,
    endMatchPending,
    isFinishing,
    isEndingMatch,
    scoring,
  })
  stateRef.current = {
    screen,
    score,
    settingsOpen,
    leavePending,
    endMatchPending,
    isFinishing,
    isEndingMatch,
    scoring,
  }

  /**
   * Priority-ordered Back handler.
   * Uses a stable callback (empty deps) that reads state via stateRef.
   * React state setters are guaranteed stable by React and captured directly.
   */
  const onBack = useCallback(() => {
    const s = stateRef.current
    const backState: BackState = {
      screen: s.screen,
      hasActiveScore: s.score !== null,
      settingsOpen: s.settingsOpen,
      undoPending: s.scoring.undoPending,
      endMatchPending: s.endMatchPending,
      leavePending: s.leavePending,
      hasScoringModal:
        s.scoring.scoringModal !== null ||
        s.scoring.wicketDetails !== null ||
        s.scoring.nextBatterOpen ||
        s.scoring.nextBowlerOpen,
      isFinishing: s.isFinishing,
      isEndingMatch: s.isEndingMatch,
    }
    const action = computeBackAction(backState)
    switch (action.type) {
      case 'noop':
        return
      case 'close-settings':
        setSettingsOpen(false)
        return
      case 'cancel-undo':
        s.scoring.setUndoPending(false)
        return
      case 'close-end-match-confirm':
        setEndMatchPending(false)
        return
      case 'close-leave-confirm':
        setLeavePending(false)
        return
      case 'close-scoring-modal':
        s.scoring.resetModals()
        return
      case 'show-leave-confirm':
        setLeavePending(true)
        return
      case 'navigate':
        setScreen(action.to)
        return
      case 'exit-app':
        if (Capacitor.isNativePlatform()) void CapacitorApp.exitApp()
        return
    }
  // React state setters (setSettingsOpen, setEndMatchPending, setLeavePending,
  // setScreen) are stable references — safe to omit from deps array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mount the browser sentinel + Capacitor backButton listener
  useBackNavigation(onBack)

  /**
   * Handles the "End Match" user action.
   * Awaits markMatchAbandoned before clearing state.
   * On failure: surfaces error in LiveScreen without clearing match state.
   */
  async function handleEndMatch() {
    setEndMatchPending(false)   // close confirmation modal immediately
    setIsEndingMatch(true)
    setEndMatchError(null)
    try {
      await endMatch()          // throws on persistence failure
      // endMatch calls resetMatchState() internally → navigates to setup
    } catch (err) {
      setIsEndingMatch(false)
      setEndMatchError(
        err instanceof Error ? err.message : 'Could not end match. Please try again.',
      )
    }
  }

  /**
   * Confirms the leave-match flow: navigate to Setup without abandoning.
   * The match remains in_progress in IndexedDB and is recoverable.
   */
  function handleLeaveMatch() {
    setLeavePending(false)
    setScreen('setup')
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!loading && (status === 'authenticated' || status === 'offline_guest')) {
      if (screen === 'login') {
        const targetScreen = matchState.recoveredScreen || (score ? 'live' : 'setup')
        setScreen(targetScreen)
      }
    }
  }, [loading, status, screen, matchState.recoveredScreen, score, setScreen])

  // Non-blocking best-effort 7-day automatic backup check on startup (Phase 6)
  useEffect(() => {
    if (!loading && status === 'authenticated') {
      void checkAndRunAutomaticBackup()
    }
  }, [loading, status])

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  const setupRoute = (
    <SetupScreen
      teamOne={teamOne}
      teamTwo={teamTwo}
      setTeamOne={setTeamOne}
      setTeamTwo={setTeamTwo}
      tossCaller={tossCaller}
      setTossCaller={setTossCaller}
      tossCall={tossCall}
      setTossCall={setTossCall}
      tossWinner={tossWinner}
      setTossWinner={setTossWinner}
      decision={decision}
      setDecision={setDecision}
      startMatch={startMatch}
      message={message}
      setScreen={setScreen}
    />
  )

  const liveRoute = (
    <LiveScreen
      score={score!}
      teamOne={teamOne}
      teamTwo={teamTwo}
      firstBattingHome={firstBattingHome}
      overs={Number(overs) || 8}
      overNumber={overNumber}
      ballNumber={ballNumber}
      inningsNumber={inningsNumber}
      target={firstInningsScore ? firstInningsScore.runs + 1 : null}
      milestone={milestone}
      shareImage={shareImage}
      shareLiveUpdate={shareLiveUpdate}
      setScreen={setScreen}
      maxBalls={maxBalls}
      battingRoster={matchState.battingRoster}
      bowlingRoster={matchState.bowlingRoster}
      onEndMatch={() => { void handleEndMatch() }}
      onLeaveMatch={() => setLeavePending(true)}
      endMatchPending={endMatchPending}
      onEndMatchPendingChange={setEndMatchPending}
      isEndingMatch={isEndingMatch}
      endMatchError={endMatchError}
      isFinishing={isFinishing}
      finishError={finishError}
      onRetryFinishMatch={retryFinishMatch}
    />
  )

  const route = (
    <MatchRouter
      screen={screen}
      fallback={liveRoute}
      routes={{
        login: (
          <LoginScreen
            setScreen={setScreen}
            resumeScreen={matchState.recoveredScreen || (score ? 'live' : 'setup')}
          />
        ),
        setup: setupRoute,
        opening: setupRoute,
        'match-options': (
          <MatchOptionsScreen
            teamOne={teamOne}
            teamTwo={teamTwo}
            overs={overs}
            teamSize={teamSize}
            lastManBatting={lastManBatting}
            venue={venue}
            competition={competition}
            setOvers={setOvers}
            setTeamSize={setTeamSize}
            setLastManBatting={setLastManBatting}
            setVenue={setVenue}
            setCompetition={setCompetition}
            startMatch={continueToRoster}
            setScreen={setScreen}
            message={message}
          />
        ),
        roster: (
          <PlayersScreen
            teamOne={teamOne}
            teamTwo={teamTwo}
            overs={overs}
            venue={venue}
            competition={competition}
            tossWinner={tossWinner}
            teamSize={teamSize}
            homePlayers={homePlayers}
            visitorPlayers={visitorPlayers}
            setHomePlayers={setHomePlayers}
            setVisitorPlayers={setVisitorPlayers}
            openingStriker={openingStriker}
            openingNonStriker={openingNonStriker}
            openingBowler={openingBowler}
            setOpeningStriker={setOpeningStriker}
            setOpeningNonStriker={setOpeningNonStriker}
            setOpeningBowler={setOpeningBowler}
            beginInnings={() => setScreen('opening-select')}
            setScreen={setScreen}
          />
        ),
        teams: <TeamsScreen matches={completedMatches} setScreen={setScreen} />,
        players: (
          <PlayersStatsScreen
            matches={completedMatches}
            setScreen={setScreen}
          />
        ),
        'opening-select': (
          <OpeningSelectScreen
            teamOne={teamOne}
            teamTwo={teamTwo}
            overs={overs}
            tossWinner={tossWinner}
            decision={decision}
            homePlayers={homePlayers}
            visitorPlayers={visitorPlayers}
            openingStriker={openingStriker}
            openingNonStriker={openingNonStriker}
            openingBowler={openingBowler}
            setOpeningStriker={setOpeningStriker}
            setOpeningNonStriker={setOpeningNonStriker}
            setOpeningBowler={setOpeningBowler}
            beginInnings={beginInnings}
            playerMessage={playerMessage}
            setScreen={setScreen}
          />
        ),
        'innings-break': firstInningsScore ? (
          <InningsBreakScreen
            teamOne={teamOne}
            teamTwo={teamTwo}
            overs={overs}
            firstBattingHome={firstBattingHome}
            firstInningsScore={firstInningsScore}
            startSecondInnings={startSecondInnings}
            onEndMatch={() => { void handleEndMatch() }}
          />
        ) : undefined,
        'second-opening': (
          <SecondOpeningScreen
            teamOne={teamOne}
            teamTwo={teamTwo}
            overs={overs}
            firstBattingHome={firstBattingHome}
            battingRoster={
              firstBattingHome ? visitorPlayers : homePlayers
            }
            bowlingRoster={
              firstBattingHome ? homePlayers : visitorPlayers
            }
            openingStriker={openingStriker}
            openingNonStriker={openingNonStriker}
            openingBowler={openingBowler}
            setOpeningStriker={setOpeningStriker}
            setOpeningNonStriker={setOpeningNonStriker}
            setOpeningBowler={setOpeningBowler}
            beginSecondInnings={beginSecondInnings}
            playerMessage={playerMessage}
            setScreen={setScreen}
          />
        ),
        scorecard: score ? (
          <ScorecardScreen
            score={score}
            firstInningsScore={firstInningsScore}
            currentTeamName={
              inningsNumber === 1
                ? firstBattingHome
                  ? teamOne
                  : teamTwo
                : firstBattingHome
                  ? teamTwo
                  : teamOne
            }
            firstTeamName={firstBattingHome ? teamOne : teamTwo}
            overs={Number(overs) || 8}
            onBack={() => setScreen('live')}
          />
        ) : undefined,
        result: matchResult ? (
          <ResultScreen
            result={matchResult}
            teamOne={teamOne}
            teamTwo={teamTwo}
            firstBattingHome={firstBattingHome}
            firstInningsScore={firstInningsScore}
            score={score}
            onBack={() => setScreen('history')}
            onPlayerOfMatch={(playerOfMatch) =>
              setCompletedMatches((items) =>
                items.map((match, index) =>
                  index === 0 ? { ...match, playerOfMatch } : match
                )
              )
            }
            onNewMatch={startNewMatch}
          />
        ) : undefined,
        history: (
          <HistoryScreen
            matches={completedMatches}
            onBack={() => setScreen(score ? 'live' : 'setup')}
            onImport={(matches) => setCompletedMatches(matches)}
            setScreen={setScreen}
          />
        ),
        profile: (
          <ProfileScreen
            setScreen={setScreen}
            openSettings={() => setSettingsOpen(true)}
            onReloadMatches={async () => {
              const persisted = await matchRepository.listMatches({ status: 'completed' })
              setCompletedMatches(persisted.map(toCompletedMatch))
            }}
          />
        ),
      }}
    />
  )

  if (loading) {
    return (
      <div
        className="app-shell"
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          background: 'var(--bg)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <img
            src="/scoremate.png"
            alt="ScoreMate"
            style={{ width: '64px', height: '64px', marginBottom: '16px' }}
          />
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>
            Starting ScoreMate…
          </p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="app-canvas">
        <LoginScreen setScreen={setScreen} />
      </div>
    )
  }

  return (
    <NavigationContext.Provider value={setScreen}>
      <SettingsContext.Provider value={() => setSettingsOpen(true)}>
        <MatchProvider value={{ score, scoring, state: matchState }}>
          <div className="app-canvas">
            {route}

            {/* Undo last delivery */}
            {scoring.undoPending && (
              <ConfirmModal
                title="Undo the last delivery?"
                onCancel={() => scoring.setUndoPending(false)}
                onConfirm={scoring.confirmUndo}
              />
            )}

            {/* Leave match — navigates to Setup, match stays in_progress */}
            {leavePending && (
              <ConfirmModal
                title="Leave this match?"
                message="The match is still in progress and has been saved. You can resume it later from Setup."
                confirmLabel="Leave Match"
                cancelLabel="Continue Scoring"
                onCancel={() => setLeavePending(false)}
                onConfirm={handleLeaveMatch}
              />
            )}

            {settingsOpen && (
              <SettingsModal
                theme={theme}
                onThemeChange={setTheme}
                onClose={() => setSettingsOpen(false)}
                onReloadMatches={async () => {
                  const persisted = await matchRepository.listMatches({ status: 'completed' })
                  setCompletedMatches(persisted.map(toCompletedMatch))
                }}
              />
            )}
          </div>
        </MatchProvider>
      </SettingsContext.Provider>
    </NavigationContext.Provider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
