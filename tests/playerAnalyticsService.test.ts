import test from 'node:test'
import assert from 'node:assert/strict'
import type { CompletedMatch, PlayerStat } from '../src/types/match.ts'
import {
  getPlayerHeadToHeadByTeam,
  getPlayerRecentMatchLog,
  getTeamHeadToHeadComparison,
  getPlayerMilestoneBadges,
} from '../src/services/playerAnalyticsService.ts'

const mockMatches: CompletedMatch[] = [
  {
    id: 'm1',
    savedAt: '2026-10-01T10:00:00Z',
    teamOne: 'Warriors',
    teamTwo: 'Titans',
    firstBattingHome: true,
    overs: '10',
    teamSize: '11',
    venue: 'Stadium A',
    result: { winner: 'Warriors', margin: '15 runs' },
    firstInningsScore: {
      runs: 85,
      wickets: 2,
      balls: 60,
      striker: { name: 'Arun', runs: 45, balls: 25, fours: 4, sixes: 2 },
      nonStriker: { name: 'Bala', runs: 20, balls: 15, fours: 2, sixes: 0 },
      bowler: { name: 'Kiran', overs: '2.0', balls: 12, runs: 18, wickets: 1, maidens: 0 },
      currentOver: [],
      overHistory: [],
      battingStats: [
        { name: 'Arun', runs: 45, balls: 25, fours: 4, sixes: 2, out: true },
        { name: 'Bala', runs: 20, balls: 15, fours: 2, sixes: 0, out: false },
      ],
      bowlerStats: [
        { name: 'Kiran', balls: 12, runs: 18, wickets: 1, maidens: 0 },
      ],
      fallOfWickets: [],
      dismissedBatters: ['Arun'],
    },
    secondInningsScore: {
      runs: 70,
      wickets: 4,
      balls: 60,
      striker: { name: 'David', runs: 30, balls: 20, fours: 2, sixes: 1 },
      nonStriker: { name: 'Ethan', runs: 10, balls: 10, fours: 1, sixes: 0 },
      bowler: { name: 'Arun', overs: '2.0', balls: 12, runs: 14, wickets: 2, maidens: 0 },
      currentOver: [],
      overHistory: [],
      battingStats: [
        { name: 'David', runs: 30, balls: 20, fours: 2, sixes: 1, out: false },
      ],
      bowlerStats: [
        { name: 'Arun', balls: 12, runs: 14, wickets: 2, maidens: 0 },
      ],
      fallOfWickets: [],
      dismissedBatters: [],
    },
    homePlayers: [{ name: 'Arun', role: 'Batter' }, { name: 'Bala', role: 'Batter' }],
    visitorPlayers: [{ name: 'David', role: 'Batter' }, { name: 'Kiran', role: 'Bowler' }],
  },
  {
    id: 'm2',
    savedAt: '2026-10-05T10:00:00Z',
    teamOne: 'Titans',
    teamTwo: 'Warriors',
    firstBattingHome: false, // Warriors (teamTwo) batted first
    overs: '10',
    teamSize: '11',
    venue: 'Stadium B',
    result: { winner: 'Titans', margin: '4 wickets' },
    firstInningsScore: {
      runs: 90,
      wickets: 3,
      balls: 60,
      striker: { name: 'Arun', runs: 60, balls: 30, fours: 6, sixes: 3 },
      nonStriker: { name: 'Bala', runs: 15, balls: 10, fours: 1, sixes: 0 },
      bowler: { name: 'Kiran', overs: '2.0', balls: 12, runs: 22, wickets: 0, maidens: 0 },
      currentOver: [],
      overHistory: [],
      battingStats: [
        { name: 'Arun', runs: 60, balls: 30, fours: 6, sixes: 3, out: false },
      ],
      bowlerStats: [
        { name: 'Kiran', balls: 12, runs: 22, wickets: 0, maidens: 0 },
      ],
      fallOfWickets: [],
      dismissedBatters: [],
    },
    secondInningsScore: {
      runs: 92,
      wickets: 2,
      balls: 55,
      striker: { name: 'David', runs: 50, balls: 28, fours: 5, sixes: 2 },
      nonStriker: { name: 'Ethan', runs: 20, balls: 12, fours: 2, sixes: 0 },
      bowler: { name: 'Arun', overs: '2.0', balls: 12, runs: 20, wickets: 1, maidens: 0 },
      currentOver: [],
      overHistory: [],
      battingStats: [
        { name: 'David', runs: 50, balls: 28, fours: 5, sixes: 2, out: false },
      ],
      bowlerStats: [
        { name: 'Arun', balls: 12, runs: 20, wickets: 1, maidens: 0 },
      ],
      fallOfWickets: [],
      dismissedBatters: [],
    },
    homePlayers: [{ name: 'David', role: 'Batter' }, { name: 'Kiran', role: 'Bowler' }],
    visitorPlayers: [{ name: 'Arun', role: 'Batter' }, { name: 'Bala', role: 'Batter' }],
  },
]

