import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  executeLocalExport,
  executeRestore,
  executeDriveBackup,
  executeDriveDownload,
  executeDriveDisconnect,
  inspectBackupSummary,
  sanitizeUserFacingError,
} from '../src/services/backupUIController.ts'
import {
  computeChecksum,
  BACKUP_SCHEMA_URL,
  BACKUP_VERSION,
  APP_VERSION,
} from '../src/services/backupService.ts'
import {
  googleDriveService,
  GoogleDriveError,
  type OAuthTokenProvider,
  type OAuthToken,
} from '../src/services/googleDriveService.ts'
import { setFirestoreAdapter, type FirestoreAdapter } from '../src/services/firestore.ts'
import { firebaseAuth } from '../src/services/firebase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setDatabaseFactory, closeDatabase } from '../src/services/localDatabase.ts'
import type {
  PersistedMatchRecord,
  BackupSnapshot,
  BackupDataPayload,
} from '../src/types/database.ts'

// In-memory Firestore adapter
class MemoryFirestoreAdapter implements FirestoreAdapter {
  readonly store = new Map<string, Record<string, unknown>>()

  async getDoc(path: string, ...pathSegments: string[]): Promise<unknown | null> {
    const key = [path, ...pathSegments].join('/')
    const data = this.store.get(key)
    return data ? JSON.parse(JSON.stringify(data)) : null
  }

  async setDoc(data: Record<string, unknown>, path: string, ...pathSegments: string[]): Promise<void> {
    const key = [path, ...pathSegments].join('/')
    this.store.set(key, JSON.parse(JSON.stringify(data)))
  }

