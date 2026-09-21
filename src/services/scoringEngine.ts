import type {
  BatterStatusEvent,
  Delivery,
  DeliveryInput,
  ExtrasBreakdown,
  FallOfWicket,
  Player,
  ScoreState,
  SquadPlayer,
  WicketEvent,
  WicketType,
} from '../types/match'

export type ScoringEngineOptions = {
  maxBalls: number
  lastManBatting: boolean
  battingRoster: SquadPlayer[]
  inningsNumber: 1 | 2
  firstInningsScore: ScoreState | null
}

export type ScoreTransitionResult = {
  nextState: ScoreState
  overComplete: boolean
  inningsComplete: boolean
  wicketOccurred: boolean
  freeHitDismissalRejected: boolean
  dismissedPlayer: Player | null
}

export const emptyPlayer = (name: string): Player => ({
  name,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  out: false,
})

export function emptyExtras(): ExtrasBreakdown {
  return { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 }
}

export function totalExtras(extras: ExtrasBreakdown): number {
  return extras.wides + extras.noBalls + extras.byes + extras.legByes + extras.penalty
}

export function isBowlerWicket(kind: WicketType): boolean {
  switch (kind) {
    case 'Bowled':
    case 'Caught':
    case 'Caught Behind':
    case 'Caught & Bowled':
    case 'LBW':
    case 'Stumped':
    case 'Hit Wicket':
      return true
    case 'Run Out':
    case 'Run Out (Mankaded)':
    case 'Retired Out':
    case 'Retired Hurt':
    case 'Absent':
    default:
      return false
  }
}

export function isDismissalAllowedOnFreeHit(kind: WicketType): boolean {
  switch (kind) {
    case 'Run Out':
    case 'Run Out (Mankaded)':
    case 'Retired Out':
      return true
    case 'Bowled':
    case 'Caught':
    case 'Caught Behind':
    case 'Caught & Bowled':
    case 'LBW':
    case 'Stumped':
    case 'Hit Wicket':
    case 'Retired Hurt':
    case 'Absent':
    default:
      return false
  }
}

export function formatDismissal(wicket: WicketEvent, bowlerName: string): string {
  switch (wicket.kind) {
    case 'Bowled':
      return `b ${bowlerName}`
    case 'Caught':
    case 'Caught Behind':
      return `c ${wicket.helper ?? 'fielder'} b ${bowlerName}`
    case 'Caught & Bowled':
      return `c & b ${bowlerName}`
    case 'Run Out':
      return `run out (${wicket.helper ?? 'fielder'})`
    case 'Stumped':
      return `st ${wicket.helper ?? 'keeper'} b ${bowlerName}`
    case 'LBW':
      return 'lbw'
    case 'Hit Wicket':
      return `hit wicket b ${bowlerName}`
    case 'Run Out (Mankaded)':
      return `run out (Mankaded) b ${bowlerName}`
    case 'Retired Out':
      return 'retired out'
    case 'Retired Hurt':
      return 'retired hurt'
    case 'Absent':
      return 'absent'
    default:
      return String(wicket.kind).toLowerCase()
  }
}

export function generateDeliveryLabel(input: DeliveryInput): string {
  if (input.customLabel) return input.customLabel
  if (input.wicket) return 'W'
  if (input.extras.wides > 0) {
    return input.extras.wides === 1 ? 'WD' : `WD+${input.extras.wides - 1}`
  }
  if (input.extras.noBalls > 0) {
    return input.batterRuns > 0 ? `NB+${input.batterRuns}` : 'NB'
  }
  if (input.extras.byes > 0) return `B${input.extras.byes}`
  if (input.extras.legByes > 0) return `LB${input.extras.legByes}`
  return String(input.batterRuns)
}

