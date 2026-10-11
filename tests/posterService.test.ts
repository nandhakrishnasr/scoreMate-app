import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  extractMilestoneCandidates,
  extractTopPerformers,
  generatePlayerOfMatchPoster,
  generateMatchSummaryPoster,
  generateMilestonePoster,
  deliverPoster,
} from '../src/services/posterService.ts'
import type { ScoreState, MatchResult } from '../src/types/match.ts'

function createMockScore(overrides?: Partial<ScoreState>): ScoreState {
  return {
    runs: 165,
    wickets: 4,
    balls: 120,
    currentOver: [],
    overHistory: [],
    striker: { name: 'Player A', runs: 55, balls: 35, fours: 6, sixes: 2 },
    nonStriker: { name: 'Player B', runs: 22, balls: 18, fours: 2, sixes: 0 },
    bowler: { name: 'Bowler X', balls: 24, maidens: 0, runs: 28, wickets: 3 },
    battingStats: [
      { name: 'Player A', runs: 55, balls: 35, fours: 6, sixes: 2, out: true, dismissal: 'Caught' },
      { name: 'Player B', runs: 22, balls: 18, fours: 2, sixes: 0, out: true, dismissal: 'Bowled' },
      { name: 'Player C', runs: 104, balls: 58, fours: 11, sixes: 5, out: false },
    ],
    bowlerStats: [
      { name: 'Bowler X', balls: 24, maidens: 0, runs: 28, wickets: 3 },
      { name: 'Bowler Y', balls: 24, maidens: 0, runs: 35, wickets: 1 },
    ],
    fallOfWickets: [],
    extras: { wides: 2, noBalls: 1, byes: 0, legByes: 1 },
    ...overrides,
  }
}

describe('PosterService & Social Media Cards (Phase 1)', () => {
  it('1. Correctly identifies 50s and 100s milestones in batting', () => {
    const firstInnings = createMockScore()
    const milestones = extractMilestoneCandidates({
      firstInningsScore: firstInnings,
      secondInningsScore: null,
      teamOne: 'Royal Challengers',
      teamTwo: 'Chennai Super',
      firstBattingHome: true,
    })

    const centuries = milestones.filter((m) => m.title === 'CENTURY!')
    const halfCenturies = milestones.filter((m) => m.title === 'HALF-CENTURY!')

    assert.strictEqual(centuries.length, 1)
    assert.strictEqual(centuries[0].name, 'Player C')
    assert.strictEqual(centuries[0].value, 104)
    assert.strictEqual(centuries[0].team, 'Royal Challengers')

    assert.strictEqual(halfCenturies.length, 1)
    assert.strictEqual(halfCenturies[0].name, 'Player A')
    assert.strictEqual(halfCenturies[0].value, 55)
  })

  it('2. Correctly identifies 3+ wicket hauls in bowling and attributes to fielding team', () => {
    const firstInnings = createMockScore()
    const milestones = extractMilestoneCandidates({
      firstInningsScore: firstInnings,
      secondInningsScore: null,
      teamOne: 'Royal Challengers',
      teamTwo: 'Chennai Super',
      firstBattingHome: true,
    })

    const wicketHauls = milestones.filter((m) => m.type === 'wickets')
    assert.strictEqual(wicketHauls.length, 1)
    assert.strictEqual(wicketHauls[0].name, 'Bowler X')
    assert.strictEqual(wicketHauls[0].value, 3)
    // Bowled in 1st innings against Royal Challengers, so bowler belongs to Chennai Super
    assert.strictEqual(wicketHauls[0].team, 'Chennai Super')
  })

  it('3. Returns empty milestone array when no players hit 50+ or take 3+ wickets', () => {
    const modestScore = createMockScore({
      battingStats: [
        { name: 'P1', runs: 24, balls: 19, fours: 2, sixes: 1, out: false },
        { name: 'P2', runs: 18, balls: 15, fours: 1, sixes: 0, out: true },
      ],
      bowlerStats: [
        { name: 'B1', balls: 12, maidens: 0, runs: 16, wickets: 1 },
        { name: 'B2', balls: 12, maidens: 0, runs: 18, wickets: 2 },
      ],
    })

    const milestones = extractMilestoneCandidates({
      firstInningsScore: modestScore,
      secondInningsScore: null,
      teamOne: 'Team A',
      teamTwo: 'Team B',
      firstBattingHome: true,
    })

    assert.strictEqual(milestones.length, 0)
  })

  it('4. Correctly extracts top batters and bowlers from innings', () => {
    const score = createMockScore()
    const { topBatters, topBowlers } = extractTopPerformers(score, 'Royal Challengers')

    assert.strictEqual(topBatters.length, 2)
    assert.strictEqual(topBatters[0].name, 'Player C') // 104 runs
    assert.strictEqual(topBatters[1].name, 'Player A') // 55 runs

    assert.strictEqual(topBowlers.length, 2)
    assert.strictEqual(topBowlers[0].name, 'Bowler X') // 3 wickets
    assert.strictEqual(topBowlers[1].name, 'Bowler Y') // 1 wicket
  })

  it('5. Safe canvas fallbacks when document is not present in Node environment', () => {
    // In Node.js environment where document may not be defined or mocked:
    const potm = generatePlayerOfMatchPoster({
      matchSummary: { teamOne: 'RCB', teamTwo: 'CSK', winner: 'RCB', margin: '12 runs' },
      player: { name: 'Player C', team: 'RCB', runs: 104, balls: 58 },
    })

    const matchSummary = generateMatchSummaryPoster({
      teamOne: 'RCB',
      teamTwo: 'CSK',
      firstTeam: 'RCB',
      secondTeam: 'CSK',
      firstInningsScore: createMockScore(),
      secondInningsScore: null,
      result: { winner: 'RCB', margin: '12 runs' } as MatchResult,
    })

    const milestone = generateMilestonePoster({
      matchSummary: { teamOne: 'RCB', teamTwo: 'CSK' },
      milestone: { name: 'Player C', team: 'RCB', type: 'runs', title: 'CENTURY!', value: 104 },
    })

    // When running in headless Node without mock document, gracefully returns empty string
    // When running with mock document, returns data URL string
    assert.ok(typeof potm === 'string')
    assert.ok(typeof matchSummary === 'string')
    assert.ok(typeof milestone === 'string')
  })

  it('6. deliverPoster handles safe filename sanitization without throwing', async () => {
    await assert.doesNotReject(async () => {
      await deliverPoster('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'Test Match/Player:Special#Name')
    })
  })
})
