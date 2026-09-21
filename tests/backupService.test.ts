import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setDatabaseFactory, closeDatabase } from '../src/services/localDatabase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import { teamRepository } from '../src/services/repositories/teamRepository.ts'
import { playerRepository } from '../src/services/repositories/playerRepository.ts'
import {
  canonicalize,
  computeChecksum,
  createSnapshot,
  serializeSnapshot,
  validateBackup,
  restoreBackup,
  generateBackupFilename,
  exportBackupJson,
  isLegacyBackup,
  migrateLegacyBackup,
  importBackupFile,
  BACKUP_SCHEMA_URL,
  APP_VERSION,
  MAX_BACKUP_SIZE_BYTES,
} from '../src/services/backupService.ts'
import {
  BackupValidationError,
  type PersistedMatchRecord,
  type PersistedTeamRecord,
  type PersistedPlayerRecord,
  type BackupSnapshot,
} from '../src/types/database.ts'

// Helper function to create a valid base snapshot object
async function createValidSnapshotObject(): Promise<BackupSnapshot> {
  const team: PersistedTeamRecord = {
    schemaVersion: 1,
    id: 'team-t1',
    name: "St. John's XI",
    ownerUid: null,
    createdAt: '2026-09-18T10:00:00.000Z',
    updatedAt: '2026-09-18T10:00:00.000Z',
    playerIds: ['player-p1'],
  }

  const player: PersistedPlayerRecord = {
    schemaVersion: 1,
    id: 'player-p1',
    name: "Liam O'Connor",
    hand: 'Right',
    ownerUid: null,
    teamId: 'team-t1',
    createdAt: '2026-09-18T10:00:00.000Z',
    updatedAt: '2026-09-18T10:00:00.000Z',
  }

  const match: PersistedMatchRecord = {
    schemaVersion: 1,
    matchId: 'match-m1',
    status: 'completed',
    ownerUid: null,
    createdAt: '2026-09-18T10:00:00.000Z',
    updatedAt: '2026-09-18T11:00:00.000Z',
    completedAt: '2026-09-18T11:00:00.000Z',
    teamOne: "St. John's XI",
    teamTwo: 'Royal Warriors & Co.',
    teamOneId: 'team-t1',
    overs: '10',
    teamSize: '11',
    lastManBatting: false,
    venue: "St. John's Ground",
    competition: 'Super Cup',
    tossCaller: 'host',
    tossCall: 'Heads',
    tossWinner: 'host',
    decision: 'bat',
    homePlayers: [{ name: "Liam O'Connor", hand: 'Right' }],
    visitorPlayers: [],
    openingStriker: "Liam O'Connor",
    openingNonStriker: 'Player Two',
    openingBowler: 'Bowler One',
    score: null,
    history: [],
    inningsNumber: 1,
    firstBattingHome: true,
    firstInningsScore: null,
    matchResult: { winner: "St. John's XI", margin: '20 runs' },
    battingRoster: [],
    bowlingRoster: [],
  }

  const data = {
    matches: [match],
    teams: [team],
    players: [player],
  }

  const checksum = await computeChecksum(data)

  return {
    $schema: BACKUP_SCHEMA_URL,
    backupVersion: 1,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    deviceId: 'test-device-uuid',
    provenanceOwnerUid: null,
    integrity: {
      algorithm: 'SHA-256',
      canonicalization: 'RFC-8785-ES6-KEY-SORT',
      checksum,
    },
    metadata: {
      matchCount: 1,
      teamCount: 1,
      playerCount: 1,
      hasActiveMatch: false,
      databaseVersion: 1,
    },
    data,
  }
}