export function processDelivery(
  currentState: ScoreState,
  input: DeliveryInput,
  options: ScoringEngineOptions,
): ScoreTransitionResult {
  // If innings is already finished or balls limit reached, do not process
  if (currentState.inningsComplete || currentState.balls >= options.maxBalls) {
    return {
      nextState: currentState,
      overComplete: false,
      inningsComplete: currentState.inningsComplete,
      wicketOccurred: false,
      freeHitDismissalRejected: false,
      dismissedPlayer: null,
    }
  }

  // Free hit legality validation
  let effectiveWicket = input.wicket ?? null
  let freeHitDismissalRejected = false
  if (currentState.freeHit && effectiveWicket) {
    if (!isDismissalAllowedOnFreeHit(effectiveWicket.kind)) {
      effectiveWicket = null
      freeHitDismissalRejected = true
    }
  }

  const isLegal = input.isLegal
  const extras = input.extras ?? emptyExtras()
  const teamRunsAdded = input.batterRuns + totalExtras(extras)
  // Bowler is charged with batter runs, wides, and no-balls (never byes, leg-byes, or penalty runs)
  const bowlerRunsAdded = input.batterRuns + (extras.wides ?? 0) + (extras.noBalls ?? 0)

  const runsAfter = currentState.runs + teamRunsAdded
  const legalBallsAfter = currentState.balls + (isLegal ? 1 : 0)

  // Update striker figures
  const nextStriker = { ...currentState.striker }
  const nextNonStriker = { ...currentState.nonStriker }
  if (isLegal || input.batterRuns > 0) {
    nextStriker.balls += 1
  }
  if (input.batterRuns > 0) {
    nextStriker.runs += input.batterRuns
    if (input.batterRuns === 4) nextStriker.fours += 1
    if (input.batterRuns === 6) nextStriker.sixes += 1
  }

  // Update bowler figures
  const nextBowler = {
    ...currentState.bowler,
    maidens: currentState.bowler.maidens ?? 0,
    wides: (currentState.bowler.wides ?? 0) + (extras.wides ?? 0),
    noBalls: (currentState.bowler.noBalls ?? 0) + (extras.noBalls ?? 0),
    dotBalls:
      (currentState.bowler.dotBalls ?? 0) + (isLegal && bowlerRunsAdded === 0 ? 1 : 0),
  }
  if (isLegal) {
    nextBowler.balls += 1
  }
  nextBowler.runs += bowlerRunsAdded

  // Wicket handling
  const isTrueWicket = Boolean(effectiveWicket && effectiveWicket.kind !== 'Retired Hurt')
  const wicketsAfter = currentState.wickets + (isTrueWicket ? 1 : 0)
  let dismissedPlayer: Player | null = null

  if (effectiveWicket) {
    if (isBowlerWicket(effectiveWicket.kind)) {
      nextBowler.wickets += 1
    }
    const dismissalDesc = formatDismissal(effectiveWicket, currentState.bowler.name)
    if (effectiveWicket.dismissedBatter === 'nonStriker') {
      nextNonStriker.out = isTrueWicket
      nextNonStriker.dismissal = dismissalDesc
      dismissedPlayer = nextNonStriker
    } else {
      nextStriker.out = isTrueWicket
      nextStriker.dismissal = dismissalDesc
      dismissedPlayer = nextStriker
    }
  }

  // Over progression
  const overComplete = isLegal && legalBallsAfter % 6 === 0

  // Recorded delivery object
  const deliveryLabel = input.customLabel || generateDeliveryLabel(input)
  const recordedDelivery: Delivery = {
    label: deliveryLabel,
    legal: isLegal,
    runs: teamRunsAdded,
    batterRuns: input.batterRuns,
    extras,
    bowlerConcededRuns: bowlerRunsAdded,
    wicket: effectiveWicket,
  }
  const nextCurrentOver = [...currentState.currentOver, recordedDelivery]

  // Innings completion conditions
  const wicketLimit = options.lastManBatting
    ? options.battingRoster.length
    : Math.max(1, options.battingRoster.length - 1)
  const targetReached =
    options.inningsNumber === 2 && runsAfter >= (options.firstInningsScore?.runs ?? 0) + 1
  const allOut = wicketsAfter >= wicketLimit
  const oversExhausted = legalBallsAfter >= options.maxBalls
  const inningsComplete = allOut || oversExhausted || targetReached

  // Fall of wickets
  const nextFow: FallOfWicket[] =
    isTrueWicket && dismissedPlayer
      ? [
          ...(currentState.fallOfWickets ?? []),
          {
            wicket: wicketsAfter,
            score: runsAfter,
            batter: dismissedPlayer.name,
            dismissal: dismissedPlayer.dismissal,
          },
        ]
      : currentState.fallOfWickets ?? []

  // Strike positioning
  let finalStriker: Player
  let finalNonStriker: Player

  if (!effectiveWicket) {
    // Standard play-on delivery
    const crossedOdd = input.completedRuns % 2 === 1
    const totalSwaps = (crossedOdd ? 1 : 0) + (overComplete ? 1 : 0)
    if (totalSwaps % 2 === 1 && nextNonStriker.name) {
      finalStriker = nextNonStriker
      finalNonStriker = nextStriker
    } else {
      finalStriker = nextStriker
      finalNonStriker = nextNonStriker
    }
  } else if (effectiveWicket.kind === 'Run Out' || effectiveWicket.kind === 'Run Out (Mankaded)') {
    // Run out: position depends on completed runs before the run out and which batter was out
    const crossedOdd = input.completedRuns % 2 === 1
    const isStrikerOut = effectiveWicket.dismissedBatter === 'striker'
    const vacantSlot = emptyPlayer('Choose next batter')

    if (isStrikerOut) {
      // Striker was dismissed. Surviving partner is nextNonStriker.
      if (!crossedOdd) {
        // Did not cross: surviving partner was at non-striker end
        if (overComplete) {
          // Ends swap for over completion: surviving partner becomes striker for next over
          finalStriker = nextNonStriker
          finalNonStriker = vacantSlot
        } else {
          finalStriker = vacantSlot
          finalNonStriker = nextNonStriker
        }
      } else {
        // Crossed odd: surviving partner reached striker end
        if (overComplete) {
          // Ends swap for over completion: surviving partner moves to non-striker end
          finalStriker = vacantSlot
          finalNonStriker = nextNonStriker
        } else {
          finalStriker = nextNonStriker
          finalNonStriker = vacantSlot
        }
      }
    } else {
      // Non-striker was dismissed. Surviving partner is nextStriker.
      if (!crossedOdd) {
        // Did not cross: surviving partner was at striker end
        if (overComplete) {
          // Ends swap for over completion: surviving partner moves to non-striker end
          finalStriker = vacantSlot
          finalNonStriker = nextStriker
        } else {
          finalStriker = nextStriker
          finalNonStriker = vacantSlot
        }
      } else {
        // Crossed odd: surviving partner reached non-striker end
        if (overComplete) {
          // Ends swap for over completion: surviving partner becomes striker for next over
          finalStriker = nextStriker
          finalNonStriker = vacantSlot
        } else {
          finalStriker = vacantSlot
          finalNonStriker = nextStriker
        }
      }
    }
  } else {
    // Bowler wicket (Bowled, Caught, LBW, Stumped, Hit Wicket) or Retired Out:
    const vacantSlot = emptyPlayer('Choose next batter')
    if (effectiveWicket.dismissedBatter === 'nonStriker') {
      // Non-striker was dismissed (e.g. Retired Out).
      // Surviving striker remains at striker end, incoming batter replaces non-striker.
      finalStriker = nextStriker
      finalNonStriker = vacantSlot
    } else {
      // Striker was dismissed. Surviving partner is nextNonStriker.
      if (overComplete) {
        // MCC Law 18.11 on Ball 6: Ends change. Surviving partner faces next over.
        finalStriker = nextNonStriker
        finalNonStriker = vacantSlot
      } else {
        // Ball 1-5: Incoming batter takes striker end.
        finalStriker = vacantSlot
        finalNonStriker = nextNonStriker
      }
    }
  }

  // Last man batting check: only one batter remains
  if (options.lastManBatting && wicketsAfter === options.battingRoster.length - 1 && !inningsComplete) {
    const soloBatter = finalStriker.name === 'Choose next batter' ? finalNonStriker : finalStriker
    finalStriker = soloBatter
    finalNonStriker = emptyPlayer('')
  }

  // Partnership tracking
  const prevPartnership = currentState.partnership ?? {
    runs: 0,
    balls: 0,
    batters: [currentState.striker.name, currentState.nonStriker.name] as [string, string],
  }
  const currentBatters =
    prevPartnership.batters ?? [currentState.striker.name, currentState.nonStriker.name]
  const nextPartnership = isTrueWicket
    ? { runs: 0, balls: 0, batters: [finalStriker.name, finalNonStriker.name] as [string, string] }
    : {
        runs: prevPartnership.runs + teamRunsAdded,
        balls: prevPartnership.balls + (isLegal ? 1 : 0),
        batters: currentBatters as [string, string],
      }

  // Free hit status
  let nextFreeHit: boolean
  if (extras.noBalls > 0) {
    nextFreeHit = true
  } else if (isLegal) {
    nextFreeHit = false
  } else {
    nextFreeHit = Boolean(currentState.freeHit)
  }

  // Wicket streak
  const nextWicketStreak = isTrueWicket
    ? (currentState.wicketStreak ?? 0) + 1
    : isLegal
      ? 0
      : currentState.wicketStreak ?? 0

  // Dismissed batters list
  const nextDismissedBatters =
    isTrueWicket && dismissedPlayer
      ? [...currentState.dismissedBatters, dismissedPlayer.name]
      : currentState.dismissedBatters

  // Maiden over calculation if over complete
  let nextOverHistory = currentState.overHistory ?? []
  let activeOverDeliveries = nextCurrentOver

  if (overComplete) {
    const isMaiden = nextCurrentOver.every(
      (d) => (d.bowlerConcededRuns ?? d.runs ?? 0) === 0,
    )
    if (isMaiden) {
      nextBowler.maidens = (nextBowler.maidens ?? 0) + 1
    }
    const overNumber = Math.floor(currentState.balls / 6) + 1
    nextOverHistory = [
      ...nextOverHistory,
      {
        number: overNumber,
        bowler: currentState.bowler.name,
        runs: nextCurrentOver.reduce((sum, d) => sum + d.runs, 0),
        deliveries: nextCurrentOver,
      },
    ]
    activeOverDeliveries = []
  }

  // Update batting stats list
  const nextBattingStats = currentState.battingStats.map((p) => {
    if (p.name === nextStriker.name) return nextStriker
    if (p.name === nextNonStriker.name) return nextNonStriker
    return p
  })

  // Update bowler stats list
  const nextBowlerStats = currentState.bowlerStats.map((b) =>
    b.name === currentState.bowler.name ? nextBowler : b,
  )

  const nextState: ScoreState = {
    runs: runsAfter,
    wickets: wicketsAfter,
    balls: legalBallsAfter,
    striker: finalStriker,
    nonStriker: finalNonStriker,
    bowler: nextBowler,
    currentOver: activeOverDeliveries,
    overHistory: nextOverHistory,
    fallOfWickets: nextFow,
    target: currentState.target,
    maxOvers: currentState.maxOvers,
    partnership: nextPartnership,
    freeHit: nextFreeHit,
    wicketStreak: nextWicketStreak,
    dismissedBatters: nextDismissedBatters,
    inningsComplete,
    battingStats: nextBattingStats,
    bowlerStats: nextBowlerStats,
  }

  return {
    nextState,
    overComplete,
    inningsComplete,
    wicketOccurred: isTrueWicket,
    freeHitDismissalRejected,
    dismissedPlayer,
  }
}

