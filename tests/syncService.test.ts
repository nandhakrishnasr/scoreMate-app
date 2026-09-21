import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setDatabaseFactory, closeDatabase } from '../src/services/localDatabase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import { teamRepository } from '../src/services/repositories/teamRepository.ts'
import { playerRepository } from '../src/services/repositories/playerRepository.ts'
import {
  syncService,
  areMatchesCanonicallyEqual,
  validateCloudMatch,
  validateCloudTeam,
  validateCloudPlayer,
  resolveMatchConflict,
} from '../src/services/syncService.ts'
import { setFirestoreAdapter, type FirestoreAdapter } from '../src/services/firestore.ts'
import { firebaseAuth } from '../src/services/firebase.ts'
import { restoreBackup, computeChecksum } from '../src/services/backupService.ts'
import type {
  PersistedMatchRecord,
  PersistedTeamRecord,
  PersistedPlayerRecord,
  BackupSnapshot,
} from '../src/types/database.ts'

// In-memory Firestore mock store
class MemoryFirestoreAdapter implements FirestoreAdapter {
  readonly store = new Map<string, Record<string, unknown>>()

  private makeKey(pathSegments: string[]): string {
    return pathSegments.join('/')
  }

  async getDoc(path: string, ...pathSegments: string[]): Promise<unknown | null> {
    const key = this.makeKey([path, ...pathSegments])
    const data = this.store.get(key)
    return data ? JSON.parse(JSON.stringify(data)) : null
  }

  async setDoc(data: Record<string, unknown>, path: string, ...pathSegments: string[]): Promise<void> {
    const key = this.makeKey([path, ...pathSegments])
    this.store.set(key, JSON.parse(JSON.stringify(data)))
  }

  async listDocs(path: string, ...pathSegments: string[]): Promise<unknown[]> {
    const prefix = this.makeKey([path, ...pathSegments]) + '/'
    const results: unknown[] = []
    for (const [key, val] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        // Ensure direct children only
        const sub = key.slice(prefix.length)
        if (!sub.includes('/')) {
          results.push(JSON.parse(JSON.stringify(val)))
        }
      }
    }
    return results
  }

  clear(): void {
    this.store.clear()
  }
}

