import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setDatabaseFactory, closeDatabase } from '../src/services/localDatabase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import { teamRepository } from '../src/services/repositories/teamRepository.ts'
import { playerRepository } from '../src/services/repositories/playerRepository.ts'
import { getPreviousSquadForTeam, persistSquadToRepositories } from '../src/services/squadService.ts'
import type { PersistedMatchRecord } from '../src/types/database.ts'
import type { SquadPlayer } from '../src/types/match.ts'

describe('SquadService & Previous Squad Pulling', () => {
  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  function createMockMatch(overrides: Partial<PersistedMatchRecord> = {}): PersistedMatchRecord {
    const now = new Date().toISOString()
    return {
      schemaVersion: 1,
      matchId: overrides.matchId || `match-${Math.random().toString(36).substring(2, 9)}`,
      status: 'completed',
      ownerUid: null,
      createdAt: overrides.createdAt || now,
      updatedAt: overrides.updatedAt || now,
      completedAt: overrides.completedAt || now,
      teamOne: 'Team Alpha',
      teamTwo: 'Team Beta',
      overs: '10',
      teamSize: '11',
      lastManBatting: false,
      venue: 'Main Ground',
      competition: 'Premier League',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [
        { name: 'Alpha Striker', hand: 'Right' },
        { name: 'Alpha Non-Striker', hand: 'Left' },
      ],
      visitorPlayers: [
        { name: 'Beta Bowler', hand: 'Right' },
        { name: 'Beta Fielder', hand: 'Right' },
      ],
      openingStriker: 'Alpha Striker',
      openingNonStriker: 'Alpha Non-Striker',
      openingBowler: 'Beta Bowler',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
      ...overrides,
    }
  }

  it('1. Returns empty result when team name is blank or missing', async () => {
    const res1 = await getPreviousSquadForTeam('')
    assert.strictEqual(res1.players.length, 0)
    assert.strictEqual(res1.source, 'none')

    const res2 = await getPreviousSquadForTeam('   ')
    assert.strictEqual(res2.players.length, 0)
    assert.strictEqual(res2.source, 'none')
  })

  it('2. Pulls homePlayers when team was teamOne in a completed match', async () => {
    const match = createMockMatch({
      teamOne: 'Royal Challengers',
      teamTwo: 'Super Kings',
      homePlayers: [
        { name: 'Virat', hand: 'Right' },
        { name: 'Faf', hand: 'Right' },
        { name: 'Maxwell', hand: 'Right' },
      ],
    })
    await matchRepository.saveMatch(match)

    const result = await getPreviousSquadForTeam('Royal Challengers')
    assert.strictEqual(result.source, 'match')
    assert.strictEqual(result.players.length, 3)
    assert.strictEqual(result.players[0].name, 'Virat')
    assert.strictEqual(result.players[1].name, 'Faf')
    assert.strictEqual(result.players[2].name, 'Maxwell')
  })

  it('3. Pulls visitorPlayers when team was teamTwo in a completed match', async () => {
    const match = createMockMatch({
      teamOne: 'Super Kings',
      teamTwo: 'Royal Challengers',
      visitorPlayers: [
        { name: 'Virat', hand: 'Right' },
        { name: 'Siraj', hand: 'Right' },
      ],
    })
    await matchRepository.saveMatch(match)

    const result = await getPreviousSquadForTeam('Royal Challengers')
    assert.strictEqual(result.source, 'match')
    assert.strictEqual(result.players.length, 2)
    assert.strictEqual(result.players[0].name, 'Virat')
    assert.strictEqual(result.players[1].name, 'Siraj')
  })

  it('4. Matches team names case-insensitively with leading/trailing spaces', async () => {
    const match = createMockMatch({
      teamOne: 'RCB',
      homePlayers: [{ name: 'Player One', hand: 'Right' }],
    })
    await matchRepository.saveMatch(match)

    const result1 = await getPreviousSquadForTeam('rcb')
    assert.strictEqual(result1.players.length, 1)

    const result2 = await getPreviousSquadForTeam('  RCB   ')
    assert.strictEqual(result2.players.length, 1)

    const result3 = await getPreviousSquadForTeam('Rcb')
    assert.strictEqual(result3.players.length, 1)
  })

  it('5. Prioritizes the most recent match when multiple matches exist for the same team', async () => {
    const olderMatch = createMockMatch({
      matchId: 'match-older',
      teamOne: 'Warriors',
      homePlayers: [
        { name: 'Old Batter 1', hand: 'Right' },
        { name: 'Old Batter 2', hand: 'Right' },
      ],
      updatedAt: '2026-01-01T10:00:00.000Z',
      completedAt: '2026-01-01T12:00:00.000Z',
    })

    const newerMatch = createMockMatch({
      matchId: 'match-newer',
      teamOne: 'Warriors',
      homePlayers: [
        { name: 'Recent Batter 1', hand: 'Left' },
        { name: 'Recent Batter 2', hand: 'Right' },
        { name: 'Recent Batter 3', hand: 'Right' },
      ],
      updatedAt: '2026-06-01T10:00:00.000Z',
      completedAt: '2026-06-01T12:00:00.000Z',
    })

    await matchRepository.saveMatch(olderMatch)
    await matchRepository.saveMatch(newerMatch)

    const result = await getPreviousSquadForTeam('Warriors')
    assert.strictEqual(result.players.length, 3)
    assert.strictEqual(result.players[0].name, 'Recent Batter 1')
    assert.strictEqual(result.players[0].hand, 'Left')
  })

  it('6. Caps the pulled squad at teamLimit', async () => {
    const match = createMockMatch({
      teamOne: 'Eleven Stars',
      homePlayers: [
        { name: 'P1', hand: 'Right' },
        { name: 'P2', hand: 'Right' },
        { name: 'P3', hand: 'Right' },
        { name: 'P4', hand: 'Right' },
        { name: 'P5', hand: 'Right' },
      ],
    })
    await matchRepository.saveMatch(match)

    const result = await getPreviousSquadForTeam('Eleven Stars', [], 3)
    assert.strictEqual(result.players.length, 3)
    assert.deepStrictEqual(result.players.map((p) => p.name), ['P1', 'P2', 'P3'])
  })

  it('7. Omits players who are already in the opposing squad to prevent duplicate conflict', async () => {
    const match = createMockMatch({
      teamOne: 'Red Bulls',
      homePlayers: [
        { name: 'Shared Player', hand: 'Right' },
        { name: 'Unique Bull', hand: 'Right' },
      ],
    })
    await matchRepository.saveMatch(match)

    const opposingSquad: SquadPlayer[] = [{ name: 'Shared Player', hand: 'Right' }]
    const result = await getPreviousSquadForTeam('Red Bulls', opposingSquad, 11)

    assert.strictEqual(result.players.length, 1)
    assert.strictEqual(result.players[0].name, 'Unique Bull')
  })

  it('8. Falls back to team and player repositories if no matches in matchRepository', async () => {
    await teamRepository.saveTeam({
      schemaVersion: 1,
      id: 'team-kdm',
      name: 'KDM Warriors',
      ownerUid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      playerIds: ['p-1', 'p-2'],
    })

    await playerRepository.savePlayer({
      schemaVersion: 1,
      id: 'p-1',
      name: 'Repo Batter',
      hand: 'Left',
      teamId: 'team-kdm',
      ownerUid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await playerRepository.savePlayer({
      schemaVersion: 1,
      id: 'p-2',
      name: 'Repo Bowler',
      hand: 'Right',
      teamId: 'team-kdm',
      ownerUid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const result = await getPreviousSquadForTeam('KDM Warriors')
    assert.strictEqual(result.source, 'team')
    assert.strictEqual(result.players.length, 2)
    assert.strictEqual(result.players[0].name, 'Repo Batter')
    assert.strictEqual(result.players[0].hand, 'Left')
    assert.strictEqual(result.players[1].name, 'Repo Bowler')
  })

  it('9. persistSquadToRepositories creates and links team and players', async () => {
    const players: SquadPlayer[] = [
      { name: 'Persisted Star 1', hand: 'Right' },
      { name: 'Persisted Star 2', hand: 'Left' },
    ]

    await persistSquadToRepositories('Super Giants', players, 'user-123')

    const team = await teamRepository.getTeamByName('Super Giants')
    assert.ok(team, 'Team should be created')
    assert.strictEqual(team.name, 'Super Giants')
    assert.strictEqual(team.playerIds?.length, 2)

    const p1 = await playerRepository.getPlayerByName('Persisted Star 1')
    assert.ok(p1, 'Player 1 should be created')
    assert.strictEqual(p1.hand, 'Right')
    assert.strictEqual(p1.teamId, team.id)

    const p2 = await playerRepository.getPlayerByName('Persisted Star 2')
    assert.ok(p2, 'Player 2 should be created')
    assert.strictEqual(p2.hand, 'Left')
    assert.strictEqual(p2.teamId, team.id)
  })
})
