/**
 * ScoreMate Google Drive Backup Transport Service (Milestone 4.4)
 *
 * Responsibilities:
 * - OAuth 2.0 token provider abstraction (supports Web GIS and future native Capacitor/Mobile providers)
 * - Ephemeral in-memory token lifecycle (NEVER persisted to localStorage, sessionStorage, IndexedDB, or Firestore)
 * - Expiration buffering (120s buffer) and automatic renewal handling
 * - Explicit OAuth revocation on disconnect vs. silent token drop on Firebase sign-out
 * - Google Drive REST API v3 transport for appDataFolder
 * - Discover, upload (create/update), and download 'scoremate_backup.json'
 * - Duplicate discovery without destructive deletion
 * - Structured errors with complete token leakage prevention
 *
 * ARCHITECTURAL CONSTRAINT:
 * GoogleDriveService is strictly a transport and authorization layer.
 * Domain logic (snapshot creation, checksums, canonicalization, validation, restore, merge/replace)
 * is authoritative only inside BackupService.
 */

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
export const DRIVE_BACKUP_FILENAME = 'scoremate_backup.json'
export const DRIVE_API_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
export const DRIVE_UPLOAD_FILES_URL = 'https://www.googleapis.com/upload/drive/v3/files'
export const TOKEN_EXPIRY_BUFFER_MS = 120 * 1000 // 2 minutes buffer

import { createDefaultOAuthTokenProvider } from './googleDriveOAuthProvider.ts'


export type GoogleDriveErrorCode =
  | 'OAUTH_NOT_CONFIGURED'
  | 'OAUTH_INITIALIZATION_FAILED'
  | 'OAUTH_AUTHORIZATION_REQUIRED'
  | 'OAUTH_REAUTHORIZATION_REQUIRED'
  | 'OAUTH_CANCELLED'
  | 'DRIVE_API_ERROR'
  | 'BACKUP_FILE_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'REVOCATION_FAILED'

export class GoogleDriveError extends Error {
  readonly code: GoogleDriveErrorCode
  readonly status?: number
  readonly details?: unknown

  constructor(code: GoogleDriveErrorCode, message: string, status?: number, details?: unknown) {
    // Strip any possible access token substrings from message and details
    const sanitizedMsg = sanitizeErrorString(message)
    super(`[${code}] ${sanitizedMsg}`)
    this.name = 'GoogleDriveError'
    this.code = code
    this.status = status
    this.details = details ? sanitizeObject(details) : undefined
  }
}

export interface DriveFileMetadata {
  id: string
  name: string
  modifiedTime: string
  size: number
  isDuplicateFound?: boolean
  duplicateCount?: number
}

export interface OAuthToken {
  accessToken: string
  expiresAt: number // epoch ms
  scope: string
}

/**
 * Platform-agnostic OAuth Token Provider abstraction.
 * Decouples GoogleDriveService from browser-specific GIS so native Capacitor/Mobile
 * providers can be plugged in without changing Drive transport logic.
 */
export interface OAuthTokenProvider {
  isConfigured(): boolean
  getInMemoryToken(): OAuthToken | null
  requestToken(interactive?: boolean): Promise<OAuthToken>
  revokeToken(token: string): Promise<void>
  clearToken(): void
}

// Helpers for token leakage prevention
function sanitizeErrorString(str: string): string {
  if (!str || typeof str !== 'string') return ''
  // Redact Bearer tokens, ya29. tokens, and raw credentials
  return str
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]')
    .replace(/ya29\.[A-Za-z0-9_.-]+/gi, 'ya29.[REDACTED]')
}

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeErrorString(obj) : obj
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject)
  }
  const clean: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
      clean[key] = '[REDACTED]'
    } else {
      clean[key] = sanitizeObject(val)
    }
  }
  return clean
}

// Environment accessor safe for Vite and Node test runners
function getEnvVariable(key: string): string | undefined {
  const globalProcess =
    typeof globalThis !== 'undefined' && 'process' in globalThis
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      : undefined

  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as unknown as Record<string, string | undefined>)
      : globalProcess?.env ?? {}

  return env[key]
}

