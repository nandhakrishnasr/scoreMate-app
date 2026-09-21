import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  isBackupDue,
  checkAndRunAutomaticBackup,
  resetSessionGuardForTesting,
  SEVEN_DAYS_MS,
} from '../src/services/autoBackupService.ts'
import { settingsRepository } from '../src/services/repositories/settingsRepository.ts'
import {
  googleDriveService,
  GoogleDriveError,
  type OAuthToken,
  type OAuthTokenProvider,
} from '../src/services/googleDriveService.ts'
import { executeDriveBackup } from '../src/services/backupUIController.ts'
import { firebaseAuth } from '../src/services/firebase.ts'
import { setDatabaseFactory, closeDatabase } from '../src/services/localDatabase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import type { PersistedMatchRecord } from '../src/types/database.ts'

// In-memory mock token provider for controlled testing
class MockTokenProvider implements OAuthTokenProvider {
  token: OAuthToken | null = null
  configured = true
  interactiveCalls = 0
  silentCalls = 0
  failSilentWithConsent = false

  isConfigured(): boolean {
    return this.configured
  }
  getInMemoryToken(): OAuthToken | null {
    return this.token
  }
  async requestToken(interactive = false): Promise<OAuthToken> {
    if (interactive) {
      this.interactiveCalls++
      this.token = {
        accessToken: 'mock-interactive-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
      }
      return this.token
    }

    this.silentCalls++
    if (this.failSilentWithConsent) {
      throw new GoogleDriveError(
        'OAUTH_REAUTHORIZATION_REQUIRED',
        'Google authorization requires interactive user consent.'
      )
    }

    this.token = {
      accessToken: 'mock-silent-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
    }
    return this.token
  }
  async revokeToken(): Promise<void> {
    this.token = null
  }
  clearToken(): void {
    this.token = null
  }
}

function createSampleMatch(id: string): PersistedMatchRecord {
  return {
    schemaVersion: 1,
    matchId: id,
    status: 'completed',
    ownerUid: 'test_user',
    createdAt: '2026-09-18T10:00:00.000Z',
    updatedAt: '2026-09-18T10:00:00.000Z',
    completedAt: '2026-09-18T10:00:00.000Z',
    teamOne: 'Team A',
    teamTwo: 'Team B',
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
    matchResult: { winner: 'Team A', margin: '10 runs' },
    battingRoster: [],
    bowlingRoster: [],
  }
}

