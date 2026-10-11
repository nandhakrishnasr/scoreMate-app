import test from 'node:test'
import assert from 'node:assert/strict'
import type { BallTrackRecord, ScoreState } from '../src/types/match.ts'
import {
  CRICKET_FIELD_ZONES,
  PITCH_LENGTHS,
  ALL_ZONES,
  ALL_LENGTHS,
  getZoneBreakdown,
  getLengthBreakdown,
  synthesizeBallTrackingIfEmpty,
} from '../src/services/wagonWheelService.ts'

test('CRICKET_FIELD_ZONES and PITCH_LENGTHS metadata completeness', () => {
  assert.equal(ALL_ZONES.length, 8)
  assert.equal(ALL_LENGTHS.length, 5)

  for (const zone of ALL_ZONES) {
    const meta = CRICKET_FIELD_ZONES[zone]
    assert.ok(meta, `Zone ${zone} meta must exist`)
    assert.ok(meta.label.length > 0)
    assert.ok(meta.angleDeg >= 0 && meta.angleDeg <= 360)
  }

  for (const length of ALL_LENGTHS) {
    const meta = PITCH_LENGTHS[length]
    assert.ok(meta, `Length ${length} meta must exist`)
    assert.ok(meta.label.length > 0)
  }
})

test('getZoneBreakdown accurately aggregates runs, boundaries, and percentages', () => {
  const sampleRecords: BallTrackRecord[] = [
    {
      ballNumber: 1,
      overNumber: 1,
      ballInOver: 1,
      batterName: 'Virat',
      bowlerName: 'Starc',
      runs: 4,
      batterRuns: 4,
      isBoundary: true,
      isWicket: false,
      zone: 'cover',
      length: 'full',
      timestamp: '2026-10-11T12:00:00Z',
    },
    {
      ballNumber: 2,
      overNumber: 1,
      ballInOver: 2,
      batterName: 'Virat',
      bowlerName: 'Starc',
      runs: 6,
      batterRuns: 6,
      isBoundary: true,
      isWicket: false,
      zone: 'long_on',
      length: 'good_length',
      timestamp: '2026-10-11T12:01:00Z',
    },
    {
      ballNumber: 3,
      overNumber: 1,
      ballInOver: 3,
      batterName: 'Rohit',
      bowlerName: 'Starc',
      runs: 1,
      batterRuns: 1,
      isBoundary: false,
      isWicket: false,
      zone: 'mid_wicket',
      length: 'good_length',
      timestamp: '2026-10-11T12:02:00Z',
    },
    {
      ballNumber: 4,
      overNumber: 1,
      ballInOver: 4,
      batterName: 'Rohit',
      bowlerName: 'Starc',
      runs: 0,
      batterRuns: 0,
      isBoundary: false,
      isWicket: true,
      zone: 'point',
      length: 'bouncer',
      timestamp: '2026-10-11T12:03:00Z',
    },
  ]

  const breakdownAll = getZoneBreakdown(sampleRecords)
  assert.equal(breakdownAll.cover.runs, 4)
  assert.equal(breakdownAll.cover.fours, 1)
  assert.equal(breakdownAll.long_on.runs, 6)
  assert.equal(breakdownAll.long_on.sixes, 1)
  assert.equal(breakdownAll.mid_wicket.runs, 1)
  assert.equal(breakdownAll.mid_wicket.singles, 1)
  assert.equal(breakdownAll.point.wickets, 1)

  // Filter by batter 'Virat'
  const breakdownVirat = getZoneBreakdown(sampleRecords, 'Virat')
  assert.equal(breakdownVirat.cover.runs, 4)
  assert.equal(breakdownVirat.long_on.runs, 6)
  assert.equal(breakdownVirat.mid_wicket.runs, 0) // Rohit's run not included
})

