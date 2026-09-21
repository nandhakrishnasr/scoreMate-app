import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  processDelivery,
  processBatterStatusEvent,
  emptyExtras,
  emptyPlayer,
  type ScoringEngineOptions,
} from '../src/services/scoringEngine.ts'
import type { ScoreState, SquadPlayer } from '../src/types/match.ts'

function createInitialState(overBalls = 0): ScoreState {
  const striker = emptyPlayer('Player A')
  const nonStriker = emptyPlayer('Player B')
  const bowler = {
    name: 'Bowler X',
    balls: overBalls,
    runs: 0,
    wickets: 0,
    maidens: 0,
    wides: 0,
    noBalls: 0,
    dotBalls: 0,
  }

  return {
    runs: 0,
    wickets: 0,
    balls: overBalls,
    striker,
    nonStriker,
    bowler,
    currentOver: [],
    overHistory: [],
    fallOfWickets: [],
    target: undefined,
    maxOvers: 20,
    partnership: { runs: 0, balls: overBalls, batters: ['Player A', 'Player B'] },
    freeHit: false,
    wicketStreak: 0,
    dismissedBatters: [],
    inningsComplete: false,
    battingStats: [striker, nonStriker],
    bowlerStats: [bowler],
  }
}

const defaultOptions: ScoringEngineOptions = {
  maxBalls: 120,
  lastManBatting: false,
  battingRoster: [
    { name: 'Player A', hand: 'Right' },
    { name: 'Player B', hand: 'Right' },
    { name: 'Player C', hand: 'Left' },
    { name: 'Player D', hand: 'Right' },
  ] as SquadPlayer[],
  inningsNumber: 1,
  firstInningsScore: null,
}