describe('Backup Snapshot & Canonicalization Engine (Milestone 4.1 Baseline)', () => {
  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  describe('Deterministic Canonicalization Algorithm', () => {
    it('1. Produces identical output regardless of object key insertion order', () => {
      const obj1 = { z: 1, a: 2, m: 3 }
      const obj2 = { a: 2, m: 3, z: 1 }
      const c1 = canonicalize(obj1)
      const c2 = canonicalize(obj2)
      assert.strictEqual(c1, '{"a":2,"m":3,"z":1}')
      assert.strictEqual(c1, c2)
    })

    it('2. Recursively sorts keys in nested objects', () => {
      const nested1 = { outer: { delta: 4, alpha: 1 }, list: [{ b: 2, a: 1 }] }
      const nested2 = { list: [{ a: 1, b: 2 }], outer: { alpha: 1, delta: 4 } }
      assert.strictEqual(canonicalize(nested1), canonicalize(nested2))
    })

    it('3. Preserves array element order strictly', () => {
      assert.notStrictEqual(canonicalize([1, 2, 3]), canonicalize([3, 2, 1]))
    })

    it('4. Omits undefined properties and filters prototype pollution keys', () => {
      const input = { valid: 1, undef: undefined, __proto__: { evil: true } }
      assert.strictEqual(canonicalize(input), '{"valid":1}')
    })

    it('5. Normalizes Unicode strings using NFC', () => {
      const decomposed = 'e\u0301'
      const precomposed = '\u00e9'
      assert.strictEqual(canonicalize(decomposed), JSON.stringify(precomposed))
    })

    it('6. Normalizes special numeric values and booleans', () => {
      assert.strictEqual(canonicalize(NaN), 'null')
      assert.strictEqual(canonicalize(true), 'true')
    })
  })

  describe('SHA-256 Integrity Checksum Engine', () => {
    it('7. Computes a deterministic 64-character lowercase hex digest', async () => {
      const hash = await computeChecksum({ matchId: 'm-1' })
      assert.match(hash, /^[0-9a-f]{64}$/)
    })

    it('8. Produces identical hash for differently ordered input objects', async () => {
      const h1 = await computeChecksum({ b: 1, a: 2 })
      const h2 = await computeChecksum({ a: 2, b: 1 })
      assert.strictEqual(h1, h2)
    })

    it('9. Alters hash when any nested data property changes', async () => {
      const h1 = await computeChecksum({ val: 1 })
      const h2 = await computeChecksum({ val: 2 })
      assert.notStrictEqual(h1, h2)
    })
  })

  describe('Snapshot Generation from IndexedDB', () => {
    it('10. Generates valid empty snapshot envelope when database has no records', async () => {
      const snapshot = await createSnapshot()
      assert.strictEqual(snapshot.metadata.matchCount, 0)
      assert.strictEqual(snapshot.integrity.checksum, await computeChecksum(snapshot.data))
    })

    it('11. Captures all matches, teams, and players while preserving UUIDs', async () => {
      const snapObj = await createValidSnapshotObject()
      await teamRepository.saveTeam(snapObj.data.teams[0])
      await playerRepository.savePlayer(snapObj.data.players[0])
      await matchRepository.saveMatch(snapObj.data.matches[0])

      const snapshot = await createSnapshot()
      assert.strictEqual(snapshot.metadata.matchCount, 1)
      assert.strictEqual(snapshot.data.matches[0].matchId, 'match-m1')
    })

    it('12. Correctly flags hasActiveMatch when in_progress match exists', async () => {
      const snapObj = await createValidSnapshotObject()
      const m = { ...snapObj.data.matches[0], status: 'in_progress' as const, completedAt: null }
      await matchRepository.saveMatch(m)
      const snapshot = await createSnapshot()
      assert.strictEqual(snapshot.metadata.hasActiveMatch, true)
    })

    it('13. Serializes snapshot to formatted JSON string cleanly', async () => {
      const snapObj = await createValidSnapshotObject()
      const str = serializeSnapshot(snapObj)
      assert.strictEqual(typeof str, 'string')
      assert.strictEqual(JSON.parse(str).$schema, BACKUP_SCHEMA_URL)
    })
  })
})

