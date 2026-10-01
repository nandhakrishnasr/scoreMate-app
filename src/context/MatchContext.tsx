import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CompletedMatch, MatchResult, SavedAppState, ScoreState, Screen, SquadPlayer } from '../types/match'
import type { useScoring } from '../hooks/useScoring'
import { matchRepository } from '../services/repositories/matchRepository.ts'
import { migrateLocalStorageToIndexedDB } from '../services/migrationService.ts'
import { toCompletedMatch, type PersistedMatchRecord } from '../types/database.ts'
import { generateUUID } from '../utils/uuid'
import { firebaseAuth } from '../services/firebase'
import { syncService } from '../services/syncService.ts'

type ScoringApi = ReturnType<typeof useScoring>
const ACTIVE_MATCH_KEY = 'gully-scorer-active-match'
const COMPLETED_MATCHES_KEY = 'gully-scorer-completed-matches'

export type MatchState = {
  matchId: string | null
  recoveredScreen: Screen | null
  screen: Screen
  teamOne: string
  teamTwo: string
  overs: string
  teamSize: string
  lastManBatting: boolean
  venue: string
  competition: string
  tossCaller: 'host' | 'visitor' | null
  tossCall: 'Heads' | 'Tails' | null
  tossWinner: 'host' | 'visitor' | null
  decision: 'bat' | 'bowl'
  homePlayers: SquadPlayer[]
  visitorPlayers: SquadPlayer[]
  openingStriker: string
  openingNonStriker: string
  openingBowler: string
  score: ScoreState | null
  history: ScoreState[]
  completedMatches: CompletedMatch[]
  inningsNumber: 1 | 2
  firstBattingHome: boolean
  firstInningsScore: ScoreState | null
  matchResult: MatchResult | null
  battingRoster: SquadPlayer[]
  bowlingRoster: SquadPlayer[]
  message: string
  authMode: 'email' | 'phone'
  authEmail: string
  authPassword: string
  authPhone: string
  authOtp: string
  authOtpSent: boolean
  authModal: 'create' | 'google' | 'apple' | null
  authMessage: string
  setMatchId: (value: string | null) => void
  setRecoveredScreen: (value: Screen | null) => void
  setScreen: (value: Screen) => void
  setTeamOne: (value: string) => void
  setTeamTwo: (value: string) => void
  setOvers: (value: string) => void
  setTeamSize: (value: string) => void
  setLastManBatting: (value: boolean) => void
  setVenue: (value: string) => void
  setCompetition: (value: string) => void
  setTossCaller: (value: 'host' | 'visitor' | null) => void
  setTossCall: (value: 'Heads' | 'Tails' | null) => void
  setTossWinner: (value: 'host' | 'visitor' | null) => void
  setDecision: (value: 'bat' | 'bowl') => void
  setHomePlayers: (value: SquadPlayer[] | ((items: SquadPlayer[]) => SquadPlayer[])) => void
  setVisitorPlayers: (value: SquadPlayer[] | ((items: SquadPlayer[]) => SquadPlayer[])) => void
  setOpeningStriker: (value: string) => void
  setOpeningNonStriker: (value: string) => void
  setOpeningBowler: (value: string) => void
  setScore: (value: ScoreState | null | ((current: ScoreState | null) => ScoreState | null)) => void
  setHistory: (value: ScoreState[] | ((items: ScoreState[]) => ScoreState[])) => void
  setCompletedMatches: (value: CompletedMatch[] | ((items: CompletedMatch[]) => CompletedMatch[])) => void
  setInningsNumber: (value: 1 | 2) => void
  setFirstBattingHome: (value: boolean) => void
  setFirstInningsScore: (value: ScoreState | null) => void
  setMatchResult: (value: MatchResult | null) => void
  setBattingRoster: (value: SquadPlayer[] | ((items: SquadPlayer[]) => SquadPlayer[])) => void
  setBowlingRoster: (value: SquadPlayer[] | ((items: SquadPlayer[]) => SquadPlayer[])) => void
  setMessage: (value: string) => void
  setAuthMode: (value: 'email' | 'phone') => void
  setAuthEmail: (value: string) => void
  setAuthPassword: (value: string) => void
  setAuthPhone: (value: string) => void
  setAuthOtp: (value: string) => void
  setAuthOtpSent: (value: boolean) => void
  setAuthModal: (value: 'create' | 'google' | 'apple' | null) => void
  setAuthMessage: (value: string) => void
  /** Cancels any queued debounce-persistence write. Call before clearing matchId
   *  on terminal transitions (finishMatch / endMatch) so the debounce cleanup
   *  cannot overwrite the final completed/abandoned record. */
  flushPending: () => void
}

export type MatchContextValue = { score: ScoreState | null; scoring: ScoringApi; state: MatchState }

const MatchContext = createContext<MatchContextValue | null>(null)

export function MatchProvider({ value, children }: { value: MatchContextValue; children: ReactNode }) {
  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>
}