test('getLengthBreakdown aggregates bowling lengths and dot balls', () => {
  const sampleRecords: BallTrackRecord[] = [
    {
      ballNumber: 1,
      overNumber: 1,
      ballInOver: 1,
      batterName: 'Virat',
      bowlerName: 'Starc',
      runs: 0,
      isBoundary: false,
      isWicket: false,
      zone: 'cover',
      length: 'yorker',
      timestamp: '2026-10-11T12:00:00Z',
    },
    {
      ballNumber: 2,
      overNumber: 1,
      ballInOver: 2,
      batterName: 'Virat',
      bowlerName: 'Starc',
      runs: 0,
      isBoundary: false,
      isWicket: true,
      zone: 'cover',
      length: 'yorker',
      timestamp: '2026-10-11T12:01:00Z',
    },
    {
      ballNumber: 3,
      overNumber: 1,
      ballInOver: 3,
      batterName: 'Rahul',
      bowlerName: 'Cummins',
      runs: 4,
      isBoundary: true,
      isWicket: false,
      zone: 'cover',
      length: 'short',
      timestamp: '2026-10-11T12:02:00Z',
    },
  ]

  const lengthBreakdown = getLengthBreakdown(sampleRecords)
  assert.equal(lengthBreakdown.yorker.balls, 2)
  assert.equal(lengthBreakdown.yorker.dotBalls, 2)
  assert.equal(lengthBreakdown.yorker.wickets, 1)
  assert.equal(lengthBreakdown.short.balls, 1)
  assert.equal(lengthBreakdown.short.runs, 4)

  // Filter by bowler 'Starc'
  const starcBreakdown = getLengthBreakdown(sampleRecords, 'Starc')
  assert.equal(starcBreakdown.yorker.balls, 2)
  assert.equal(starcBreakdown.short.balls, 0)
})

test('synthesizeBallTrackingIfEmpty returns existing ball tracking or synthesizes deterministically', () => {
  const existingRecords: BallTrackRecord[] = [
    {
      ballNumber: 1,
      overNumber: 1,
      ballInOver: 1,
      batterName: 'Dhoni',
      bowlerName: 'Anderson',
      runs: 6,
      isBoundary: true,
      isWicket: false,
      zone: 'long_on',
      length: 'good_length',
      timestamp: '2026-10-11T12:00:00Z',
    },
  ]

  const scoreWithTracking: ScoreState = {
    runs: 6,
    wickets: 0,
    balls: 1,
    striker: { name: 'Dhoni', runs: 6, balls: 1, fours: 0, sixes: 1 },
    nonStriker: { name: 'Kohli', runs: 0, balls: 0, fours: 0, sixes: 0 },
    bowler: { name: 'Anderson', overs: '0.1', balls: 1, runs: 6, wickets: 0, maidens: 0 },
    currentOver: [],
    overHistory: [],
    battingStats: [{ name: 'Dhoni', runs: 6, balls: 1, fours: 0, sixes: 1 }],
    bowlerStats: [],
    fallOfWickets: [],
    dismissedBatters: [],
    ballTracking: existingRecords,
  }

  const resultExisting = synthesizeBallTrackingIfEmpty(scoreWithTracking)
  assert.equal(resultExisting.length, 1)
  assert.equal(resultExisting[0].runs, 6)
  assert.equal(resultExisting[0].batterName, 'Dhoni')

  // Synthesize for legacy match without ballTracking
  const legacyScore: ScoreState = {
    runs: 10,
    wickets: 1,
    balls: 6,
    striker: { name: 'Dhoni', runs: 10, balls: 5, fours: 1, sixes: 1 },
    nonStriker: { name: 'Kohli', runs: 0, balls: 1, fours: 0, sixes: 0 },
    bowler: { name: 'Anderson', overs: '1.0', balls: 6, runs: 10, wickets: 1, maidens: 0 },
    currentOver: [],
    overHistory: [
      {
        number: 1,
        bowler: 'Anderson',
        runs: 10,
        wickets: 1,
        deliveries: [
          { ball: 1, runs: 0, legal: true, wicket: false },
          { ball: 2, runs: 4, legal: true, wicket: false, batterRuns: 4 },
          { ball: 3, runs: 6, legal: true, wicket: false, batterRuns: 6 },
          { ball: 4, runs: 0, legal: true, wicket: true },
        ],
      },
    ],
    battingStats: [{ name: 'Dhoni', runs: 10, balls: 5, fours: 1, sixes: 1 }],
    bowlerStats: [],
    fallOfWickets: [],
    dismissedBatters: [],
  }

  const synthesized = synthesizeBallTrackingIfEmpty(legacyScore)
  assert.equal(synthesized.length, 4)
  assert.equal(synthesized[1].runs, 4)
  assert.equal(synthesized[1].isBoundary, true)
  assert.equal(synthesized[2].runs, 6)
  assert.equal(synthesized[2].isBoundary, true)
  assert.equal(synthesized[3].isWicket, true)
})