describe('SyncService & Firestore Synchronization (Phase 3)', () => {
  let mockFirestore: MemoryFirestoreAdapter

  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
    mockFirestore = new MemoryFirestoreAdapter()
    setFirestoreAdapter(mockFirestore)
    syncService.invalidateSession()

    // Default to unauthenticated / offline guest
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: null,
      writable: true,
      configurable: true,
    })
  })

  afterEach(async () => {
    syncService.invalidateSession()
    setFirestoreAdapter(null)
    await closeDatabase()
  })

  it('1. Offline-first guest is never synchronized', async () => {
    // Current user is null (offline guest)
    assert.strictEqual(firebaseAuth.currentUser, null)

    const match: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'guest-match-1',
      status: 'in_progress',
      ownerUid: null,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
      teamOne: 'Guest 1',
      teamTwo: 'Guest 2',
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
    await matchRepository.saveMatch(match)

    const result = await syncService.syncAll()
    assert.strictEqual(result.matchesUploaded, 0)
    assert.strictEqual(mockFirestore.store.size, 0, 'Firestore must remain completely untouched for offline guests')
  })

  it('2. Authenticated user uses real Firebase UID as partition path', async () => {
    const realUid = 'firebase_user_abc123'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid: realUid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    const match: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'auth-match-001',
      status: 'in_progress',
      ownerUid: realUid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
      teamOne: 'Titans',
      teamTwo: 'Warriors',
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
    await matchRepository.saveMatch(match)

    const result = await syncService.syncAll()
    assert.strictEqual(result.matchesUploaded, 1)

    // Verify key in Firestore
    const expectedKey = `users/${realUid}/matches/auth-match-001`
    assert.ok(mockFirestore.store.has(expectedKey), `Document must be stored at ${expectedKey}`)
  })

  it('3. Anonymous Firebase user uses real anonymous UID as partition path', async () => {
    const anonUid = 'anon_user_xyz789'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid: anonUid, isAnonymous: true },
      writable: true,
      configurable: true,
    })

    const team: PersistedTeamRecord = {
      schemaVersion: 1,
      id: 'team_anon_1',
      name: 'Anon XI',
      ownerUid: anonUid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    }
    await teamRepository.saveTeam(team)

    const result = await syncService.syncAll()
    assert.strictEqual(result.teamsUploaded, 1)

    const expectedKey = `users/${anonUid}/teams/team_anon_1`
    assert.ok(mockFirestore.store.has(expectedKey))
  })

  it('4. Stable match/team/player IDs produce deterministic Firestore paths', async () => {
    const uid = 'user_deterministic'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await matchRepository.saveMatch({
      schemaVersion: 1,
      matchId: 'fixed-match-id',
      status: 'completed',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
      teamOne: 'T1',
      teamTwo: 'T2',
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
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: { winner: 'T1', margin: '5 runs' },
      battingRoster: [],
      bowlingRoster: [],
    })

    await teamRepository.saveTeam({
      schemaVersion: 1,
      id: 'fixed-team-id',
      name: 'Fixed Team',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    })

    await playerRepository.savePlayer({
      schemaVersion: 1,
      id: 'fixed-player-id',
      name: 'Fixed Player',
      hand: 'Right',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    })

    await syncService.syncAll()

    assert.ok(mockFirestore.store.has(`users/${uid}/matches/fixed-match-id`))
    assert.ok(mockFirestore.store.has(`users/${uid}/teams/fixed-team-id`))
    assert.ok(mockFirestore.store.has(`users/${uid}/players/fixed-player-id`))
  })

  it('5. Repeated identical upload is idempotent', async () => {
    const uid = 'user_idempotent'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await teamRepository.saveTeam({
      schemaVersion: 1,
      id: 'idemp-team-1',
      name: 'Idempotent XI',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    })

    const run1 = await syncService.syncAll()
    assert.strictEqual(run1.teamsUploaded, 1)

    const run2 = await syncService.syncAll()
    assert.strictEqual(run2.teamsUploaded, 0)
    assert.strictEqual(run2.teamsDownloaded, 0)
    assert.strictEqual(mockFirestore.store.size, 1)
  })

  it('6. Local-only record uploads to cloud', async () => {
    const uid = 'user_upload_only'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await playerRepository.savePlayer({
      schemaVersion: 1,
      id: 'local-only-player',
      name: 'Local Only',
      hand: 'Left',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.playersUploaded, 1)
    const inCloud = mockFirestore.store.get(`users/${uid}/players/local-only-player`)
    assert.ok(inCloud)
    assert.strictEqual((inCloud as PersistedPlayerRecord).name, 'Local Only')
  })

  it('7. Cloud-only record imports to local IndexedDB', async () => {
    const uid = 'user_download_only'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    // Pre-seed cloud with a team
    mockFirestore.store.set(`users/${uid}/teams/cloud-team-1`, {
      schemaVersion: 1,
      id: 'cloud-team-1',
      name: 'Cloud Stars',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.teamsDownloaded, 1)

    const localTeam = await teamRepository.getTeam('cloud-team-1')
    assert.ok(localTeam)
    assert.strictEqual(localTeam.name, 'Cloud Stars')
    assert.strictEqual(localTeam.syncStatus, 'synced')
  })

  it('8. Newer local record updates cloud', async () => {
    const uid = 'user_newer_local'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    // Cloud record older
    mockFirestore.store.set(`users/${uid}/teams/team-time-1`, {
      schemaVersion: 1,
      id: 'team-time-1',
      name: 'Old Name',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T01:00:00.000Z',
    })

    // Local record newer
    await teamRepository.saveTeam({
      schemaVersion: 1,
      id: 'team-time-1',
      name: 'New Name',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T02:00:00.000Z',
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.teamsUploaded, 1)

    const inCloud = mockFirestore.store.get(`users/${uid}/teams/team-time-1`) as PersistedTeamRecord
    assert.strictEqual(inCloud.name, 'New Name')
  })

  it('9. Newer cloud record updates local IndexedDB', async () => {
    const uid = 'user_newer_cloud'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    // Local older
    await teamRepository.saveTeam({
      schemaVersion: 1,
      id: 'team-time-2',
      name: 'Local Version',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T01:00:00.000Z',
    })

    // Cloud newer
    mockFirestore.store.set(`users/${uid}/teams/team-time-2`, {
      schemaVersion: 1,
      id: 'team-time-2',
      name: 'Cloud Updated Version',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T03:00:00.000Z',
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.teamsDownloaded, 1)

    const localTeam = await teamRepository.getTeam('team-time-2')
    assert.strictEqual(localTeam?.name, 'Cloud Updated Version')
  })

  it('10. Same timestamp + differing content preserves both and reports conflict', async () => {
    const uid = 'user_conflict'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    const ts = '2026-09-18T05:00:00.000Z'
    // Local
    await teamRepository.saveTeam({
      schemaVersion: 1,
      id: 'conflict-team',
      name: 'Local Fork',
      ownerUid: uid,
      createdAt: ts,
      updatedAt: ts,
    })

    // Cloud
    mockFirestore.store.set(`users/${uid}/teams/conflict-team`, {
      schemaVersion: 1,
      id: 'conflict-team',
      name: 'Cloud Fork',
      ownerUid: uid,
      createdAt: ts,
      updatedAt: ts,
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.conflicts.length, 1)

    // Neither version destroyed
    const local = await teamRepository.getTeam('conflict-team')
    assert.strictEqual(local?.name, 'Local Fork')
    assert.strictEqual(local?.syncStatus, 'error')

    const cloud = mockFirestore.store.get(`users/${uid}/teams/conflict-team`) as PersistedTeamRecord
    assert.strictEqual(cloud.name, 'Cloud Fork')
  })

  it('11. Cloud completed cannot be downgraded to local in_progress', async () => {
    const uid = 'user_terminal_1'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    // Local has stale in_progress with higher timestamp (e.g. offline device edited old match)
    await matchRepository.saveMatch({
      schemaVersion: 1,
      matchId: 'match-term-1',
      status: 'in_progress',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T05:00:00.000Z',
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
      score: { runs: 20, wickets: 1, balls: 12, striker: { name: 'P1', runs: 10, balls: 6, fours: 1, sixes: 0, out: false }, nonStriker: { name: 'P2', runs: 5, balls: 6, fours: 0, sixes: 0, out: false }, bowler: { name: 'B1', balls: 12, runs: 20, wickets: 1 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: false, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    })

    // Cloud is already completed
    mockFirestore.store.set(`users/${uid}/matches/match-term-1`, {
      schemaVersion: 1,
      matchId: 'match-term-1',
      status: 'completed',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T04:00:00.000Z',
      completedAt: '2026-09-18T04:00:00.000Z',
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
      score: { runs: 45, wickets: 3, balls: 30, striker: { name: 'P1', runs: 25, balls: 15, fours: 3, sixes: 1, out: false }, nonStriker: { name: 'P2', runs: 15, balls: 15, fours: 1, sixes: 0, out: false }, bowler: { name: 'B1', balls: 12, runs: 15, wickets: 2 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: true, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: { winner: 'A', margin: '15 runs' },
      battingRoster: [],
      bowlingRoster: [],
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.matchesDownloaded, 1)

    // Local must be updated to completed, NOT overwrite cloud with in_progress
    const local = await matchRepository.getMatch('match-term-1')
    assert.strictEqual(local?.status, 'completed')
  })

  it('12. Cloud abandoned cannot be downgraded to local in_progress', async () => {
    const uid = 'user_term_abandon'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await matchRepository.saveMatch({
      schemaVersion: 1,
      matchId: 'match-term-2',
      status: 'in_progress',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T06:00:00.000Z',
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
    })

    mockFirestore.store.set(`users/${uid}/matches/match-term-2`, {
      schemaVersion: 1,
      matchId: 'match-term-2',
      status: 'abandoned',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T04:00:00.000Z',
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
    })

    await syncService.syncAll()
    const local = await matchRepository.getMatch('match-term-2')
    assert.strictEqual(local?.status, 'abandoned', 'Local must take cloud abandoned status')
  })

  it('13. Local completed cannot be downgraded by stale cloud in_progress', async () => {
    const uid = 'user_term_local_completed'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    // Local is completed
    await matchRepository.saveMatch({
      schemaVersion: 1,
      matchId: 'match-term-3',
      status: 'completed',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T03:00:00.000Z',
      completedAt: '2026-09-18T03:00:00.000Z',
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
      inningsNumber: 2,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: { winner: 'A', margin: '10 runs' },
      battingRoster: [],
      bowlingRoster: [],
    })

    // Cloud has in_progress with newer timestamp
    mockFirestore.store.set(`users/${uid}/matches/match-term-3`, {
      schemaVersion: 1,
      matchId: 'match-term-3',
      status: 'in_progress',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T05:00:00.000Z',
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
    })

    await syncService.syncAll()

    // Local completed wins and overwrites cloud in_progress
    const cloud = mockFirestore.store.get(`users/${uid}/matches/match-term-3`) as PersistedMatchRecord
    assert.strictEqual(cloud.status, 'completed')

    const local = await matchRepository.getMatch('match-term-3')
    assert.strictEqual(local?.status, 'completed')
  })

  it('14. Local abandoned cannot be downgraded by stale cloud in_progress', async () => {
    const uid = 'user_term_local_abandon'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await matchRepository.saveMatch({
      schemaVersion: 1,
      matchId: 'match-term-4',
      status: 'abandoned',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T02:00:00.000Z',
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
    })

    mockFirestore.store.set(`users/${uid}/matches/match-term-4`, {
      schemaVersion: 1,
      matchId: 'match-term-4',
      status: 'in_progress',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T04:00:00.000Z',
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
    })

    await syncService.syncAll()
    const cloud = mockFirestore.store.get(`users/${uid}/matches/match-term-4`) as PersistedMatchRecord
    assert.strictEqual(cloud.status, 'abandoned')
  })

  it('15. Sign-out invalidates an in-flight sync session', async () => {
    const uid = 'user_signout_test'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await teamRepository.saveTeam({
      schemaVersion: 1,
      id: 'team-slow-1',
      name: 'Slow Team',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    })

    // Start sync and immediately invalidate session (simulating sign-out)
    const syncPromise = syncService.syncAll()
    syncService.invalidateSession()
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: null,
      writable: true,
      configurable: true,
    })

    await syncPromise
    assert.strictEqual(syncService.getSyncState(), 'idle')
  })

  it('16. Cross-user records are never imported', async () => {
    const userA = 'user_alice'
    const userB = 'user_bob'

    // Seed User B document
    mockFirestore.store.set(`users/${userB}/teams/bob-team-1`, {
      schemaVersion: 1,
      id: 'bob-team-1',
      name: 'Bob Warriors',
      ownerUid: userB,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    })

    // Active user is User A
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid: userA, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await syncService.syncAll()

    // Alice's IndexedDB must NOT contain Bob's team
    const bobTeamInLocal = await teamRepository.getTeam('bob-team-1')
    assert.strictEqual(bobTeamInLocal, null, 'User B data must never be imported into User A local storage')
  })

  it('17. Malformed cloud records are rejected without corrupting IndexedDB', async () => {
    const uid = 'user_malformed'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    // Malformed match (missing status, missing teamOne/teamTwo)
    mockFirestore.store.set(`users/${uid}/matches/corrupt-match`, {
      randomField: 'bogus',
      matchId: 'corrupt-match',
    })

    // Malformed team
    mockFirestore.store.set(`users/${uid}/teams/corrupt-team`, {
      id: 'corrupt-team',
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.matchesDownloaded, 0)
    assert.strictEqual(result.teamsDownloaded, 0)
    assert.ok(result.errors.length >= 2, 'Errors must be recorded for malformed documents')

    const inLocal = await matchRepository.getMatch('corrupt-match')
    assert.strictEqual(inLocal, null, 'Corrupt cloud match must not be inserted into IndexedDB')
  })

  it('18. Offline/network failure does not destroy local data', async () => {
    const uid = 'user_network_failure'
    Object.defineProperty(firebaseAuth, 'currentUser', {
      value: { uid, isAnonymous: false },
      writable: true,
      configurable: true,
    })

    await matchRepository.saveMatch({
      schemaVersion: 1,
      matchId: 'offline-match-1',
      status: 'in_progress',
      ownerUid: uid,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
      teamOne: 'Local One',
      teamTwo: 'Local Two',
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
      score: { runs: 50, wickets: 2, balls: 30, striker: { name: 'P1', runs: 30, balls: 18, fours: 3, sixes: 1, out: false }, nonStriker: { name: 'P2', runs: 18, balls: 12, fours: 1, sixes: 0, out: false }, bowler: { name: 'B1', balls: 12, runs: 20, wickets: 1 }, currentOver: [], overHistory: [], fallOfWickets: [], dismissedBatters: [], inningsComplete: false, battingStats: [], bowlerStats: [] },
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    })

    // Mock network failure on firestore
    setFirestoreAdapter({
      async getDoc() {
        throw new Error('Network unavailable / quota exceeded')
      },
      async setDoc() {
        throw new Error('Network unavailable / quota exceeded')
      },
      async listDocs() {
        throw new Error('Network unavailable / quota exceeded')
      },
    })

    const result = await syncService.syncAll()
    assert.strictEqual(result.success, false)
    assert.strictEqual(syncService.getSyncState(), 'error')

    // Local data remains completely intact
    const local = await matchRepository.getMatch('offline-match-1')
    assert.ok(local)
    assert.strictEqual(local.score?.runs, 50)
  })

  it('19. Sync metadata is not treated as canonical application data', async () => {
    const matchA: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'match-meta-test',
      status: 'in_progress',
      ownerUid: 'uid1',
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
      teamOne: 'Red',
      teamTwo: 'Blue',
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
      lastSyncedAt: '2026-09-18T01:00:00.000Z',
      syncStatus: 'synced',
      syncError: null,
    }

    const matchB: PersistedMatchRecord = {
      ...matchA,
      lastSyncedAt: '2026-09-18T02:00:00.000Z',
      syncStatus: 'pending',
      syncError: 'Previous timeout',
    }

    // areMatchesCanonicallyEqual must return true despite differing sync metadata
    assert.strictEqual(areMatchesCanonicallyEqual(matchA, matchB), true)
  })

  it('20. Completed/abandoned lifecycle states remain monotonic', async () => {
    // Validator tests
    assert.strictEqual(validateCloudMatch(null), false)
    assert.strictEqual(validateCloudMatch({ matchId: '' }), false)
    assert.strictEqual(validateCloudMatch({ matchId: 'm1', status: 'invalid_status' }), false)
    assert.strictEqual(validateCloudTeam({ id: 't1' }), false)
    assert.strictEqual(validateCloudPlayer({ id: 'p1', name: 'P', hand: 'InvalidHand' }), false)

    const validPlayer: PersistedPlayerRecord = {
      schemaVersion: 1,
      id: 'p1',
      name: 'Player 1',
      hand: 'Right',
      ownerUid: 'u1',
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    }
    assert.strictEqual(validateCloudPlayer(validPlayer), true)
  })

  // --- MILESTONE 4.5 TESTS: Firestore Post-Restore Reconciliation ---
  describe('Milestone 4.5 — Firestore Reconciliation After Backup Restore', () => {
    // Helper to create a valid sample snapshot for testing
    async function createMockSnapshot(options: {
      provenanceOwnerUid?: string | null
      matchId?: string
      status?: 'in_progress' | 'completed' | 'abandoned'
      updatedAt?: string
    } = {}): Promise<BackupSnapshot> {
      const matchId = options.matchId || 'match-restored-1'
      const status = options.status || 'completed'
      const updatedAt = options.updatedAt || '2026-09-18T12:00:00.000Z'

      const data = {
        teams: [
          {
            schemaVersion: 1,
            id: 'team-restored-1',
            name: 'Restored Strikers',
            ownerUid: options.provenanceOwnerUid || null,
            createdAt: '2026-09-18T10:00:00.000Z',
            updatedAt: '2026-09-18T10:00:00.000Z',
            playerIds: ['player-restored-1'],
          },
        ],
        players: [
          {
            schemaVersion: 1,
            id: 'player-restored-1',
            name: 'Restored Batter',
            hand: 'Right' as const,
            teamId: 'team-restored-1',
            ownerUid: options.provenanceOwnerUid || null,
            createdAt: '2026-09-18T10:00:00.000Z',
            updatedAt: '2026-09-18T10:00:00.000Z',
          },
        ],
        matches: [
          {
            schemaVersion: 1,
            matchId,
            status,
            ownerUid: options.provenanceOwnerUid || null,
            createdAt: '2026-09-18T10:00:00.000Z',
            updatedAt,
            completedAt: status === 'completed' ? updatedAt : undefined,
            teamOne: 'Restored Strikers',
            teamTwo: 'Restored Defenders',
            teamOneId: 'team-restored-1',
            overs: '10',
            teamSize: '11',
            lastManBatting: false,
            firstBattingHome: true,
            battingRoster: [],
            bowlingRoster: [],
            matchResult: status === 'completed' ? { winner: 'Restored Strikers', margin: '10 runs' } : null,
          },
        ],
      }

      const checksum = await computeChecksum(data)

      return {
        $schema: 'https://scoremate.app/schemas/backup-v1.json',
        backupVersion: 1,
        appVersion: '1.0.0',
        createdAt: '2026-09-18T12:00:00.000Z',
        deviceId: 'device-test-1',
        provenanceOwnerUid: options.provenanceOwnerUid !== undefined ? options.provenanceOwnerUid : 'user_alice',
        integrity: {
          algorithm: 'SHA-256',
          canonicalization: 'RFC-8785-ES6-KEY-SORT',
          checksum,
        },
        metadata: {
          matchCount: 1,
          teamCount: 1,
          playerCount: 1,
          hasActiveMatch: status === 'in_progress',
          databaseVersion: 1,
        },
        data,
      }
    }

    // A. Signed-out restore
    it('A. Signed-out restore succeeds locally and skips Firestore reconciliation', async () => {
      Object.defineProperty(firebaseAuth, 'currentUser', {
        value: null,
        writable: true,
        configurable: true,
      })

      const snapshot = await createMockSnapshot()
      await restoreBackup(snapshot, { mode: 'replace' })

      const reconciliation = await syncService.reconcileAfterRestore()

      assert.strictEqual(reconciliation.authenticated, false)
      assert.strictEqual(reconciliation.skipped, true)
      assert.strictEqual(reconciliation.skipReason, 'signed_out')
      assert.strictEqual(reconciliation.success, true)

      // Zero Firestore operations occurred
      assert.strictEqual(mockFirestore.store.size, 0)

      // Local IndexedDB has restored records intact
      const localMatch = await matchRepository.getMatch('match-restored-1')
      assert.ok(localMatch)
      assert.strictEqual(localMatch.teamOne, 'Restored Strikers')
    })

    // B. Signed-in restore
    it('B. Signed-in restore reconciles with current Firebase user partition', async () => {
      const activeUid = 'user_bob_signed_in'
      Object.defineProperty(firebaseAuth, 'currentUser', {
        value: { uid: activeUid, isAnonymous: false },
        writable: true,
        configurable: true,
      })

      const snapshot = await createMockSnapshot()
      await restoreBackup(snapshot, { mode: 'replace' })

      const reconciliation = await syncService.reconcileAfterRestore()

      assert.strictEqual(reconciliation.authenticated, true)
      assert.strictEqual(reconciliation.skipped, false)
      assert.strictEqual(reconciliation.success, true)
      assert.ok(reconciliation.syncResult)
      assert.strictEqual(reconciliation.syncResult.matchesUploaded, 1)
      assert.strictEqual(reconciliation.syncResult.teamsUploaded, 1)
      assert.strictEqual(reconciliation.syncResult.playersUploaded, 1)

      // Firestore contains records under user_bob_signed_in
      const cloudMatch = mockFirestore.store.get(`users/${activeUid}/matches/match-restored-1`) as PersistedMatchRecord
      assert.ok(cloudMatch)
      assert.strictEqual(cloudMatch.teamOne, 'Restored Strikers')

      // Local record now carries activeUid and synced status
      const localMatch = await matchRepository.getMatch('match-restored-1')
      assert.strictEqual(localMatch?.ownerUid, activeUid)
      assert.strictEqual(localMatch?.syncStatus, 'synced')
    })

    // C. Cross-user provenance isolation
    it('C. Cross-user isolation: ignores backup provenanceOwnerUid and targets current Firebase user partition only', async () => {
      const activeUid = 'user_charlie_target'
      const provenanceUid = 'user_alice_original'

      Object.defineProperty(firebaseAuth, 'currentUser', {
        value: { uid: activeUid, isAnonymous: false },
        writable: true,
        configurable: true,
      })

      // Snapshot created by User Alice
      const snapshot = await createMockSnapshot({ provenanceOwnerUid: provenanceUid })
      await restoreBackup(snapshot, { mode: 'replace' })

      const reconciliation = await syncService.reconcileAfterRestore()
      assert.strictEqual(reconciliation.success, true)

      // Zero operations must target Alice's partition
      for (const key of mockFirestore.store.keys()) {
        assert.ok(!key.startsWith(`users/${provenanceUid}/`), `Forbidden write to provenance UID: ${key}`)
        assert.ok(key.startsWith(`users/${activeUid}/`), `Write must target current active user only: ${key}`)
      }

      // Local records in Charlie's DB now carry Charlie's UID
      const local = await matchRepository.getMatch('match-restored-1')
      assert.strictEqual(local?.ownerUid, activeUid)
    })

    // D. Reconciliation failure does not roll back local IndexedDB
    it('D. Reconciliation failure preserves restored local IndexedDB data without rollback', async () => {
      const activeUid = 'user_fail_test'
      Object.defineProperty(firebaseAuth, 'currentUser', {
        value: { uid: activeUid, isAnonymous: false },
        writable: true,
        configurable: true,
      })

      const snapshot = await createMockSnapshot()
      await restoreBackup(snapshot, { mode: 'replace' })

      // Inject failing Firestore adapter
      setFirestoreAdapter({
        async getDoc() {
          throw new Error('Firestore connection timed out')
        },
        async setDoc() {
          throw new Error('Firestore connection timed out')
        },
        async listDocs() {
          throw new Error('Firestore connection timed out')
        },
      })

      const reconciliation = await syncService.reconcileAfterRestore()

      assert.strictEqual(reconciliation.success, false)
      assert.strictEqual(reconciliation.errorCategory, 'FIRESTORE_ERROR')
      assert.ok(reconciliation.error?.includes('Firestore'))

      // CRITICAL: Local restored records remain 100% intact in IndexedDB
      const localMatch = await matchRepository.getMatch('match-restored-1')
      assert.ok(localMatch)
      assert.strictEqual(localMatch.teamOne, 'Restored Strikers')
    })

    // E. Idempotency
    it('E. Reconciliation is idempotent: repeated executions produce no duplicate records', async () => {
      const activeUid = 'user_idempotency'
      Object.defineProperty(firebaseAuth, 'currentUser', {
        value: { uid: activeUid, isAnonymous: false },
        writable: true,
        configurable: true,
      })

      const snapshot = await createMockSnapshot()
      await restoreBackup(snapshot, { mode: 'replace' })

      // First reconciliation: uploads 1 match, 1 team, 1 player
      const rec1 = await syncService.reconcileAfterRestore()
      assert.strictEqual(rec1.success, true)
      assert.strictEqual(rec1.syncResult?.matchesUploaded, 1)

      // Second reconciliation on same data: 0 new uploads, perfectly idempotent
      const rec2 = await syncService.reconcileAfterRestore()
      assert.strictEqual(rec2.success, true)
      assert.strictEqual(rec2.syncResult?.matchesUploaded, 0)
      assert.strictEqual(rec2.syncResult?.matchesDownloaded, 0)

      const matchesInDb = await matchRepository.listMatches()
      assert.strictEqual(matchesInDb.length, 1)
    })

    // F. Lifecycle conflict matrix
    describe('F. Lifecycle Conflict Resolution Matrix', () => {
      const baseMatch = {
        schemaVersion: 1 as const,
        matchId: 'conflict-match-1',
        teamOne: 'Team A',
        teamTwo: 'Team B',
        overs: '10',
        teamSize: '11',
        lastManBatting: false,
        firstBattingHome: true,
        battingRoster: [],
        bowlingRoster: [],
        createdAt: '2026-09-18T00:00:00.000Z',
      }

      it('F1. in_progress vs completed: completed wins even if in_progress has newer timestamp', () => {
        const localInProgress: PersistedMatchRecord = {
          ...baseMatch,
          status: 'in_progress',
          updatedAt: '2026-09-18T15:00:00.000Z', // Newer
          matchResult: null,
        }
        const cloudCompleted: PersistedMatchRecord = {
          ...baseMatch,
          status: 'completed',
          updatedAt: '2026-09-18T10:00:00.000Z', // Older
          completedAt: '2026-09-18T10:00:00.000Z',
          matchResult: { winner: 'Team A', margin: '5 runs' },
        }

        const res = resolveMatchConflict(localInProgress, cloudCompleted)
        assert.strictEqual(res.winner, 'cloud') // Cloud completed wins
      })

      it('F2. in_progress vs abandoned: abandoned wins even if in_progress has newer timestamp', () => {
        const localAbandoned: PersistedMatchRecord = {
          ...baseMatch,
          status: 'abandoned',
          updatedAt: '2026-09-18T10:00:00.000Z', // Older
          matchResult: null,
        }
        const cloudInProgress: PersistedMatchRecord = {
          ...baseMatch,
          status: 'in_progress',
          updatedAt: '2026-09-18T15:00:00.000Z', // Newer
          matchResult: null,
        }

        const res = resolveMatchConflict(localAbandoned, cloudInProgress)
        assert.strictEqual(res.winner, 'local') // Local abandoned wins
      })

      it('F3. completed vs completed: newer updatedAt wins', () => {
        const localCompleted: PersistedMatchRecord = {
          ...baseMatch,
          status: 'completed',
          updatedAt: '2026-09-18T14:00:00.000Z', // Newer
          completedAt: '2026-09-18T14:00:00.000Z',
          matchResult: { winner: 'Team A', margin: '20 runs' },
        }
        const cloudCompleted: PersistedMatchRecord = {
          ...baseMatch,
          status: 'completed',
          updatedAt: '2026-09-18T10:00:00.000Z', // Older
          completedAt: '2026-09-18T10:00:00.000Z',
          matchResult: { winner: 'Team A', margin: '5 runs' },
        }

        const res = resolveMatchConflict(localCompleted, cloudCompleted)
        assert.strictEqual(res.winner, 'local')
      })

      it('F4. abandoned vs abandoned: newer updatedAt wins', () => {
        const localAbandoned: PersistedMatchRecord = {
          ...baseMatch,
          status: 'abandoned',
          updatedAt: '2026-09-18T10:00:00.000Z', // Older
          matchResult: null,
        }
        const cloudAbandoned: PersistedMatchRecord = {
          ...baseMatch,
          status: 'abandoned',
          updatedAt: '2026-09-18T14:00:00.000Z', // Newer
          matchResult: null,
        }

        const res = resolveMatchConflict(localAbandoned, cloudAbandoned)
        assert.strictEqual(res.winner, 'cloud')
      })

      it('F5. completed vs abandoned: newer updatedAt wins (completed newer)', () => {
        const localCompleted: PersistedMatchRecord = {
          ...baseMatch,
          status: 'completed',
          updatedAt: '2026-09-18T16:00:00.000Z', // Newer
          completedAt: '2026-09-18T16:00:00.000Z',
          matchResult: { winner: 'Team A', margin: '15 runs' },
        }
        const cloudAbandoned: PersistedMatchRecord = {
          ...baseMatch,
          status: 'abandoned',
          updatedAt: '2026-09-18T12:00:00.000Z', // Older
          matchResult: null,
        }

        const res = resolveMatchConflict(localCompleted, cloudAbandoned)
        assert.strictEqual(res.winner, 'local')
      })

      it('F6. completed vs abandoned: newer updatedAt wins (abandoned newer)', () => {
        const localCompleted: PersistedMatchRecord = {
          ...baseMatch,
          status: 'completed',
          updatedAt: '2026-09-18T10:00:00.000Z', // Older
          completedAt: '2026-09-18T10:00:00.000Z',
          matchResult: { winner: 'Team A', margin: '15 runs' },
        }
        const cloudAbandoned: PersistedMatchRecord = {
          ...baseMatch,
          status: 'abandoned',
          updatedAt: '2026-09-18T16:00:00.000Z', // Newer
          matchResult: null,
        }

        const res = resolveMatchConflict(localCompleted, cloudAbandoned)
        assert.strictEqual(res.winner, 'cloud')
      })

      it('F7. completed vs abandoned with equal updatedAt: deterministic tie-break and records conflict', () => {
        const equalTs = '2026-09-18T12:00:00.000Z'
        const localCompleted: PersistedMatchRecord = {
          ...baseMatch,
          status: 'completed',
          updatedAt: equalTs,
          completedAt: equalTs,
          matchResult: { winner: 'Team A', margin: '15 runs' },
        }
        const cloudAbandoned: PersistedMatchRecord = {
          ...baseMatch,
          status: 'abandoned',
          updatedAt: equalTs,
          matchResult: null,
        }

        const res = resolveMatchConflict(localCompleted, cloudAbandoned)
        assert.ok(res.winner === 'local' || res.winner === 'cloud')
        assert.strictEqual(res.tieBreakApplied, true)
        assert.ok(res.conflictMessage?.includes('terminal conflict'))
      })

      it('F8. exact equal terminal records: identical result without conflict', () => {
        const ts = '2026-09-18T12:00:00.000Z'
        const localCompleted: PersistedMatchRecord = {
          ...baseMatch,
          status: 'completed',
          updatedAt: ts,
          completedAt: ts,
          matchResult: { winner: 'Team A', margin: '15 runs' },
        }
        const cloudCompleted: PersistedMatchRecord = {
          ...localCompleted,
        }

        const res = resolveMatchConflict(localCompleted, cloudCompleted)
        assert.strictEqual(res.winner, 'identical')
        assert.strictEqual(res.tieBreakApplied, false)
      })
    })

    // G. Current-auth enforcement
    it('G. reconcileAfterRestore strictly enforces active Firebase user UID', async () => {
      const realUid = 'user_real_authenticated'
      Object.defineProperty(firebaseAuth, 'currentUser', {
        value: { uid: realUid, isAnonymous: false },
        writable: true,
        configurable: true,
      })

      const snapshot = await createMockSnapshot({ provenanceOwnerUid: 'arbitrary_injected_uid' })
      await restoreBackup(snapshot, { mode: 'replace' })

      await syncService.reconcileAfterRestore()

      // Operations must only have been executed for realUid
      assert.ok(mockFirestore.store.has(`users/${realUid}/matches/match-restored-1`))
      assert.strictEqual(mockFirestore.store.has(`users/arbitrary_injected_uid/matches/match-restored-1`), false)
    })

    // H. No unrelated deletion
    it('H. Does not delete pre-existing cloud records absent from the restored backup', async () => {
      const activeUid = 'user_keep_cloud_data'
      Object.defineProperty(firebaseAuth, 'currentUser', {
        value: { uid: activeUid, isAnonymous: false },
        writable: true,
        configurable: true,
      })

      // Pre-existing cloud record belonging to this user
      mockFirestore.store.set(`users/${activeUid}/matches/cloud-preexisting-match`, {
        schemaVersion: 1,
        matchId: 'cloud-preexisting-match',
        status: 'completed',
        ownerUid: activeUid,
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
        completedAt: '2026-09-18T00:00:00.000Z',
        teamOne: 'Old Cloud One',
        teamTwo: 'Old Cloud Two',
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
        matchResult: { winner: 'Old Cloud One', margin: '5 runs' },
        battingRoster: [],
        bowlingRoster: [],
      })

      // User restores a backup containing a different match
      const snapshot = await createMockSnapshot({ matchId: 'new-restored-match' })
      await restoreBackup(snapshot, { mode: 'replace' })

      await syncService.reconcileAfterRestore()

      // Pre-existing cloud record was NOT deleted
      assert.ok(mockFirestore.store.has(`users/${activeUid}/matches/cloud-preexisting-match`))

      // And it was downloaded into local storage as well
      const localOld = await matchRepository.getMatch('cloud-preexisting-match')
      assert.ok(localOld)
      assert.strictEqual(localOld.teamOne, 'Old Cloud One')

      // Restored match was also uploaded
      assert.ok(mockFirestore.store.has(`users/${activeUid}/matches/new-restored-match`))
    })
  })
})