export function useMatch() {
  const value = useContext(MatchContext)
  if (!value) throw new Error('useMatch must be used inside MatchProvider')
  return value
}

function isSavedAppState(value: unknown): value is SavedAppState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<SavedAppState>
  return typeof state.teamOne === 'string' && typeof state.teamTwo === 'string' && typeof state.overs === 'string' && typeof state.teamSize === 'string' && typeof state.lastManBatting === 'boolean' && Array.isArray(state.homePlayers) && Array.isArray(state.visitorPlayers) && Array.isArray(state.history) && (state.score === null || typeof state.score === 'object') && (state.firstInningsScore === null || typeof state.firstInningsScore === 'object') && (state.matchResult === null || typeof state.matchResult === 'object') && Array.isArray(state.battingRoster) && Array.isArray(state.bowlingRoster)
}

export function useMatchState(): MatchState {
  const [matchId, setMatchId] = useState<string | null>(null)
  const [recoveredScreen, setRecoveredScreen] = useState<Screen | null>(null)
  const [screen, setScreen] = useState<Screen>('login')
  const [teamOne, setTeamOne] = useState('')
  const [teamTwo, setTeamTwo] = useState('')
  const [overs, setOvers] = useState('8')
  const [teamSize, setTeamSize] = useState('11')
  const [lastManBatting, setLastManBatting] = useState(false)
  const [venue, setVenue] = useState('')
  const [competition, setCompetition] = useState('')
  const [tossCaller, setTossCaller] = useState<'host' | 'visitor' | null>(null)
  const [tossCall, setTossCall] = useState<'Heads' | 'Tails' | null>(null)
  const [tossWinner, setTossWinner] = useState<'host' | 'visitor' | null>(null)
  const [decision, setDecision] = useState<'bat' | 'bowl'>('bat')
  const [homePlayers, setHomePlayers] = useState<SquadPlayer[]>([])
  const [visitorPlayers, setVisitorPlayers] = useState<SquadPlayer[]>([])
  const [openingStriker, setOpeningStriker] = useState('')
  const [openingNonStriker, setOpeningNonStriker] = useState('')
  const [openingBowler, setOpeningBowler] = useState('')
  const [score, setScore] = useState<ScoreState | null>(null)
  const [history, setHistory] = useState<ScoreState[]>([])
  const [completedMatches, setCompletedMatches] = useState<CompletedMatch[]>([])
  const [inningsNumber, setInningsNumber] = useState<1 | 2>(1)
  const [firstBattingHome, setFirstBattingHome] = useState(true)
  const [firstInningsScore, setFirstInningsScore] = useState<ScoreState | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [battingRoster, setBattingRoster] = useState<SquadPlayer[]>([])
  const [bowlingRoster, setBowlingRoster] = useState<SquadPlayer[]>([])
  const [message, setMessage] = useState('')
  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const [authOtp, setAuthOtp] = useState('')
  const [authOtpSent, setAuthOtpSent] = useState(false)
  const [authModal, setAuthModal] = useState<'create' | 'google' | 'apple' | null>(null)
  const [authMessage, setAuthMessage] = useState('')
  const completedMatchesLoaded = useRef(false)
  const storageReady = useRef(false)

  useEffect(() => {
    let isMounted = true

    async function initPersistence() {
      try {
        await migrateLocalStorageToIndexedDB(firebaseAuth.currentUser?.uid ?? null)

        // 1. Load completed matches from IndexedDB
        const persistedCompleted = await matchRepository.listMatches({ status: 'completed' })
        if (isMounted && persistedCompleted.length > 0) {
          setCompletedMatches(persistedCompleted.map(toCompletedMatch))
        } else if (isMounted) {
          const savedMatches = localStorage.getItem(COMPLETED_MATCHES_KEY)
          if (savedMatches) {
            try {
              const parsed: unknown = JSON.parse(savedMatches)
              if (Array.isArray(parsed)) setCompletedMatches(parsed as CompletedMatch[])
            } catch {
              setMessage('Saved match history could not be loaded. Import a backup to restore it.')
            }
          }
        }

        // 2. Recover active match from IndexedDB
        const active = await matchRepository.getActiveMatch()
        if (isMounted && active) {
          setMatchId(active.matchId)
          if (active.screen) {
            setRecoveredScreen(active.screen)
          }
          setScreen('login')
          setTeamOne(active.teamOne); setTeamTwo(active.teamTwo); setOvers(active.overs); setTeamSize(active.teamSize); setLastManBatting(active.lastManBatting)
          setVenue(active.venue); setCompetition(active.competition); setTossCaller(active.tossCaller); setTossCall(active.tossCall); setTossWinner(active.tossWinner); setDecision(active.decision)
          setHomePlayers(active.homePlayers); setVisitorPlayers(active.visitorPlayers); setOpeningStriker(active.openingStriker); setOpeningNonStriker(active.openingNonStriker); setOpeningBowler(active.openingBowler)
          setScore(active.score); setHistory(active.history); setInningsNumber(active.inningsNumber); setFirstBattingHome(active.firstBattingHome); setFirstInningsScore(active.firstInningsScore); setMatchResult(active.matchResult); setBattingRoster(active.battingRoster); setBowlingRoster(active.bowlingRoster)
        } else if (isMounted) {
          const saved = localStorage.getItem(ACTIVE_MATCH_KEY)
          if (saved) {
            try {
              const parsed: unknown = JSON.parse(saved)
              if (isSavedAppState(parsed)) {
                const newId = generateUUID()
                setMatchId(newId)
                if (parsed.screen) {
                  setRecoveredScreen(parsed.screen)
                }
                setScreen('login')
                setTeamOne(parsed.teamOne); setTeamTwo(parsed.teamTwo); setOvers(parsed.overs); setTeamSize(parsed.teamSize); setLastManBatting(parsed.lastManBatting)
                setVenue(parsed.venue); setCompetition(parsed.competition); setTossCaller(parsed.tossCaller); setTossCall(parsed.tossCall); setTossWinner(parsed.tossWinner); setDecision(parsed.decision)
                setHomePlayers(parsed.homePlayers); setVisitorPlayers(parsed.visitorPlayers); setOpeningStriker(parsed.openingStriker); setOpeningNonStriker(parsed.openingNonStriker); setOpeningBowler(parsed.openingBowler)
                setScore(parsed.score); setHistory(parsed.history); setInningsNumber(parsed.inningsNumber); setFirstBattingHome(parsed.firstBattingHome); setFirstInningsScore(parsed.firstInningsScore); setMatchResult(parsed.matchResult); setBattingRoster(parsed.battingRoster); setBowlingRoster(parsed.bowlingRoster)
              }
            } catch {
              localStorage.removeItem(ACTIVE_MATCH_KEY)
              setMessage('Saved match data could not be loaded. Start a new match.')
            }
          }
        }
      } catch {
        if (isMounted) setMessage('Local database error. Operating with temporary session.')
      } finally {
        if (isMounted) {
          completedMatchesLoaded.current = true
          storageReady.current = true
          if (firebaseAuth.currentUser?.uid) {
            void syncService.syncAll()
          }
        }
      }
    }

    void initPersistence()

    return () => {
      isMounted = false
    }
  }, [])

  const pendingRecordRef = useRef<PersistedMatchRecord | null>(null)

  /** Synchronously discards any pending debounce write. Must be called before
   *  setMatchId(null) during finishMatch/endMatch to prevent the effect cleanup
   *  from overwriting the terminal record with a stale in_progress snapshot. */
  const flushPending = useCallback(() => {
    pendingRecordRef.current = null
  }, [])

  // Flush pending persistence on visibility change or pagehide (e.g. mobile app backgrounding/closing)
  useEffect(() => {
    function flushPending() {
      if (document.visibilityState === 'hidden' && pendingRecordRef.current) {
        void matchRepository.saveMatch(pendingRecordRef.current)
        pendingRecordRef.current = null
      }
    }
    window.addEventListener('visibilitychange', flushPending)
    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('visibilitychange', flushPending)
      window.removeEventListener('pagehide', flushPending)
    }
  }, [])

  // Controlled debounced persistence to IndexedDB
  useEffect(() => {
    if (!storageReady.current || !matchId) return
    if (!teamOne.trim() && !teamTwo.trim()) return

    const record: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: firebaseAuth.currentUser?.uid ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      history,
      inningsNumber,
      firstBattingHome,
      firstInningsScore,
      matchResult,
      battingRoster,
      bowlingRoster,
      screen,
    }

    pendingRecordRef.current = record

    const timer = setTimeout(() => {
      if (pendingRecordRef.current) {
        void matchRepository.saveMatch(pendingRecordRef.current)
        pendingRecordRef.current = null
      }
    }, 400)

    return () => {
      clearTimeout(timer)
      if (pendingRecordRef.current) {
        void matchRepository.saveMatch(pendingRecordRef.current)
        pendingRecordRef.current = null
      }
    }
  }, [
    matchId,
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
    history,
    inningsNumber,
    firstBattingHome,
    firstInningsScore,
    matchResult,
    battingRoster,
    bowlingRoster,
  ])

  return {
    matchId,
    recoveredScreen,
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
    history,
    completedMatches,
    inningsNumber,
    firstBattingHome,
    firstInningsScore,
    matchResult,
    battingRoster,
    bowlingRoster,
    message,
    authMode,
    authEmail,
    authPassword,
    authPhone,
    authOtp,
    authOtpSent,
    authModal,
    authMessage,
    setMatchId,
    setRecoveredScreen,
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
    setAuthMode,
    setAuthEmail,
    setAuthPassword,
    setAuthPhone,
    setAuthOtp,
    setAuthOtpSent,
    setAuthModal,
    setAuthMessage,
    flushPending,
  }
}