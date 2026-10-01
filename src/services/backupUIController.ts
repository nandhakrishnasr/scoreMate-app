import {
  exportBackupJson as serviceExportBackupJson,
  triggerFileDownload,
  importBackupFile as serviceImportBackupFile,
  createSnapshot,
  serializeSnapshot,
} from './backupService.ts'
import {
  googleDriveService,
  GoogleDriveError,
  type DriveFileMetadata,
} from './googleDriveService.ts'
import { syncService, type PostRestoreReconciliationResult } from './syncService.ts'
import { BackupValidationError, type RestoreMode, type RestoreResult } from '../types/database.ts'

export type BackupUIOperation =
  | 'idle'
  | 'exporting'
  | 'importing'
  | 'connecting'
  | 'backing_up_drive'
  | 'downloading_drive'
  | 'restoring'
  | 'syncing'

export interface BackupStatusMessage {
  type: 'success' | 'warning' | 'error' | 'info'
  text: string
  details?: string
}

export interface BackupInspectionSummary {
  matchCount?: number
  teamCount?: number
  playerCount?: number
  createdAt?: string
}

export interface RestoreExecutionResult {
  localSuccess: boolean
  localResult?: RestoreResult
  cloudResult?: PostRestoreReconciliationResult
  message: string
  statusType: 'success' | 'warning' | 'error'
}

/**
 * Sanitizes any unknown error into a clean, safe, user-friendly message.
 * Strictly redacts tokens, headers, credentials, and internal stack traces.
 */
export function sanitizeUserFacingError(err: unknown): string {
  if (!err) return 'An unknown error occurred.'

  if (err instanceof GoogleDriveError) {
    switch (err.code) {
      case 'OAUTH_NOT_CONFIGURED':
        return 'Google Drive integration is not configured with a valid Client ID.'
      case 'OAUTH_AUTHORIZATION_REQUIRED':
        return 'Google Drive authorization is required. Please connect your account.'
      case 'OAUTH_REAUTHORIZATION_REQUIRED':
        return 'Your Google Drive authorization has expired. Please sign in and authorize again.'
      case 'OAUTH_CANCELLED':
        return 'Google Drive authorization was cancelled.'
      case 'BACKUP_FILE_NOT_FOUND':
        return 'No ScoreMate backup file was found in your Google Drive.'
      case 'NETWORK_ERROR':
        return 'Unable to connect to Google Drive. Please check your network connection.'
      case 'DRIVE_API_ERROR':
        return 'Google Drive service returned an error. Please try again later.'
      case 'REVOCATION_FAILED':
        return 'Unable to revoke Google authorization on the server. Local session was cleared.'
      default:
        return 'A Google Drive communication error occurred.'
    }
  }

  if (err instanceof BackupValidationError) {
    switch (err.code) {
      case 'VALIDATION_FILE_TOO_LARGE':
        return 'The backup file exceeds the maximum allowed size (50 MB).'
      case 'VALIDATION_INVALID_JSON':
        return 'The selected file is not a valid JSON document.'
      case 'VALIDATION_INVALID_ENVELOPE':
      case 'VALIDATION_UNSUPPORTED_VERSION':
        return 'The backup format is not supported by this version of ScoreMate.'
      case 'VALIDATION_CHECKSUM_MISMATCH':
        return 'Backup integrity check failed: file contents appear corrupted or modified.'
      case 'VALIDATION_INVALID_ENTITY':
        return 'The backup contains invalid match or team entity data.'
      case 'VALIDATION_DUPLICATE_ID':
        return 'The backup contains duplicate record identifiers.'
      case 'VALIDATION_MISSING_REFERENCE':
        return 'The backup references missing team or player records.'
      case 'VALIDATION_INVALID_LIFECYCLE':
        return 'The backup contains invalid match lifecycle states.'
      default:
        return 'The backup file failed integrity or structure validation.'
    }
  }

  if (err instanceof Error) {
    const raw = err.message
    // Redact tokens, secrets, bear tokens, ya29. tokens
    const sanitized = raw
      .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]')
      .replace(/ya29\.[A-Za-z0-9_.-]+/gi, 'ya29.[REDACTED]')
      .replace(/key=[A-Za-z0-9_.-]+/gi, 'key=[REDACTED]')

    // If message contains sensitive stack or URLs, return safe fallback
    if (sanitized.includes('at ') || sanitized.includes('eval at') || sanitized.length > 200) {
      return 'An unexpected error occurred during the operation.'
    }
    return sanitized
  }

  return 'An unexpected error occurred.'
}

/**
 * Inspects a raw JSON backup string to extract non-authoritative summary details
 * for display in the restore confirmation modal.
 */
export function inspectBackupSummary(rawContent: string): BackupInspectionSummary | null {
  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      if (parsed.data && typeof parsed.data === 'object') {
        const data = parsed.data as Record<string, unknown[]>
        return {
          matchCount: Array.isArray(data.matches) ? data.matches.length : undefined,
          teamCount: Array.isArray(data.teams) ? data.teams.length : undefined,
          playerCount: Array.isArray(data.players) ? data.players.length : undefined,
          createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
        }
      }
      if (parsed.metadata && typeof parsed.metadata === 'object') {
        const meta = parsed.metadata as Record<string, unknown>
        return {
          matchCount: typeof meta.matchCount === 'number' ? meta.matchCount : undefined,
          teamCount: typeof meta.teamCount === 'number' ? meta.teamCount : undefined,
          playerCount: typeof meta.playerCount === 'number' ? meta.playerCount : undefined,
          createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
        }
      }
      if (Array.isArray(parsed)) {
        return { matchCount: parsed.length }
      }
    }
  } catch {
    // Ignore parse error; BackupService validation will formally catch it
  }
  return null
}

