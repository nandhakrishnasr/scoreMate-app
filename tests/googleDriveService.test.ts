import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  GoogleDriveService,
  GisOAuthProvider,
  GoogleDriveError,
  DRIVE_APPDATA_SCOPE,
  DRIVE_BACKUP_FILENAME,
  type OAuthToken,
  type OAuthTokenProvider,
  type GisGlobalAdapter,
  type GisTokenClientConfig,
} from '../src/services/googleDriveService.ts'
import {
  createSnapshot,
  serializeSnapshot,
  validateBackup,
  restoreBackup,
} from '../src/services/backupService.ts'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setDatabaseFactory, closeDatabase } from '../src/services/localDatabase.ts'
import { matchRepository } from '../src/services/repositories/matchRepository.ts'
import type { PersistedMatchRecord } from '../src/types/database.ts'

// In-memory mock token provider for unit testing
class MockTokenProvider implements OAuthTokenProvider {
  private inMemoryToken: OAuthToken | null = null
  public isConfiguredResult = true
  public requestCount = 0
  public revokeCount = 0
  public lastPrompt?: string

  constructor(initialToken?: OAuthToken) {
    if (initialToken) this.inMemoryToken = initialToken
  }

  isConfigured(): boolean {
    return this.isConfiguredResult
  }

  getInMemoryToken(): OAuthToken | null {
    return this.inMemoryToken
  }

  setToken(token: OAuthToken | null): void {
    this.inMemoryToken = token
  }

  async requestToken(_interactive = false): Promise<OAuthToken> {
    this.requestCount++
    this.lastPrompt = _interactive ? 'consent' : ''
    if (!this.isConfiguredResult) {
      throw new GoogleDriveError('OAUTH_NOT_CONFIGURED', 'OAuth not configured.')
    }
    const token: OAuthToken = {
      accessToken: 'mock-access-token-' + Date.now(),
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    }
    this.inMemoryToken = token
    return token
  }

  async revokeToken(_token: string): Promise<void> {
    this.revokeCount++
    this.inMemoryToken = null
  }

  clearToken(): void {
    this.inMemoryToken = null
  }
}