describe('Pre-Restore Validation Pipeline (Milestone 4.2)', () => {
  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  it('14. Stage 1: Rejects payload exceeding 50 MB with VALIDATION_FILE_TOO_LARGE', async () => {
    // Create an oversized string representation
    const oversizedString = 'a'.repeat(MAX_BACKUP_SIZE_BYTES + 10)
    await assert.rejects(
      async () => validateBackup(oversizedString),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_FILE_TOO_LARGE')
        return true
      }
    )
  })

  it('15. Stage 2: Rejects malformed JSON syntax with VALIDATION_INVALID_JSON', async () => {
    await assert.rejects(
      async () => validateBackup('{"truncatedJson": '),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_JSON')
        return true
      }
    )
  })

  it('16. Stage 3: Rejects missing required envelope fields with VALIDATION_INVALID_ENVELOPE', async () => {
    const invalidEnvelope = { backupVersion: 1, data: {} }
    await assert.rejects(
      async () => validateBackup(invalidEnvelope),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_ENVELOPE')
        return true
      }
    )
  })

  it('17. Stage 4: Rejects unsupported backupVersion with VALIDATION_UNSUPPORTED_VERSION', async () => {
    const snap = await createValidSnapshotObject()
    const invalidVersion = { ...snap, backupVersion: 2 }
    await assert.rejects(
      async () => validateBackup(invalidVersion),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_UNSUPPORTED_VERSION')
        return true
      }
    )
  })

  it('18. Stage 5: Rejects missing/malformed integrity block with VALIDATION_INVALID_INTEGRITY', async () => {
    const snap = await createValidSnapshotObject()
    const invalidIntegrity = { ...snap, integrity: { algorithm: 'MD5', checksum: '123' } }
    await assert.rejects(
      async () => validateBackup(invalidIntegrity),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_INTEGRITY')
        return true
      }
    )
  })

  it('19. Stage 6: Rejects checksum mismatch/corruption with VALIDATION_CHECKSUM_MISMATCH', async () => {
    const snap = await createValidSnapshotObject()
    // Tamper with data without updating checksum
    snap.data.matches[0].teamOne = 'Tampered Team Name'
    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_CHECKSUM_MISMATCH')
        return true
      }
    )
  })

  it('20. Stage 7: Rejects malformed match entity with VALIDATION_INVALID_ENTITY', async () => {
    const snap = await createValidSnapshotObject()
    // Missing required teamOne
    ;(snap.data.matches[0] as any).teamOne = ''
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_ENTITY')
        return true
      }
    )
  })

  it('21. Stage 7: Rejects control characters in entity names with VALIDATION_INVALID_ENTITY', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.teams[0].name = 'Team\x00WithNullByte'
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_ENTITY')
        return true
      }
    )
  })

  it('22. Stage 7: Accepts legitimate punctuation, apostrophes, and accented characters', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.teams[0].name = "O'Connor & St. John's XI - Côte d'Ivoire"
    snap.integrity.checksum = await computeChecksum(snap.data)

    const validated = await validateBackup(snap)
    assert.strictEqual(validated.data.teams[0].name, "O'Connor & St. John's XI - Côte d'Ivoire")
  })

  it('23. Stage 8: Rejects duplicate match IDs with VALIDATION_DUPLICATE_ID', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.matches.push({ ...snap.data.matches[0] })
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_DUPLICATE_ID')
        return true
      }
    )
  })

  it('24. Stage 8: Rejects duplicate team IDs with VALIDATION_DUPLICATE_ID', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.teams.push({ ...snap.data.teams[0], name: 'Different Name' })
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_DUPLICATE_ID')
        return true
      }
    )
  })

  it('25. Stage 8: Rejects duplicate player IDs with VALIDATION_DUPLICATE_ID', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.players.push({ ...snap.data.players[0], name: 'Different Name' })
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_DUPLICATE_ID')
        return true
      }
    )
  })

  it('26. Stage 9: Rejects dangling team reference in Replace mode with VALIDATION_MISSING_REFERENCE', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.matches[0].teamOneId = 'non-existent-team-id'
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap, { mode: 'replace' }),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_MISSING_REFERENCE')
        return true
      }
    )
  })

  it('27. Stage 9: Rejects dangling player reference with VALIDATION_MISSING_REFERENCE', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.teams[0].playerIds = ['non-existent-player-id']
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap, { mode: 'replace' }),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_MISSING_REFERENCE')
        return true
      }
    )
  })

  it('28. Stage 9: Merge mode allows references resolved against existing local IndexedDB records', async () => {
    // Pre-populate local DB with the team
    const localTeam: PersistedTeamRecord = {
      schemaVersion: 1,
      id: 'local-team-99',
      name: 'Local Existing Team',
      ownerUid: null,
      createdAt: '2026-09-18T10:00:00.000Z',
      updatedAt: '2026-09-18T10:00:00.000Z',
    }
    await teamRepository.saveTeam(localTeam)

    const snap = await createValidSnapshotObject()
    // Point match and player to the local team and remove teams from backup data
    snap.data.matches[0].teamOneId = 'local-team-99'
    snap.data.players[0].teamId = 'local-team-99'
    snap.data.teams = []
    snap.integrity.checksum = await computeChecksum(snap.data)

    // Replace mode MUST reject because backup does not contain local-team-99
    await assert.rejects(
      async () => validateBackup(snap, { mode: 'replace' }),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_MISSING_REFERENCE')
        return true
      }
    )

    // Merge mode MUST accept because local-team-99 exists in IndexedDB
    const validated = await validateBackup(snap, { mode: 'merge' })
    assert.strictEqual(validated.data.matches[0].teamOneId, 'local-team-99')
  })

  it('29. Stage 10: Rejects completed match missing completedAt with VALIDATION_INVALID_LIFECYCLE', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.matches[0].completedAt = null
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_LIFECYCLE')
        return true
      }
    )
  })

  it('30. Stage 10: Rejects completed match missing matchResult with VALIDATION_INVALID_LIFECYCLE', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.matches[0].matchResult = null
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_LIFECYCLE')
        return true
      }
    )
  })

  it('31. Stage 10: Rejects in_progress match missing history array with VALIDATION_INVALID_LIFECYCLE', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.matches[0].status = 'in_progress'
    ;(snap.data.matches[0] as any).history = null
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_LIFECYCLE')
        return true
      }
    )
  })

  it('32. Stage 10: Rejects abandoned match missing updatedAt with VALIDATION_INVALID_LIFECYCLE', async () => {
    const snap = await createValidSnapshotObject()
    snap.data.matches[0].status = 'abandoned'
    ;(snap.data.matches[0] as any).updatedAt = ''
    snap.integrity.checksum = await computeChecksum(snap.data)

    await assert.rejects(
      async () => validateBackup(snap),
      (err: BackupValidationError) => {
        assert.strictEqual(err.code, 'VALIDATION_INVALID_LIFECYCLE')
        return true
      }
    )
  })
})