// GIS Script Types (Window global google.accounts.oauth2)
export interface GisTokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
  error_description?: string
  error_uri?: string
}

export interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

export interface GisTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GisTokenResponse) => void
  error_callback?: (err: unknown) => void
}

export interface GisGlobalAdapter {
  initTokenClient: (config: GisTokenClientConfig) => GisTokenClient
  revoke: (accessToken: string, done: () => void) => void
  loadScript?: () => Promise<void>
}

/**
 * Web Google Identity Services (GIS) OAuth Token Provider.
 * Holds token strictly in memory and coordinates silent renewal / interactive prompts.
 */
export class GisOAuthProvider implements OAuthTokenProvider {
  private clientId: string
  private scope: string
  private inMemoryToken: OAuthToken | null = null
  private gisAdapter?: GisGlobalAdapter

  constructor(config?: { clientId?: string; scope?: string; gisAdapter?: GisGlobalAdapter }) {
    this.clientId =
      config?.clientId !== undefined
        ? config.clientId
        : (getEnvVariable('VITE_GOOGLE_CLIENT_ID') ||
           '772863652395-h4olkmum81i58o40soh0irqlhafjsp4n.apps.googleusercontent.com')
    this.scope = config?.scope || DRIVE_APPDATA_SCOPE
    this.gisAdapter = config?.gisAdapter
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientId.trim().length > 0)
  }

  getInMemoryToken(): OAuthToken | null {
    return this.inMemoryToken
  }

  clearToken(): void {
    this.inMemoryToken = null
  }

  setGisAdapter(adapter: GisGlobalAdapter): void {
    this.gisAdapter = adapter
  }

  setClientId(clientId: string): void {
    this.clientId = clientId
  }

  private isTokenValid(token: OAuthToken | null): boolean {
    if (!token || !token.accessToken) return false
    return Date.now() < token.expiresAt - TOKEN_EXPIRY_BUFFER_MS
  }

  private async getGisAdapter(): Promise<GisGlobalAdapter> {
    if (this.gisAdapter) return this.gisAdapter

    // Check browser window
    const gWindow = globalThis as unknown as {
      google?: {
        accounts?: {
          oauth2?: {
            initTokenClient: (config: GisTokenClientConfig) => GisTokenClient
            revoke: (accessToken: string, done: () => void) => void
          }
        }
      }
    }

    if (gWindow.google?.accounts?.oauth2) {
      return gWindow.google.accounts.oauth2
    }

    // Attempt to load script dynamically in browser
    if (typeof document !== 'undefined') {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
        if (existing) {
          existing.addEventListener('load', () => resolve())
          existing.addEventListener('error', () =>
            reject(new GoogleDriveError('OAUTH_INITIALIZATION_FAILED', 'Failed to load Google Identity Services script.'))
          )
          if (gWindow.google?.accounts?.oauth2) resolve()
          return
        }

        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = () => resolve()
        script.onerror = () =>
          reject(new GoogleDriveError('OAUTH_INITIALIZATION_FAILED', 'Failed to load Google Identity Services script.'))
        document.head.appendChild(script)
      })

      if (gWindow.google?.accounts?.oauth2) {
        return gWindow.google.accounts.oauth2
      }
    }

    throw new GoogleDriveError(
      'OAUTH_INITIALIZATION_FAILED',
      'Google Identity Services is not available in the current environment.'
    )
  }

  async requestToken(interactive = false): Promise<OAuthToken> {
    if (!this.isConfigured()) {
      throw new GoogleDriveError(
        'OAUTH_NOT_CONFIGURED',
        'Google Client ID is missing. Set VITE_GOOGLE_CLIENT_ID in environment or pass clientId to provider.'
      )
    }

    // Return existing token if valid within buffer and not forcing interactive consent
    if (!interactive && this.isTokenValid(this.inMemoryToken)) {
      return this.inMemoryToken!
    }

    const adapter = await this.getGisAdapter()

    return new Promise<OAuthToken>((resolve, reject) => {
      let settled = false

      const tokenClient = adapter.initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        callback: (resp: GisTokenResponse) => {
          if (settled) return
          settled = true

          if (resp.error) {
            if (resp.error === 'access_denied') {
              reject(new GoogleDriveError('OAUTH_CANCELLED', 'Google Drive authorization was denied or cancelled.'))
              return
            }
            if (resp.error === 'interaction_required' || resp.error === 'consent_required') {
              reject(
                new GoogleDriveError(
                  'OAUTH_REAUTHORIZATION_REQUIRED',
                  'Google authorization requires interactive user consent.'
                )
              )
              return
            }
            reject(
              new GoogleDriveError(
                'OAUTH_AUTHORIZATION_REQUIRED',
                resp.error_description || resp.error || 'Failed to authorize Google Drive.'
              )
            )
            return
          }

          if (!resp.access_token) {
            reject(new GoogleDriveError('OAUTH_AUTHORIZATION_REQUIRED', 'No access token received from Google.'))
            return
          }

          const expiresInSec = typeof resp.expires_in === 'number' ? resp.expires_in : 3600
          const token: OAuthToken = {
            accessToken: resp.access_token,
            expiresAt: Date.now() + expiresInSec * 1000,
            scope: resp.scope || this.scope,
          }

          this.inMemoryToken = token
          resolve(token)
        },
        error_callback: (err: unknown) => {
          if (settled) return
          settled = true
          reject(new GoogleDriveError('OAUTH_AUTHORIZATION_REQUIRED', 'OAuth request encountered an error.', undefined, err))
        },
      })

      // If interactive: prompt user consent / account chooser
      // If silent: prompt '' (does not show popup if already authorized; fails gracefully if interaction required)
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' })
    })
  }

  async revokeToken(token: string): Promise<void> {
    const adapter = await this.getGisAdapter()
    return new Promise<void>((resolve, reject) => {
      try {
        adapter.revoke(token, () => {
          this.clearToken()
          resolve()
        })
      } catch (err) {
        this.clearToken()
        reject(new GoogleDriveError('REVOCATION_FAILED', 'Failed to revoke Google authorization.', undefined, err))
      }
    })
  }
}

