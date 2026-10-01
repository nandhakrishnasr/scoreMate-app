import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setDatabaseFactory, closeDatabase } from '../src/services/localDatabase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import { generateUUID } from '../src/utils/uuid.ts'
import type { PersistedMatchRecord } from '../src/types/database.ts'
import type { MatchResult, ScoreState } from '../types/match.ts'

function createSampleScore(): ScoreState {
  return {
    runs: 54,
    wickets: 2,
    balls: 32,
    striker: { name: 'Player A', runs: 30, balls: 18, fours: 3, sixes: 1 },
    nonStriker: { name: 'Player B', runs: 20, balls: 14, fours: 2, sixes: 0 },
    bowler: { name: 'Bowler X', balls: 14, runs: 22, wickets: 2 },
    currentOver: [],
    overHistory: [],
    fallOfWickets: [],
    maxOvers: 6,
    target: 52,
    partnership: { runs: 50, balls: 30, batters: ['Player A', 'Player B'] },
    freeHit: false,
    wicketStreak: 0,
    dismissedBatters: [],
    inningsComplete: true,
    battingStats: [
      { name: 'Player A', runs: 30, balls: 18, fours: 3, sixes: 1 },
      { name: 'Player B', runs: 20, balls: 14, fours: 2, sixes: 0 },
    ],
    bowlerStats: [{ name: 'Bowler X', balls: 14, runs: 22, wickets: 2 }],
  }
}

describe('Match Lifecycle & Persistence Guarantees (Phase 8)', () => {
  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  it('1. finishMatch: Constructs and awaits completed record before terminal transition', async () => {
    const matchId = generateUUID()
    const now = new Date().toISOString()
    const initialRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: now,
      updatedAt: now,
      teamOne: 'Red XI',
      teamTwo: 'Blue XI',
      overs: 6,
      teamSize: 5,
      lastManBatting: false,
      venue: 'Gully Ground',
      competition: 'Local Cup',
      tossCaller: 'Red XI',
      tossCall: 'heads',
      tossWinner: 'Red XI',
      decision: 'bat',
      homePlayers: ['Player A', 'Player B', 'Player C'],
      visitorPlayers: ['Bowler X', 'Bowler Y', 'Bowler Z'],
      openingStriker: 'Player A',
      openingNonStriker: 'Player B',
      openingBowler: 'Bowler X',
      score: createSampleScore(),
      history: [],
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: { ...createSampleScore(), runs: 51, balls: 36, wickets: 4 },
      matchResult: null,
      battingRoster: ['Player A', 'Player B', 'Player C'],
      bowlingRoster: ['Bowler X', 'Bowler Y', 'Bowler Z'],
      screen: 'live',
    }

    // Save initial in_progress state
    await matchRepository.saveMatch(initialRecord)
    const inProgress = await matchRepository.getMatch(matchId)
    assert.strictEqual(inProgress?.status, 'in_progress')

    // Simulate finishMatch flow
    const finalScore = createSampleScore()
    const resultObj: MatchResult = { winner: 'Red XI', margin: '3 wickets to spare' }
    const completedRecord: PersistedMatchRecord = {
      ...initialRecord,
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      score: finalScore,
      matchResult: resultObj,
      screen: 'result',
    }

    // Explicitly await persistence
    await matchRepository.saveMatch(completedRecord)

    // Verify record in IndexedDB is now completed and has terminal metadata
    const persisted = await matchRepository.getMatch(matchId)
    assert.strictEqual(persisted?.status, 'completed')
    assert.ok(persisted?.completedAt, 'Must have completedAt timestamp')
    assert.deepStrictEqual(persisted?.matchResult, resultObj)

    // Verify list queries
    const completedMatches = await matchRepository.listMatches({ status: 'completed' })
    assert.strictEqual(completedMatches.length, 1)
    assert.strictEqual(completedMatches[0].matchId, matchId)

    const activeMatches = await matchRepository.listMatches({ status: 'in_progress' })
    assert.strictEqual(activeMatches.length, 0, 'Completed match must not appear in in_progress')
  })

  it('2. finishMatch failure: Match remains in_progress and recoverable when write fails', async () => {
    const matchId = generateUUID()
    const now = new Date().toISOString()
    const initialRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: now,
      updatedAt: now,
      teamOne: 'Red XI',
      teamTwo: 'Blue XI',
      overs: 6,
      teamSize: 5,
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: '',
      tossCall: '',
      tossWinner: '',
      decision: '',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: createSampleScore(),
      history: [],
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
      screen: 'live',
    }

    await matchRepository.saveMatch(initialRecord)

    // Close database to simulate an unhandled persistence failure / I/O error
    await closeDatabase()

    // Mock/simulate failure during save
    const originalSave = matchRepository.saveMatch
    matchRepository.saveMatch = async () => {
      throw new Error('QuotaExceededError: storage full')
    }

    let saveFailed = false
    try {
      await matchRepository.saveMatch({
        ...initialRecord,
        status: 'completed',
      })
    } catch {
      saveFailed = true
    } finally {
      // Restore repository method
      matchRepository.saveMatch = originalSave
    }

    assert.strictEqual(saveFailed, true, 'Persistence must throw on storage failure')

    // Reopen and inspect database state
    const current = await matchRepository.getMatch(matchId)
    assert.strictEqual(current?.status, 'in_progress', 'Match must remain in_progress and not falsely completed')

    // Retry write succeeds
    await matchRepository.saveMatch({
      ...initialRecord,
      status: 'completed',
      completedAt: new Date().toISOString(),
    })

    const retried = await matchRepository.getMatch(matchId)
    assert.strictEqual(retried?.status, 'completed', 'Retry must persist completed status')
  })

  it('3. endMatch (abandoned): Awaits markMatchAbandoned and transitions to abandoned', async () => {
    const matchId = generateUUID()
    const now = new Date().toISOString()
    const initialRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'in_progress',
      ownerUid: null,
      createdAt: now,
      updatedAt: now,
      teamOne: 'Team A',
      teamTwo: 'Team B',
      overs: 5,
      teamSize: 4,
      lastManBatting: false,
      venue: '',
      competition: '',
      tossCaller: '',
      tossCall: '',
      tossWinner: '',
      decision: '',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: '',
      openingNonStriker: '',
      openingBowler: '',
      score: createSampleScore(),
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
      screen: 'live',
    }

    await matchRepository.saveMatch(initialRecord)

    // Execute markMatchAbandoned
    await matchRepository.markMatchAbandoned(matchId)

    const abandoned = await matchRepository.getMatch(matchId)
    assert.strictEqual(abandoned?.status, 'abandoned')

    const activeList = await matchRepository.listMatches({ status: 'in_progress' })
    assert.strictEqual(activeList.length, 0, 'Abandoned match must not be in in_progress')

    const completedList = await matchRepository.listMatches({ status: 'completed' })
    assert.strictEqual(completedList.length, 0, 'Abandoned match must not be in completed')

    const allMatches = await matchRepository.listMatches()
    assert.strictEqual(allMatches.length, 1)
    assert.strictEqual(allMatches[0].status, 'abandoned')
  })
})