export function processBatterStatusEvent(
  currentState: ScoreState,
  event: BatterStatusEvent,
  playerName: string,
  incomingPlayerName: string,
): ScoreState {
  const isStriker = currentState.striker.name === playerName
  const isNonStriker = currentState.nonStriker.name === playerName
  if (!isStriker && !isNonStriker) return currentState

  const nextStriker = { ...currentState.striker }
  const nextNonStriker = { ...currentState.nonStriker }
  const replacement = emptyPlayer(incomingPlayerName)

  if (event === 'Retired Hurt') {
    // Retired hurt is NOT out. Team wickets do not increment.
    const retiredPlayer: Player = {
      ...(isStriker ? nextStriker : nextNonStriker),
      out: false,
      dismissal: 'retired hurt',
    }

    const nextBattingStats = currentState.battingStats.map((p) =>
      p.name === playerName ? retiredPlayer : p,
    )
    if (!nextBattingStats.some((p) => p.name === incomingPlayerName)) {
      nextBattingStats.push(replacement)
    }

    return {
      ...currentState,
      striker: isStriker ? replacement : nextStriker,
      nonStriker: isNonStriker ? replacement : nextNonStriker,
      partnership: {
        runs: currentState.partnership?.runs ?? 0,
        balls: currentState.partnership?.balls ?? 0,
        batters: isStriker
          ? [incomingPlayerName, nextNonStriker.name]
          : [nextStriker.name, incomingPlayerName],
      },
      battingStats: nextBattingStats,
    }
  }

  if (event === 'Absent') {
    // Absent counts as team wicket down for innings all-out calculation
    const absentPlayer: Player = {
      ...(isStriker ? nextStriker : nextNonStriker),
      out: true,
      dismissal: 'absent',
    }
    const nextBattingStats = currentState.battingStats.map((p) =>
      p.name === playerName ? absentPlayer : p,
    )

    return {
      ...currentState,
      wickets: currentState.wickets + 1,
      striker: isStriker ? replacement : nextStriker,
      nonStriker: isNonStriker ? replacement : nextNonStriker,
      battingStats: nextBattingStats,
      dismissedBatters: [...currentState.dismissedBatters, playerName],
    }
  }

  return currentState
}