test('getPlayerHeadToHeadByTeam aggregates against opponent teams correctly', () => {
  const records = getPlayerHeadToHeadByTeam('Arun', mockMatches)
  assert.equal(records.length, 1)
  const titansRecord = records[0]
  assert.equal(titansRecord.opponentTeam, 'Titans')
  assert.equal(titansRecord.matches, 2)
  assert.equal(titansRecord.runs, 105) // 45 + 60
  assert.equal(titansRecord.balls, 55) // 25 + 30
  assert.equal(titansRecord.best, 60)
  assert.equal(titansRecord.wickets, 3) // 2 + 1
})

test('getPlayerRecentMatchLog returns chronological log with batting & bowling stats', () => {
  const logs = getPlayerRecentMatchLog('Arun', mockMatches)
  assert.equal(logs.length, 2)
  // Newest match first (m2 on Oct 5)
  assert.equal(logs[0].matchId, 'm2')
  assert.equal(logs[0].batting?.runs, 60)
  assert.equal(logs[0].bowling?.wickets, 1)

  // Older match second (m1 on Oct 1)
  assert.equal(logs[1].matchId, 'm1')
  assert.equal(logs[1].batting?.runs, 45)
  assert.equal(logs[1].bowling?.wickets, 2)
})

test('getTeamHeadToHeadComparison computes head-to-head metrics between teams', () => {
  const h2h = getTeamHeadToHeadComparison('Warriors', 'Titans', mockMatches)
  assert.equal(h2h.totalMatches, 2)
  assert.equal(h2h.teamAWins, 1)
  assert.equal(h2h.teamBWins, 1)
  assert.equal(h2h.teamAWinPct, 50)
  assert.equal(h2h.teamBWinPct, 50)
  assert.equal(h2h.teamAHighest, 90) // Warriors highest score: 90 in m2
  assert.equal(h2h.teamBHighest, 92) // Titans highest score: 92 in m2
  assert.deepEqual(h2h.recentForm, ['L', 'W'])
})

test('getPlayerMilestoneBadges identifies earned milestones accurately', () => {
  const playerStat: PlayerStat = {
    name: 'Arun',
    runs: 105,
    balls: 55,
    bowlingBalls: 24,
    fours: 10,
    sixes: 5,
    outs: 1,
    notOuts: 1,
    wickets: 3,
    catches: 2,
    runOuts: 0,
    stumpings: 0,
    matches: 2,
    innings: 2,
    best: 60,
    average: 105,
    strikeRate: 190.9,
    fifties: 1,
    hundreds: 0,
    ducks: 0,
    overs: 4,
    maidens: 0,
    wides: 0,
    noBalls: 0,
    dotBalls: 10,
    economy: 8.5,
    runsConceded: 34,
  }

  const badges = getPlayerMilestoneBadges(playerStat)
  const runMachine = badges.find((b) => b.id === 'run_machine')
  const halfCentury = badges.find((b) => b.id === 'half_century')
  const wicketHunter = badges.find((b) => b.id === 'wicket_hunter')
  const centurion = badges.find((b) => b.id === 'centurion')

  assert.equal(runMachine?.earned, true)
  assert.equal(halfCentury?.earned, true)
  assert.equal(wicketHunter?.earned, true)
  assert.equal(centurion?.earned, false) // 0 hundreds
})
