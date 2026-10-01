import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setDatabaseFactory, closeDatabase, openDatabase } from '../src/services/localDatabase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import { teamRepository } from '../src/services/repositories/teamRepository.ts'
import { playerRepository } from '../src/services/repositories/playerRepository.ts'
import { migrateLocalStorageToIndexedDB, MIGRATION_FLAG_KEY } from '../src/services/migrationService.ts'
import { generateUUID } from '../src/utils/uuid.ts'
import type { PersistedMatchRecord, PersistedTeamRecord, PersistedPlayerRecord } from '../src/types/database.ts'
import {
  ACTIVE_MATCH_KEY,
  COMPLETED_MATCHES_KEY,
  TEAM_IMAGES_KEY,
  PLAYER_IMAGES_KEY,
} from '../src/services/storageService.ts'

describe('Local Persistence & Repository Layer (Phase 2)', () => {
  beforeEach(async () => {
    // Reset database instance and isolate storage
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  it('1. Initializes database with correct object stores and indexes', async () => {
    const db = await openDatabase()
    assert.ok(db, 'Database must be initialized')
    assert.strictEqual(db.name, 'scoremate_local_db')
    assert.strictEqual(db.version, 2)

    assert.ok(db.objectStoreNames.contains('matches'), 'matches store must exist')
    assert.ok(db.objectStoreNames.contains('teams'), 'teams store must exist')
    assert.ok(db.objectStoreNames.contains('players'), 'players store must exist')
    assert.ok(db.objectStoreNames.contains('settings'), 'settings store must exist')
  })

  it('2. Saves and retrieves a match record', async () => {
    const matchId = 'test-match-uuid-001'
    const record: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: 'user_123',
      createdAt: '2026-09-17T12:00:00.000Z',
      updatedAt: '2026-09-17T12:00:00.000Z',
      teamOne: 'Avengers CC',
      teamTwo: 'Supernovas',
      overs: '10',
      teamSize: '11',
      lastManBatting: false,
      venue: 'Main Stadium',
      competition: 'T20 Cup',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'Tony',
      openingNonStriker: 'Steve',
      openingBowler: 'Thanos',
      score: {
        runs: 45,
        wickets: 1,
        balls: 24,
        striker: { name: 'Tony', runs: 28, balls: 14, fours: 3, sixes: 1, out: false },
        nonStriker: { name: 'Steve', runs: 12, balls: 10, fours: 1, sixes: 0, out: false },
        bowler: { name: 'Thanos', balls: 12, runs: 20, wickets: 1 },
        currentOver: [],
        overHistory: [],
        fallOfWickets: [],
        dismissedBatters: ['Thor'],
        inningsComplete: false,
        battingStats: [],
        bowlerStats: [],
      },
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }

    await matchRepository.saveMatch(record)
    const retrieved = await matchRepository.getMatch(matchId)

    assert.ok(retrieved, 'Match should be retrieved from IndexedDB')
    assert.strictEqual(retrieved?.matchId, matchId)
    assert.strictEqual(retrieved?.teamOne, 'Avengers CC')
    assert.strictEqual(retrieved?.score?.runs, 45)
    assert.strictEqual(retrieved?.status, 'in_progress')
  })

  it('3. Updates a match record while preserving existing fields', async () => {
    const matchId = 'test-match-uuid-002'
    const initial: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: '2026-09-17T12:00:00.000Z',
      updatedAt: '2026-09-17T12:00:00.000Z',
      teamOne: 'Lions',
      teamTwo: 'Tigers',
      overs: '8',
      teamSize: '11',
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }

    await matchRepository.saveMatch(initial)
    await matchRepository.updateMatch(matchId, {
      venue: 'City Oval',
      overs: '12',
    })

    const updated = await matchRepository.getMatch(matchId)
    assert.strictEqual(updated?.venue, 'City Oval')
    assert.strictEqual(updated?.overs, '12')
    assert.strictEqual(updated?.teamOne, 'Lions')
  })

  it('4. Maintains stable match ID across updates without regeneration', async () => {
    const matchId = 'immutable-uuid-xyz-789'
    const initial: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamOne: 'Team A',
      teamTwo: 'Team B',
      overs: '5',
      teamSize: '5',
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }

    await matchRepository.saveMatch(initial)
    await matchRepository.updateMatch(matchId, { venue: 'Ground 1' })
    await matchRepository.updateMatch(matchId, { venue: 'Ground 2' })

    const res = await matchRepository.getMatch(matchId)
    assert.strictEqual(res?.matchId, matchId)
  })

  it('5. Lists matches and filters by status correctly', async () => {
    const m1: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'm-in-prog-1',
      status: 'in_progress',
      ownerUid: null,
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:00:00.000Z',
      teamOne: 'A1', teamTwo: 'B1', overs: '8', teamSize: '11', lastManBatting: false,
      venue: '', competition: '', tossCaller: null, tossCall: null, tossWinner: null, decision: 'bat',
      homePlayers: [], visitorPlayers: [], openingStriker: '', openingNonStriker: '', openingBowler: '',
      score: null, history: [], inningsNumber: 1, firstBattingHome: true, firstInningsScore: null,
      matchResult: null, battingRoster: [], bowlingRoster: [],
    }
    const m2: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'm-comp-1',
      status: 'completed',
      ownerUid: null,
      createdAt: '2026-09-17T11:00:00.000Z',
      updatedAt: '2026-09-17T11:00:00.000Z',
      completedAt: '2026-09-17T11:45:00.000Z',
      teamOne: 'A2', teamTwo: 'B2', overs: '8', teamSize: '11', lastManBatting: false,
      venue: '', competition: '', tossCaller: null, tossCall: null, tossWinner: null, decision: 'bat',
      homePlayers: [], visitorPlayers: [], openingStriker: '', openingNonStriker: '', openingBowler: '',
      score: null, history: [], inningsNumber: 2, firstBattingHome: true, firstInningsScore: null,
      matchResult: { winner: 'A2', margin: '10 runs' }, battingRoster: [], bowlingRoster: [],
    }

    await matchRepository.saveMatch(m1)
    await matchRepository.saveMatch(m2)

    const inProgressList = await matchRepository.listMatches({ status: 'in_progress' })
    const completedList = await matchRepository.listMatches({ status: 'completed' })

    assert.strictEqual(inProgressList.length, 1)
    assert.strictEqual(inProgressList[0]?.matchId, 'm-in-prog-1')

    assert.strictEqual(completedList.length, 1)
    assert.strictEqual(completedList[0]?.matchId, 'm-comp-1')
  })

  it('6. Successfully persists completed match with scores and result', async () => {
    const matchId = 'm-completed-final'
    const record: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'completed',
      ownerUid: 'uid-456',
      createdAt: '2026-09-17T14:00:00.000Z',
      updatedAt: '2026-09-17T15:30:00.000Z',
      completedAt: '2026-09-17T15:30:00.000Z',
      teamOne: 'Warriors',
      teamTwo: 'Royals',
      overs: '20',
      teamSize: '11',
      lastManBatting: false,
      venue: 'National Arena',
      competition: 'Premier League',
      tossCaller: 'visitor',
      tossCall: 'Tails',
      tossWinner: 'visitor',
      decision: 'bowl',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'A',
      openingNonStriker: 'B',
      openingBowler: 'C',
      score: { runs: 165, wickets: 6, balls: 120, striker: { name: 'A', runs: 50, balls: 35, fours: 4, sixes: 2, out: true }, nonStriker: { name: 'B', runs: 30, balls: 20, fours: 2, sixes: 1, out: false }, bowler: { name: 'C', balls: 24, runs: 30, wickets: 2 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: true, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: { runs: 160, wickets: 8, balls: 120, striker: { name: 'D', runs: 40, balls: 30, fours: 3, sixes: 1, out: true }, nonStriker: { name: 'E', runs: 20, balls: 15, fours: 1, sixes: 0, out: false }, bowler: { name: 'F', balls: 24, runs: 25, wickets: 3 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: true, battingStats: [], bowlerStats: [] },
      matchResult: { winner: 'Royals', margin: '4 wickets to spare' },
      battingRoster: [],
      bowlingRoster: [],
      playerOfMatch: { name: 'A', team: 'Royals', reason: 'Match-winning 50' },
    }

    await matchRepository.saveMatch(record)
    const fetched = await matchRepository.getMatch(matchId)
    assert.strictEqual(fetched?.status, 'completed')
    assert.strictEqual(fetched?.matchResult?.winner, 'Royals')
    assert.strictEqual(fetched?.playerOfMatch?.name, 'A')
  })

  it('7. Abandoned match is marked abandoned and excluded from completed matches', async () => {
    const matchId = 'm-abandon-test'
    const record: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamOne: 'Team Alpha',
      teamTwo: 'Team Beta',
      overs: '10',
      teamSize: '11',
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }

    await matchRepository.saveMatch(record)
    await matchRepository.markMatchAbandoned(matchId)

    const abandoned = await matchRepository.getMatch(matchId)
    assert.strictEqual(abandoned?.status, 'abandoned')

    const completed = await matchRepository.listMatches({ status: 'completed' })
    assert.strictEqual(completed.some((m) => m.matchId === matchId), false)
  })

  it('8. Persists and queries teams with stable IDs', async () => {
    const teamId = 'team-uuid-101'
    const team: PersistedTeamRecord = {
      schemaVersion: 1,
      id: teamId,
      name: 'Chennai Superstars',
      ownerUid: 'uid-team-1',
      image: 'data:image/png;base64,sample',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await teamRepository.saveTeam(team)
    const fetchedById = await teamRepository.getTeam(teamId)
    const fetchedByName = await teamRepository.getTeamByName('Chennai Superstars')

    assert.ok(fetchedById)
    assert.strictEqual(fetchedById?.id, teamId)
    assert.ok(fetchedByName)
    assert.strictEqual(fetchedByName?.name, 'Chennai Superstars')
  })

  it('9. Persists and queries players with stable IDs', async () => {
    const playerId = 'player-uuid-201'
    const player: PersistedPlayerRecord = {
      schemaVersion: 1,
      id: playerId,
      name: 'Sachin R',
      hand: 'Right',
      teamId: 'team-uuid-101',
      ownerUid: null,
      image: 'data:image/png;base64,player',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await playerRepository.savePlayer(player)
    const fetched = await playerRepository.getPlayer(playerId)
    const byTeam = await playerRepository.listPlayers({ teamId: 'team-uuid-101' })

    assert.ok(fetched)
    assert.strictEqual(fetched?.id, playerId)
    assert.strictEqual(byTeam.length, 1)
    assert.strictEqual(byTeam[0]?.name, 'Sachin R')
  })

  it('10. Handles offline guest records with null ownerUid without fabricating fake UID', async () => {
    const matchId = 'guest-offline-match-001'
    const record: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null, // Strictly null for offline guest
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamOne: 'Local Eleven',
      teamTwo: 'Street XI',
      overs: '5',
      teamSize: '6',
      lastManBatting: false,
      venue: 'Gully',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }

    await matchRepository.saveMatch(record)
    const retrieved = await matchRepository.getMatch(matchId)

    assert.ok(retrieved)
    assert.strictEqual(retrieved?.ownerUid, null, 'ownerUid must be null for offline guest')
    assert.notStrictEqual(retrieved?.ownerUid, 'guest_offline', 'Never fabricate a fake UID')
  })

  it('11. Enforces schemaVersion: 1 on all persisted records', async () => {
    const matchId = 'schema-ver-test'
    const record: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamOne: 'A',
      teamTwo: 'B',
      overs: '5',
      teamSize: '5',
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }
    await matchRepository.saveMatch(record)
    const fetched = await matchRepository.getMatch(matchId)
    assert.strictEqual(fetched?.schemaVersion, 1)
  })

  it('12. Migrates legacy localStorage records into IndexedDB safely and idempotently', async () => {
    // Setup mock global localStorage for Node test
    const storageStore: Record<string, string> = {
      [COMPLETED_MATCHES_KEY]: JSON.stringify([
        {
          id: 'legacy-match-1',
          savedAt: '2026-09-01T10:00:00.000Z',
          teamOne: 'Legacy 1',
          teamTwo: 'Legacy 2',
          firstBattingHome: true,
          firstInningsScore: null,
          secondInningsScore: null,
          result: { winner: 'Legacy 1', margin: '5 runs' },
        },
      ]),
      [ACTIVE_MATCH_KEY]: JSON.stringify({
        screen: 'live',
        teamOne: 'Active Team 1',
        teamTwo: 'Active Team 2',
        overs: '8',
        teamSize: '11',
        lastManBatting: false,
        venue: 'Turf Park',
        competition: '',
        tossCaller: null,
        tossCall: null,
        tossWinner: null,
        decision: 'bat',
        homePlayers: [],
        visitorPlayers: [],
        openingStriker: 'Batter A',
        openingNonStriker: 'Batter B',
        openingBowler: 'Bowler C',
        score: null,
        history: [],
        inningsNumber: 1,
        firstBattingHome: true,
        firstInningsScore: null,
        matchResult: null,
        battingRoster: [],
        bowlingRoster: [],
      }),
      [TEAM_IMAGES_KEY]: JSON.stringify({
        'Legacy Team': 'data:image/png;base64,teamlogo',
      }),
      [PLAYER_IMAGES_KEY]: JSON.stringify({
        'Legacy Player': 'data:image/png;base64,playerlogo',
      }),
    }

    const mockLocalStorage = {
      getItem: (key: string) => storageStore[key] ?? null,
      setItem: (key: string, val: string) => {
        storageStore[key] = val
      },
      removeItem: (key: string) => {
        delete storageStore[key]
      },
      clear: () => {
        for (const k in storageStore) delete storageStore[k]
      },
    }

    // Assign to global
    // @ts-expect-error Mocking localStorage
    globalThis.localStorage = mockLocalStorage

    const migrationResult = await migrateLocalStorageToIndexedDB('migrated-owner', true)
    assert.strictEqual(migrationResult.matchesMigrated, 1)
    assert.strictEqual(migrationResult.activeMigrated, true)
    assert.strictEqual(migrationResult.teamsMigrated, 1)
    assert.strictEqual(migrationResult.playersMigrated, 1)
    assert.strictEqual(mockLocalStorage.getItem(MIGRATION_FLAG_KEY), 'true')

    // Verify records exist in IndexedDB
    const migratedMatch = await matchRepository.getMatch('legacy-match-1')
    assert.ok(migratedMatch)
    assert.strictEqual(migratedMatch?.teamOne, 'Legacy 1')
    assert.strictEqual(migratedMatch?.status, 'completed')

    const activeMatch = await matchRepository.getActiveMatch()
    assert.ok(activeMatch)
    assert.strictEqual(activeMatch?.teamOne, 'Active Team 1')
    assert.strictEqual(activeMatch?.status, 'in_progress')

    const team = await teamRepository.getTeamByName('Legacy Team')
    assert.ok(team)
    assert.strictEqual(team?.image, 'data:image/png;base64,teamlogo')

    const player = await playerRepository.getPlayerByName('Legacy Player')
    assert.ok(player)
    assert.strictEqual(player?.image, 'data:image/png;base64,playerlogo')

    // Run again and verify idempotence
    const secondRun = await migrateLocalStorageToIndexedDB('migrated-owner', false)
    assert.strictEqual(secondRun.alreadyMigrated, true)
  })

  it('13. Recovers active in-progress match successfully', async () => {
    const matchId = 'recover-active-match'
    const inProgressRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: '2026-09-17T16:00:00.000Z',
      updatedAt: '2026-09-17T16:30:00.000Z',
      teamOne: 'Falcons',
      teamTwo: 'Hawks',
      overs: '6',
      teamSize: '8',
      lastManBatting: true,
      venue: 'South Ground',
      competition: 'Super 6s',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'F1',
      openingNonStriker: 'F2',
      openingBowler: 'H1',
      score: { runs: 32, wickets: 2, balls: 18, striker: { name: 'F1', runs: 18, balls: 10, fours: 2, sixes: 1, out: false }, nonStriker: { name: 'F2', runs: 10, balls: 8, fours: 1, sixes: 0, out: false }, bowler: { name: 'H1', balls: 6, runs: 12, wickets: 1 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: ['F0'], inningsComplete: false, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
      screen: 'live',
    }

    await matchRepository.saveMatch(inProgressRecord)
    const active = await matchRepository.getActiveMatch()

    assert.ok(active)
    assert.strictEqual(active?.matchId, matchId)
    assert.strictEqual(active?.score?.runs, 32)
    assert.strictEqual(active?.screen, 'live')
  })

  it('14. Stable match ID across multiple updates without duplicating records', async () => {
    const matchId = generateUUID()
    const baseRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: 'uid_test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamOne: 'Team A',
      teamTwo: 'Team B',
      overs: '10',
      teamSize: '11',
      lastManBatting: false,
      venue: 'Lords',
      competition: 'Club Trophy',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'A1',
      openingNonStriker: 'A2',
      openingBowler: 'B1',
      score: { runs: 0, wickets: 0, balls: 0, striker: { name: 'A1', runs: 0, balls: 0, fours: 0, sixes: 0, out: false }, nonStriker: { name: 'A2', runs: 0, balls: 0, fours: 0, sixes: 0, out: false }, bowler: { name: 'B1', balls: 0, runs: 0, wickets: 0 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: false, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
      screen: 'live',
    }

    // Save initial
    await matchRepository.saveMatch(baseRecord)

    // Perform 5 sequential scoring updates
    for (let i = 1; i <= 5; i++) {
      const updated = await matchRepository.getMatch(matchId)
      assert.ok(updated)
      assert.strictEqual(updated.matchId, matchId)
      updated.score!.runs = i * 6
      updated.score!.balls = i
      await matchRepository.saveMatch(updated)
    }

    // Verify exactly one record exists in matches store
    const matches = await matchRepository.listMatches()
    assert.strictEqual(matches.length, 1)
    assert.strictEqual(matches[0]?.matchId, matchId)
    assert.strictEqual(matches[0]?.score?.runs, 30)
    assert.strictEqual(matches[0]?.score?.balls, 5)
  })

  it('15. Interrupted migration behavior is safe and idempotent', async () => {
    // Setup mock localStorage with 2 matches
    const storageStore: Record<string, string> = {
      [COMPLETED_MATCHES_KEY]: JSON.stringify([
        { id: 'match-int-1', teamOne: 'T1', teamTwo: 'T2', savedAt: '2026-09-01T00:00:00.000Z', result: { winner: 'T1', margin: '10 runs' } },
        { id: 'match-int-2', teamOne: 'T3', teamTwo: 'T4', savedAt: '2026-09-02T00:00:00.000Z', result: { winner: 'T3', margin: '5 wickets' } },
      ]),
      [ACTIVE_MATCH_KEY]: JSON.stringify({
        screen: 'live',
        teamOne: 'Act1',
        teamTwo: 'Act2',
        overs: '8',
        teamSize: '11',
        lastManBatting: false,
        venue: 'Gully',
        competition: 'Street',
        tossCaller: null,
        tossCall: null,
        tossWinner: null,
        decision: 'bat',
        homePlayers: [],
        visitorPlayers: [],
        openingStriker: '',
        openingNonStriker: '',
        openingBowler: '',
        score: { runs: 12, wickets: 0, balls: 6, striker: { name: 'P1', runs: 8, balls: 4, fours: 1, sixes: 0, out: false }, nonStriker: { name: 'P2', runs: 4, balls: 2, fours: 0, sixes: 0, out: false }, bowler: { name: 'B1', balls: 6, runs: 12, wickets: 0 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: false, battingStats: [], bowlerStats: [] },
        history: [],
        inningsNumber: 1,
        firstBattingHome: true,
        firstInningsScore: null,
        matchResult: null,
        battingRoster: [],
        bowlingRoster: [],
      }),
    }

    // @ts-expect-error Mocking localStorage
    globalThis.localStorage = {
      getItem: (k: string) => storageStore[k] ?? null,
      setItem: (k: string, v: string) => { storageStore[k] = v },
      removeItem: (k: string) => { delete storageStore[k] },
      clear: () => { for (const k in storageStore) delete storageStore[k] },
    }

    // Manually pre-seed match-int-1 as if migration was interrupted after writing it
    await matchRepository.saveMatch({
      schemaVersion: 1,
      matchId: 'match-int-1',
      status: 'completed',
      ownerUid: 'uid-partial',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      completedAt: '2026-09-01T00:00:00.000Z',
      teamOne: 'T1',
      teamTwo: 'T2',
      overs: '8',
      teamSize: '11',
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: { winner: 'T1', margin: '10 runs' },
      battingRoster: [],
      bowlingRoster: [],
    })

    // Run migration (simulating resume after crash/interruption)
    const result = await migrateLocalStorageToIndexedDB('uid-partial')
    assert.strictEqual(result.matchesMigrated, 1) // Only match-int-2 was migrated; match-int-1 was not duplicated
    assert.strictEqual(result.activeMigrated, true)
    assert.strictEqual(result.errors.length, 0)

    // Verify all completed matches exist without duplicates
    const allMatches = await matchRepository.listMatches({ status: 'completed' })
    assert.strictEqual(allMatches.length, 2)
    assert.ok(allMatches.some((m) => m.matchId === 'match-int-1'))
    assert.ok(allMatches.some((m) => m.matchId === 'match-int-2'))

    // Verify legacy storage was not deleted prematurely
    assert.ok(storageStore[COMPLETED_MATCHES_KEY])
  })

  it('16. Completed match remains completed and preserves its original UUID', async () => {
    const matchId = generateUUID()
    const activeRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: 'user-finish-test',
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:30:00.000Z',
      teamOne: 'Strikers',
      teamTwo: 'Defenders',
      overs: '5',
      teamSize: '6',
      lastManBatting: false,
      venue: 'Ground',
      competition: 'Friendly',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'S1',
      openingNonStriker: 'S2',
      openingBowler: 'D1',
      score: { runs: 40, wickets: 2, balls: 30, striker: { name: 'S1', runs: 25, balls: 15, fours: 3, sixes: 1, out: false }, nonStriker: { name: 'S2', runs: 15, balls: 15, fours: 1, sixes: 0, out: false }, bowler: { name: 'D1', balls: 12, runs: 18, wickets: 1 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: true, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: { runs: 38, wickets: 4, balls: 30, striker: { name: 'D1', runs: 10, balls: 10, fours: 1, sixes: 0, out: true }, nonStriker: { name: 'D2', runs: 12, balls: 8, fours: 1, sixes: 0, out: false }, bowler: { name: 'S1', balls: 12, runs: 15, wickets: 2 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: true, battingStats: [], bowlerStats: [] },
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
      screen: 'live',
    }

    await matchRepository.saveMatch(activeRecord)

    // Finish match
    const completedRecord: PersistedMatchRecord = {
      ...activeRecord,
      status: 'completed',
      completedAt: '2026-09-17T11:00:00.000Z',
      updatedAt: '2026-09-17T11:00:00.000Z',
      matchResult: { winner: 'Strikers', margin: '4 wickets to spare' },
      screen: 'result',
    }
    await matchRepository.saveMatch(completedRecord)

    // Verify status and ID stability
    const fetched = await matchRepository.getMatch(matchId)
    assert.ok(fetched)
    assert.strictEqual(fetched.matchId, matchId)
    assert.strictEqual(fetched.status, 'completed')
    assert.strictEqual(fetched.matchResult?.winner, 'Strikers')

    // Verify it is no longer returned as active match
    const active = await matchRepository.getActiveMatch()
    assert.strictEqual(active, null)
  })

  it('17. Abandoned match remains abandoned and preserves its original UUID', async () => {
    const matchId = generateUUID()
    const activeRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: 'user-abandon-test',
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:15:00.000Z',
      teamOne: 'Royals',
      teamTwo: 'Kings',
      overs: '10',
      teamSize: '11',
      lastManBatting: false,
      venue: 'Oval',
      competition: 'League',
      tossCaller: 'host',
      tossCall: 'Tails',
      tossWinner: 'visitor',
      decision: 'bowl',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'R1',
      openingNonStriker: 'R2',
      openingBowler: 'K1',
      score: { runs: 15, wickets: 1, balls: 12, striker: { name: 'R1', runs: 8, balls: 6, fours: 1, sixes: 0, out: false }, nonStriker: { name: 'R2', runs: 5, balls: 6, fours: 0, sixes: 0, out: false }, bowler: { name: 'K1', balls: 12, runs: 15, wickets: 1 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: false, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
      screen: 'live',
    }

    await matchRepository.saveMatch(activeRecord)

    // Abandon match
    await matchRepository.markMatchAbandoned(matchId)

    // Verify status and ID preservation
    const fetched = await matchRepository.getMatch(matchId)
    assert.ok(fetched)
    assert.strictEqual(fetched.matchId, matchId)
    assert.strictEqual(fetched.status, 'abandoned')

    // Verify it is no longer returned as active match
    const active = await matchRepository.getActiveMatch()
    assert.strictEqual(active, null)
  })

  it('18. Offline guest has null ownerUid and never fabricates a UID', async () => {
    const matchId = generateUUID()
    const offlineRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null, // OFFLINE-FIRST GUEST
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamOne: 'Guest Team 1',
      teamTwo: 'Guest Team 2',
      overs: '5',
      teamSize: '5',
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }

    await matchRepository.saveMatch(offlineRecord)
    const fetched = await matchRepository.getMatch(matchId)
    assert.ok(fetched)
    assert.strictEqual(fetched.ownerUid, null, 'Offline guest must have strictly null ownerUid')
  })

  it('19. Online anonymous guest carries real Firebase ownerUid', async () => {
    const matchId = generateUUID()
    const realFirebaseAnonymousUid = 'anon_fb_user_998877'
    const onlineAnonRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: realFirebaseAnonymousUid, // Real Firebase UID from anonymous sign-in
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamOne: 'Anon Team 1',
      teamTwo: 'Anon Team 2',
      overs: '5',
      teamSize: '5',
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: null,
      tossCall: null,
      tossWinner: null,
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }

    await matchRepository.saveMatch(onlineAnonRecord)
    const fetched = await matchRepository.getMatch(matchId)
    assert.ok(fetched)
    assert.strictEqual(fetched.ownerUid, realFirebaseAnonymousUid)
  })

  it('20. Complete active match recovery restores all scoring state and screen', async () => {
    const matchId = generateUUID()
    const fullActiveState: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: 'uid_rec_test',
      createdAt: '2026-09-17T14:00:00.000Z',
      updatedAt: '2026-09-17T14:45:00.000Z',
      teamOne: 'Lions',
      teamTwo: 'Tigers',
      overs: '20',
      teamSize: '11',
      lastManBatting: false,
      venue: 'MCG',
      competition: 'IPL',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [{ name: 'L1', hand: 'Right' }, { name: 'L2', hand: 'Left' }],
      visitorPlayers: [{ name: 'T1', hand: 'Right' }, { name: 'T2', hand: 'Right' }],
      openingStriker: 'L1',
      openingNonStriker: 'L2',
      openingBowler: 'T1',
      score: {
        runs: 85,
        wickets: 2,
        balls: 48,
        striker: { name: 'L1', runs: 42, balls: 24, fours: 4, sixes: 2, out: false },
        nonStriker: { name: 'L2', runs: 35, balls: 20, fours: 3, sixes: 1, out: false },
        bowler: { name: 'T1', balls: 18, runs: 28, wickets: 1, maidens: 0, wides: 1, noBalls: 0, dotBalls: 8 },
        currentOver: [],
        overHistory: [],
        fallOfWickets: [{ wicket: 1, score: 20, batter: 'L0' }, { wicket: 2, score: 50, batter: 'L00' }],
        partnership: { runs: 35, balls: 20, batters: ['L1', 'L2'] },
        freeHit: false,
        dismissedBatters: ['L0', 'L00'],
        inningsComplete: false,
        battingStats: [{ name: 'L1', runs: 42, balls: 24, fours: 4, sixes: 2, out: false }],
        bowlerStats: [{ name: 'T1', balls: 18, runs: 28, wickets: 1, maidens: 0, wides: 1, noBalls: 0, dotBalls: 8 }],
      },
      history: [{ runs: 80, wickets: 2, balls: 47, striker: { name: 'L1', runs: 41, balls: 23, fours: 4, sixes: 2, out: false }, nonStriker: { name: 'L2', runs: 35, balls: 20, fours: 3, sixes: 1, out: false }, bowler: { name: 'T1', balls: 17, runs: 27, wickets: 1 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: false, battingStats: [], bowlerStats: [] }],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [{ name: 'L1', hand: 'Right' }, { name: 'L2', hand: 'Left' }],
      bowlingRoster: [{ name: 'T1', hand: 'Right' }, { name: 'T2', hand: 'Right' }],
      screen: 'live',
    }

    await matchRepository.saveMatch(fullActiveState)
    const recovered = await matchRepository.getActiveMatch()

    assert.ok(recovered)
    assert.strictEqual(recovered.matchId, matchId)
    assert.strictEqual(recovered.teamOne, 'Lions')
    assert.strictEqual(recovered.teamTwo, 'Tigers')
    assert.strictEqual(recovered.score?.runs, 85)
    assert.strictEqual(recovered.score?.wickets, 2)
    assert.strictEqual(recovered.score?.balls, 48)
    assert.strictEqual(recovered.score?.striker.name, 'L1')
    assert.strictEqual(recovered.score?.nonStriker.name, 'L2')
    assert.strictEqual(recovered.score?.bowler.name, 'T1')
    assert.strictEqual(recovered.score?.partnership?.runs, 35)
    assert.strictEqual(recovered.score?.battingStats.length, 1)
    assert.strictEqual(recovered.score?.bowlerStats.length, 1)
    assert.strictEqual(recovered.history.length, 1)
    assert.strictEqual(recovered.homePlayers.length, 2)
    assert.strictEqual(recovered.visitorPlayers.length, 2)
    assert.strictEqual(recovered.screen, 'live')
  })

  it('21. Migrates IndexedDB schema from version 1 to version 2, adding settings store while preserving data', async () => {
    // 1. Create a legacy version 1 database manually
    await closeDatabase()
    const factory = new IDBFactory()
    setDatabaseFactory(factory)

    const v1Db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open('scoremate_local_db', 1)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('matches', { keyPath: 'matchId' })
        db.createObjectStore('teams', { keyPath: 'id' })
        db.createObjectStore('players', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    // 2. Populate v1 stores with data
    const sampleMatchId = 'v1-match-preserve-001'
    const sampleTeamId = 'v1-team-preserve-001'
    const samplePlayerId = 'v1-player-preserve-001'

    await new Promise<void>((resolve, reject) => {
      const tx = v1Db.transaction(['matches', 'teams', 'players'], 'readwrite')
      tx.objectStore('matches').put({
        schemaVersion: 1,
        matchId: sampleMatchId,
        status: 'completed',
        ownerUid: 'user_v1',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
        teamOne: 'V1 Kings',
        teamTwo: 'V1 Royals',
      })
      tx.objectStore('teams').put({
        id: sampleTeamId,
        name: 'V1 Kings',
        ownerUid: 'user_v1',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      })
      tx.objectStore('players').put({
        id: samplePlayerId,
        name: 'V1 Legend',
        teamId: sampleTeamId,
        ownerUid: 'user_v1',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    v1Db.close()

    // 3. Open through standard openDatabase() which migrates to version 2
    const v2Db = await openDatabase()
    assert.strictEqual(v2Db.version, 2, 'Database must be upgraded to version 2')
    assert.ok(v2Db.objectStoreNames.contains('settings'), 'Version 2 must add settings store')
    assert.ok(v2Db.objectStoreNames.contains('matches'), 'Matches store must still exist')
    assert.ok(v2Db.objectStoreNames.contains('teams'), 'Teams store must still exist')
    assert.ok(v2Db.objectStoreNames.contains('players'), 'Players store must still exist')

    // 4. Verify all existing v1 data was preserved 100%
    const preservedMatch = await matchRepository.getMatch(sampleMatchId)
    assert.ok(preservedMatch, 'V1 match record must be preserved after v2 upgrade')
    assert.strictEqual(preservedMatch.teamOne, 'V1 Kings')

    const preservedTeam = await teamRepository.getTeam(sampleTeamId)
    assert.ok(preservedTeam, 'V1 team record must be preserved after v2 upgrade')
    assert.strictEqual(preservedTeam.name, 'V1 Kings')

    const preservedPlayer = await playerRepository.getPlayer(samplePlayerId)
    assert.ok(preservedPlayer, 'V1 player record must be preserved after v2 upgrade')
    assert.strictEqual(preservedPlayer.name, 'V1 Legend')
  })
})