export interface GoogleDriveServiceOptions {
  tokenProvider?: OAuthTokenProvider
  fetchFn?: typeof fetch
}

/**
 * ScoreMate GoogleDriveService
 * Authoritative transport client for Google Drive appDataFolder backup file.
 */
export class GoogleDriveService {
  private customTokenProvider?: OAuthTokenProvider
  private fetchFn: typeof fetch
  private cachedFileMetadata: DriveFileMetadata | null = null

  constructor(options?: GoogleDriveServiceOptions) {
    if (options?.tokenProvider) {
      this.customTokenProvider = options.tokenProvider
    }
    this.fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis)
  }

  setTokenProvider(provider: OAuthTokenProvider): void {
    this.customTokenProvider = provider
  }

  getTokenProvider(): OAuthTokenProvider {
    return this.customTokenProvider ?? createDefaultOAuthTokenProvider()
  }

  private get tokenProvider(): OAuthTokenProvider {
    return this.getTokenProvider()
  }

  setFetch(fetchFn: typeof fetch): void {
    this.fetchFn = fetchFn
  }

  isConfigured(): boolean {
    return this.tokenProvider.isConfigured()
  }

  isConnected(): boolean {
    const token = this.tokenProvider.getInMemoryToken()
    if (!token) return false
    return Date.now() < token.expiresAt - TOKEN_EXPIRY_BUFFER_MS
  }

  getStoredFileMetadata(): DriveFileMetadata | null {
    return this.cachedFileMetadata
  }

  /**
   * Acquire a valid in-memory token, attempting silent renewal if expired,
   * or prompting interactively if requested or required.
   */
  async authorize(interactive = false): Promise<OAuthToken> {
    return this.tokenProvider.requestToken(interactive)
  }

  /**
   * Clear the in-memory access token without calling Google revocation.
   * MUST be called on Firebase sign-out so orphaned tokens do not linger in memory.
   */
  clearToken(): void {
    this.tokenProvider.clearToken()
    this.cachedFileMetadata = null
  }

  /**
   * Explicitly disconnect Google Drive.
   * Revokes the OAuth grant on Google servers and purges in-memory token and cached file metadata.
   */
  async disconnect(): Promise<void> {
    const token = this.tokenProvider.getInMemoryToken()
    this.cachedFileMetadata = null
    if (token?.accessToken) {
      await this.tokenProvider.revokeToken(token.accessToken)
    } else {
      this.tokenProvider.clearToken()
    }
  }

  private async getValidToken(): Promise<OAuthToken> {
    const token = this.tokenProvider.getInMemoryToken()
    if (token && Date.now() < token.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
      return token
    }
    // Attempt silent non-interactive renewal first
    try {
      return await this.tokenProvider.requestToken(false)
    } catch (err) {
      if (err instanceof GoogleDriveError && err.code === 'OAUTH_REAUTHORIZATION_REQUIRED') {
        throw err
      }
      throw new GoogleDriveError(
        'OAUTH_REAUTHORIZATION_REQUIRED',
        'Google Drive authorization has expired. Interactive authorization required.',
        undefined,
        err
      )
    }
  }

  /**
   * Execute an authenticated HTTP operation with automatic 401 token retry.
   * If Drive returns 401 (token expired/invalidated), purges memory token,
   * requests a fresh token, and retries the operation exactly once.
   */
  private async executeWithAuthRetry(
    operation: (token: OAuthToken) => Promise<Response>
  ): Promise<Response> {
    let token = await this.getValidToken()
    let resp: Response
    try {
      resp = await operation(token)
    } catch (err) {
      throw new GoogleDriveError('NETWORK_ERROR', 'Network error connecting to Google Drive API.', undefined, err)
    }

    if (resp.status === 401) {
      this.tokenProvider.clearToken()
      try {
        try {
          token = await this.tokenProvider.requestToken(false)
        } catch {
          token = await this.tokenProvider.requestToken(true)
        }
      } catch (err) {
        if (err instanceof GoogleDriveError) throw err
        throw new GoogleDriveError(
          'OAUTH_REAUTHORIZATION_REQUIRED',
          'Google Drive authorization has expired. Re-authorization required.',
          undefined,
          err
        )
      }

      try {
        resp = await operation(token)
      } catch (err) {
        throw new GoogleDriveError('NETWORK_ERROR', 'Network error connecting to Google Drive API.', undefined, err)
      }
    }

    return resp
  }

  /**
   * Search appDataFolder for existing 'scoremate_backup.json' files.
   *
   * RULE (Milestone 4.4 Change 1):
   * If multiple duplicate backup files exist, select the newest by modifiedTime
   * for normal retrieval. Do NOT delete, trash, or mutate older files.
   */
  async findBackupFile(): Promise<DriveFileMetadata | null> {
    const query = `name = '${DRIVE_BACKUP_FILENAME}' and trashed = false`
    const url = new URL(DRIVE_API_FILES_URL)
    url.searchParams.set('spaces', 'appDataFolder')
    url.searchParams.set('q', query)
    url.searchParams.set('fields', 'files(id, name, modifiedTime, size)')

    const resp = await this.executeWithAuthRetry((token) =>
      this.fetchFn(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      })
    )

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new GoogleDriveError(
        'DRIVE_API_ERROR',
        `Drive query failed with status ${resp.status}: ${errText}`,
        resp.status
      )
    }

    const data = (await resp.json()) as {
      files?: Array<{ id: string; name: string; modifiedTime?: string; size?: string }>
    }

    const files = data.files || []
    if (files.length === 0) {
      this.cachedFileMetadata = null
      return null
    }

    // Sort descending by modifiedTime to pick the newest
    files.sort((a, b) => {
      const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
      const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
      return timeB - timeA
    })

    const primary = files[0]
    const metadata: DriveFileMetadata = {
      id: primary.id,
      name: primary.name,
      modifiedTime: primary.modifiedTime || new Date().toISOString(),
      size: primary.size ? parseInt(primary.size, 10) : 0,
      isDuplicateFound: files.length > 1,
      duplicateCount: files.length,
    }

    this.cachedFileMetadata = metadata
    return metadata
  }

  /**
   * Upload backup content to appDataFolder.
   * If an existing file exists, update it via PATCH.
   * If absent, create it via multipart POST.
   */
  async uploadBackup(content: string): Promise<DriveFileMetadata> {
    const existing = await this.findBackupFile()

    if (existing) {
      // Update existing backup (PATCH media)
      const updateUrl = `${DRIVE_UPLOAD_FILES_URL}/${existing.id}?uploadType=media`
      const resp = await this.executeWithAuthRetry((token) =>
        this.fetchFn(updateUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: content,
        })
      )

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new GoogleDriveError(
          'DRIVE_API_ERROR',
          `Drive backup update failed with status ${resp.status}: ${errText}`,
          resp.status
        )
      }

      const updated = (await resp.json()) as { id: string; name: string; modifiedTime?: string; size?: string }
      const metadata: DriveFileMetadata = {
        id: updated.id || existing.id,
        name: updated.name || DRIVE_BACKUP_FILENAME,
        modifiedTime: updated.modifiedTime || new Date().toISOString(),
        size: updated.size ? parseInt(updated.size, 10) : content.length,
        isDuplicateFound: existing.isDuplicateFound,
        duplicateCount: existing.duplicateCount,
      }
      this.cachedFileMetadata = metadata
      return metadata
    } else {
      // Create new backup (POST multipart)
      const boundary = '-------ScoreMateDriveBoundary' + Date.now().toString(16)
      const metadataPart = JSON.stringify({
        name: DRIVE_BACKUP_FILENAME,
        parents: ['appDataFolder'],
      })

      const multipartBody =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadataPart}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`

      const createUrl = `${DRIVE_UPLOAD_FILES_URL}?uploadType=multipart`
      const resp = await this.executeWithAuthRetry((token) =>
        this.fetchFn(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        })
      )

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new GoogleDriveError(
          'DRIVE_API_ERROR',
          `Drive backup creation failed with status ${resp.status}: ${errText}`,
          resp.status
        )
      }

      const created = (await resp.json()) as { id: string; name: string; modifiedTime?: string; size?: string }
      const metadata: DriveFileMetadata = {
        id: created.id,
        name: created.name || DRIVE_BACKUP_FILENAME,
        modifiedTime: created.modifiedTime || new Date().toISOString(),
        size: created.size ? parseInt(created.size, 10) : content.length,
      }
      this.cachedFileMetadata = metadata
      return metadata
    }
  }

  /**
   * Download raw JSON backup content from appDataFolder.
   * Does NOT validate or restore the backup; caller must pass raw string
   * directly to BackupService.validateBackup().
   */
  async downloadBackup(): Promise<string> {
    const existing = await this.findBackupFile()

    if (!existing) {
      throw new GoogleDriveError(
        'BACKUP_FILE_NOT_FOUND',
        `No ScoreMate backup file ('${DRIVE_BACKUP_FILENAME}') found in Google Drive appDataFolder.`
      )
    }

    const downloadUrl = `${DRIVE_API_FILES_URL}/${existing.id}?alt=media`
    const resp = await this.executeWithAuthRetry((token) =>
      this.fetchFn(downloadUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      })
    )

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new GoogleDriveError(
        'DRIVE_API_ERROR',
        `Drive download failed with status ${resp.status}: ${errText}`,
        resp.status
      )
    }

    return resp.text()
  }
}

// Global singleton instance configured with default web GIS provider
export const googleDriveService = new GoogleDriveService()
