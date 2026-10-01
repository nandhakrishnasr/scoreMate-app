import { useState } from 'react'
import type {
  BallKind,
  BatterStatusEvent,
  BowlerStats,
  DeliveryInput,
  Player,
  ScoreState,
  SquadPlayer,
  WicketDetails,
  WicketEvent,
  WicketType,
} from '../types/match'
import {
  emptyExtras,
  emptyPlayer,
  processBatterStatusEvent,
  processDelivery,
} from '../services/scoringEngine'

type UseScoringOptions = {
  score: ScoreState | null
  setScore: (update: ScoreState | null | ((current: ScoreState | null) => ScoreState | null)) => void
  history: ScoreState[]
  setHistory: (update: ScoreState[] | ((current: ScoreState[]) => ScoreState[])) => void
  maxBalls: number
  lastManBatting: boolean
  battingRoster: SquadPlayer[]
  inningsNumber: 1 | 2
  firstInningsScore: ScoreState | null
  teamOne: string
  teamTwo: string
  onFirstInningsComplete: (score: ScoreState) => void
  onSecondInningsComplete: (score: ScoreState) => void
  createShareImage?: (score: ScoreState, teamOne: string, teamTwo: string, inningsNumber: 1 | 2) => string | null
  onShareImage: (image: string) => void
}