describe('Atomic Restore Engine & Conflict Resolution (Milestone 4.2)', () => {
  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  it('33. Replace mode completely replaces existing local data', async () => {
    // Populate existing local data
    const oldTeam: PersistedTeamRecord = {
      schemaVersion: 1,
      id: 'old-team-id',
      name: 'Old Team to be Deleted',
      ownerUid: null,
      createdAt: '2026-09-18T08:00:00.000Z',
      updatedAt: '2026-09-18T08:00:00.000Z',
    }
    await teamRepository.saveTeam(oldTeam)

    const backupSnap = await createValidSnapshotObject()
    const result = await restoreBackup(backupSnap, { mode: 'replace' })

    assert.strictEqual(result.mode, 'replace')
    assert.strictEqual(result.teamsAdded, 1)

    // Old team must be gone
    assert.strictEqual(await teamRepository.getTeam('old-team-id'), null)
    // New team must exist
    assert.notStrictEqual(await teamRepository.getTeam('team-t1'), null)
  })

  it('34. Merge mode adds missing records non-destructively', async () => {
    const oldTeam: PersistedTeamRecord = {
      schemaVersion: 1,
      id: 'existing-local-team',
      name: 'Local Retained Team',
      ownerUid: null,
      createdAt: '2026-09-18T08:00:00.000Z',
      updatedAt: '2026-09-18T08:00:00.000Z',
    }
    await teamRepository.saveTeam(oldTeam)

    const backupSnap = await createValidSnapshotObject()
    const result = await restoreBackup(backupSnap, { mode: 'merge' })

    assert.strictEqual(result.mode, 'merge')
    assert.strictEqual(result.teamsAdded, 1)

    // Both local and backup teams must exist
    assert.notStrictEqual(await teamRepository.getTeam('existing-local-team'), null)
    assert.notStrictEqual(await teamRepository.getTeam('team-t1'), null)
  })

  it('35. Merge mode preserves local active in_progress match by default', async () => {
    const localActive: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'active-match-1',
      status: 'in_progress',
      ownerUid: null,
      createdAt: '2026-09-18T09:00:00.000Z',
      updatedAt: '2026-09-18T09:30:00.000Z',
      teamOne: 'Local Active Team',
      teamTwo: 'Visitor',
      overs: '5',
      teamSize: '6',
      lastManBatting: false,
      venue: 'Park',
      competition: 'Gully',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'S1',
      openingNonStriker: 'S2',
      openingBowler: 'B1',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }
    await matchRepository.saveMatch(localActive)

    const backupSnap = await createValidSnapshotObject()
    // Add an in_progress match with same ID to backup
    const backupActive: PersistedMatchRecord = {
      ...localActive,
      teamOne: 'Backup Active Attempted Overwrite',
      updatedAt: '2026-09-18T10:00:00.000Z', // newer in backup
    }
    backupSnap.data.matches.push(backupActive)
    backupSnap.integrity.checksum = await computeChecksum(backupSnap.data)

    // Merge with overwriteActiveMatch=false (default)
    await restoreBackup(backupSnap, { mode: 'merge', overwriteActiveMatch: false })

    const preserved = await matchRepository.getMatch('active-match-1')
    assert.strictEqual(preserved?.teamOne, 'Local Active Team') // Protected!
  })

  it('36. Merge mode overwrites active match when overwriteActiveMatch is explicitly true', async () => {
    const localActive: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'active-match-1',
      status: 'in_progress',
      ownerUid: null,
      createdAt: '2026-09-18T09:00:00.000Z',
      updatedAt: '2026-09-18T09:30:00.000Z',
      teamOne: 'Local Active Team',
      teamTwo: 'Visitor',
      overs: '5',
      teamSize: '6',
      lastManBatting: false,
      venue: 'Park',
      competition: 'Gully',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'S1',
      openingNonStriker: 'S2',
      openingBowler: 'B1',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: null,
      battingRoster: [],
      bowlingRoster: [],
    }
    await matchRepository.saveMatch(localActive)

    const backupSnap = await createValidSnapshotObject()
    const backupActive: PersistedMatchRecord = {
      ...localActive,
      teamOne: 'Backup Active Successfully Overwritten',
      updatedAt: '2026-09-18T10:00:00.000Z',
    }
    backupSnap.data.matches.push(backupActive)
    backupSnap.integrity.checksum = await computeChecksum(backupSnap.data)

    await restoreBackup(backupSnap, { mode: 'merge', overwriteActiveMatch: true })

    const updated = await matchRepository.getMatch('active-match-1')
    assert.strictEqual(updated?.teamOne, 'Backup Active Successfully Overwritten')
  })

  it('37. Merge mode never downgrades terminal (completed/abandoned) match to in_progress', async () => {
    const snap = await createValidSnapshotObject()
    // Local match is completed
    await matchRepository.saveMatch(snap.data.matches[0])

    // Incoming backup match is in_progress (even with newer timestamp)
    const downgradedBackup: PersistedMatchRecord = {
      ...snap.data.matches[0],
      status: 'in_progress',
      completedAt: null,
      matchResult: null,
      history: [],
      updatedAt: '2026-09-18T12:00:00.000Z', // newer
    }
    snap.data.matches[0] = downgradedBackup
    snap.integrity.checksum = await computeChecksum(snap.data)

    await restoreBackup(snap, { mode: 'merge', overwriteActiveMatch: true })

    const current = await matchRepository.getMatch('match-m1')
    assert.strictEqual(current?.status, 'completed') // Did not downgrade!
  })

  it('38. Terminal vs Terminal (completed vs abandoned) resolves using updatedAt (newer wins)', async () => {
    const snap = await createValidSnapshotObject()
    // Local is completed at 10:00
    const localCompleted: PersistedMatchRecord = {
      ...snap.data.matches[0],
      status: 'completed',
      updatedAt: '2026-09-18T10:00:00.000Z',
    }
    await matchRepository.saveMatch(localCompleted)

    // Backup is abandoned at 11:00 (newer)
    const backupAbandoned: PersistedMatchRecord = {
      ...snap.data.matches[0],
      status: 'abandoned',
      updatedAt: '2026-09-18T11:00:00.000Z',
    }
    snap.data.matches[0] = backupAbandoned
    snap.integrity.checksum = await computeChecksum(snap.data)

    await restoreBackup(snap, { mode: 'merge' })

    const current = await matchRepository.getMatch('match-m1')
    assert.strictEqual(current?.status, 'abandoned') // Newer terminal state won!
  })

  it('39. Terminal vs Terminal with equal timestamps uses deterministic tie-breaker', async () => {
    const snap = await createValidSnapshotObject()
    const timestamp = '2026-09-18T10:00:00.000Z'

    const localRecord: PersistedMatchRecord = {
      ...snap.data.matches[0],
      status: 'completed',
      updatedAt: timestamp,
    }
    await matchRepository.saveMatch(localRecord)

    const backupRecord: PersistedMatchRecord = {
      ...snap.data.matches[0],
      status: 'abandoned',
      updatedAt: timestamp,
    }
    snap.data.matches[0] = backupRecord
    snap.integrity.checksum = await computeChecksum(snap.data)

    await restoreBackup(snap, { mode: 'merge' })

    const current = await matchRepository.getMatch('match-m1')
    // Either completed or abandoned won deterministically
    assert.ok(current?.status === 'completed' || current?.status === 'abandoned')
    // If incoming backup won, conflict note was attached
    if (current?.status === 'abandoned') {
      assert.strictEqual(current.syncError, 'CONFLICT_TERMINAL_TIE_RESOLVED')
    }
  })

  it('40. CRITICAL ATOMICITY TEST: Simulated write failure causes 100% rollback with zero partial writes', async () => {
    // 1. Capture complete known pre-restore state across all 3 stores
    const preTeam: PersistedTeamRecord = {
      schemaVersion: 1,
      id: 'pre-restore-team',
      name: 'Pre-Restore Team Name',
      ownerUid: 'uid-1',
      createdAt: '2026-09-18T08:00:00.000Z',
      updatedAt: '2026-09-18T08:00:00.000Z',
    }
    await teamRepository.saveTeam(preTeam)

    const prePlayer: PersistedPlayerRecord = {
      schemaVersion: 1,
      id: 'pre-restore-player',
      name: 'Pre-Restore Player Name',
      hand: 'Left',
      ownerUid: 'uid-1',
      teamId: 'pre-restore-team',
      createdAt: '2026-09-18T08:00:00.000Z',
      updatedAt: '2026-09-18T08:00:00.000Z',
    }
    await playerRepository.savePlayer(prePlayer)

    const preMatch: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'pre-restore-match',
      status: 'completed',
      ownerUid: 'uid-1',
      createdAt: '2026-09-18T08:00:00.000Z',
      updatedAt: '2026-09-18T08:00:00.000Z',
      completedAt: '2026-09-18T08:00:00.000Z',
      teamOne: 'Pre-Restore Team Name',
      teamTwo: 'Visitor',
      overs: '10',
      teamSize: '11',
      lastManBatting: false,
      venue: 'Pre-Venue',
      competition: 'Pre-Comp',
      tossCaller: 'host',
      tossCall: 'Heads',
      tossWinner: 'host',
      decision: 'bat',
      homePlayers: [],
      visitorPlayers: [],
      openingStriker: 'S',
      openingNonStriker: 'N',
      openingBowler: 'B',
      score: null,
      history: [],
      inningsNumber: 1,
      firstBattingHome: true,
      firstInningsScore: null,
      matchResult: { winner: 'Pre-Restore Team Name', margin: '10 runs' },
      battingRoster: [],
      bowlingRoster: [],
    }
    await matchRepository.saveMatch(preMatch)

    // Verify baseline in IndexedDB before restore attempt
    assert.strictEqual((await matchRepository.listMatches()).length, 1)
    assert.strictEqual((await teamRepository.listTeams()).length, 1)
    assert.strictEqual((await playerRepository.listPlayers()).length, 1)

    // 2. Prepare candidate backup that writes matches, then teams, then players
    const backupSnap = await createValidSnapshotObject()

    // 3. Attempt restore with forced failure during the transaction write phase
    await assert.rejects(
      async () => {
        await restoreBackup(backupSnap, {
          mode: 'replace',
          _injectFailureStore: 'players', // matches and teams write, but players fails!
        })
      },
      (err: Error) => {
        assert.ok(err.message.includes('Simulated write failure') || err.message.includes('aborted'))
        return true
      }
    )

    // 4. Reopen/read all 3 stores to verify native rollback
    await closeDatabase()

    const currentMatches = await matchRepository.listMatches()
    const currentTeams = await teamRepository.listTeams()
    const currentPlayers = await playerRepository.listPlayers()

    // In Replace mode, stores were cleared and matches/teams were put, BUT because tx aborted,
    // ALL 3 stores must be rolled back to their exact pre-restore state!
    assert.strictEqual(currentMatches.length, 1)
    assert.strictEqual(currentMatches[0].matchId, 'pre-restore-match')
    assert.strictEqual(currentMatches[0].teamOne, 'Pre-Restore Team Name')

    assert.strictEqual(currentTeams.length, 1)
    assert.strictEqual(currentTeams[0].id, 'pre-restore-team')
    assert.strictEqual(currentTeams[0].name, 'Pre-Restore Team Name')

    assert.strictEqual(currentPlayers.length, 1)
    assert.strictEqual(currentPlayers[0].id, 'pre-restore-player')
    assert.strictEqual(currentPlayers[0].name, 'Pre-Restore Player Name')

    // None of the backup records leaked into the database
    assert.strictEqual(await matchRepository.getMatch('match-m1'), null)
    assert.strictEqual(await teamRepository.getTeam('team-t1'), null)
    assert.strictEqual(await playerRepository.getPlayer('player-p1'), null)
  })

  it('41. Validation failure performs zero IndexedDB writes', async () => {
    const corrupted = await createValidSnapshotObject()
    corrupted.data.matches[0].matchId = '' // Invalid ID triggers Stage 7 error

    await assert.rejects(async () => restoreBackup(corrupted))

    // DB should remain completely empty
    assert.strictEqual((await matchRepository.listMatches()).length, 0)
    assert.strictEqual((await teamRepository.listTeams()).length, 0)
    assert.strictEqual((await playerRepository.listPlayers()).length, 0)
  })
})

