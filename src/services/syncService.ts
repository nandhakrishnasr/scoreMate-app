import { firebaseAuth } from './firebase.ts'
import { firestoreService } from './firestore.ts'
import { matchRepository } from './repositories/matchRepository.ts'
import { teamRepository } from './repositories/teamRepository.ts'
import { playerRepository } from './repositories/playerRepository.ts'
import { canonicalize } from './backupService.ts'
import type {
  PersistedMatchRecord,
  PersistedTeamRecord,
  PersistedPlayerRecord,
  MatchLifecycleStatus,
} from '../types/database.ts'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export interface SyncDetails {
  state: SyncState
  lastSyncedAt: string | null
  lastError: string | null
  matchesSynced: number
  teamsSynced: number
  playersSynced: number
  conflicts: string[]
}

export interface SyncResult {
  success: boolean
  matchesUploaded: number
  matchesDownloaded: number
  teamsUploaded: number
  teamsDownloaded: number
  playersUploaded: number
  playersDownloaded: number
  conflicts: string[]
  errors: string[]
}

export interface PostRestoreReconciliationResult {
  authenticated: boolean
  skipped: boolean
  skipReason?: 'signed_out' | 'offline' | 'unauthenticated'
  success: boolean
  syncResult?: SyncResult
  error?: string
  errorCategory?: 'AUTH_UNAVAILABLE' | 'NETWORK_OFFLINE' | 'FIRESTORE_ERROR' | 'UNKNOWN'
}

export interface MatchConflictResolution {
  winner: 'local' | 'cloud' | 'identical'
  tieBreakApplied: boolean
  conflictMessage?: string
}

// Current sync state
let currentSyncState: SyncState = 'idle'
let lastSyncedAt: string | null = null
let lastError: string | null = null
let syncGeneration = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempts = 0
const MAX_RETRY_ATTEMPTS = 3

type SyncStateListener = (state: SyncState, details: SyncDetails) => void
const listeners = new Set<SyncStateListener>()

function notifyListeners(): void {
  const details: SyncDetails = {
    state: currentSyncState,
    lastSyncedAt,
    lastError,
    matchesSynced: 0,
    teamsSynced: 0,
    playersSynced: 0,
    conflicts: [],
  }
  for (const listener of listeners) {
    try {
      listener(currentSyncState, details)
    } catch {
      // Ignore listener error
    }
  }
}

function setSyncState(state: SyncState, error: string | null = null): void {
  currentSyncState = state
  if (error) {
    lastError = error
  }
  if (state === 'synced') {
    lastSyncedAt = new Date().toISOString()
    lastError = null
  }
  notifyListeners()
}

/**
 * Normalizes and determines canonical equality between two match records.
 * Ignores sync metadata (lastSyncedAt, syncStatus, syncError).
 */
export function areMatchesCanonicallyEqual(a: PersistedMatchRecord, b: PersistedMatchRecord): boolean {
  if (a.matchId !== b.matchId) return false
  if (a.status !== b.status) return false
  if (a.teamOne !== b.teamOne || a.teamTwo !== b.teamTwo) return false
  if (a.overs !== b.overs || a.teamSize !== b.teamSize) return false
  if (a.lastManBatting !== b.lastManBatting) return false
  if (a.inningsNumber !== b.inningsNumber) return false
  if (a.firstBattingHome !== b.firstBattingHome) return false

  // Compare score progression
  const aScore = a.score ? `${a.score.runs}/${a.score.wickets} (${a.score.balls}b)` : 'none'
  const bScore = b.score ? `${b.score.runs}/${b.score.wickets} (${b.score.balls}b)` : 'none'
  if (aScore !== bScore) return false

  // Compare match result
  const aRes = a.matchResult ? `${a.matchResult.winner}-${a.matchResult.margin}` : 'none'
  const bRes = b.matchResult ? `${b.matchResult.winner}-${b.matchResult.margin}` : 'none'
  if (aRes !== bRes) return false

  return true
}

export function areTeamsCanonicallyEqual(a: PersistedTeamRecord, b: PersistedTeamRecord): boolean {
  return a.id === b.id && a.name === b.name && a.image === b.image
}