export function useScoring(options: UseScoringOptions) {
  const [nextBatterOpen, setNextBatterOpen] = useState(false)
  const [nextBowlerOpen, setNextBowlerOpen] = useState(false)
  const [undoPending, setUndoPending] = useState(false)
  const [scoringModal, setScoringModal] = useState<Exclude<import('../types/match').ScoringModal, null> | null>(null)
  const [wicketDetails, setWicketDetails] = useState<WicketDetails | null>(null)

  function addDelivery(input: DeliveryInput) {
    const score = options.score
    if (!score || score.balls >= options.maxBalls || score.inningsComplete || nextBatterOpen || nextBowlerOpen) return

    options.setHistory((items) => [...items, structuredClone(score)])

    const result = processDelivery(score, input, {
      maxBalls: options.maxBalls,
      lastManBatting: options.lastManBatting,
      battingRoster: options.battingRoster,
      inningsNumber: options.inningsNumber,
      firstInningsScore: options.firstInningsScore,
    })

    const updated = result.nextState
    options.setScore(updated)

    if (result.wicketOccurred && !result.inningsComplete) {
      const isSoloLastMan =
        options.lastManBatting && updated.wickets === options.battingRoster.length - 1
      if (!isSoloLastMan) {
        setNextBatterOpen(true)
      }
    }

    if (result.overComplete && !result.wicketOccurred && !result.inningsComplete) {
      setNextBowlerOpen(true)
    }

    if (result.overComplete && options.createShareImage) {
      const lastOver = updated.overHistory.at(-1)
      const image = options.createShareImage(
        { ...updated, currentOver: lastOver?.deliveries ?? [] },
        options.teamOne,
        options.teamTwo,
        options.inningsNumber,
      )
      if (image) options.onShareImage(image)
    }

    setScoringModal(null)
    setWicketDetails(null)

    if (result.inningsComplete) {
      if (options.inningsNumber === 1) options.onFirstInningsComplete(updated)
      else options.onSecondInningsComplete(updated)
    }
  }

  function addBall(kind: BallKind, value = 0, label?: string, wicket?: WicketDetails) {
    const score = options.score
    if (!score) return

    let input: DeliveryInput

    if (kind === 'runs') {
      input = {
        batterRuns: value,
        extras: emptyExtras(),
        completedRuns: value,
        isLegal: true,
        customLabel: label,
      }
    } else if (kind === 'wide') {
      input = {
        batterRuns: 0,
        extras: { wides: 1 + value, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: value,
        isLegal: false,
        customLabel: label,
      }
    } else if (kind === 'noBall') {
      input = {
        batterRuns: value,
        extras: { wides: 0, noBalls: 1, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: value,
        isLegal: false,
        customLabel: label,
      }
    } else if (kind === 'bye') {
      input = {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 0, byes: value, legByes: 0, penalty: 0 },
        completedRuns: value,
        isLegal: true,
        customLabel: label,
      }
    } else if (kind === 'legBye') {
      input = {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: value, penalty: 0 },
        completedRuns: value,
        isLegal: true,
        customLabel: label,
      }
    } else if (kind === 'wicket') {
      const dismissedRole = wicket?.dismissedBatter ?? 'striker'
      const dismissedName =
        dismissedRole === 'nonStriker' ? score.nonStriker.name : score.striker.name
      const runsCompleted = wicket?.runsCompleted ?? 0
      const wkt: WicketEvent = {
        kind: wicket?.type ?? 'Bowled',
        dismissedBatter: dismissedRole,
        dismissedPlayerName: dismissedName,
        helper: wicket?.helper,
        runsCompleted,
      }
      input = {
        batterRuns: runsCompleted,
        extras: emptyExtras(),
        completedRuns: runsCompleted,
        isLegal: true,
        wicket: wkt,
        customLabel: label,
      }
    } else {
      input = {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
      }
    }

    addDelivery(input)
  }

  function chooseNextBatter(name: string) {
    if (!options.score || !name) return
    const current = options.score

    let nextStriker: Player
    let nextNonStriker: Player

    if (current.striker.name === 'Choose next batter' || !current.striker.name) {
      nextStriker = emptyPlayer(name)
      nextNonStriker = current.nonStriker
    } else if (current.nonStriker.name === 'Choose next batter' || !current.nonStriker.name) {
      nextStriker = current.striker
      nextNonStriker = emptyPlayer(name)
    } else {
      nextStriker = emptyPlayer(name)
      nextNonStriker = current.nonStriker
    }

    const nextBattingStats = current.battingStats.some((p) => p.name === name)
      ? current.battingStats
      : [...current.battingStats, emptyPlayer(name)]

    options.setScore({
      ...current,
      striker: nextStriker,
      nonStriker: nextNonStriker,
      partnership: {
        runs: current.partnership?.runs ?? 0,
        balls: current.partnership?.balls ?? 0,
        batters: [nextStriker.name, nextNonStriker.name],
      },
      battingStats: nextBattingStats,
    })

    setNextBatterOpen(false)
    if (current.balls > 0 && current.balls % 6 === 0) {
      setNextBowlerOpen(true)
    }
  }

  function chooseNextBowler(name: string) {
    if (!options.score || !name) return
    const current = options.score

    // Look up existing cumulative figures for returning bowlers
    const existing = current.bowlerStats.find((b) => b.name === name)
    const activeBowler: BowlerStats = existing
      ? { ...existing }
      : {
          name,
          balls: 0,
          runs: 0,
          wickets: 0,
          maidens: 0,
          wides: 0,
          noBalls: 0,
          dotBalls: 0,
        }

    const nextBowlerStats = existing
      ? current.bowlerStats
      : [...current.bowlerStats, activeBowler]

    options.setScore({
      ...current,
      bowler: activeBowler,
      bowlerStats: nextBowlerStats,
    })
    setNextBowlerOpen(false)
  }

  function swapBatters() {
    if (!options.score?.nonStriker.name) return
    options.setScore({
      ...options.score,
      striker: options.score.nonStriker,
      nonStriker: options.score.striker,
      partnership: options.score.partnership
        ? {
            ...options.score.partnership,
            batters: [options.score.nonStriker.name, options.score.striker.name],
          }
        : options.score.partnership,
    })
  }

  function retireBatter(
    playerName: string,
    statusEvent: BatterStatusEvent = 'Retired Hurt',
    incomingPlayerName = 'Choose next batter',
  ) {
    if (!options.score || !playerName) return
    options.setHistory((items) => [...items, structuredClone(options.score!)])
    const nextState = processBatterStatusEvent(
      options.score,
      statusEvent,
      playerName,
      incomingPlayerName,
    )
    options.setScore(nextState)
    setScoringModal(null)
    setNextBatterOpen(true)
  }

  function undo() {
    if (options.history.at(-1)) setUndoPending(true)
  }

  function confirmUndo() {
    const previous = options.history.at(-1)
    if (!previous) return setUndoPending(false)
    options.setScore(previous)
    options.setHistory((items) => items.slice(0, -1))
    setUndoPending(false)
    setNextBatterOpen(false)
    setNextBowlerOpen(false)
    setScoringModal(null)
    setWicketDetails(null)
  }

  function selectWicket(
    type: WicketType,
    dismissedBatter: 'striker' | 'nonStriker' = 'striker',
    runsCompleted = 0,
  ) {
    const needsFielder =
      type === 'Caught' ||
      type === 'Caught Behind' ||
      type === 'Run Out' ||
      type === 'Stumped'

    if (!needsFielder) {
      addBall('wicket', runsCompleted, 'W', { type, dismissedBatter, runsCompleted })
    } else {
      setWicketDetails({ type, dismissedBatter, runsCompleted })
      setScoringModal(null)
    }
  }

  function selectWicketHelper(helper: string) {
    if (wicketDetails) {
      addBall('wicket', wicketDetails.runsCompleted ?? 0, 'W', {
        ...wicketDetails,
        helper,
      })
    }
  }

  return {
    addDelivery,
    addBall,
    chooseNextBatter,
    chooseNextBowler,
    swapBatters,
    retireBatter,
    undo,
    confirmUndo,
    nextBatterOpen,
    setNextBatterOpen,
    nextBowlerOpen,
    setNextBowlerOpen,
    undoPending,
    setUndoPending,
    scoringModal,
    setScoringModal,
    wicketDetails,
    selectWicket,
    selectWicketHelper,
    resetModals: () => {
      setScoringModal(null)
      setWicketDetails(null)
      setNextBatterOpen(false)
      setNextBowlerOpen(false)
      setUndoPending(false)
    },
  }
}