describe('Local JSON Export, Import & Legacy Migration (Milestone 4.3)', () => {
  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  describe('Local JSON Export', () => {
    it('42. generateBackupFilename formats as scoremate_backup_YYYY-MM-DD_HH-mm-ss.json', () => {
      const fixedDate = new Date('2026-09-18T14:30:45.000Z')
      const name = generateBackupFilename(fixedDate)
      assert.match(name, /^scoremate_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/)
    })

    it('43. exportBackupJson creates valid JSON string with matching snapshot and SHA-256 checksum', async () => {
      const snapObj = await createValidSnapshotObject()
      await teamRepository.saveTeam(snapObj.data.teams[0])
      await playerRepository.savePlayer(snapObj.data.players[0])
      await matchRepository.saveMatch(snapObj.data.matches[0])

      const { snapshot, json, filename } = await exportBackupJson({ ownerUid: 'export-user' })

      assert.strictEqual(typeof json, 'string')
      assert.match(filename, /^scoremate_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/)
      assert.strictEqual(snapshot.provenanceOwnerUid, 'export-user')
      assert.strictEqual(snapshot.metadata.matchCount, 1)

      const parsed = JSON.parse(json)
      assert.strictEqual(parsed.$schema, BACKUP_SCHEMA_URL)
      assert.strictEqual(parsed.backupVersion, 1)
      assert.strictEqual(parsed.integrity.checksum, snapshot.integrity.checksum)
    })

    it('44. exportBackupJson performs zero IndexedDB mutations', async () => {
      // Pre-populate DB
      const snapObj = await createValidSnapshotObject()
      await teamRepository.saveTeam(snapObj.data.teams[0])

      const beforeTeams = await teamRepository.listTeams()
      await exportBackupJson()
      const afterTeams = await teamRepository.listTeams()

      assert.deepStrictEqual(beforeTeams, afterTeams)
    })

    it('45. Exported JSON validates successfully through validateBackup', async () => {
      const snapObj = await createValidSnapshotObject()
      await teamRepository.saveTeam(snapObj.data.teams[0])
      await playerRepository.savePlayer(snapObj.data.players[0])
      await matchRepository.saveMatch(snapObj.data.matches[0])

      const { json } = await exportBackupJson()
      const validated = await validateBackup(json)

      assert.strictEqual(validated.metadata.matchCount, 1)
      assert.strictEqual(validated.data.matches[0].matchId, 'match-m1')
    })
  })

  describe('Local JSON Import', () => {
    it('46. importBackupFile imports valid JSON string and populates IndexedDB', async () => {
      const snapObj = await createValidSnapshotObject()
      const json = serializeSnapshot(snapObj)

      const result = await importBackupFile(json, { mode: 'replace' })
      assert.strictEqual(result.mode, 'replace')
      assert.strictEqual(result.matchesAdded, 1)
      assert.strictEqual(result.teamsAdded, 1)
      assert.strictEqual(result.playersAdded, 1)

      assert.notStrictEqual(await matchRepository.getMatch('match-m1'), null)
    })

    it('47. importBackupFile rejects malformed JSON string', async () => {
      await assert.rejects(
        async () => importBackupFile('{"notValidJson: '),
        (err: BackupValidationError) => {
          assert.strictEqual(err.code, 'VALIDATION_INVALID_JSON')
          return true
        }
      )
    })

    it('48. importBackupFile rejects oversized File/Blob > 50 MB before reading', async () => {
      const oversizedBlob = {
        size: MAX_BACKUP_SIZE_BYTES + 100,
        text: async () => 'some text',
      } as unknown as File

      await assert.rejects(
        async () => importBackupFile(oversizedBlob),
        (err: BackupValidationError) => {
          assert.strictEqual(err.code, 'VALIDATION_FILE_TOO_LARGE')
          return true
        }
      )
    })

    it('49. importBackupFile rejects checksum mismatch/corrupted content', async () => {
      const snapObj = await createValidSnapshotObject()
      // Corrupt team name without recomputing checksum
      snapObj.data.teams[0].name = 'Corrupted Name'
      const json = serializeSnapshot(snapObj)

      await assert.rejects(
        async () => importBackupFile(json),
        (err: BackupValidationError) => {
          assert.strictEqual(err.code, 'VALIDATION_CHECKSUM_MISMATCH')
          return true
        }
      )
    })

    it('50. importBackupFile preserves active in_progress match by default in Merge mode', async () => {
      const localActive: PersistedMatchRecord = {
        schemaVersion: 1,
        matchId: 'active-match-1',
        status: 'in_progress',
        ownerUid: null,
        createdAt: '2026-09-18T09:00:00.000Z',
        updatedAt: '2026-09-18T09:30:00.000Z',
        teamOne: 'Local Active Team',
        teamTwo: 'Visitor',
        overs: '5',
        teamSize: '6',
        lastManBatting: false,
        venue: 'Park',
        competition: 'Gully',
        tossCaller: 'host',
        tossCall: 'Heads',
        tossWinner: 'host',
        decision: 'bat',
        homePlayers: [],
        visitorPlayers: [],
        openingStriker: 'S1',
        openingNonStriker: 'S2',
        openingBowler: 'B1',
        score: null,
        history: [],
        inningsNumber: 1,
        firstBattingHome: true,
        firstInningsScore: null,
        matchResult: null,
        battingRoster: [],
        bowlingRoster: [],
      }
      await matchRepository.saveMatch(localActive)

      const snapObj = await createValidSnapshotObject()
      const backupActive: PersistedMatchRecord = {
        ...localActive,
        teamOne: 'Attempted File Overwrite',
        updatedAt: '2026-09-18T10:00:00.000Z',
      }
      snapObj.data.matches.push(backupActive)
      snapObj.integrity.checksum = await computeChecksum(snapObj.data)
      const json = serializeSnapshot(snapObj)

      await importBackupFile(json, { mode: 'merge' })

      const current = await matchRepository.getMatch('active-match-1')
      assert.strictEqual(current?.teamOne, 'Local Active Team') // Protected!
    })

    it('51. importBackupFile on validation failure causes zero partial DB changes', async () => {
      const snapObj = await createValidSnapshotObject()
      snapObj.data.matches[0].matchId = '' // Invalid ID triggers validation failure
      const json = serializeSnapshot(snapObj)

      await assert.rejects(async () => importBackupFile(json))

      assert.strictEqual((await matchRepository.listMatches()).length, 0)
      assert.strictEqual((await teamRepository.listTeams()).length, 0)
      assert.strictEqual((await playerRepository.listPlayers()).length, 0)
    })
  })

  describe('Legacy Backup Migration (Actual Repository Formats)', () => {
    it('52. isLegacyBackup correctly detects CompletedMatch[] array format', () => {
      const legacyArray = [
        {
          id: 'legacy-1',
          savedAt: '2026-09-15T12:00:00.000Z',
          teamOne: 'Team Red',
          teamTwo: 'Team Blue',
          result: { winner: 'Team Red', margin: '10 runs' },
        },
      ]
      assert.strictEqual(isLegacyBackup(legacyArray), true)
      assert.strictEqual(isLegacyBackup([]), true) // Empty array format
    })

    it('53. isLegacyBackup correctly detects { active, completed } legacy format', () => {
      const legacyObject = {
        active: '{"teamOne":"A","teamTwo":"B"}',
        completed: [
          {
            id: 'legacy-2',
            teamOne: 'T1',
            teamTwo: 'T2',
            result: { winner: 'T1', margin: '2 wkts' },
          },
        ],
      }
      assert.strictEqual(isLegacyBackup(legacyObject), true)
    })

    it('54. isLegacyBackup returns false for canonical v1 BackupSnapshot', async () => {
      const v1Snap = await createValidSnapshotObject()
      assert.strictEqual(isLegacyBackup(v1Snap), false)
    })

    it('55. migrateLegacyBackup converts CompletedMatch[] array into valid BackupSnapshot v1', async () => {
      const legacyArray = [
        {
          id: 'legacy-completed-101',
          savedAt: '2026-09-15T12:00:00.000Z',
          teamOne: 'Classic Stars',
          teamTwo: 'Heritage XI',
          firstBattingHome: true,
          firstInningsScore: null,
          secondInningsScore: null,
          result: { winner: 'Classic Stars', margin: '4 runs' },
        },
      ]

      const migrated = await migrateLegacyBackup(legacyArray, { ownerUid: 'migrated-user' })

      assert.strictEqual(migrated.$schema, BACKUP_SCHEMA_URL)
      assert.strictEqual(migrated.backupVersion, 1)
      assert.strictEqual(migrated.metadata.matchCount, 1)
      assert.strictEqual(migrated.provenanceOwnerUid, 'migrated-user')

      // Check record integrity
      const record = migrated.data.matches[0]
      assert.strictEqual(record.matchId, 'legacy-completed-101') // Preserved ID!
      assert.strictEqual(record.status, 'completed')
      assert.strictEqual(record.teamOne, 'Classic Stars')
      assert.strictEqual(record.matchResult?.winner, 'Classic Stars')

      // Checksum must be valid for the newly generated payload
      const expectedChecksum = await computeChecksum(migrated.data)
      assert.strictEqual(migrated.integrity.checksum, expectedChecksum)

      // Must pass validateBackup completely
      const validated = await validateBackup(migrated)
      assert.strictEqual(validated.data.matches.length, 1)
    })

    it('56. migrateLegacyBackup converts { active, completed } preserving in_progress active match', async () => {
      const activeState = {
        teamOne: 'Active Team A',
        teamTwo: 'Active Team B',
        overs: '10',
        teamSize: '11',
        lastManBatting: false,
        venue: 'Central Ground',
        competition: 'T20 Cup',
        score: null,
        history: [],
        inningsNumber: 1,
        firstBattingHome: true,
      }

      const legacyBackup = {
        active: JSON.stringify(activeState),
        completed: [
          {
            id: 'completed-leg-1',
            savedAt: '2026-09-16T12:00:00.000Z',
            teamOne: 'Team A',
            teamTwo: 'Team B',
            result: { winner: 'Team A', margin: '5 wickets' },
          },
        ],
      }

      const migrated = await migrateLegacyBackup(legacyBackup)
      assert.strictEqual(migrated.metadata.matchCount, 2)
      assert.strictEqual(migrated.metadata.hasActiveMatch, true)

      const activeRecord = migrated.data.matches.find((m) => m.status === 'in_progress')
      assert.notStrictEqual(activeRecord, undefined)
      assert.strictEqual(activeRecord?.teamOne, 'Active Team A')
      assert.strictEqual(activeRecord?.venue, 'Central Ground')

      const completedRecord = migrated.data.matches.find((m) => m.status === 'completed')
      assert.notStrictEqual(completedRecord, undefined)
      assert.strictEqual(completedRecord?.matchId, 'completed-leg-1')

      // Validates and imports seamlessly
      const result = await importBackupFile(JSON.stringify(legacyBackup), { mode: 'replace' })
      assert.strictEqual(result.matchesAdded, 2)
      assert.notStrictEqual(await matchRepository.getMatch('completed-leg-1'), null)
    })

    it('57. migrateLegacyBackup rejects corrupted legacy match missing team names', async () => {
      const corruptedLegacy = [
        {
          id: 'corrupted-leg-1',
          savedAt: '2026-09-15T12:00:00.000Z',
          teamOne: '', // missing
          teamTwo: '',
        },
      ]

      await assert.rejects(
        async () => migrateLegacyBackup(corruptedLegacy),
        (err: BackupValidationError) => {
          assert.strictEqual(err.code, 'VALIDATION_INVALID_ENTITY')
          return true
        }
      )
    })
  })
})