/**
 * Orchestrates Local Backup Export.
 * Generates snapshot via BackupService, triggers browser download, does not mutate DB.
 */
export async function executeLocalExport(): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    const { json, filename } = await serviceExportBackupJson()
    await triggerFileDownload(json, filename)
    return { success: true, filename }
  } catch (err) {
    return { success: false, error: sanitizeUserFacingError(err) }
  }
}

/**
 * Orchestrates Backup Restoration and Firestore Reconciliation.
 *
 * CRITICAL LIFECYCLE ORDER (Milestone 4.5 & 4.6):
 * 1. Validate & Atomic restore into IndexedDB via BackupService FIRST.
 * 2. Only after local restore succeeds, invoke reconcileAfterRestore() if authenticated.
 * 3. If reconciliation fails, DO NOT report restore failure; preserve local restored state!
 */
export async function executeRestore(
  content: string,
  mode: RestoreMode,
  isAuthenticated: boolean
): Promise<RestoreExecutionResult> {
  // Step 1: Local atomic restore
  let restoreResult: RestoreResult
  try {
    restoreResult = await serviceImportBackupFile(content, { mode })
  } catch (err) {
    return {
      localSuccess: false,
      message: sanitizeUserFacingError(err),
      statusType: 'error',
    }
  }

  // Step 2: Cloud reconciliation if signed in
  if (!isAuthenticated) {
    return {
      localSuccess: true,
      localResult: restoreResult,
      message: `Restore completed successfully on this device (${restoreResult.totalRestored} records restored).`,
      statusType: 'success',
    }
  }

  try {
    const reconciliation = await syncService.reconcileAfterRestore()

    if (reconciliation.success) {
      const syncDetail = reconciliation.syncResult
        ? ` (${reconciliation.syncResult.matchesUploaded} matches uploaded, ${reconciliation.syncResult.matchesDownloaded} downloaded)`
        : ''
      return {
        localSuccess: true,
        localResult: restoreResult,
        cloudResult: reconciliation,
        message: `Restore completed and synchronized with cloud${syncDetail}.`,
        statusType: 'success',
      }
    } else {
      // Local restore succeeded, cloud reconciliation failed
      return {
        localSuccess: true,
        localResult: restoreResult,
        cloudResult: reconciliation,
        message: 'Restore completed on this device. Cloud sync could not be completed.',
        statusType: 'warning',
      }
    }
  } catch {
    return {
      localSuccess: true,
      localResult: restoreResult,
      message: 'Restore completed on this device. Cloud sync could not be completed.',
      statusType: 'warning',
    }
  }
}

import { settingsRepository } from './repositories/settingsRepository.ts'

/**
 * Formats an ISO backup timestamp into a user-friendly string (e.g. "Today, 3:42 PM" or "Never").
 */
export function formatLastBackupTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return 'Never'
  try {
    const d = new Date(isoTimestamp)
    if (isNaN(d.getTime())) return 'Never'

    const now = new Date()
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    if (isToday) {
      return `Today, ${timeStr}`
    }
    const dateStr = d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
    return `${dateStr}, ${timeStr}`
  } catch {
    return 'Never'
  }
}

/**
 * Orchestrates Google Drive Backup:
 * 1. Creates snapshot through BackupService
 * 2. Serializes it
 * 3. Sends through GoogleDriveService
 * 4. Persists lastSuccessfulDriveBackupAt ONLY upon verified success
 */
export async function executeDriveBackup(): Promise<{
  success: boolean
  metadata?: DriveFileMetadata
  error?: string
}> {
  try {
    const snapshot = await createSnapshot()
    const json = serializeSnapshot(snapshot)
    const metadata = await googleDriveService.uploadBackup(json)
    const nowIso = new Date().toISOString()
    await settingsRepository.setLastSuccessfulDriveBackupAt(nowIso)
    return { success: true, metadata }
  } catch (err) {
    return { success: false, error: sanitizeUserFacingError(err) }
  }
}

/**
 * Orchestrates Google Drive Restore Download:
 * Downloads raw JSON from Google Drive appDataFolder for subsequent confirmation & restore.
 */
export async function executeDriveDownload(): Promise<{
  success: boolean
  content?: string
  error?: string
}> {
  try {
    const content = await googleDriveService.downloadBackup()
    return { success: true, content }
  } catch (err) {
    return { success: false, error: sanitizeUserFacingError(err) }
  }
}

/**
 * Orchestrates Google Drive Disconnect.
 * Calls googleDriveService.disconnect() to revoke OAuth grant and purge cached state.
 */
export async function executeDriveDisconnect(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await googleDriveService.disconnect()
    return { success: true }
  } catch (err) {
    return { success: false, error: sanitizeUserFacingError(err) }
  }
}