describe('Delivery Truth Table Verification', () => {
  it('TT-01: Dot Ball', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 0)
    assert.equal(result.nextState.striker.runs, 0)
    assert.equal(result.nextState.striker.balls, 1)
    assert.equal(result.nextState.striker.name, 'Player A')
    assert.equal(result.nextState.bowler.balls, 1)
    assert.equal(result.nextState.bowler.runs, 0)
    assert.equal(result.nextState.bowler.dotBalls, 1)
    assert.equal(result.nextState.freeHit, false)
  })

  it('TT-02: Single (1 run off bat)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 1,
        extras: emptyExtras(),
        completedRuns: 1,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 1)
    assert.equal(result.nextState.striker.name, 'Player B') // Strike rotated
    assert.equal(result.nextState.nonStriker.name, 'Player A')
    assert.equal(result.nextState.nonStriker.runs, 1)
    assert.equal(result.nextState.nonStriker.balls, 1)
    assert.equal(result.nextState.bowler.runs, 1)
  })

  it('TT-03: Two runs (off bat)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 2,
        extras: emptyExtras(),
        completedRuns: 2,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 2)
    assert.equal(result.nextState.striker.name, 'Player A') // Strike retained
    assert.equal(result.nextState.striker.runs, 2)
  })

  it('TT-04: Three runs (off bat)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 3,
        extras: emptyExtras(),
        completedRuns: 3,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 3)
    assert.equal(result.nextState.striker.name, 'Player B') // Strike rotated
    assert.equal(result.nextState.nonStriker.runs, 3)
  })

  it('TT-05: Four (boundary)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 4,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 4)
    assert.equal(result.nextState.striker.runs, 4)
    assert.equal(result.nextState.striker.fours, 1)
    assert.equal(result.nextState.striker.name, 'Player A')
  })

  it('TT-06: Six (boundary)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 6,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 6)
    assert.equal(result.nextState.striker.runs, 6)
    assert.equal(result.nextState.striker.sixes, 1)
    assert.equal(result.nextState.striker.name, 'Player A')
  })

  it('TT-07: Wide (standard)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 1, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 0,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 1)
    assert.equal(result.nextState.balls, 0) // Legal ball not incremented
    assert.equal(result.nextState.striker.balls, 0)
    assert.equal(result.nextState.striker.name, 'Player A')
    assert.equal(result.nextState.bowler.runs, 1)
    assert.equal(result.nextState.bowler.wides, 1)
  })

  it('TT-08: Wide + 1 run (ran single)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 2, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 1,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 2)
    assert.equal(result.nextState.balls, 0)
    assert.equal(result.nextState.bowler.runs, 2)
    assert.equal(result.nextState.striker.name, 'Player B') // Strike swapped on odd crossing
  })

  it('TT-09: Wide + 4 additional wides', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 5, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 0,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 5)
    assert.equal(result.nextState.balls, 0)
    assert.equal(result.nextState.bowler.runs, 5)
    assert.equal(result.nextState.striker.name, 'Player A')
  })

  it('TT-10: No Ball (no run off bat)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 1, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 0,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 1)
    assert.equal(result.nextState.balls, 0)
    assert.equal(result.nextState.bowler.runs, 1)
    assert.equal(result.nextState.bowler.noBalls, 1)
    assert.equal(result.nextState.freeHit, true)
  })

  it('TT-11: No Ball + 1 run (off bat)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 1,
        extras: { wides: 0, noBalls: 1, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 1,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 2)
    assert.equal(result.nextState.balls, 0)
    assert.equal(result.nextState.bowler.runs, 2)
    assert.equal(result.nextState.freeHit, true)
    assert.equal(result.nextState.striker.name, 'Player B') // Strike rotated
    assert.equal(result.nextState.nonStriker.runs, 1)
    assert.equal(result.nextState.nonStriker.balls, 1)
  })

  it('TT-12: No Ball + 4 (hit boundary)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 4,
        extras: { wides: 0, noBalls: 1, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 0,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 5)
    assert.equal(result.nextState.balls, 0)
    assert.equal(result.nextState.bowler.runs, 5)
    assert.equal(result.nextState.freeHit, true)
    assert.equal(result.nextState.striker.runs, 4)
    assert.equal(result.nextState.striker.fours, 1)
    assert.equal(result.nextState.striker.name, 'Player A')
  })

  it('TT-13: 1 Bye (Bowler conceded runs remains 0)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 0, byes: 1, legByes: 0, penalty: 0 },
        completedRuns: 1,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 1)
    assert.equal(result.nextState.balls, 1)
    assert.equal(result.nextState.bowler.runs, 0) // Byes NOT charged to bowler
    assert.equal(result.nextState.striker.name, 'Player B') // Strike rotated
    assert.equal(result.nextState.nonStriker.runs, 0)
    assert.equal(result.nextState.nonStriker.balls, 1)
  })

  it('TT-14: 2 Leg Byes (Bowler conceded runs remains 0)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 2, penalty: 0 },
        completedRuns: 2,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 2)
    assert.equal(result.nextState.balls, 1)
    assert.equal(result.nextState.bowler.runs, 0) // Leg Byes NOT charged to bowler
    assert.equal(result.nextState.striker.name, 'Player A')
  })

  it('TT-15: Ball 6: Dot Ball (Ends swap)', () => {
    const initial = createInitialState(5) // Ball 5 bowled
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.balls, 6)
    assert.equal(result.overComplete, true)
    assert.equal(result.nextState.striker.name, 'Player B') // Ends change for next over
    assert.equal(result.nextState.nonStriker.name, 'Player A')
  })

  it('TT-16: Ball 6: 1 Run (Single - original striker retains strike for next over)', () => {
    const initial = createInitialState(5) // Ball 5 bowled
    const result = processDelivery(
      initial,
      {
        batterRuns: 1,
        extras: emptyExtras(),
        completedRuns: 1,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.balls, 6)
    assert.equal(result.overComplete, true)
    // 1 physical run (swap 1) + over completion ends change (swap 2) = 2 swaps.
    // Player A who scored the single faces Ball 1 of next over!
    assert.equal(result.nextState.striker.name, 'Player A')
    assert.equal(result.nextState.nonStriker.name, 'Player B')
  })

  it('TT-17: Ball 6: 2 Runs', () => {
    const initial = createInitialState(5)
    const result = processDelivery(
      initial,
      {
        batterRuns: 2,
        extras: emptyExtras(),
        completedRuns: 2,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.balls, 6)
    assert.equal(result.overComplete, true)
    assert.equal(result.nextState.striker.name, 'Player B')
    assert.equal(result.nextState.nonStriker.name, 'Player A')
  })

  it('TT-18: Bowled on Ball 1-5 (New batter takes striker end)', () => {
    const initial = createInitialState(2)
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Bowled',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.wickets, 1)
    assert.equal(result.nextState.striker.name, 'Choose next batter')
    assert.equal(result.nextState.nonStriker.name, 'Player B')
  })

  it('TT-19: Bowled on Ball 6 (Surviving partner faces next over)', () => {
    const initial = createInitialState(5)
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Bowled',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.overComplete, true)
    assert.equal(result.nextState.bowler.wickets, 1)
    // Surviving partner Player B takes strike for Over 2
    assert.equal(result.nextState.striker.name, 'Player B')
    assert.equal(result.nextState.nonStriker.name, 'Choose next batter')
  })

  it('TT-20: Free Hit - Bowled attempt is rejected, free hit consumed on legal ball', () => {
    const initial = { ...createInitialState(), freeHit: true }
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Bowled',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(result.freeHitDismissalRejected, true)
    assert.equal(result.wicketOccurred, false)
    assert.equal(result.nextState.wickets, 0)
    assert.equal(result.nextState.bowler.wickets, 0)
    assert.equal(result.nextState.striker.out, false)
    assert.equal(result.nextState.freeHit, false) // Consumed on legal delivery
  })

  it('TT-21: Run Out Striker + 0 runs', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          helper: 'Fielder',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.wickets, 0) // Bowler NOT credited
    assert.equal(result.nextState.striker.name, 'Choose next batter')
    assert.equal(result.nextState.nonStriker.name, 'Player B')
  })

  it('TT-22: Run Out Non-Striker + 0 runs', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'nonStriker',
          dismissedPlayerName: 'Player B',
          helper: 'Keeper',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.wickets, 0)
    // Striker remains active on strike
    assert.equal(result.nextState.striker.name, 'Player A')
    assert.equal(result.nextState.nonStriker.name, 'Choose next batter')
  })

  it('TT-23: Run Out Non-Striker + 1 completed run', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 1,
        extras: emptyExtras(),
        completedRuns: 1,
        isLegal: true,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'nonStriker',
          dismissedPlayerName: 'Player B',
          helper: 'Fielder',
          runsCompleted: 1,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 1)
    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.wickets, 0)
    // Completed 1 run: Player A crossed to non-striker end.
    // Non-striker Player B was run out at striker end.
    // So Player A is at non-striker end; incoming batter takes striker end.
    assert.equal(result.nextState.striker.name, 'Choose next batter')
    assert.equal(result.nextState.nonStriker.name, 'Player A')
  })

  it('TT-24: Run Out Striker + 1 completed run', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 1,
        extras: emptyExtras(),
        completedRuns: 1,
        isLegal: true,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          helper: 'Fielder',
          runsCompleted: 1,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 1)
    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.wickets, 0)
    // Completed 1 run: Player B crossed to striker end.
    // Player A was run out at non-striker end.
    // Surviving Player B is at striker end; incoming batter takes non-striker end.
    assert.equal(result.nextState.striker.name, 'Player B')
    assert.equal(result.nextState.nonStriker.name, 'Choose next batter')
  })

  it('TT-25: Run Out Striker + 2 completed runs', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 2,
        extras: emptyExtras(),
        completedRuns: 2,
        isLegal: true,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          helper: 'Fielder',
          runsCompleted: 2,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 2)
    assert.equal(result.nextState.wickets, 1)
    // 2 completed runs: Player B made it back to non-striker end.
    // Player A was run out turning for 3rd run at striker end.
    // Surviving Player B is at non-striker end; incoming batter takes striker end.
    assert.equal(result.nextState.striker.name, 'Choose next batter')
    assert.equal(result.nextState.nonStriker.name, 'Player B')
  })

  it('TT-26: Run Out Non-Striker + 2 completed runs', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 2,
        extras: emptyExtras(),
        completedRuns: 2,
        isLegal: true,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'nonStriker',
          dismissedPlayerName: 'Player B',
          helper: 'Fielder',
          runsCompleted: 2,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 2)
    assert.equal(result.nextState.wickets, 1)
    // 2 completed runs: Player A made it back to striker end.
    // Player B was run out at bowler end.
    // Surviving Player A is at striker end; incoming batter takes non-striker end.
    assert.equal(result.nextState.striker.name, 'Player A')
    assert.equal(result.nextState.nonStriker.name, 'Choose next batter')
  })

  it('TT-27: Retired Hurt status event (Not Out, wickets unchanged, same crease)', () => {
    const initial = createInitialState()
    const next = processBatterStatusEvent(initial, 'Retired Hurt', 'Player A', 'Player C')

    assert.equal(next.wickets, 0) // Wickets NOT incremented
    assert.equal(next.striker.name, 'Player C') // Player C takes Player A's crease
    assert.equal(next.nonStriker.name, 'Player B')
    const playerARecord = next.battingStats.find((p) => p.name === 'Player A')
    assert.equal(playerARecord?.out, false)
    assert.equal(playerARecord?.dismissal, 'retired hurt')
  })

  it('TT-28: Maiden Over with 6 dots and 4 Byes', () => {
    let state = createInitialState()
    // 5 dots
    for (let i = 0; i < 5; i++) {
      state = processDelivery(
        state,
        {
          batterRuns: 0,
          extras: emptyExtras(),
          completedRuns: 0,
          isLegal: true,
        },
        defaultOptions,
      ).nextState
    }
    // 6th ball: 4 Byes
    const lastResult = processDelivery(
      state,
      {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 0, byes: 4, legByes: 0, penalty: 0 },
        completedRuns: 0,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(lastResult.overComplete, true)
    assert.equal(lastResult.nextState.bowler.maidens, 1) // Maiden because bowlerConcededRuns was 0
    assert.equal(lastResult.nextState.bowler.runs, 0)
    assert.equal(lastResult.nextState.runs, 4)
  })

  it('TT-29: 1 Leg Bye (Bowler conceded runs remains 0, strike rotates)', () => {
    const initial = createInitialState()
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 1, penalty: 0 },
        completedRuns: 1,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 1)
    assert.equal(result.nextState.bowler.runs, 0) // Bowler does NOT concede leg byes
    assert.equal(result.nextState.bowler.balls, 1)
    assert.equal(result.nextState.striker.name, 'Player B') // Strike rotated
    assert.equal(result.nextState.nonStriker.name, 'Player A')
  })

  it('TT-30: Ball 6 + three runs (Striker retains strike for next over)', () => {
    const initial = createInitialState(5) // Ball 6
    const result = processDelivery(
      initial,
      {
        batterRuns: 3,
        extras: emptyExtras(),
        completedRuns: 3,
        isLegal: true,
      },
      defaultOptions,
    )

    assert.equal(result.overComplete, true)
    assert.equal(result.nextState.runs, 3)
    assert.equal(result.nextState.striker.runs, 3)
    // 3 runs on Ball 6:
    // Running swap: Player A -> non-striker, Player B -> striker.
    // End-of-over swap: Player B -> non-striker, Player A -> striker.
    // Player A retains strike for next over!
    assert.equal(result.nextState.striker.name, 'Player A')
    assert.equal(result.nextState.nonStriker.name, 'Player B')
    assert.equal(result.nextState.bowler.runs, 3)
    assert.equal(result.nextState.bowler.balls, 6)
  })

  it('TT-31: Returning Bowler maintains cumulative figures across spells', () => {
    // Over 1 by Bowler X
    let state = createInitialState()
    for (let i = 0; i < 6; i++) {
      state = processDelivery(
        state,
        {
          batterRuns: 1,
          extras: emptyExtras(),
          completedRuns: 1,
          isLegal: true,
        },
        defaultOptions,
      ).nextState
    }
    assert.equal(state.bowler.balls, 6)
    assert.equal(state.bowler.runs, 6)

    // Over 2: Switch to Bowler Y
    const bowlerY = {
      name: 'Bowler Y',
      balls: 0,
      runs: 0,
      wickets: 0,
      maidens: 0,
      wides: 0,
      noBalls: 0,
      dotBalls: 0,
    }
    state = {
      ...state,
      bowler: bowlerY,
      bowlerStats: [...state.bowlerStats, bowlerY],
    }
    for (let i = 0; i < 6; i++) {
      state = processDelivery(
        state,
        {
          batterRuns: 0,
          extras: emptyExtras(),
          completedRuns: 0,
          isLegal: true,
        },
        defaultOptions,
      ).nextState
    }
    assert.equal(state.bowler.name, 'Bowler Y')
    assert.equal(state.bowler.balls, 6)

    // Over 3: Bowler X returns! Retrieve existing cumulative stats
    const existingX = state.bowlerStats.find((b) => b.name === 'Bowler X')!
    assert.ok(existingX)
    assert.equal(existingX.balls, 6)
    assert.equal(existingX.runs, 6)

    state = {
      ...state,
      bowler: { ...existingX },
    }

    // Bowl 1st ball of Over 3 (dot ball)
    const over3Ball1 = processDelivery(
      state,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
      },
      defaultOptions,
    )

    // Cumulative figures for Bowler X are correctly incremented from 6 to 7 balls
    assert.equal(over3Ball1.nextState.bowler.name, 'Bowler X')
    assert.equal(over3Ball1.nextState.bowler.balls, 7)
    assert.equal(over3Ball1.nextState.bowler.runs, 6)
  })

  it('TT-32: Undo after Wicket restores state and dismissed batter', () => {
    const history: ScoreState[] = []
    let current = createInitialState()

    // Record Ball 1: Single
    history.push(structuredClone(current))
    current = processDelivery(
      current,
      { batterRuns: 1, extras: emptyExtras(), completedRuns: 1, isLegal: true },
      defaultOptions,
    ).nextState

    // Record Ball 2: Bowled (wicket)
    history.push(structuredClone(current))
    const preWicketState = structuredClone(current)
    current = processDelivery(
      current,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Bowled',
          dismissedBatter: 'striker',
          dismissedPlayerName: current.striker.name,
          runsCompleted: 0,
        },
      },
      defaultOptions,
    ).nextState

    assert.equal(current.wickets, 1)
    assert.equal(current.striker.name, 'Choose next batter')

    // Undo action
    const undoneState = history.pop()!
    assert.deepEqual(undoneState, preWicketState)
    assert.equal(undoneState.wickets, 0)
    assert.equal(undoneState.striker.name, 'Player B')
    assert.equal(undoneState.nonStriker.name, 'Player A')
  })

  it('TT-33: Undo after No Ball reverts free hit and extra runs', () => {
    const history: ScoreState[] = []
    let current = createInitialState()

    // Record No Ball + 4 off bat
    history.push(structuredClone(current))
    const preNBState = structuredClone(current)
    current = processDelivery(
      current,
      {
        batterRuns: 4,
        extras: { wides: 0, noBalls: 1, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 4,
        isLegal: false,
      },
      defaultOptions,
    ).nextState

    assert.equal(current.runs, 5)
    assert.equal(current.freeHit, true)
    assert.equal(current.bowler.runs, 5)

    // Undo action
    const undoneState = history.pop()!
    assert.deepEqual(undoneState, preNBState)
    assert.equal(undoneState.runs, 0)
    assert.equal(undoneState.freeHit, false)
    assert.equal(undoneState.bowler.runs, 0)
  })

  it('TT-34: Undo after Over Completion restores 5 balls, current over, and cancels bowler prompt', () => {
    const history: ScoreState[] = []
    let current = createInitialState(5) // Ball 6

    history.push(structuredClone(current))
    const preBall6State = structuredClone(current)

    const result = processDelivery(
      current,
      { batterRuns: 0, extras: emptyExtras(), completedRuns: 0, isLegal: true },
      defaultOptions,
    )
    current = result.nextState

    assert.equal(result.overComplete, true)
    assert.equal(current.balls, 6)
    assert.equal(current.overHistory.length, 1)
    assert.equal(current.currentOver.length, 0)

    // Undo action
    const undoneState = history.pop()!
    assert.deepEqual(undoneState, preBall6State)
    assert.equal(undoneState.balls, 5)
    assert.equal(undoneState.overHistory.length, 0)
  })

  it('TT-35: Wide + 2 completed runs (Strike retained on even completed runs)', () => {
    const initial = createInitialState(0)
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 3, noBalls: 0, byes: 0, legByes: 0, penalty: 0 }, // 1 penalty wide + 2 run wides
        completedRuns: 2,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 3)
    assert.equal(result.nextState.balls, 0) // Illegal delivery
    assert.equal(result.nextState.bowler.runs, 3)
    assert.equal(result.nextState.bowler.balls, 0)
    // 2 completed runs is even: strike is retained by Player A
    assert.equal(result.nextState.striker.name, 'Player A')
    assert.equal(result.nextState.nonStriker.name, 'Player B')
  })

  it('TT-36: No Ball + 2 Byes (Bowler charged only 1 NB penalty, Free Hit active)', () => {
    const initial = createInitialState(0)
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: { wides: 0, noBalls: 1, byes: 2, legByes: 0, penalty: 0 },
        completedRuns: 2,
        isLegal: false,
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 3) // 1 NB + 2 Byes
    assert.equal(result.nextState.bowler.runs, 1) // Only 1 NB charged to bowler
    assert.equal(result.nextState.striker.runs, 0)
    assert.equal(result.nextState.striker.balls, 0) // Striker did not face legal ball or hit off bat
    assert.equal(result.nextState.balls, 0)
    assert.equal(result.nextState.freeHit, true) // Free Hit awarded
    assert.equal(result.nextState.striker.name, 'Player A') // 2 completed runs is even -> strike retained
    assert.equal(result.nextState.nonStriker.name, 'Player B')
  })

  it('TT-37: Run Out on No Ball (Illegal delivery, 0 bowler wicket credit, Free Hit active)', () => {
    const initial = createInitialState(0)
    const result = processDelivery(
      initial,
      {
        batterRuns: 1,
        extras: { wides: 0, noBalls: 1, byes: 0, legByes: 0, penalty: 0 },
        completedRuns: 1,
        isLegal: false,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'nonStriker',
          dismissedPlayerName: 'Player B',
          runsCompleted: 1,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.runs, 2) // 1 NB + 1 bat run
    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.runs, 2)
    assert.equal(result.nextState.bowler.wickets, 0) // No wicket credit to bowler for run out
    assert.equal(result.nextState.balls, 0) // Ball does not advance on No Ball
    assert.equal(result.nextState.freeHit, true) // Next ball remains Free Hit due to No Ball
    // 1 completed run: Player B run out at bowler end. Surviving Player A crossed to non-striker end.
    assert.equal(result.nextState.striker.name, 'Choose next batter')
    assert.equal(result.nextState.nonStriker.name, 'Player A')
  })

  it('TT-38: Run Out on Free Hit (Dismissal permitted, 0 bowler credit, Free Hit consumed)', () => {
    const initial = { ...createInitialState(0), freeHit: true }
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Run Out',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(result.wicketOccurred, true)
    assert.equal(result.freeHitDismissalRejected, false) // Run Out allowed on Free Hit
    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.wickets, 0)
    assert.equal(result.nextState.freeHit, false) // Free Hit consumed on legal delivery
    assert.equal(result.nextState.striker.name, 'Choose next batter')
    assert.equal(result.nextState.nonStriker.name, 'Player B')
  })

  it('TT-39: Striker Retired Out on Ball 1–5 (No bowler credit, incoming batter takes striker end)', () => {
    const initial = createInitialState(2) // Ball 3
    const result = processDelivery(
      initial,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Retired Out',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player A',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(result.nextState.wickets, 1)
    assert.equal(result.nextState.bowler.wickets, 0) // Retired Out NOT credited to bowler
    assert.equal(result.nextState.balls, 3)
    assert.equal(result.nextState.striker.name, 'Choose next batter') // Incoming batter takes striker end
    assert.equal(result.nextState.nonStriker.name, 'Player B') // Surviving non-striker remains at non-striker end
  })

  it('TT-40: Non-Striker Retired Out on Ball 1–5 and Ball 6 (Incoming batter replaces non-striker)', () => {
    // Subcase A: Ball 1-5
    const initialBall3 = createInitialState(2)
    const resultBall3 = processDelivery(
      initialBall3,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Retired Out',
          dismissedBatter: 'nonStriker',
          dismissedPlayerName: 'Player B',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(resultBall3.nextState.wickets, 1)
    assert.equal(resultBall3.nextState.bowler.wickets, 0)
    assert.equal(resultBall3.nextState.striker.name, 'Player A') // Surviving striker remains at striker end
    assert.equal(resultBall3.nextState.nonStriker.name, 'Choose next batter') // Incoming batter replaces non-striker

    // Subcase B: Ball 6
    const initialBall6 = createInitialState(5)
    const resultBall6 = processDelivery(
      initialBall6,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Retired Out',
          dismissedBatter: 'nonStriker',
          dismissedPlayerName: 'Player B',
          runsCompleted: 0,
        },
      },
      defaultOptions,
    )

    assert.equal(resultBall6.overComplete, true)
    assert.equal(resultBall6.nextState.wickets, 1)
    assert.equal(resultBall6.nextState.bowler.wickets, 0)
    assert.equal(resultBall6.nextState.striker.name, 'Player A') // Surviving striker at striker end
    assert.equal(resultBall6.nextState.nonStriker.name, 'Choose next batter') // Incoming batter replaces non-striker
  })

  it('TT-41: Last Man Batting (Solo batter odd runs, Ball 6, and all-out termination)', () => {
    const lastManRoster: SquadPlayer[] = [
      { name: 'Player A', hand: 'Right' },
      { name: 'Player B', hand: 'Right' },
      { name: 'Player C', hand: 'Left' },
    ]
    const lastManOptions: ScoringEngineOptions = {
      maxBalls: 60,
      lastManBatting: true,
      battingRoster: lastManRoster,
      inningsNumber: 1,
      firstInningsScore: null,
    }

    // 2 wickets down in a 3-player roster: Player C bats solo
    const initial = {
      ...createInitialState(0),
      wickets: 2,
      striker: emptyPlayer('Player C'),
      nonStriker: emptyPlayer(''),
    }

    // Action 1: Solo batter scores a single (odd runs)
    const afterSingle = processDelivery(
      initial,
      { batterRuns: 1, extras: emptyExtras(), completedRuns: 1, isLegal: true },
      lastManOptions,
    )
    assert.equal(afterSingle.nextState.runs, 1)
    assert.equal(afterSingle.nextState.striker.name, 'Player C') // Solo batter retains strike
    assert.equal(afterSingle.nextState.nonStriker.name, '') // No second active batter created

    // Action 2: Ball 6 dot ball
    const initialBall6 = {
      ...afterSingle.nextState,
      balls: 5,
    }
    const afterBall6 = processDelivery(
      initialBall6,
      { batterRuns: 0, extras: emptyExtras(), completedRuns: 0, isLegal: true },
      lastManOptions,
    )
    assert.equal(afterBall6.overComplete, true)
    assert.equal(afterBall6.nextState.striker.name, 'Player C') // Solo batter faces next over
    assert.equal(afterBall6.nextState.nonStriker.name, '')

    // Action 3: Solo batter is dismissed -> Innings Complete (All Out)
    const afterDismissal = processDelivery(
      afterBall6.nextState,
      {
        batterRuns: 0,
        extras: emptyExtras(),
        completedRuns: 0,
        isLegal: true,
        wicket: {
          kind: 'Bowled',
          dismissedBatter: 'striker',
          dismissedPlayerName: 'Player C',
          runsCompleted: 0,
        },
      },
      lastManOptions,
    )
    assert.equal(afterDismissal.nextState.wickets, 3)
    assert.equal(afterDismissal.inningsComplete, true) // All out reached
  })

  it('TT-42: Target Reached in Second Innings (Match completes immediately)', () => {
    const firstInningsScore = {
      ...createInitialState(30),
      runs: 49,
      balls: 30,
      inningsComplete: true,
    }
    const secondInningsOptions: ScoringEngineOptions = {
      maxBalls: 30,
      lastManBatting: false,
      battingRoster: defaultOptions.battingRoster,
      inningsNumber: 2,
      firstInningsScore,
    }

    // Score is 48, needing 2 runs to win (target is 50)
    const initial = {
      ...createInitialState(10),
      runs: 48,
      balls: 10,
    }

    // Batter hits a 4 to win
    const result = processDelivery(
      initial,
      { batterRuns: 4, extras: emptyExtras(), completedRuns: 4, isLegal: true },
      secondInningsOptions,
    )

    assert.equal(result.nextState.runs, 52)
    assert.equal(result.inningsComplete, true) // Target passed -> innings complete!
    assert.equal(result.overComplete, false)
    assert.equal(result.wicketOccurred, false)
  })

  it('Legacy Compatibility: Safely handles partnership without batters array', () => {
    const legacyState = createInitialState(0)
    // Simulate legacy persisted state where partnership has runs/balls but no batters array
    const legacyPartnership = { runs: 15, balls: 12 } as unknown as {
      runs: number
      balls: number
      batters: [string, string]
    }
    const stateWithLegacyPartnership = {
      ...legacyState,
      partnership: legacyPartnership,
    }

    const result = processDelivery(
      stateWithLegacyPartnership,
      { batterRuns: 1, extras: emptyExtras(), completedRuns: 1, isLegal: true },
      defaultOptions,
    )

    assert.ok(result.nextState.partnership.batters)
    assert.equal(result.nextState.partnership.batters[0], 'Player A')
    assert.equal(result.nextState.partnership.batters[1], 'Player B')
    assert.equal(result.nextState.partnership.runs, 16)
    assert.equal(result.nextState.partnership.balls, 13)
  })
})