describe('GoogleDriveService — OAuth & Transport Tests (Milestone 4.4)', () => {
  beforeEach(async () => {
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
  })

  afterEach(async () => {
    await closeDatabase()
  })

  // 1. OAuth initialization & Configuration
  it('identifies unconfigured state when client ID is missing', async () => {
    const provider = new GisOAuthProvider({ clientId: '' })
    assert.equal(provider.isConfigured(), false)

    await assert.rejects(
      async () => provider.requestToken(),
      (err: unknown) => {
        assert.ok(err instanceof GoogleDriveError)
        assert.equal(err.code, 'OAUTH_NOT_CONFIGURED')
        return true
      }
    )
  })

  it('configures with explicit client ID and correct appData scope', () => {
    const provider = new GisOAuthProvider({
      clientId: 'test-client-id-123.apps.googleusercontent.com',
    })
    assert.equal(provider.isConfigured(), true)
  })

  // 2. GIS Adapter & Web OAuth Provider Token Lifecycle
  it('requests token via GIS adapter with correct scope and prompt', async () => {
    let capturedPrompt: string | undefined
    let capturedConfig: GisTokenClientConfig | undefined

    const mockGis: GisGlobalAdapter = {
      initTokenClient: (config: GisTokenClientConfig) => {
        capturedConfig = config
        return {
          requestAccessToken: (override) => {
            capturedPrompt = override?.prompt
            // Simulate Google OAuth success callback
            config.callback({
              access_token: 'ya29.gis_mock_token_abc',
              expires_in: 3600,
              scope: config.scope,
              token_type: 'Bearer',
            })
          },
        }
      },
      revoke: (_token, done) => done(),
    }

    const provider = new GisOAuthProvider({
      clientId: 'test-client-id',
      gisAdapter: mockGis,
    })

    // Silent request (prompt = '')
    const token = await provider.requestToken(false)
    assert.equal(token.accessToken, 'ya29.gis_mock_token_abc')
    assert.equal(capturedPrompt, '')
    assert.equal(capturedConfig?.scope, DRIVE_APPDATA_SCOPE)

    // Interactive request (prompt = 'consent')
    await provider.requestToken(true)
    assert.equal(capturedPrompt, 'consent')
  })

  // 3. In-memory token storage (NEVER in localStorage/sessionStorage/IndexedDB)
  it('stores access token in memory only and never writes to storage mechanisms', async () => {
    const mockGis: GisGlobalAdapter = {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          config.callback({
            access_token: 'secret-token-123',
            expires_in: 3600,
            scope: DRIVE_APPDATA_SCOPE,
            token_type: 'Bearer',
          })
        },
      }),
      revoke: (_t, done) => done(),
    }

    const provider = new GisOAuthProvider({ clientId: 'test-id', gisAdapter: mockGis })
    const token = await provider.requestToken()

    assert.equal(token.accessToken, 'secret-token-123')
    assert.equal(provider.getInMemoryToken()?.accessToken, 'secret-token-123')

    // Verify token is NOT written to global storage
    if (typeof localStorage !== 'undefined') {
      assert.equal(localStorage.getItem('access_token'), null)
      assert.equal(localStorage.getItem('oauth_token'), null)
    }
    if (typeof sessionStorage !== 'undefined') {
      assert.equal(sessionStorage.getItem('access_token'), null)
    }
  })

  // 4. Token expiration buffer (120 seconds) & silent renewal
  it('honors 120s expiry buffer and triggers renewal when expired', async () => {
    let tokenGen = 1
    const mockGis: GisGlobalAdapter = {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          config.callback({
            access_token: `token-v${tokenGen++}`,
            expires_in: 3600,
            scope: DRIVE_APPDATA_SCOPE,
            token_type: 'Bearer',
          })
        },
      }),
      revoke: (_t, done) => done(),
    }

    const provider = new GisOAuthProvider({ clientId: 'test-id', gisAdapter: mockGis })

    // Initial token
    const token1 = await provider.requestToken()
    assert.equal(token1.accessToken, 'token-v1')

    // Immediate second call should return cached in-memory token (no new generation)
    const token2 = await provider.requestToken()
    assert.equal(token2.accessToken, 'token-v1')

    // Simulate token approaching expiration (within 120s buffer)
    const stored = provider.getInMemoryToken()!
    stored.expiresAt = Date.now() + 60 * 1000 // Only 60s left (< 120s buffer)

    // Next call must renew
    const token3 = await provider.requestToken()
    assert.equal(token3.accessToken, 'token-v2')
  })

  // 5. OAuth denial / cancellation
  it('handles user denial or cancellation with OAUTH_CANCELLED', async () => {
    const mockGis: GisGlobalAdapter = {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          config.callback({
            access_token: '',
            expires_in: 0,
            scope: '',
            token_type: '',
            error: 'access_denied',
          })
        },
      }),
      revoke: (_t, done) => done(),
    }

    const provider = new GisOAuthProvider({ clientId: 'test-id', gisAdapter: mockGis })

    await assert.rejects(
      async () => provider.requestToken(true),
      (err: unknown) => {
        assert.ok(err instanceof GoogleDriveError)
        assert.equal(err.code, 'OAUTH_CANCELLED')
        return true
      }
    )
  })

  // 6. OAuth interaction required (silent renewal failed)
  it('surfaces OAUTH_REAUTHORIZATION_REQUIRED when silent renewal requires consent', async () => {
    const mockGis: GisGlobalAdapter = {
      initTokenClient: (config) => ({
        requestAccessToken: () => {
          config.callback({
            access_token: '',
            expires_in: 0,
            scope: '',
            token_type: '',
            error: 'interaction_required',
          })
        },
      }),
      revoke: (_t, done) => done(),
    }

    const provider = new GisOAuthProvider({ clientId: 'test-id', gisAdapter: mockGis })

    await assert.rejects(
      async () => provider.requestToken(false),
      (err: unknown) => {
        assert.ok(err instanceof GoogleDriveError)
        assert.equal(err.code, 'OAUTH_REAUTHORIZATION_REQUIRED')
        return true
      }
    )
  })

  // 7. clearToken() on Firebase sign-out (No network revocation)
  it('clearToken() drops token from memory without calling network revocation', async () => {
    const tokenProvider = new MockTokenProvider()
    const service = new GoogleDriveService({ tokenProvider })

    await service.authorize()
    assert.ok(service.isConnected())

    // Firebase sign-out triggers clearToken()
    service.clearToken()
    assert.equal(service.isConnected(), false)
    assert.equal(tokenProvider.getInMemoryToken(), null)
    assert.equal(tokenProvider.revokeCount, 0) // Did NOT call network revocation
  })

  // 8. Explicit Disconnect (calls revocation)
  it('disconnect() revokes authorization with Google and clears memory', async () => {
    const tokenProvider = new MockTokenProvider()
    const service = new GoogleDriveService({ tokenProvider })

    await service.authorize()
    assert.ok(service.isConnected())

    await service.disconnect()
    assert.equal(service.isConnected(), false)
    assert.equal(tokenProvider.getInMemoryToken(), null)
    assert.equal(tokenProvider.revokeCount, 1) // Called network revocation
  })

  // 9. Drive API: findBackupFile() with zero files
  it('finds null when no backup file exists in appDataFolder', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-test-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    let requestedUrl = ''
    let requestedHeaders: Record<string, string> = {}

    const mockFetch: typeof fetch = async (input, init) => {
      requestedUrl = String(input)
      requestedHeaders = (init?.headers as Record<string, string>) || {}
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })
    const result = await service.findBackupFile()

    assert.equal(result, null)
    assert.ok(requestedUrl.includes('spaces=appDataFolder'))
    const decodedUrl = decodeURIComponent(requestedUrl.replace(/\+/g, ' '))
    assert.ok(decodedUrl.includes(`name = '${DRIVE_BACKUP_FILENAME}'`))
    assert.equal(requestedHeaders['Authorization'], 'Bearer valid-test-token')
  })

  // 10. Drive API: findBackupFile() with existing file
  it('finds existing backup file metadata in appDataFolder', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          files: [
            {
              id: 'file-drive-123',
              name: DRIVE_BACKUP_FILENAME,
              modifiedTime: '2026-09-18T10:00:00.000Z',
              size: '4096',
            },
          ],
        }),
        { status: 200 }
      )
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })
    const result = await service.findBackupFile()

    assert.ok(result)
    assert.equal(result.id, 'file-drive-123')
    assert.equal(result.name, DRIVE_BACKUP_FILENAME)
    assert.equal(result.size, 4096)
    assert.equal(result.isDuplicateFound, false)
  })

  // 11. Drive API: Duplicate handling WITHOUT deletion (Milestone 4.4 Change 1)
  it('selects newest file when duplicates exist and does NOT delete older files', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    let deleteCalled = false

    const mockFetch: typeof fetch = async (_input, init) => {
      if (init?.method === 'DELETE') {
        deleteCalled = true
        return new Response('', { status: 204 })
      }
      return new Response(
        JSON.stringify({
          files: [
            {
              id: 'older-file-1',
              name: DRIVE_BACKUP_FILENAME,
              modifiedTime: '2026-09-15T08:00:00.000Z',
              size: '2000',
            },
            {
              id: 'newest-file-2',
              name: DRIVE_BACKUP_FILENAME,
              modifiedTime: '2026-09-18T12:00:00.000Z',
              size: '5000',
            },
            {
              id: 'intermediate-file-3',
              name: DRIVE_BACKUP_FILENAME,
              modifiedTime: '2026-09-17T09:00:00.000Z',
              size: '3000',
            },
          ],
        }),
        { status: 200 }
      )
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })
    const result = await service.findBackupFile()

    assert.ok(result)
    assert.equal(result.id, 'newest-file-2') // Picked newest
    assert.equal(result.isDuplicateFound, true)
    assert.equal(result.duplicateCount, 3)
    assert.equal(deleteCalled, false) // Strictly no deletion!
  })

  // 12. Upload new backup (multipart POST)
  it('creates new backup in appDataFolder using multipart POST when absent', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    let postCalled = false
    let postBody = ''
    let postContentType = ''

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      if (init?.method === 'GET') {
        // First check: no file
        return new Response(JSON.stringify({ files: [] }), { status: 200 })
      }
      if (init?.method === 'POST') {
        postCalled = true
        postBody = String(init.body)
        postContentType = (init.headers as Record<string, string>)['Content-Type'] || ''
        assert.ok(url.includes('uploadType=multipart'))
        return new Response(
          JSON.stringify({
            id: 'newly-created-id',
            name: DRIVE_BACKUP_FILENAME,
            modifiedTime: '2026-09-18T14:00:00.000Z',
            size: '150',
          }),
          { status: 200 }
        )
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`)
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })
    const meta = await service.uploadBackup('{"hello":"world"}')

    assert.ok(postCalled)
    assert.equal(meta.id, 'newly-created-id')
    assert.ok(postContentType.includes('multipart/related'))
    assert.ok(postBody.includes('appDataFolder'))
    assert.ok(postBody.includes('{"hello":"world"}'))
  })

  // 13. Update existing backup (media PATCH)
  it('updates existing backup using PATCH media when file already exists', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    let patchCalled = false
    let patchUrl = ''
    let patchBody = ''

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      if (init?.method === 'GET') {
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'existing-backup-id',
                name: DRIVE_BACKUP_FILENAME,
                modifiedTime: '2026-09-18T10:00:00.000Z',
                size: '200',
              },
            ],
          }),
          { status: 200 }
        )
      }
      if (init?.method === 'PATCH') {
        patchCalled = true
        patchUrl = url
        patchBody = String(init.body)
        return new Response(
          JSON.stringify({
            id: 'existing-backup-id',
            name: DRIVE_BACKUP_FILENAME,
            modifiedTime: '2026-09-18T14:30:00.000Z',
            size: '300',
          }),
          { status: 200 }
        )
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`)
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })
    const meta = await service.uploadBackup('{"updated":"content"}')

    assert.ok(patchCalled)
    assert.equal(meta.id, 'existing-backup-id')
    assert.ok(patchUrl.includes('/existing-backup-id?uploadType=media'))
    assert.equal(patchBody, '{"updated":"content"}')
  })

  // 14. Download backup
  it('downloads raw JSON content from appDataFolder', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    const expectedContent = '{"schemaVersion":1,"data":{"matches":[]}}'

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes('alt=media')) {
        assert.ok(url.includes('/existing-id?alt=media'))
        return new Response(expectedContent, { status: 200 })
      }
      return new Response(
        JSON.stringify({
          files: [
            {
              id: 'existing-id',
              name: DRIVE_BACKUP_FILENAME,
              modifiedTime: '2026-09-18T11:00:00.000Z',
              size: '40',
            },
          ],
        }),
        { status: 200 }
      )
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })
    const content = await service.downloadBackup()

    assert.equal(content, expectedContent)
  })

  // 15. Download fails when no backup file exists
  it('throws BACKUP_FILE_NOT_FOUND when attempting to download non-existent backup', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })

    await assert.rejects(
      async () => service.downloadBackup(),
      (err: unknown) => {
        assert.ok(err instanceof GoogleDriveError)
        assert.equal(err.code, 'BACKUP_FILE_NOT_FOUND')
        return true
      }
    )
  })

  // 16. Drive API errors handling
  it('handles Drive API 500 error gracefully with DRIVE_API_ERROR', async () => {
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    const mockFetch: typeof fetch = async () => {
      return new Response('Internal Server Error', { status: 500 })
    }

    const service = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })

    await assert.rejects(
      async () => service.findBackupFile(),
      (err: unknown) => {
        assert.ok(err instanceof GoogleDriveError)
        assert.equal(err.code, 'DRIVE_API_ERROR')
        assert.equal(err.status, 500)
        return true
      }
    )
  })

  // 17. Security: Token leakage prevention
  it('sanitizes and redacts access tokens from all error messages and details', () => {
    const sensitiveToken = 'ya29.a0AfH6SMD_very_secret_oauth_token_xyz_12345'
    const error = new GoogleDriveError(
      'DRIVE_API_ERROR',
      `Failed request with Authorization: Bearer ${sensitiveToken} and ${sensitiveToken}`,
      401,
      { token: sensitiveToken, userToken: sensitiveToken, status: 'failed' }
    )

    // Token must be stripped from message
    assert.equal(error.message.includes(sensitiveToken), false)
    assert.ok(error.message.includes('[REDACTED]'))

    // Token must be stripped from details
    const details = error.details as Record<string, unknown>
    assert.equal(details.token, '[REDACTED]')
    assert.equal(details.userToken, '[REDACTED]')
  })

  // 18. Architectural Separation: End-to-end BackupService <-> GoogleDriveService roundtrip
  it('verifies strict architectural flow: BackupService creates/validates <-> GoogleDriveService transports', async () => {
    // A. Populate local DB with sample match
    const testMatch: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId: 'drive-test-match-1',
      teamOne: 'Challengers',
      teamTwo: 'Warriors',
      firstBattingHome: true,
      overs: '10',
      totalOvers: 10,
      status: 'completed',
      score: { runs: 120, wickets: 4, overs: 10 },
      updatedAt: '2026-09-18T10:00:00.000Z',
      completedAt: '2026-09-18T10:00:00.000Z',
      battingRoster: [],
      bowlingRoster: [],
      matchResult: { winner: 'Challengers', margin: '20 runs' },
    }
    await matchRepository.saveMatch(testMatch)

    // B. BackupService creates and serializes snapshot (GoogleDriveService has NO domain knowledge)
    const snapshot = await createSnapshot()
    const serializedJson = serializeSnapshot(snapshot)

    // C. GoogleDriveService transports JSON to mock Drive
    let cloudStorage = ''
    const tokenProvider = new MockTokenProvider({
      accessToken: 'valid-transport-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: DRIVE_APPDATA_SCOPE,
    })

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      if (init?.method === 'GET' && !url.includes('alt=media')) {
        // Query appDataFolder
        if (cloudStorage.length === 0) {
          return new Response(JSON.stringify({ files: [] }), { status: 200 })
        }
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'cloud-file-id-1',
                name: DRIVE_BACKUP_FILENAME,
                modifiedTime: new Date().toISOString(),
                size: String(cloudStorage.length),
              },
            ],
          }),
          { status: 200 }
        )
      }
      if (init?.method === 'POST') {
        // Create backup
        cloudStorage = serializedJson
        return new Response(
          JSON.stringify({
            id: 'cloud-file-id-1',
            name: DRIVE_BACKUP_FILENAME,
            modifiedTime: new Date().toISOString(),
            size: String(cloudStorage.length),
          }),
          { status: 200 }
        )
      }
      if (init?.method === 'GET' && url.includes('alt=media')) {
        // Download backup
        return new Response(cloudStorage, { status: 200 })
      }
      throw new Error(`Unexpected call: ${init?.method} ${url}`)
    }

    const driveService = new GoogleDriveService({ tokenProvider, fetchFn: mockFetch })
    await driveService.uploadBackup(serializedJson)

    // D. Clear local database completely
    await closeDatabase()
    setDatabaseFactory(new IDBFactory())
    assert.equal((await matchRepository.listMatches()).length, 0)

    // E. GoogleDriveService downloads raw JSON
    const downloadedRawJson = await driveService.downloadBackup()
    assert.equal(typeof downloadedRawJson, 'string')

    // F. BackupService validates downloaded JSON completely before any restore
    const validatedSnapshot = await validateBackup(downloadedRawJson)
    assert.equal(validatedSnapshot.metadata.matchCount, 1)
    assert.equal(validatedSnapshot.data.matches[0].matchId, 'drive-test-match-1')

    // G. BackupService atomically restores the validated snapshot
    const restoreResult = await restoreBackup(validatedSnapshot, { mode: 'replace' })
    assert.equal(restoreResult.matchesAdded, 1)

    // H. Verify restored match in IndexedDB
    const restored = await matchRepository.getMatch('drive-test-match-1')
    assert.ok(restored)
    assert.equal(restored.teamOne, 'Challengers')
    assert.equal(restored.teamTwo, 'Warriors')
  })
})