export function arePlayersCanonicallyEqual(a: PersistedPlayerRecord, b: PersistedPlayerRecord): boolean {
  return a.id === b.id && a.name === b.name && a.hand === b.hand && a.teamId === b.teamId && a.image === b.image
}

/**
 * Validates untrusted cloud match data before committing to local IndexedDB.
 */
export function validateCloudMatch(data: unknown): data is PersistedMatchRecord {
  if (!data || typeof data !== 'object') return false
  const r = data as Partial<PersistedMatchRecord>
  if (typeof r.matchId !== 'string' || !r.matchId) return false
  if (!r.status || !['in_progress', 'completed', 'abandoned'].includes(r.status)) return false
  if (typeof r.teamOne !== 'string' || typeof r.teamTwo !== 'string') return false
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') return false
  return true
}

export function validateCloudTeam(data: unknown): data is PersistedTeamRecord {
  if (!data || typeof data !== 'object') return false
  const r = data as Partial<PersistedTeamRecord>
  if (typeof r.id !== 'string' || !r.id) return false
  if (typeof r.name !== 'string' || !r.name) return false
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') return false
  return true
}

export function validateCloudPlayer(data: unknown): data is PersistedPlayerRecord {
  if (!data || typeof data !== 'object') return false
  const r = data as Partial<PersistedPlayerRecord>
  if (typeof r.id !== 'string' || !r.id) return false
  if (typeof r.name !== 'string' || !r.name) return false
  if (r.hand !== 'Right' && r.hand !== 'Left') return false
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') return false
  return true
}

function isTerminal(status: MatchLifecycleStatus): boolean {
  return status === 'completed' || status === 'abandoned'
}

/**
 * Resolves match conflicts according to the ScoreMate Phase 4 lifecycle precedence model:
 * 1. in_progress < terminal (completed or abandoned)
 *    - Terminal state ALWAYS wins over in_progress, even if in_progress has a newer updatedAt.
 *    - Never downgrade terminal to in_progress.
 * 2. If both records have the same lifecycle state (both terminal or both in_progress):
 *    - compare updatedAt: newer wins.
 * 3. If one record is completed and the other is abandoned:
 *    - compare updatedAt first: newer terminal record wins.
 *    - if completed vs abandoned have equal updatedAt:
 *      use a deterministic tie-breaker (canonical string comparison) and record the conflict.
 * 4. If timestamps are equal and content differs:
 *    - compare canonical strings deterministically and record the conflict.
 */
export function resolveMatchConflict(
  local: PersistedMatchRecord,
  cloud: PersistedMatchRecord
): MatchConflictResolution {
  const isLocalTerminal = isTerminal(local.status)
  const isCloudTerminal = isTerminal(cloud.status)

  // 1. Any terminal state takes precedence over in_progress (regardless of timestamp)
  if (isLocalTerminal && !isCloudTerminal) {
    return { winner: 'local', tieBreakApplied: false }
  }
  if (!isLocalTerminal && isCloudTerminal) {
    return { winner: 'cloud', tieBreakApplied: false }
  }

  // 2. Both are terminal or both are in_progress: compare updatedAt (newer wins)
  const localTime = new Date(local.updatedAt).getTime()
  const cloudTime = new Date(cloud.updatedAt).getTime()

  if (localTime > cloudTime) {
    return { winner: 'local', tieBreakApplied: false }
  }
  if (cloudTime > localTime) {
    return { winner: 'cloud', tieBreakApplied: false }
  }

  // 3. Timestamps are exactly equal
  if (areMatchesCanonicallyEqual(local, cloud)) {
    return { winner: 'identical', tieBreakApplied: false }
  }

  // Content differs with equal timestamps: deterministic canonical tie-breaker
  const strLocal = canonicalize(local)
  const strCloud = canonicalize(cloud)

  const isTerminalMismatch = isLocalTerminal && isCloudTerminal && local.status !== cloud.status
  const conflictMessage = isTerminalMismatch
    ? `Match ${local.matchId}: terminal conflict between local ${local.status} and cloud ${cloud.status} with equal timestamps (resolved deterministically)`
    : `Match ${local.matchId}: conflict with equal timestamps (resolved deterministically)`

  if (strLocal >= strCloud) {
    return { winner: 'local', tieBreakApplied: true, conflictMessage }
  } else {
    return { winner: 'cloud', tieBreakApplied: true, conflictMessage }
  }
}

