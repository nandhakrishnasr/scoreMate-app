import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import {
  GoogleDriveError,
  DRIVE_APPDATA_SCOPE,
  TOKEN_EXPIRY_BUFFER_MS,
  GisOAuthProvider,
  type OAuthToken,
  type OAuthTokenProvider,
} from './googleDriveService.ts'

/**
 * Android-Native Google Drive OAuth Provider (Milestone 4.4 / Android QA Pass)
 *
 * Responsibilities:
 * - Uses native Google Play Services authorization sheet via @capacitor-firebase/authentication
 * - Requests the 'https://www.googleapis.com/auth/drive.appdata' scope with skipNativeAuth: true
 * - Preserves existing Firebase user session (no sign-out, no duplicate native session)
 * - Holds access tokens strictly IN MEMORY (never written to localStorage, IndexedDB, Firestore, or files)
 * - Never persists refresh tokens
 * - Strips and sanitizes tokens from error representations
 */
export interface NativeGoogleAuthBridge {
  signInWithGoogle: (options?: {
    scopes?: string[]
    skipNativeAuth?: boolean
    useCredentialManager?: boolean
  }) => Promise<{
    credential?: {
      accessToken?: string
      idToken?: string
    } | null
  }>
}

export class NativeAndroidOAuthProvider implements OAuthTokenProvider {
  private scope: string
  private inMemoryToken: OAuthToken | null = null
  private authBridge: NativeGoogleAuthBridge

  constructor(config?: { scope?: string; authBridge?: NativeGoogleAuthBridge }) {
    this.scope = config?.scope || DRIVE_APPDATA_SCOPE
    this.authBridge = config?.authBridge ?? FirebaseAuthentication
  }

  isConfigured(): boolean {
    // Native Android relies on app package name and SHA-1 registered in Firebase / Google Cloud
    // It does not require VITE_GOOGLE_CLIENT_ID
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  }

  getInMemoryToken(): OAuthToken | null {
    return this.inMemoryToken
  }

  clearToken(): void {
    this.inMemoryToken = null
  }

  /**
   * Revokes the OAuth token on Google OAuth server and purges in-memory token.
   */
  async revokeToken(token: string): Promise<void> {
    this.clearToken()
    if (!token) return

    try {
      // Direct OAuth2 token revocation endpoint
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
    } catch {
      // Local session is already cleared; server-side revocation failure should not block disconnection
    }
  }

  /**
   * Request or refresh Google Drive access token using native Play Services authentication.
   */
  async requestToken(interactive = false): Promise<OAuthToken> {
    // Return existing token if still valid and not forcing interactive re-auth
    if (
      !interactive &&
      this.inMemoryToken &&
      Date.now() < this.inMemoryToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.inMemoryToken
    }

    try {
      // skipNativeAuth: true ensures the native plugin returns tokens without creating
      // a duplicate native Firebase session or signing out the JS Firebase session
      const result = await this.authBridge.signInWithGoogle({
        scopes: [this.scope],
        skipNativeAuth: true,
        useCredentialManager: false,
      })

      const accessToken = result?.credential?.accessToken
      if (!accessToken) {
        throw new GoogleDriveError(
          'OAUTH_AUTHORIZATION_REQUIRED',
          'No access token received from Google Play Services.'
        )
      }

      // Default to 1 hour expiration for Google OAuth tokens if not provided by native bridge
      const token: OAuthToken = {
        accessToken,
        expiresAt: Date.now() + 3600 * 1000,
        scope: this.scope,
      }

      this.inMemoryToken = token
      return token
    } catch (err: unknown) {
      if (err instanceof GoogleDriveError) {
        throw err
      }

      const rawMsg = err instanceof Error ? err.message : String(err)
      const lower = rawMsg.toLowerCase()

      // Detect user cancellation across Android Play Services error variants
      if (
        lower.includes('cancel') ||
        lower.includes('12501') ||
        lower.includes('closed') ||
        lower.includes('aborted')
      ) {
        throw new GoogleDriveError(
          'OAUTH_CANCELLED',
          'Google Drive authorization was cancelled.'
        )
      }

      if (lower.includes('network') || lower.includes('offline')) {
        throw new GoogleDriveError(
          'NETWORK_ERROR',
          'Network error connecting to Google services.',
          undefined,
          err
        )
      }

      throw new GoogleDriveError(
        'OAUTH_AUTHORIZATION_REQUIRED',
        rawMsg || 'Failed to authorize Google Drive on Android device.',
        undefined,
        err
      )
    }
  }
}

/**
 * Unsupported platform provider (e.g. iOS or unrecognized native environment).
 * Explicitly rejects without claiming Android OAuth support.
 */
export class UnsupportedPlatformOAuthProvider implements OAuthTokenProvider {
  private platformName: string

  constructor(platformName: string) {
    this.platformName = platformName
  }

  isConfigured(): boolean {
    return false
  }

  getInMemoryToken(): OAuthToken | null {
    return null
  }

  clearToken(): void {
    // No-op
  }

  async revokeToken(): Promise<void> {
    // No-op
  }

  async requestToken(): Promise<OAuthToken> {
    throw new GoogleDriveError(
      'OAUTH_NOT_CONFIGURED',
      `Google Drive backup is not currently supported on ${this.platformName}.`
    )
  }
}

/**
 * Factory for selecting the appropriate OAuthTokenProvider for the current runtime environment.
 * - Android Native -> NativeAndroidOAuthProvider
 * - iOS Native     -> UnsupportedPlatformOAuthProvider
 * - Web / PWA      -> GisOAuthProvider
 */
export function createDefaultOAuthTokenProvider(platformOverride?: {
  platform?: string
  isNative?: boolean
}): OAuthTokenProvider {
  const platform = platformOverride?.platform ?? Capacitor.getPlatform()
  const isNative = platformOverride?.isNative ?? Capacitor.isNativePlatform()

  if (isNative && platform === 'android') {
    return new NativeAndroidOAuthProvider()
  }

  if (isNative && platform === 'ios') {
    return new UnsupportedPlatformOAuthProvider('iOS')
  }

  return new GisOAuthProvider()
}
