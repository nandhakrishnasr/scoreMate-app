import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  NativeAndroidOAuthProvider,
  UnsupportedPlatformOAuthProvider,
  createDefaultOAuthTokenProvider,
} from '../src/services/googleDriveOAuthProvider.ts'
import {
  GoogleDriveService,
  GoogleDriveError,
  GisOAuthProvider,
  DRIVE_APPDATA_SCOPE,
  type OAuthToken,
  type OAuthTokenProvider,
} from '../src/services/googleDriveService.ts'

describe('Android-Native Google Drive OAuth Provider', () => {

  // 1. Platform routing tests
  describe('Platform Routing Factory', () => {
    it('selects NativeAndroidOAuthProvider when running on native Android', () => {
      const provider = createDefaultOAuthTokenProvider({ platform: 'android', isNative: true })
      assert.ok(provider instanceof NativeAndroidOAuthProvider)
    })

    it('selects GisOAuthProvider when running on Web / PWA', () => {
      const provider = createDefaultOAuthTokenProvider({ platform: 'web', isNative: false })
      assert.ok(provider instanceof GisOAuthProvider)
    })

    it('selects UnsupportedPlatformOAuthProvider when running on native iOS (does NOT route to Android)', () => {
      const provider = createDefaultOAuthTokenProvider({ platform: 'ios', isNative: true })
      assert.ok(provider instanceof UnsupportedPlatformOAuthProvider)
      assert.equal(provider instanceof NativeAndroidOAuthProvider, false)
      assert.equal(provider.isConfigured(), false)
    })

    it('unsupported platform throws explicit OAUTH_NOT_CONFIGURED mentioning platform', async () => {
      const provider = new UnsupportedPlatformOAuthProvider('iOS')
      await assert.rejects(
        async () => provider.requestToken(),
        (err: unknown) => {
          assert.ok(err instanceof GoogleDriveError)
          assert.equal(err.code, 'OAUTH_NOT_CONFIGURED')
          assert.match(err.message, /iOS/)
          return true
        }
      )
    })
  })

  // 2. NativeAndroidOAuthProvider requests exact scope and returns accessToken
  describe('NativeAndroidOAuthProvider Authentication Flow', () => {
    it('requests drive.appdata scope with skipNativeAuth: true and returns memory-only token', async () => {
      let passedOptions: unknown = null
      const authBridge = {
        signInWithGoogle: async (options: unknown) => {
          passedOptions = options
          return {
            credential: {
              accessToken: 'ya29.test_android_native_access_token_abc123',
              idToken: 'test_id_token',
            },
          }
        },
      }

      const provider = new NativeAndroidOAuthProvider({ authBridge })
      assert.equal(provider.getInMemoryToken(), null)

      const token = await provider.requestToken(true)

      // Verify exact scope, skipNativeAuth: true, and useCredentialManager: false
      assert.deepEqual(passedOptions, {
        scopes: [DRIVE_APPDATA_SCOPE],
        skipNativeAuth: true,
        useCredentialManager: false,
      })

      // Verify token payload
      assert.equal(token.accessToken, 'ya29.test_android_native_access_token_abc123')
      assert.equal(token.scope, DRIVE_APPDATA_SCOPE)
      assert.ok(token.expiresAt > Date.now())

      // Verify token is available in memory
      assert.equal(provider.getInMemoryToken(), token)
    })

    it('maintains strict in-memory token lifecycle: never persisted in storage', async () => {
      const secretToken = 'ya29.ephemeral_in_memory_only_token_456'
      const authBridge = {
        signInWithGoogle: async () => ({
          credential: { accessToken: secretToken },
        }),
      }

      const storageEntries = new Map<string, string>()
      const mockStorage = {
        getItem: (k: string) => storageEntries.get(k) ?? null,
        setItem: (k: string, v: string) => storageEntries.set(k, v),
        removeItem: (k: string) => storageEntries.delete(k),
        clear: () => storageEntries.clear(),
        get length() {
          return storageEntries.size
        },
        key: (i: number) => Array.from(storageEntries.keys())[i] ?? null,
      }
      // @ts-expect-error Mocking storage
      globalThis.localStorage = mockStorage
      // @ts-expect-error Mocking storage
      globalThis.sessionStorage = mockStorage

      const provider = new NativeAndroidOAuthProvider({ authBridge })
      await provider.requestToken()

      // Verify token exists in memory
      assert.equal(provider.getInMemoryToken()?.accessToken, secretToken)

      // Verify token NEVER exists in localStorage or sessionStorage
      assert.equal(storageEntries.size, 0)
      for (const [key, value] of storageEntries.entries()) {
        assert.doesNotMatch(key, /token/i)
        assert.doesNotMatch(value, new RegExp(secretToken))
      }

      // Verify clearToken clears memory
      provider.clearToken()
      assert.equal(provider.getInMemoryToken(), null)
    })

    it('returns cached valid token without calling native bridge on non-interactive request', async () => {
      let callCount = 0
      const authBridge = {
        signInWithGoogle: async () => {
          callCount++
          return {
            credential: { accessToken: `ya29.token_call_${callCount}` },
          }
        },
      }

      const provider = new NativeAndroidOAuthProvider({ authBridge })
      const firstToken = await provider.requestToken(true)
      assert.equal(callCount, 1)

      // Non-interactive second call should return cached token
      const secondToken = await provider.requestToken(false)
      assert.equal(callCount, 1)
      assert.equal(secondToken.accessToken, firstToken.accessToken)

      // Interactive call should refresh from native bridge
      const thirdToken = await provider.requestToken(true)
      assert.equal(callCount, 2)
      assert.notEqual(thirdToken.accessToken, firstToken.accessToken)
    })

    it('maps user cancellation into OAUTH_CANCELLED error', async () => {
      const authBridge = {
        signInWithGoogle: async () => {
          throw new Error('User canceled the sign-in flow (12501)')
        },
      }

      const provider = new NativeAndroidOAuthProvider({ authBridge })
      await assert.rejects(
        async () => provider.requestToken(true),
        (err: unknown) => {
          assert.ok(err instanceof GoogleDriveError)
          assert.equal(err.code, 'OAUTH_CANCELLED')
          assert.match(err.message, /cancelled/)
          return true
        }
      )
    })

    it('maps missing credentials/token into OAUTH_AUTHORIZATION_REQUIRED error', async () => {
      const authBridge = {
        signInWithGoogle: async () => ({
          credential: {}, // No accessToken returned
        }),
      }

      const provider = new NativeAndroidOAuthProvider({ authBridge })
      await assert.rejects(
        async () => provider.requestToken(true),
        (err: unknown) => {
          assert.ok(err instanceof GoogleDriveError)
          assert.equal(err.code, 'OAUTH_AUTHORIZATION_REQUIRED')
          return true
        }
      )
    })

    it('maps network errors into NETWORK_ERROR code', async () => {
      const authBridge = {
        signInWithGoogle: async () => {
          throw new Error('Network error: device is offline')
        },
      }

      const provider = new NativeAndroidOAuthProvider({ authBridge })
      await assert.rejects(
        async () => provider.requestToken(true),
        (err: unknown) => {
          assert.ok(err instanceof GoogleDriveError)
          assert.equal(err.code, 'NETWORK_ERROR')
          return true
        }
      )
    })
  })

  // 3. 401 retry behavior in GoogleDriveService
  describe('GoogleDriveService 401 Token Refresh and Retry', () => {
    class ControllableMockTokenProvider implements OAuthTokenProvider {
      private token: OAuthToken | null = null
      public requestCount = 0
      public clearCount = 0

      constructor(initialToken: string) {
        this.token = {
          accessToken: initialToken,
          expiresAt: Date.now() + 3600 * 1000,
          scope: DRIVE_APPDATA_SCOPE,
        }
      }

      isConfigured(): boolean {
        return true
      }

      getInMemoryToken(): OAuthToken | null {
        return this.token
      }

      clearToken(): void {
        this.clearCount++
        this.token = null
      }

      async revokeToken(): Promise<void> {
        this.clearToken()
      }

      async requestToken(): Promise<OAuthToken> {
        this.requestCount++
        this.token = {
          accessToken: `ya29.refreshed_token_${this.requestCount}`,
          expiresAt: Date.now() + 3600 * 1000,
          scope: DRIVE_APPDATA_SCOPE,
        }
        return this.token
      }
    }

    it('retries request exactly once with a refreshed token when Drive returns 401', async () => {
      const mockProvider = new ControllableMockTokenProvider('ya29.stale_token')
      const tokensReceived: string[] = []

      const mockFetch: typeof fetch = async (_url, init) => {
        const authHeader = (init?.headers as Record<string, string>)?.['Authorization'] || ''
        const token = authHeader.replace('Bearer ', '')
        tokensReceived.push(token)

        if (token === 'ya29.stale_token') {
          return new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), {
            status: 401,
          })
        }

        return new Response(
          JSON.stringify({
            files: [{ id: 'file-xyz', name: 'scoremate_backup.json', size: '100' }],
          }),
          { status: 200 }
        )
      }

      const service = new GoogleDriveService({
        tokenProvider: mockProvider,
        fetchFn: mockFetch,
      })

      const fileMeta = await service.findBackupFile()

      assert.ok(fileMeta)
      assert.equal(fileMeta.id, 'file-xyz')
      assert.equal(mockProvider.clearCount, 1)
      assert.equal(mockProvider.requestCount, 1)
      assert.deepEqual(tokensReceived, ['ya29.stale_token', 'ya29.refreshed_token_1'])
    })

    it('throws DRIVE_API_ERROR if 401 persists after retry without looping', async () => {
      const mockProvider = new ControllableMockTokenProvider('ya29.stale_token')
      let fetchCount = 0

      const mockFetch: typeof fetch = async () => {
        fetchCount++
        return new Response(JSON.stringify({ error: 'Still 401 Unauthorized' }), { status: 401 })
      }

      const service = new GoogleDriveService({
        tokenProvider: mockProvider,
        fetchFn: mockFetch,
      })

      await assert.rejects(
        async () => service.findBackupFile(),
        (err: unknown) => {
          assert.ok(err instanceof GoogleDriveError)
          assert.equal(err.code, 'DRIVE_API_ERROR')
          assert.equal(err.status, 401)
          return true
        }
      )

      // Initial call + exactly one retry = 2 fetch calls
      assert.equal(fetchCount, 2)
      assert.equal(mockProvider.clearCount, 1)
    })
  })
})