/**
 * Core synchronization service orchestrating bidirectional reconciliation
 * between IndexedDB and user-scoped Firestore documents.
 */
export const syncService = {
  getSyncState(): SyncState {
    return currentSyncState
  },

  getSyncDetails(): SyncDetails {
    return {
      state: currentSyncState,
      lastSyncedAt,
      lastError,
      matchesSynced: 0,
      teamsSynced: 0,
      playersSynced: 0,
      conflicts: [],
    }
  },

  subscribeSyncState(listener: SyncStateListener): () => void {
    listeners.add(listener)
    listener(currentSyncState, this.getSyncDetails())
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Invalidates any in-flight sync operations (e.g. on sign-out or account switch).
   */
  invalidateSession(): void {
    syncGeneration++
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    retryAttempts = 0
    setSyncState('idle')
  },

  /**
   * Synchronizes all matches, teams, and players for the current authenticated user.
   */
  async syncAll(callerUid?: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      matchesUploaded: 0,
      matchesDownloaded: 0,
      teamsUploaded: 0,
      teamsDownloaded: 0,
      playersUploaded: 0,
      playersDownloaded: 0,
      conflicts: [],
      errors: [],
    }

    const currentUid = firebaseAuth.currentUser?.uid

    // Strict identity guard: if no authenticated Firebase user exists (offline-first guest), skip sync.
    if (!currentUid) {
      return result
    }

    // Strict caller UID verification: caller cannot request another user's partition
    if (callerUid && callerUid !== currentUid) {
      result.errors.push(`UID mismatch: requested ${callerUid} but active user is ${currentUid}`)
      setSyncState('error', 'UID mismatch')
      return result
    }

    // Network guard
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncState('offline')
      return result
    }

    const thisGeneration = ++syncGeneration
    setSyncState('syncing')

    try {
      // 1. Synchronize Teams
      await this._reconcileTeams(currentUid, thisGeneration, result)

      // 2. Synchronize Players
      await this._reconcilePlayers(currentUid, thisGeneration, result)

      // 3. Synchronize Matches
      await this._reconcileMatches(currentUid, thisGeneration, result)

      // Check if session was invalidated during async operation
      if (thisGeneration !== syncGeneration) {
        return result
      }

      result.success = result.errors.length === 0
      if (result.success) {
        retryAttempts = 0
        setSyncState('synced')
      } else {
        setSyncState('error', result.errors.join('; '))
        this._scheduleRetry()
      }
    } catch (err) {
      if (thisGeneration !== syncGeneration) return result
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      setSyncState('error', msg)
      this._scheduleRetry()
    }

    return result
  },

  /**
   * Synchronizes a single match record.
   */
  async syncMatch(matchId: string, callerUid?: string): Promise<void> {
    const currentUid = firebaseAuth.currentUser?.uid
    if (!currentUid) return
    if (callerUid && callerUid !== currentUid) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncState('offline')
      return
    }

    const thisGeneration = syncGeneration
    try {
      const local = await matchRepository.getMatch(matchId)
      const cloud = await firestoreService.getMatch(currentUid, matchId)

      if (thisGeneration !== syncGeneration) return

      const now = new Date().toISOString()

      if (local && !cloud) {
        // Upload local
        const toUpload: PersistedMatchRecord = { ...local, ownerUid: currentUid }
        await firestoreService.setMatch(currentUid, matchId, toUpload)
        local.ownerUid = currentUid
        local.syncStatus = 'synced'
        local.lastSyncedAt = now
        local.syncError = null
        await matchRepository.saveMatch(local)
      } else if (!local && cloud) {
        // Import cloud
        if (validateCloudMatch(cloud)) {
          cloud.ownerUid = currentUid
          cloud.syncStatus = 'synced'
          cloud.lastSyncedAt = now
          cloud.syncError = null
          await matchRepository.saveMatch(cloud)
        }
      } else if (local && cloud) {
        if (!validateCloudMatch(cloud)) return

        const resolution = resolveMatchConflict(local, cloud)

        if (resolution.winner === 'identical') {
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          local.syncError = null
          await matchRepository.saveMatch(local)
          return
        }

        if (resolution.winner === 'local') {
          local.ownerUid = currentUid
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          local.syncError = resolution.tieBreakApplied ? 'CONFLICT_TERMINAL_TIE_RESOLVED' : null
          await firestoreService.setMatch(currentUid, matchId, local)
          await matchRepository.saveMatch(local)
        } else {
          cloud.ownerUid = currentUid
          cloud.syncStatus = 'synced'
          cloud.lastSyncedAt = now
          cloud.syncError = resolution.tieBreakApplied ? 'CONFLICT_TERMINAL_TIE_RESOLVED' : null
          await matchRepository.saveMatch(cloud)
        }
      }
    } catch (err) {
      if (thisGeneration !== syncGeneration) return
      const msg = err instanceof Error ? err.message : String(err)
      setSyncState('error', msg)
    }
  },

  async syncTeam(teamId: string, callerUid?: string): Promise<void> {
    const currentUid = firebaseAuth.currentUser?.uid
    if (!currentUid) return
    if (callerUid && callerUid !== currentUid) return
    const local = await teamRepository.getTeam(teamId)
    if (!local) return
    const now = new Date().toISOString()
    const toUpload: PersistedTeamRecord = { ...local, ownerUid: currentUid }
    await firestoreService.setTeam(currentUid, teamId, toUpload)
    local.ownerUid = currentUid
    local.syncStatus = 'synced'
    local.lastSyncedAt = now
    await teamRepository.saveTeam(local)
  },

  async syncPlayer(playerId: string, callerUid?: string): Promise<void> {
    const currentUid = firebaseAuth.currentUser?.uid
    if (!currentUid) return
    if (callerUid && callerUid !== currentUid) return
    const local = await playerRepository.getPlayer(playerId)
    if (!local) return
    const now = new Date().toISOString()
    const toUpload: PersistedPlayerRecord = { ...local, ownerUid: currentUid }
    await firestoreService.setPlayer(currentUid, playerId, toUpload)
    local.ownerUid = currentUid
    local.syncStatus = 'synced'
    local.lastSyncedAt = now
    await playerRepository.savePlayer(local)
  },

  // --- Internal Reconcilers ---

  async _reconcileMatches(uid: string, generation: number, result: SyncResult): Promise<void> {
    const localMatches = await matchRepository.listMatches()
    const cloudMatches = await firestoreService.listMatches(uid)

    if (generation !== syncGeneration) return

    const cloudMap = new Map<string, PersistedMatchRecord>()
    for (const m of cloudMatches) {
      if (validateCloudMatch(m)) {
        cloudMap.set(m.matchId, m)
      } else {
        result.errors.push(`Rejected malformed cloud match document: ${JSON.stringify(m)}`)
      }
    }

    const localMap = new Map<string, PersistedMatchRecord>()
    for (const m of localMatches) {
      localMap.set(m.matchId, m)
    }

    const allMatchIds = new Set([...localMap.keys(), ...cloudMap.keys()])
    const now = new Date().toISOString()

    for (const matchId of allMatchIds) {
      if (generation !== syncGeneration) return

      const local = localMap.get(matchId)
      const cloud = cloudMap.get(matchId)

      if (local && !cloud) {
        // Upload local to cloud
        const toUpload: PersistedMatchRecord = { ...local, ownerUid: uid }
        await firestoreService.setMatch(uid, matchId, toUpload)
        local.ownerUid = uid
        local.syncStatus = 'synced'
        local.lastSyncedAt = now
        local.syncError = null
        await matchRepository.saveMatch(local)
        result.matchesUploaded++
      } else if (!local && cloud) {
        // Import cloud to local
        cloud.ownerUid = uid
        cloud.syncStatus = 'synced'
        cloud.lastSyncedAt = now
        cloud.syncError = null
        await matchRepository.saveMatch(cloud)
        result.matchesDownloaded++
      } else if (local && cloud) {
        const resolution = resolveMatchConflict(local, cloud)

        if (resolution.conflictMessage) {
          result.conflicts.push(resolution.conflictMessage)
        }

        if (resolution.winner === 'identical') {
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          local.syncError = null
          await matchRepository.saveMatch(local)
          continue
        }

        if (resolution.winner === 'local') {
          local.ownerUid = uid
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          local.syncError = resolution.tieBreakApplied ? 'CONFLICT_TERMINAL_TIE_RESOLVED' : null
          await firestoreService.setMatch(uid, matchId, local)
          await matchRepository.saveMatch(local)
          result.matchesUploaded++
        } else {
          cloud.ownerUid = uid
          cloud.syncStatus = 'synced'
          cloud.lastSyncedAt = now
          cloud.syncError = resolution.tieBreakApplied ? 'CONFLICT_TERMINAL_TIE_RESOLVED' : null
          await matchRepository.saveMatch(cloud)
          result.matchesDownloaded++
        }
      }
    }
  },

  async _reconcileTeams(uid: string, generation: number, result: SyncResult): Promise<void> {
    const localTeams = await teamRepository.listTeams()
    const cloudTeams = await firestoreService.listTeams(uid)

    if (generation !== syncGeneration) return

    const cloudMap = new Map<string, PersistedTeamRecord>()
    for (const t of cloudTeams) {
      if (validateCloudTeam(t)) {
        cloudMap.set(t.id, t)
      } else {
        result.errors.push(`Rejected malformed cloud team: ${JSON.stringify(t)}`)
      }
    }

    const localMap = new Map<string, PersistedTeamRecord>()
    for (const t of localTeams) {
      localMap.set(t.id, t)
    }

    const allTeamIds = new Set([...localMap.keys(), ...cloudMap.keys()])
    const now = new Date().toISOString()

    for (const teamId of allTeamIds) {
      if (generation !== syncGeneration) return

      const local = localMap.get(teamId)
      const cloud = cloudMap.get(teamId)

      if (local && !cloud) {
        const toUpload: PersistedTeamRecord = { ...local, ownerUid: uid }
        await firestoreService.setTeam(uid, teamId, toUpload)
        local.ownerUid = uid
        local.syncStatus = 'synced'
        local.lastSyncedAt = now
        await teamRepository.saveTeam(local)
        result.teamsUploaded++
      } else if (!local && cloud) {
        cloud.ownerUid = uid
        cloud.syncStatus = 'synced'
        cloud.lastSyncedAt = now
        await teamRepository.saveTeam(cloud)
        result.teamsDownloaded++
      } else if (local && cloud) {
        if (areTeamsCanonicallyEqual(local, cloud)) {
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          await teamRepository.saveTeam(local)
        } else if (local.updatedAt > cloud.updatedAt) {
          local.ownerUid = uid
          await firestoreService.setTeam(uid, teamId, local)
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          await teamRepository.saveTeam(local)
          result.teamsUploaded++
        } else if (cloud.updatedAt > local.updatedAt) {
          cloud.ownerUid = uid
          cloud.syncStatus = 'synced'
          cloud.lastSyncedAt = now
          await teamRepository.saveTeam(cloud)
          result.teamsDownloaded++
        } else {
          result.conflicts.push(`Team ${teamId}: ambiguous conflict`)
          local.syncStatus = 'error'
          local.syncError = 'Ambiguous conflict with equal timestamps'
          await teamRepository.saveTeam(local)
        }
      }
    }
  },

  async _reconcilePlayers(uid: string, generation: number, result: SyncResult): Promise<void> {
    const localPlayers = await playerRepository.listPlayers()
    const cloudPlayers = await firestoreService.listPlayers(uid)

    if (generation !== syncGeneration) return

    const cloudMap = new Map<string, PersistedPlayerRecord>()
    for (const p of cloudPlayers) {
      if (validateCloudPlayer(p)) {
        cloudMap.set(p.id, p)
      } else {
        result.errors.push(`Rejected malformed cloud player: ${JSON.stringify(p)}`)
      }
    }

    const localMap = new Map<string, PersistedPlayerRecord>()
    for (const p of localPlayers) {
      localMap.set(p.id, p)
    }

    const allPlayerIds = new Set([...localMap.keys(), ...cloudMap.keys()])
    const now = new Date().toISOString()

    for (const playerId of allPlayerIds) {
      if (generation !== syncGeneration) return

      const local = localMap.get(playerId)
      const cloud = cloudMap.get(playerId)

      if (local && !cloud) {
        const toUpload: PersistedPlayerRecord = { ...local, ownerUid: uid }
        await firestoreService.setPlayer(uid, playerId, toUpload)
        local.ownerUid = uid
        local.syncStatus = 'synced'
        local.lastSyncedAt = now
        await playerRepository.savePlayer(local)
        result.playersUploaded++
      } else if (!local && cloud) {
        cloud.ownerUid = uid
        cloud.syncStatus = 'synced'
        cloud.lastSyncedAt = now
        await playerRepository.savePlayer(cloud)
        result.playersDownloaded++
      } else if (local && cloud) {
        if (arePlayersCanonicallyEqual(local, cloud)) {
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          await playerRepository.savePlayer(local)
        } else if (local.updatedAt > cloud.updatedAt) {
          local.ownerUid = uid
          await firestoreService.setPlayer(uid, playerId, local)
          local.syncStatus = 'synced'
          local.lastSyncedAt = now
          await playerRepository.savePlayer(local)
          result.playersUploaded++
        } else if (cloud.updatedAt > local.updatedAt) {
          cloud.ownerUid = uid
          cloud.syncStatus = 'synced'
          cloud.lastSyncedAt = now
          await playerRepository.savePlayer(cloud)
          result.playersDownloaded++
        } else {
          result.conflicts.push(`Player ${playerId}: ambiguous conflict`)
          local.syncStatus = 'error'
          local.syncError = 'Ambiguous conflict with equal timestamps'
          await playerRepository.savePlayer(local)
        }
      }
    }
  },

  _scheduleRetry(): void {
    if (retryTimer) clearTimeout(retryTimer)
    if (retryAttempts >= MAX_RETRY_ATTEMPTS) return

    retryAttempts++
    // Exponential backoff: 2s, 4s, 8s
    const delay = Math.pow(2, retryAttempts) * 1000

    retryTimer = setTimeout(() => {
      retryTimer = null
      void this.syncAll()
    }, delay)
  },

  /**
   * Reconciles restored local IndexedDB records with Firestore for the CURRENTLY authenticated Firebase user.
   *
   * SECURITY & ARCHITECTURAL RULES (Milestone 4.5):
   * 1. The current Firebase Auth user UID is the ONLY authorization identity.
   * 2. provenanceOwnerUid in the backup is ignored for authorization and partition selection.
   * 3. If signed out, reconciliation is cleanly skipped; local restore remains intact.
   * 4. If Firestore sync fails, the local restored state remains intact (no partial rollback).
   * 5. No destructive deletions: current user's existing cloud data is preserved.
   */
  async reconcileAfterRestore(): Promise<PostRestoreReconciliationResult> {
    const currentUid = firebaseAuth.currentUser?.uid

    // Rule 1 & 3: If user is signed out, restore remains local-only
    if (!currentUid) {
      return {
        authenticated: false,
        skipped: true,
        skipReason: 'signed_out',
        success: true,
      }
    }

    // Network guard
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        authenticated: true,
        skipped: true,
        skipReason: 'offline',
        success: false,
        error: 'Device is offline. Restored records will synchronize when back online.',
        errorCategory: 'NETWORK_OFFLINE',
      }
    }

    try {
      const syncResult = await this.syncAll(currentUid)
      return {
        authenticated: true,
        skipped: false,
        success: syncResult.success,
        syncResult,
        error: syncResult.errors.length > 0 ? syncResult.errors.join('; ') : undefined,
        errorCategory: syncResult.errors.length > 0 ? 'FIRESTORE_ERROR' : undefined,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        authenticated: true,
        skipped: false,
        success: false,
        error: msg,
        errorCategory: 'FIRESTORE_ERROR',
      }
    }
  },
}