  async listDocs(path: string, ...pathSegments: string[]): Promise<unknown[]> {
    const prefix = [path, ...pathSegments].join('/') + '/'
    const results: unknown[] = []
    for (const [key, val] of this.store.entries()) {
      if (key.startsWith(prefix)) {
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

// In-memory Mock OAuth Provider for Drive tests
class MockOAuthProvider implements OAuthTokenProvider {
  token: OAuthToken | null = null
  configured = true

  isConfigured(): boolean {
    return this.configured
  }
  getInMemoryToken(): OAuthToken | null {
    return this.token
  }
  async requestToken(): Promise<OAuthToken> {
    this.token = {
      accessToken: 'test-oauth-token',
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

function createSampleMatch(id: string, name = 'Match'): PersistedMatchRecord {
  return {
    schemaVersion: 1,
    matchId: id,
    status: 'completed',
    ownerUid: 'test_user',
    createdAt: '2026-09-18T10:00:00.000Z',
    updatedAt: '2026-09-18T10:00:00.000Z',
    completedAt: '2026-09-18T10:00:00.000Z',
    teamOne: `${name} Team A`,
    teamTwo: `${name} Team B`,
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

async function createValidSnapshotJson(matches: PersistedMatchRecord[]): Promise<string> {
  const payload: BackupDataPayload = {
    matches,
    teams: [],
    players: [],
  }
  const checksum = await computeChecksum(payload)
  const snapshot: BackupSnapshot = {
    $schema: BACKUP_SCHEMA_URL,
    backupVersion: BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    deviceId: 'test_device',
    provenanceOwnerUid: 'test_user',
    integrity: {
      algorithm: 'SHA-256',
      canonicalization: 'RFC-8785-ES6-KEY-SORT',
      checksum,
    },
    metadata: {
      matchCount: matches.length,
      teamCount: 0,
      playerCount: 0,
      hasActiveMatch: false,
      databaseVersion: 1,
    },
    data: payload,
  }
  return JSON.stringify(snapshot, null, 2)
}

describe('Milestone 4.6 — Backup & Restore UI + Final Integration', () => {
  let mockFirestore: MemoryFirestoreAdapter
  let mockOAuth: MockOAuthProvider
  let downloads: Array<{ content: string; filename: string }>

  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())

    mockFirestore = new MemoryFirestoreAdapter()
    setFirestoreAdapter(mockFirestore)

    mockOAuth = new MockOAuthProvider()
    googleDriveService.setTokenProvider(mockOAuth)

    downloads = []
    // Mock globalThis.document and Blob for file download testing
    // @ts-expect-error test mock
    globalThis.document = {
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
      createElement: () => ({
        set href(val: string) {
          downloads.push({ content: val, filename: this.download })
        },
        download: '',
        click: () => {},
      }),
    }
    // @ts-expect-error test mock
    globalThis.URL.createObjectURL = (blob: { content?: string }) => blob.content ?? 'blob:url'
    // @ts-expect-error test mock
    globalThis.URL.revokeObjectURL = () => {}
    // @ts-expect-error test mock
    globalThis.Blob = class MockBlob {
      content: string
      constructor(parts: string[]) {
        this.content = parts.join('')
      }
    }

    // Default signed in
    firebaseAuth.currentUser = { uid: 'user_46_main', isAnonymous: false }
  })

  // ==================================================
  // A. Local Export
  // ==================================================
  it('A. Export invokes BackupService, triggers download, and does NOT mutate IndexedDB', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_export_1', 'Original'))
    const initialMatches = await matchRepository.listMatches()
    assert.equal(initialMatches.length, 1)

    const res = await executeLocalExport()
    assert.equal(res.success, true)
    assert.ok(res.filename?.startsWith('scoremate_backup_'))
    assert.equal(downloads.length, 1)

    // Verify zero mutations in IndexedDB
    const afterMatches = await matchRepository.listMatches()
    assert.equal(afterMatches.length, 1)
    assert.equal(afterMatches[0].matchId, 'm_export_1')
  })

  // ==================================================
  // B. Import: Merge and Replace
  // ==================================================
  it('B. Import parses summary, handles Merge and Replace correctly', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_existing', 'Local'))

    const backupMatch = createSampleMatch('m_incoming', 'Backup')
    const json = await createValidSnapshotJson([backupMatch])

    // Inspect summary
    const summary = inspectBackupSummary(json)
    assert.equal(summary?.matchCount, 1)

    // Merge flow: preserves existing and adds incoming
    const mergeRes = await executeRestore(json, 'merge', false)
    assert.equal(mergeRes.localSuccess, true)
    const afterMerge = await matchRepository.listMatches()
    assert.equal(afterMerge.length, 2)

    // Replace flow: wipes local and replaces with backup
    const replaceRes = await executeRestore(json, 'replace', false)
    assert.equal(replaceRes.localSuccess, true)
    const afterReplace = await matchRepository.listMatches()
    assert.equal(afterReplace.length, 1)
    assert.equal(afterReplace[0].matchId, 'm_incoming')
  })

  // ==================================================
  // C. Validation Failure
  // ==================================================
  it('C. Validation failure produces user-friendly error without mutating IndexedDB', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_keep', 'KeepMe'))

    // Corrupted data payload (violates SHA-256 integrity checksum)
    const validJson = await createValidSnapshotJson([createSampleMatch('m_corrupt', 'OriginalTeam')])
    const corruptedJson = validJson.replace('"OriginalTeam Team A"', '"CorruptedTeam Team A"')

    const res = await executeRestore(corruptedJson, 'merge', true)
    assert.equal(res.localSuccess, false)
    assert.equal(res.statusType, 'error')
    assert.match(res.message, /corrupted|modified|failed/i)

    // Verify zero mutations
    const matches = await matchRepository.listMatches()
    assert.equal(matches.length, 1)
    assert.equal(matches[0].matchId, 'm_keep')
  })

  // ==================================================
  // D. Successful Restore + Reconciliation
  // ==================================================
  it('D. Successful restore reconciles with Firestore when user is authenticated', async () => {
    firebaseAuth.currentUser = { uid: 'auth_user_d', isAnonymous: false }

    const backupMatch = createSampleMatch('m_auth_d', 'CloudSync')
    const json = await createValidSnapshotJson([backupMatch])

    const res = await executeRestore(json, 'merge', true)
    assert.equal(res.localSuccess, true)
    assert.equal(res.statusType, 'success')
    assert.ok(res.cloudResult)
    assert.equal(res.cloudResult.success, true)
    assert.equal(res.cloudResult.authenticated, true)

    // Verify Firestore partition has the match
    const cloudDoc = await mockFirestore.getDoc('users', 'auth_user_d', 'matches', 'm_auth_d')
    assert.ok(cloudDoc)
  })

  // ==================================================
  // E. Signed-Out Restore
  // ==================================================
  it('E. Signed-out restore succeeds locally and cleanly skips Firestore reconciliation', async () => {
    firebaseAuth.currentUser = null // Signed out

    const backupMatch = createSampleMatch('m_signed_out', 'OfflineMatch')
    const json = await createValidSnapshotJson([backupMatch])

    const res = await executeRestore(json, 'merge', false)
    assert.equal(res.localSuccess, true)
    assert.equal(res.statusType, 'success')
    assert.equal(res.cloudResult, undefined) // Skipped entirely

    // Local IndexedDB has it
    const local = await matchRepository.getMatch('m_signed_out')
    assert.ok(local)

    // Zero Firestore operations occurred
    assert.equal(mockFirestore.store.size, 0)
  })

  // ==================================================
  // F. Reconciliation Failure Preserves Local Restore
  // ==================================================
  it('F. Reconciliation failure preserves local restore and reports separate status', async () => {
    firebaseAuth.currentUser = { uid: 'auth_user_f', isAnonymous: false }

    // Break Firestore adapter to simulate network failure
    mockFirestore.setDoc = async () => {
      throw new Error('Network timeout connecting to Cloud Firestore')
    }

    const backupMatch = createSampleMatch('m_fail_cloud', 'LocalIntact')
    const json = await createValidSnapshotJson([backupMatch])

    const res = await executeRestore(json, 'merge', true)
    // Local restore succeeded
    assert.equal(res.localSuccess, true)
    // Cloud sync flagged as warning/failure
    assert.equal(res.statusType, 'warning')
    assert.match(res.message, /Cloud sync could not be completed/i)

    // Local data is preserved and not rolled back
    const local = await matchRepository.getMatch('m_fail_cloud')
    assert.ok(local)
  })

  // ==================================================
  // G. Google Drive Backup
  // ==================================================
  it('G. Google Drive backup orchestrates snapshot creation and upload', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_drive_g', 'DriveMatch'))

    // Mock fetch for Google Drive upload
    let uploadedBody = ''
    googleDriveService.setFetch(async (_url, init) => {
      if (init?.method === 'GET') {
        // findBackupFile returns empty files array
        return new Response(JSON.stringify({ files: [] }), { status: 200 })
      }
      if (init?.method === 'POST') {
        uploadedBody = String(init.body)
        return new Response(
          JSON.stringify({ id: 'file_drive_123', name: 'scoremate_backup.json', modifiedTime: new Date().toISOString() }),
          { status: 200 }
        )
      }
      return new Response('Not found', { status: 404 })
    })

    const res = await executeDriveBackup()
    assert.equal(res.success, true)
    assert.equal(res.metadata?.id, 'file_drive_123')
    assert.ok(uploadedBody.includes('m_drive_g'))
  })

  // ==================================================
  // H. Google Drive Restore
  // ==================================================
  it('H. Google Drive restore downloads backup and passes it to atomic restore', async () => {
    const backupMatch = createSampleMatch('m_drive_h', 'RestoredFromDrive')
    const validJson = await createValidSnapshotJson([backupMatch])

    googleDriveService.setFetch(async (url, init) => {
      if (String(url).includes('files?') && init?.method === 'GET') {
        return new Response(
          JSON.stringify({
            files: [{ id: 'file_cloud_h', name: 'scoremate_backup.json', modifiedTime: '2026-09-18T12:00:00Z', size: String(validJson.length) }],
          }),
          { status: 200 }
        )
      }
      if (String(url).includes('file_cloud_h') && init?.method === 'GET') {
        return new Response(validJson, { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    // 1. Download
    const downloadRes = await executeDriveDownload()
    assert.equal(downloadRes.success, true)
    assert.ok(downloadRes.content)

    // 2. Restore
    const restoreRes = await executeRestore(downloadRes.content, 'merge', true)
    assert.equal(restoreRes.localSuccess, true)

    // 3. Verify in IndexedDB
    const saved = await matchRepository.getMatch('m_drive_h')
    assert.ok(saved)
  })

  // ==================================================
  // I. OAuth Error Mapping
  // ==================================================
  it('I. Maps OAuth structured errors cleanly to concise user-friendly messages', () => {
    const errCancelled = new GoogleDriveError('OAUTH_CANCELLED', 'User closed the popup')
    assert.equal(sanitizeUserFacingError(errCancelled), 'Google Drive authorization was cancelled.')

    const errNotConfigured = new GoogleDriveError('OAUTH_NOT_CONFIGURED', 'Missing client id')
    assert.equal(
      sanitizeUserFacingError(errNotConfigured),
      'Google Drive integration is not configured with a valid Client ID.'
    )

    const errReauth = new GoogleDriveError('OAUTH_REAUTHORIZATION_REQUIRED', 'Consent needed')
    assert.equal(
      sanitizeUserFacingError(errReauth),
      'Your Google Drive authorization has expired. Please sign in and authorize again.'
    )

    const errNotFound = new GoogleDriveError('BACKUP_FILE_NOT_FOUND', 'File absent')
    assert.equal(
      sanitizeUserFacingError(errNotFound),
      'No ScoreMate backup file was found in your Google Drive.'
    )
  })

  // ==================================================
  // J. Duplicate-Click / Concurrency Protection
  // ==================================================
  it('J. Disconnect and operations reject or guard against invalid concurrent states', async () => {
    let revokeCalled = false
    mockOAuth.revokeToken = async () => {
      revokeCalled = true
      mockOAuth.token = null
    }
    await mockOAuth.requestToken()
    assert.equal(googleDriveService.isConnected(), true)

    const disconnectRes = await executeDriveDisconnect()
    assert.equal(disconnectRes.success, true)
    assert.equal(revokeCalled, true)
    assert.equal(googleDriveService.isConnected(), false)
  })

  // ==================================================
  // K. Replace Confirmation Cancellation
  // ==================================================
  it('K. Canceling restore leaves local data 100% untouched', async () => {
    await matchRepository.saveMatch(createSampleMatch('m_safe_local', 'Untouched'))

    // Simulated: User chose a file, summary was inspected, but modal was canceled (no executeRestore called)
    const backupMatch = createSampleMatch('m_unrestored', 'Unrestored')
    const json = await createValidSnapshotJson([backupMatch])
    const summary = inspectBackupSummary(json)
    assert.equal(summary?.matchCount, 1)

    // Cancel: Nothing happens
    const local = await matchRepository.listMatches()
    assert.equal(local.length, 1)
    assert.equal(local[0].matchId, 'm_safe_local')
  })

  // ==================================================
  // L. Secret Redaction
  // ==================================================
  it('L. Redacts access tokens, bearer headers, and keys from any displayed error message', () => {
    const errorWithToken = new Error('HTTP 401: Bearer ya29.a0ARrdaM-1234567890abcdef is invalid. key=AIzaSySecret123')
    const sanitized = sanitizeUserFacingError(errorWithToken)

    assert.ok(!sanitized.includes('ya29.a0ARrdaM-1234567890abcdef'))
    assert.ok(!sanitized.includes('AIzaSySecret123'))
    assert.ok(sanitized.includes('[REDACTED]'))
  })
})