describe('Phase 6 — 7-Day Best-Effort Automatic Backup', () => {
  let mockOAuth: MockTokenProvider
  let uploadCalls: number

  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
    resetSessionGuardForTesting()

    mockOAuth = new MockTokenProvider()
    googleDriveService.setTokenProvider(mockOAuth)

    uploadCalls = 0
    googleDriveService.setFetch(async (_url, init) => {
      if (init?.method === 'GET') {
        return new Response(JSON.stringify({ files: [] }), { status: 200 })
      }
      if (init?.method === 'POST') {
        uploadCalls++
        return new Response(
          JSON.stringify({
            id: 'mock_drive_file_p6',
            name: 'scoremate_backup.json',
            modifiedTime: new Date().toISOString(),
          }),
          { status: 200 }
        )
      }
      return new Response('Not found', { status: 404 })
    })

    // Default authenticated
    firebaseAuth.currentUser = { uid: 'user_phase6', isAnonymous: false }
  })

  afterEach(async () => {
    await closeDatabase()
    resetSessionGuardForTesting()
  })

  // ==================================================
  // 1. No previous backup (null) -> backup is due
  // ==================================================
  it('1. No previous backup (null) -> backup is due', () => {
    assert.equal(isBackupDue(null), true)
    assert.equal(isBackupDue(undefined), true)
  })

  // ==================================================
  // 2. Backup exactly 7 days ago -> backup is due
  // ==================================================
  it('2. Backup exactly 7 days ago -> backup is due', () => {
    const now = 1758200000000
    const exactlySevenDaysAgo = new Date(now - SEVEN_DAYS_MS).toISOString()
    assert.equal(isBackupDue(exactlySevenDaysAgo, now), true)
  })

  // ==================================================
  // 3. Backup older than 7 days -> backup is due
  // ==================================================
  it('3. Backup older than 7 days -> backup is due', () => {
    const now = 1758200000000
    const eightDaysAgo = new Date(now - (SEVEN_DAYS_MS + 24 * 60 * 60 * 1000)).toISOString()
    assert.equal(isBackupDue(eightDaysAgo, now), true)
  })

  // ==================================================
  // 4. Backup 6 days 23 hours ago -> backup is not due
  // ==================================================
  it('4. Backup 6 days 23 hours ago -> backup is not due', () => {
    const now = 1758200000000
    const almostSevenDaysAgo = new Date(now - (SEVEN_DAYS_MS - 3600 * 1000)).toISOString()
    assert.equal(isBackupDue(almostSevenDaysAgo, now), false)
  })

  // ==================================================
  // 5. Successful manual backup -> updates timestamp
  // ==================================================
  it('5. Successful manual backup -> updates timestamp', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_manual_p6'))

    const initial = await settingsRepository.getLastSuccessfulDriveBackupAt()
    assert.equal(initial, null)

    const res = await executeDriveBackup()
    assert.equal(res.success, true)

    const updated = await settingsRepository.getLastSuccessfulDriveBackupAt()
    assert.ok(updated, 'lastSuccessfulDriveBackupAt must be populated after manual backup')
    assert.ok(!isNaN(Date.parse(updated!)))
  })

  // ==================================================
  // 6. Failed manual backup -> timestamp unchanged
  // ==================================================
  it('6. Failed manual backup -> timestamp unchanged', async () => {
    const initialTimestamp = '2026-09-01T12:00:00.000Z'
    await settingsRepository.setLastSuccessfulDriveBackupAt(initialTimestamp)

    // Simulate Drive network error
    googleDriveService.setFetch(async () => {
      throw new Error('Network failure uploading to Google Drive')
    })

    const res = await executeDriveBackup()
    assert.equal(res.success, false)

    const after = await settingsRepository.getLastSuccessfulDriveBackupAt()
    assert.equal(after, initialTimestamp, 'Timestamp must not change when manual backup fails')
  })

  // ==================================================
  // 7. Successful automatic backup -> updates timestamp
  // ==================================================
  it('7. Successful automatic backup -> updates timestamp', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_auto_p6'))
    const now = 1758200000000

    const res = await checkAndRunAutomaticBackup({ injectedNow: now })
    assert.equal(res.attempted, true)
    assert.equal(res.success, true)
    assert.equal(uploadCalls, 1)

    const saved = await settingsRepository.getLastSuccessfulDriveBackupAt()
    assert.equal(saved, new Date(now).toISOString())
  })

  // ==================================================
  // 8. Failed automatic backup -> timestamp unchanged
  // ==================================================
  it('8. Failed automatic backup -> timestamp unchanged', async () => {
    const initialTimestamp = '2026-09-01T12:00:00.000Z'
    await settingsRepository.setLastSuccessfulDriveBackupAt(initialTimestamp)

    googleDriveService.setFetch(async () => {
      throw new Error('Drive API 500 internal server error')
    })

    const res = await checkAndRunAutomaticBackup({ forceCheck: true })
    assert.equal(res.attempted, true)
    assert.equal(res.success, false)

    const after = await settingsRepository.getLastSuccessfulDriveBackupAt()
    assert.equal(after, initialTimestamp, 'Timestamp must remain unchanged on failure')
  })

  // ==================================================
  // 9. Signed-out user -> no Drive operation
  // ==================================================
  it('9. Signed-out user -> no Drive operation', async () => {
    firebaseAuth.currentUser = null

    const res = await checkAndRunAutomaticBackup({ forceCheck: true })
    assert.equal(res.attempted, false)
    assert.equal(res.skipReason, 'unauthenticated')
    assert.equal(uploadCalls, 0)
    assert.equal(mockOAuth.silentCalls, 0)
  })

  // ==================================================
  // 10. Drive not configured -> no OAuth/Drive operation
  // ==================================================
  it('10. Drive not configured -> no OAuth/Drive operation', async () => {
    mockOAuth.configured = false

    const res = await checkAndRunAutomaticBackup({ forceCheck: true })
    assert.equal(res.attempted, false)
    assert.equal(res.skipReason, 'drive_not_configured')
    assert.equal(uploadCalls, 0)
    assert.equal(mockOAuth.silentCalls, 0)
  })

  // ==================================================
  // 11. Interactive OAuth required -> does NOT open popup
  // ==================================================
  it('11. Interactive OAuth required -> does NOT open interactive authorization', async () => {
    mockOAuth.failSilentWithConsent = true

    const res = await checkAndRunAutomaticBackup({ forceCheck: true })
    assert.equal(res.attempted, false)
    assert.equal(res.skipReason, 'silent_token_failed')
    assert.equal(mockOAuth.interactiveCalls, 0, 'Must NEVER call interactive requestToken')
    assert.equal(uploadCalls, 0)
  })

  // ==================================================
  // 12. Two simultaneous startup checks -> only one backup
  // ==================================================
  it('12. Two simultaneous startup checks -> only one backup operation', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_concurrent_p6'))

    // Run two automatic backup attempts simultaneously
    const [p1, p2] = await Promise.all([
      checkAndRunAutomaticBackup({ bypassSessionGuard: true }),
      checkAndRunAutomaticBackup({ bypassSessionGuard: true }),
    ])

    // One must succeed and the other must report already_running
    const oneRan = p1.attempted || p2.attempted
    const oneGuarded = p1.skipReason === 'already_running' || p2.skipReason === 'already_running'

    assert.equal(oneRan, true)
    assert.equal(oneGuarded, true)
    assert.equal(uploadCalls, 1, 'Only exactly 1 upload call should occur')
  })

  // ==================================================
  // 13. Automatic backup failure -> non-fatal to app
  // ==================================================
  it('13. Automatic backup failure -> app remains usable / error is non-fatal', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_intact_p6'))

    googleDriveService.setFetch(async () => {
      throw new Error('Fatal socket hang up')
    })

    // Must not throw exception
    let thrown = false
    try {
      const res = await checkAndRunAutomaticBackup({ forceCheck: true })
      assert.equal(res.attempted, true)
      assert.equal(res.success, false)
    } catch {
      thrown = true
    }
    assert.equal(thrown, false, 'checkAndRunAutomaticBackup must never throw')

    // Local IndexedDB matches are 100% intact
    const local = await matchRepository.getMatch('m_intact_p6')
    assert.ok(local)
  })

  // ==================================================
  // 14. Invalid timestamp -> safely handled (due)
  // ==================================================
  it('14. Invalid timestamp -> safely handled and treated as due', () => {
    assert.equal(isBackupDue('not-a-valid-date'), true)
    assert.equal(isBackupDue(''), true)
  })

  // ==================================================
  // 15. Future timestamp -> safely handled (not due)
  // ==================================================
  it('15. Future timestamp -> safely handled (not due to prevent rapid loops)', () => {
    const now = 1758200000000
    const futureTimestamp = new Date(now + 24 * 60 * 60 * 1000).toISOString() // +1 day in future
    assert.equal(isBackupDue(futureTimestamp, now), false)
  })

  // ==================================================
  // 16. Manual backup after automatic backup -> latest wins
  // ==================================================
  it('16. Manual backup after automatic backup -> latest successful timestamp wins', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_chain_p6'))

    const t1 = 1758200000000 // Monday
    const autoRes = await checkAndRunAutomaticBackup({ injectedNow: t1 })
    assert.equal(autoRes.success, true)

    const afterAuto = await settingsRepository.getLastSuccessfulDriveBackupAt()
    assert.equal(afterAuto, new Date(t1).toISOString())

    // 2 days later: manual backup occurs
    const resManual = await executeDriveBackup()
    assert.equal(resManual.success, true)

    const afterManual = await settingsRepository.getLastSuccessfulDriveBackupAt()
    assert.ok(afterManual)
    assert.ok(afterManual !== afterAuto)
    assert.ok(new Date(afterManual!).getTime() >= new Date(afterAuto!).getTime())
  })
})
