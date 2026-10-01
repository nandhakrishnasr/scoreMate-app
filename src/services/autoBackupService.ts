import { createSnapshot, serializeSnapshot } from './backupService.ts'
import { googleDriveService } from './googleDriveService.ts'
import { settingsRepository } from './repositories/settingsRepository.ts'
import { firebaseAuth } from './firebase.ts'
import type { DriveFileMetadata } from './googleDriveService.ts'

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000 // 604,800,000 ms

export type AutoBackupSkipReason =
  | 'unauthenticated'
  | 'drive_not_configured'
  | 'silent_token_failed'
  | 'not_due'
  | 'already_running'
  | 'already_completed_this_session'
  | 'offline'
  | 'disabled'

export interface AutoBackupResult {
  attempted: boolean
  success: boolean
  skipReason?: AutoBackupSkipReason
  lastBackupAt?: string | null
  error?: string
  metadata?: DriveFileMetadata
  timestamp?: string
}

// Module-level concurrency & session guards
let isAutoBackupRunning = false
let sessionBackupCompleted = false

/**
 * Resets session guard (primarily for unit testing).
 */
export function resetSessionGuardForTesting(): void {
  isAutoBackupRunning = false
  sessionBackupCompleted = false
}

/**
 * Checks if automatic backup is currently executing.
 */
export function isAutomaticBackupInProgress(): boolean {
  return isAutoBackupRunning
}

/**
 * Evaluates whether a Google Drive backup is due based on the 7-day policy.
 *
 * Rules:
 * 1. null or undefined -> due (true)
 * 2. Corrupt or unparseable timestamp -> due (true, safe fallback)
 * 3. Future timestamp (clock drift/manual tampering) -> not due (false, prevents rapid loops)
 * 4. exactly 7 days -> due (true)
 * 5. >= 7 days -> due (true)
 * 6. < 7 days -> not due (false)
 */
export function isBackupDue(lastBackupAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastBackupAt) {
    return true
  }

  const parsed = Date.parse(lastBackupAt)
  if (isNaN(parsed)) {
    return true
  }

  // Handle future timestamps gracefully
  if (parsed > now) {
    return false
  }

  return now - parsed >= SEVEN_DAYS_MS
}

/**
 * Performs a BEST-EFFORT Google Drive backup on application startup.
 *
 * GUARANTEES:
 * 1. Non-blocking: Runs asynchronously without blocking UI or startup.
 * 2. Strictly non-interactive: Never displays an OAuth popup or prompt on startup.
 * 3. User isolation: Only runs for authenticated Firebase users (never offline guests).
 * 4. Authoritative persistence: Only updates lastSuccessfulDriveBackupAt after upload succeeds.
 * 5. Non-fatal: Errors are caught, logged, and never cause logouts, crashes, or data loss.
 */
export async function checkAndRunAutomaticBackup(options?: {
  injectedNow?: number
  forceCheck?: boolean
  bypassSessionGuard?: boolean
}): Promise<AutoBackupResult> {
  const now = options?.injectedNow ?? Date.now()

  // 1. Concurrency Guard
  if (isAutoBackupRunning) {
    return { attempted: false, success: false, skipReason: 'already_running' }
  }

  // 2. Session Guard (once per application session unless explicitly bypassed)
  if (!options?.bypassSessionGuard && sessionBackupCompleted) {
    return { attempted: false, success: false, skipReason: 'already_completed_this_session' }
  }

  // 3. Authentication Guard
  const user = firebaseAuth.currentUser
  const isGuest = typeof localStorage !== 'undefined' && localStorage.getItem('scoremate_offline_guest') === 'true'
  if (!user || isGuest) {
    return { attempted: false, success: false, skipReason: 'unauthenticated' }
  }

  // 4. Network Guard
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { attempted: false, success: false, skipReason: 'offline' }
  }

  // 5. Google Drive Configuration Guard
  if (!googleDriveService.isConfigured()) {
    return { attempted: false, success: false, skipReason: 'drive_not_configured' }
  }

  // Acquire concurrency lock synchronously before any async operations
  isAutoBackupRunning = true

  let lastBackupAt: string | null = null
  try {
    // 6. User Toggle Guard
    const autoBackupEnabled = await settingsRepository.isAutoBackupEnabled().catch(() => true)
    if (!autoBackupEnabled) {
      return { attempted: false, success: false, skipReason: 'disabled' }
    }
    // 6. Check 7-Day Eligibility
    try {
      lastBackupAt = await settingsRepository.getLastSuccessfulDriveBackupAt()
    } catch {
      // If settings store read fails, treat as null safely
      lastBackupAt = null
    }

    if (!options?.forceCheck && !isBackupDue(lastBackupAt, now)) {
      return {
        attempted: false,
        success: false,
        skipReason: 'not_due',
        lastBackupAt,
      }
    }

    // 7. Silent Token Acquisition Guard (STRICTLY NON-INTERACTIVE)
    // Automatic backup must NEVER surprise the user with an OAuth consent popup on startup.
    try {
      const tokenProvider = googleDriveService.getTokenProvider()
      const token = await tokenProvider.requestToken(false)
      if (!token?.accessToken) {
        return { attempted: false, success: false, skipReason: 'silent_token_failed' }
      }
    } catch {
      // Silent token request failed (e.g. consent needed, expired refresh) -> skip non-fatally
      return { attempted: false, success: false, skipReason: 'silent_token_failed' }
    }

    // 8. Execute Automatic Backup
    // A. Create snapshot from IndexedDB
    const snapshot = await createSnapshot()

    // B. Serialize snapshot to canonical JSON
    const json = serializeSnapshot(snapshot)

    // C. Upload to Google Drive appDataFolder
    const metadata = await googleDriveService.uploadBackup(json)

    // D. Persist authoritative timestamp ONLY after upload succeeds
    const successTimestamp = new Date(now).toISOString()
    await settingsRepository.setLastSuccessfulDriveBackupAt(successTimestamp)

    sessionBackupCompleted = true

    return {
      attempted: true,
      success: true,
      metadata,
      timestamp: successTimestamp,
      lastBackupAt: successTimestamp,
    }
  } catch (err) {
    // Non-fatal error handling: log and return structured result without crashing
    const message = err instanceof Error ? err.message : String(err)
    return {
      attempted: true,
      success: false,
      error: message,
      lastBackupAt,
    }
  } finally {
    isAutoBackupRunning = false
  }
}
