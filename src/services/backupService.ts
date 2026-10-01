import {
  STORES,
  DB_VERSION,
  type BackupSnapshot,
  type BackupDataPayload,
  type BackupIntegrity,
  type BackupMetadata,
  type PersistedMatchRecord,
  type PersistedTeamRecord,
  type PersistedPlayerRecord,
  type RestoreMode,
  type RestoreOptions,
  type RestoreResult,
  BackupValidationError,
} from '../types/database.ts'
import type { CompletedMatch, SavedAppState } from '../types/match.ts'
import { matchRepository } from './repositories/matchRepository.ts'
import { teamRepository } from './repositories/teamRepository.ts'
import { playerRepository } from './repositories/playerRepository.ts'
import { openDatabase, DatabaseError } from './localDatabase.ts'
import { generateUUID } from '../utils/uuid.ts'
import { deliverFile } from '../utils/fileDelivery.ts'

export const BACKUP_SCHEMA_URL = 'https://scoremate.app/schemas/backup-v1.json'
export const BACKUP_VERSION = 1
export const APP_VERSION = '1.0.0'
export const MAX_BACKUP_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const DEVICE_ID_KEY = 'scoremate_device_id'
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/

/**
 * Deterministic JSON canonicalization algorithm.
 * Recursively sorts keys lexicographically by Unicode code point, normalizes strings (NFC),
 * preserves array order, and strips prototype pollution keys.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  }

  if (typeof value === 'string') {
    return JSON.stringify(value.normalize('NFC'))
  }

  if (Array.isArray(value)) {
    const elements = value.map((elem) => (elem === undefined ? 'null' : canonicalize(elem)))
    return `[${elements.join(',')}]`
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
      .filter((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
      .sort()

    const entries: string[] = []
    for (const key of keys) {
      const val = obj[key]
      if (val !== undefined && typeof val !== 'function' && typeof val !== 'symbol') {
        const canonicalKey = JSON.stringify(key.normalize('NFC'))
        const canonicalVal = canonicalize(val)
        entries.push(`${canonicalKey}:${canonicalVal}`)
      }
    }
    return `{${entries.join(',')}}`
  }

  return 'null'
}

/**
 * Computes a deterministic SHA-256 integrity checksum of any data object.
 * Used for integrity & corruption detection (not cryptographic signing).
 */
export async function computeChecksum(data: unknown): Promise<string> {
  const canonicalString = canonicalize(data)
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(canonicalString)

  const subtleCrypto =
    typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
      ? globalThis.crypto.subtle
      : undefined

  if (!subtleCrypto) {
    throw new Error('Web Crypto API (crypto.subtle) is unavailable in current environment.')
  }

  const hashBuffer = await subtleCrypto.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Retrieves a stable device identifier or creates a persistent one.
 */
export function getOrCreateDeviceId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(DEVICE_ID_KEY)
      if (existing) return existing
      const newId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      localStorage.setItem(DEVICE_ID_KEY, newId)
      return newId
    }
  } catch {
    // Fallback for non-browser or storage-restricted runtimes
  }
  return 'device-local-unknown'
}

export interface CreateSnapshotOptions {
  ownerUid?: string | null
  deviceId?: string
}

/**
 * Creates a complete database snapshot containing all matches, teams, and players
 * from IndexedDB with canonical integrity checksum and metadata.
 */
export async function createSnapshot(options: CreateSnapshotOptions = {}): Promise<BackupSnapshot> {
  const [rawMatches, rawTeams, rawPlayers] = await Promise.all([
    matchRepository.listMatches(),
    teamRepository.listTeams(),
    playerRepository.listPlayers(),
  ])

  const matches: PersistedMatchRecord[] = rawMatches.map((m) => ({
    ...m,
    syncError: null,
  }))
  const teams: PersistedTeamRecord[] = rawTeams.map((t) => ({
    ...t,
    syncError: null,
  }))
  const players: PersistedPlayerRecord[] = rawPlayers.map((p) => ({
    ...p,
    syncError: null,
  }))

  const payload: BackupDataPayload = {
    matches,
    teams,
    players,
  }

  const checksum = await computeChecksum(payload)

  const integrity: BackupIntegrity = {
    algorithm: 'SHA-256',
    canonicalization: 'RFC-8785-ES6-KEY-SORT',
    checksum,
  }

  const metadata: BackupMetadata = {
    matchCount: matches.length,
    teamCount: teams.length,
    playerCount: players.length,
    hasActiveMatch: matches.some((m) => m.status === 'in_progress'),
    databaseVersion: DB_VERSION,
  }

  const deviceId = options.deviceId || getOrCreateDeviceId()

  const snapshot: BackupSnapshot = {
    $schema: BACKUP_SCHEMA_URL,
    backupVersion: BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    deviceId,
    provenanceOwnerUid: options.ownerUid ?? null,
    integrity,
    metadata,
    data: payload,
  }

  return snapshot
}

/**
 * Serializes a snapshot to formatted JSON suitable for file export or transport.
 */
export function serializeSnapshot(snapshot: BackupSnapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

export interface ValidationOptions {
  mode?: RestoreMode
  existingTeams?: PersistedTeamRecord[]
  existingPlayers?: PersistedPlayerRecord[]
}

/**
 * Validates a backup payload against all 10 validation stages.
 * Performs ZERO writes to IndexedDB.
 */
export async function validateBackup(
  backupInput: string | unknown,
  options: ValidationOptions = {}
): Promise<BackupSnapshot> {
  const mode: RestoreMode = options.mode ?? 'merge'

  // Stage 1: Size Guard (max 50 MB)
  if (typeof backupInput === 'string' && backupInput.length > MAX_BACKUP_SIZE_BYTES) {
    throw new BackupValidationError(
      'VALIDATION_FILE_TOO_LARGE',
      `Backup exceeds 50 MB limit (size: ${(backupInput.length / 1024 / 1024).toFixed(2)} MB)`
    )
  }

  // Stage 2: JSON Syntax Validation
  let parsed: unknown
  if (typeof backupInput === 'string') {
    try {
      parsed = JSON.parse(backupInput)
    } catch (err) {
      throw new BackupValidationError(
        'VALIDATION_INVALID_JSON',
        'Backup content is not valid JSON',
        err
      )
    }
  } else {
    parsed = backupInput
  }

  // Stage 3: Envelope / Schema Validation
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupValidationError('VALIDATION_INVALID_ENVELOPE', 'Backup root must be an object')
  }

  const raw = parsed as Record<string, unknown>
  if (
    typeof raw.$schema !== 'string' ||
    typeof raw.appVersion !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    typeof raw.deviceId !== 'string' ||
    typeof raw.metadata !== 'object' ||
    raw.metadata === null ||
    typeof raw.data !== 'object' ||
    raw.data === null
  ) {
    throw new BackupValidationError(
      'VALIDATION_INVALID_ENVELOPE',
      'Missing or malformed required envelope fields'
    )
  }

  const data = raw.data as Record<string, unknown>
  if (!Array.isArray(data.matches) || !Array.isArray(data.teams) || !Array.isArray(data.players)) {
    throw new BackupValidationError(
      'VALIDATION_INVALID_ENVELOPE',
      'Backup data must contain matches, teams, and players arrays'
    )
  }

  // Stage 4: backupVersion Validation
  if (raw.backupVersion !== 1) {
    throw new BackupValidationError(
      'VALIDATION_UNSUPPORTED_VERSION',
      `Unsupported backupVersion: ${String(raw.backupVersion)}. Only version 1 is supported.`
    )
  }

  // Stage 5: Integrity Block Validation
  if (
    typeof raw.integrity !== 'object' ||
    raw.integrity === null ||
    (raw.integrity as Record<string, unknown>).algorithm !== 'SHA-256' ||
    typeof (raw.integrity as Record<string, unknown>).checksum !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(String((raw.integrity as Record<string, unknown>).checksum))
  ) {
    throw new BackupValidationError(
      'VALIDATION_INVALID_INTEGRITY',
      'Invalid or missing integrity block'
    )
  }

  // Stage 6: SHA-256 Checksum Validation against canonical data payload
  const expectedChecksum = String((raw.integrity as Record<string, unknown>).checksum).toLowerCase()
  const computedChecksum = (await computeChecksum(data)).toLowerCase()
  if (computedChecksum !== expectedChecksum) {
    throw new BackupValidationError(
      'VALIDATION_CHECKSUM_MISMATCH',
      `Integrity checksum mismatch. Expected ${expectedChecksum}, computed ${computedChecksum}.`
    )
  }

  const matches = data.matches as PersistedMatchRecord[]
  const teams = data.teams as PersistedTeamRecord[]
  const players = data.players as PersistedPlayerRecord[]

  // Stage 7: Structural Entity Validation
  for (const match of matches) {
    if (typeof match !== 'object' || match === null) {
      throw new BackupValidationError('VALIDATION_INVALID_ENTITY', 'Match record must be an object')
    }
    if (
      match.schemaVersion !== 1 ||
      typeof match.matchId !== 'string' ||
      match.matchId.trim() === '' ||
      CONTROL_CHARS_REGEX.test(match.matchId) ||
      match.matchId.length > 100 ||
      typeof match.teamOne !== 'string' ||
      match.teamOne.trim() === '' ||
      CONTROL_CHARS_REGEX.test(match.teamOne) ||
      match.teamOne.length > 100 ||
      typeof match.teamTwo !== 'string' ||
      match.teamTwo.trim() === '' ||
      CONTROL_CHARS_REGEX.test(match.teamTwo) ||
      match.teamTwo.length > 100 ||
      typeof match.overs !== 'string' ||
      CONTROL_CHARS_REGEX.test(match.overs) ||
      typeof match.status !== 'string'
    ) {
      throw new BackupValidationError(
        'VALIDATION_INVALID_ENTITY',
        `Malformed match record: ${match.matchId || 'unknown'}`
      )
    }
    if (match.venue && (CONTROL_CHARS_REGEX.test(match.venue) || match.venue.length > 150)) {
      throw new BackupValidationError('VALIDATION_INVALID_ENTITY', `Invalid venue in match ${match.matchId}`)
    }
    if (
      match.competition &&
      (CONTROL_CHARS_REGEX.test(match.competition) || match.competition.length > 150)
    ) {
      throw new BackupValidationError(
        'VALIDATION_INVALID_ENTITY',
        `Invalid competition in match ${match.matchId}`
      )
    }
  }

  for (const team of teams) {
    if (typeof team !== 'object' || team === null) {
      throw new BackupValidationError('VALIDATION_INVALID_ENTITY', 'Team record must be an object')
    }
    if (
      team.schemaVersion !== 1 ||
      typeof team.id !== 'string' ||
      team.id.trim() === '' ||
      CONTROL_CHARS_REGEX.test(team.id) ||
      team.id.length > 100 ||
      typeof team.name !== 'string' ||
      team.name.trim() === '' ||
      CONTROL_CHARS_REGEX.test(team.name) ||
      team.name.length > 100
    ) {
      throw new BackupValidationError(
        'VALIDATION_INVALID_ENTITY',
        `Malformed team record: ${team.id || 'unknown'}`
      )
    }
  }

  for (const player of players) {
    if (typeof player !== 'object' || player === null) {
      throw new BackupValidationError('VALIDATION_INVALID_ENTITY', 'Player record must be an object')
    }
    if (
      player.schemaVersion !== 1 ||
      typeof player.id !== 'string' ||
      player.id.trim() === '' ||
      CONTROL_CHARS_REGEX.test(player.id) ||
      player.id.length > 100 ||
      typeof player.name !== 'string' ||
      player.name.trim() === '' ||
      CONTROL_CHARS_REGEX.test(player.name) ||
      player.name.length > 100 ||
      (player.hand !== 'Right' && player.hand !== 'Left')
    ) {
      throw new BackupValidationError(
        'VALIDATION_INVALID_ENTITY',
        `Malformed player record: ${player.id || 'unknown'}`
      )
    }
  }

  // Stage 8: Duplicate-ID Detection
  const matchIdSet = new Set<string>()
  for (const m of matches) {
    if (matchIdSet.has(m.matchId)) {
      throw new BackupValidationError(
        'VALIDATION_DUPLICATE_ID',
        `Duplicate matchId detected in backup: ${m.matchId}`
      )
    }
    matchIdSet.add(m.matchId)
  }

  const teamIdSet = new Set<string>()
  for (const t of teams) {
    if (teamIdSet.has(t.id)) {
      throw new BackupValidationError(
        'VALIDATION_DUPLICATE_ID',
        `Duplicate team ID detected in backup: ${t.id}`
      )
    }
    teamIdSet.add(t.id)
  }

  const playerIdSet = new Set<string>()
  for (const p of players) {
    if (playerIdSet.has(p.id)) {
      throw new BackupValidationError(
        'VALIDATION_DUPLICATE_ID',
        `Duplicate player ID detected in backup: ${p.id}`
      )
    }
    playerIdSet.add(p.id)
  }

  // Stage 9: Referential-Integrity Validation
  // For Replace mode: references MUST resolve inside the backup.
  // For Merge mode: references can resolve inside backup OR in existing local IndexedDB records.
  let resolvableTeamIds = new Set(teamIdSet)
  let resolvablePlayerIds = new Set(playerIdSet)

  if (mode === 'merge') {
    if (options.existingTeams) {
      for (const t of options.existingTeams) resolvableTeamIds.add(t.id)
    } else {
      const localTeams = await teamRepository.listTeams()
      for (const t of localTeams) resolvableTeamIds.add(t.id)
    }

    if (options.existingPlayers) {
      for (const p of options.existingPlayers) resolvablePlayerIds.add(p.id)
    } else {
      const localPlayers = await playerRepository.listPlayers()
      for (const p of localPlayers) resolvablePlayerIds.add(p.id)
    }
  }

  for (const m of matches) {
    if (m.teamOneId && !resolvableTeamIds.has(m.teamOneId)) {
      throw new BackupValidationError(
        'VALIDATION_MISSING_REFERENCE',
        `Match ${m.matchId} references non-existent teamOneId: ${m.teamOneId}`
      )
    }
    if (m.teamTwoId && !resolvableTeamIds.has(m.teamTwoId)) {
      throw new BackupValidationError(
        'VALIDATION_MISSING_REFERENCE',
        `Match ${m.matchId} references non-existent teamTwoId: ${m.teamTwoId}`
      )
    }
  }

  for (const t of teams) {
    if (t.playerIds && Array.isArray(t.playerIds)) {
      for (const pid of t.playerIds) {
        if (!resolvablePlayerIds.has(pid)) {
          throw new BackupValidationError(
            'VALIDATION_MISSING_REFERENCE',
            `Team ${t.id} references non-existent playerId: ${pid}`
          )
        }
      }
    }
  }

  for (const p of players) {
    if (p.teamId && !resolvableTeamIds.has(p.teamId)) {
      throw new BackupValidationError(
        'VALIDATION_MISSING_REFERENCE',
        `Player ${p.id} references non-existent teamId: ${p.teamId}`
      )
    }
  }

  // Stage 10: Lifecycle & Domain Invariant Validation
  for (const m of matches) {
    if (m.status !== 'in_progress' && m.status !== 'completed' && m.status !== 'abandoned') {
      throw new BackupValidationError(
        'VALIDATION_INVALID_LIFECYCLE',
        `Match ${m.matchId} has invalid lifecycle status: ${String(m.status)}`
      )
    }

    if (m.status === 'completed') {
      if (!m.completedAt || typeof m.completedAt !== 'string' || m.completedAt.trim() === '') {
        throw new BackupValidationError(
          'VALIDATION_INVALID_LIFECYCLE',
          `Completed match ${m.matchId} is missing required completedAt timestamp`
        )
      }
      if (
        !m.matchResult ||
        typeof m.matchResult !== 'object' ||
        typeof m.matchResult.winner !== 'string'
      ) {
        throw new BackupValidationError(
          'VALIDATION_INVALID_LIFECYCLE',
          `Completed match ${m.matchId} is missing required matchResult`
        )
      }
    }

    if (m.status === 'in_progress') {
      if (!Array.isArray(m.history)) {
        throw new BackupValidationError(
          'VALIDATION_INVALID_LIFECYCLE',
          `In-progress match ${m.matchId} is missing required scoring history array`
        )
      }
      if (m.inningsNumber !== 1 && m.inningsNumber !== 2) {
        throw new BackupValidationError(
          'VALIDATION_INVALID_LIFECYCLE',
          `In-progress match ${m.matchId} has invalid inningsNumber: ${m.inningsNumber}`
        )
      }
    }

    if (m.status === 'abandoned') {
      if (!m.updatedAt || typeof m.updatedAt !== 'string' || m.updatedAt.trim() === '') {
        throw new BackupValidationError(
          'VALIDATION_INVALID_LIFECYCLE',
          `Abandoned match ${m.matchId} is missing required updatedAt timestamp`
        )
      }
    }
  }

  return raw as unknown as BackupSnapshot
}

export interface ExtendedRestoreOptions extends RestoreOptions {
  _injectFailureStore?: 'matches' | 'teams' | 'players'
}

/**
 * Restores a validated backup into IndexedDB using a single atomic readwrite transaction.
 * Strictly adheres to lifecycle precedence and transactional rollback invariants.
 */
export async function restoreBackup(
  backupInput: string | BackupSnapshot,
  options: ExtendedRestoreOptions = { mode: 'merge' }
): Promise<RestoreResult> {
  const mode: RestoreMode = options.mode ?? 'merge'

  // Pre-validate before touching IndexedDB
  const snapshot = await validateBackup(backupInput, { mode })

  const db = await openDatabase()

  return new Promise<RestoreResult>((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction([STORES.MATCHES, STORES.TEAMS, STORES.PLAYERS], 'readwrite')
    } catch (err) {
      return reject(new DatabaseError('Failed to initiate restore transaction', err))
    }

    let hasAborted = false
    const abortTx = (err: unknown) => {
      if (!hasAborted) {
        hasAborted = true
        try {
          tx.abort()
        } catch {
          // Already aborted
        }
        reject(err)
      }
    }

    tx.onerror = () => {
      abortTx(new DatabaseError('Restore transaction aborted due to error', tx.error))
    }

    tx.onabort = () => {
      abortTx(new DatabaseError('Restore transaction was aborted', tx.error))
    }

    const matchStore = tx.objectStore(STORES.MATCHES)
    const teamStore = tx.objectStore(STORES.TEAMS)
    const playerStore = tx.objectStore(STORES.PLAYERS)

    if (mode === 'replace') {
      // Clear all stores
      matchStore.clear()
      teamStore.clear()
      playerStore.clear()

      let matchesAdded = 0
      let teamsAdded = 0
      let playersAdded = 0

      // Put validated backup matches
      for (const m of snapshot.data.matches) {
        if (options._injectFailureStore === 'matches') {
          return abortTx(new Error('Simulated write failure in matches store'))
        }
        matchStore.put(m)
        matchesAdded++
      }

      // Put validated backup teams
      for (const t of snapshot.data.teams) {
        if (options._injectFailureStore === 'teams') {
          return abortTx(new Error('Simulated write failure in teams store'))
        }
        teamStore.put(t)
        teamsAdded++
      }

      // Put validated backup players
      for (const p of snapshot.data.players) {
        if (options._injectFailureStore === 'players') {
          return abortTx(new Error('Simulated write failure in players store'))
        }
        playerStore.put(p)
        playersAdded++
      }

      tx.oncomplete = () => {
        resolve({
          mode: 'replace',
          matchesAdded,
          matchesUpdated: 0,
          teamsAdded,
          teamsUpdated: 0,
          playersAdded,
          playersUpdated: 0,
          totalRestored: matchesAdded + teamsAdded + playersAdded,
        })
      }
    } else {
      // Merge mode: Read existing records in transaction to determine mutation set
      const matchReq = matchStore.getAll()
      const teamReq = teamStore.getAll()
      const playerReq = playerStore.getAll()

      let existingMatches: PersistedMatchRecord[] = []
      let existingTeams: PersistedTeamRecord[] = []
      let existingPlayers: PersistedPlayerRecord[] = []

      let completedReads = 0
      const onReadDone = async () => {
        completedReads++
        if (completedReads < 3) return

        existingMatches = (matchReq.result as PersistedMatchRecord[]) || []
        existingTeams = (teamReq.result as PersistedTeamRecord[]) || []
        existingPlayers = (playerReq.result as PersistedPlayerRecord[]) || []

        const localMatchMap = new Map(existingMatches.map((m) => [m.matchId, m]))
        const localTeamMap = new Map(existingTeams.map((t) => [t.id, t]))
        const localPlayerMap = new Map(existingPlayers.map((p) => [p.id, p]))

        let matchesAdded = 0
        let matchesUpdated = 0
        let teamsAdded = 0
        let teamsUpdated = 0
        let playersAdded = 0
        let playersUpdated = 0

        try {
          // Process Matches
          for (const backupMatch of snapshot.data.matches) {
            if (options._injectFailureStore === 'matches') {
              return abortTx(new Error('Simulated write failure in matches store'))
            }

            const localMatch = localMatchMap.get(backupMatch.matchId)
            if (!localMatch) {
              matchStore.put(backupMatch)
              matchesAdded++
              continue
            }

            // Conflict Resolution Matrix: in_progress < terminal (completed | abandoned)
            const isLocalTerminal =
              localMatch.status === 'completed' || localMatch.status === 'abandoned'
            const isBackupTerminal =
              backupMatch.status === 'completed' || backupMatch.status === 'abandoned'

            // Rule 1: Never downgrade terminal to in_progress
            if (isLocalTerminal && !isBackupTerminal) {
              continue // Keep local terminal
            }

            // Rule 2: Terminal supersedes in_progress
            if (!isLocalTerminal && isBackupTerminal) {
              matchStore.put(backupMatch)
              matchesUpdated++
              continue
            }

            // Rule 3: Active in_progress vs in_progress
            if (!isLocalTerminal && !isBackupTerminal) {
              if (options.overwriteActiveMatch) {
                const bTime = new Date(backupMatch.updatedAt).getTime()
                const lTime = new Date(localMatch.updatedAt).getTime()
                if (bTime >= lTime) {
                  matchStore.put(backupMatch)
                  matchesUpdated++
                }
              }
              // Else: local active match remains protected
              continue
            }

            // Rule 4: Both are terminal
            if (isLocalTerminal && isBackupTerminal) {
              const bTime = new Date(backupMatch.updatedAt).getTime()
              const lTime = new Date(localMatch.updatedAt).getTime()

              if (localMatch.status === backupMatch.status) {
                // Same terminal state: newer updatedAt wins
                if (bTime > lTime) {
                  matchStore.put(backupMatch)
                  matchesUpdated++
                }
              } else {
                // Completed vs Abandoned conflict
                if (bTime > lTime) {
                  matchStore.put(backupMatch)
                  matchesUpdated++
                } else if (bTime < lTime) {
                  // Local is newer: preserve local
                  continue
                } else {
                  // Timestamps are strictly equal: deterministic tie-break using canonical string comparison
                  const strLocal = canonicalize(localMatch)
                  const strBackup = canonicalize(backupMatch)

                  if (strBackup > strLocal) {
                    const resolvedMatch: PersistedMatchRecord = {
                      ...backupMatch,
                      syncError: 'CONFLICT_TERMINAL_TIE_RESOLVED',
                    }
                    matchStore.put(resolvedMatch)
                    matchesUpdated++
                  }
                  // Else local wins tie-break
                }
              }
            }
          }

          // Process Teams
          for (const backupTeam of snapshot.data.teams) {
            if (options._injectFailureStore === 'teams') {
              return abortTx(new Error('Simulated write failure in teams store'))
            }

            const localTeam = localTeamMap.get(backupTeam.id)
            if (!localTeam) {
              teamStore.put(backupTeam)
              teamsAdded++
            } else {
              const bTime = new Date(backupTeam.updatedAt).getTime()
              const lTime = new Date(localTeam.updatedAt).getTime()
              if (bTime > lTime) {
                teamStore.put(backupTeam)
                teamsUpdated++
              }
            }
          }

          // Process Players
          for (const backupPlayer of snapshot.data.players) {
            if (options._injectFailureStore === 'players') {
              return abortTx(new Error('Simulated write failure in players store'))
            }

            const localPlayer = localPlayerMap.get(backupPlayer.id)
            if (!localPlayer) {
              playerStore.put(backupPlayer)
              playersAdded++
            } else {
              const bTime = new Date(backupPlayer.updatedAt).getTime()
              const lTime = new Date(localPlayer.updatedAt).getTime()
              if (bTime > lTime) {
                playerStore.put(backupPlayer)
                playersUpdated++
              }
            }
          }

          tx.oncomplete = () => {
            resolve({
              mode: 'merge',
              matchesAdded,
              matchesUpdated,
              teamsAdded,
              teamsUpdated,
              playersAdded,
              playersUpdated,
              totalRestored:
                matchesAdded +
                matchesUpdated +
                teamsAdded +
                teamsUpdated +
                playersAdded +
                playersUpdated,
            })
          }
        } catch (err) {
          abortTx(err)
        }
      }

      matchReq.onsuccess = onReadDone
      teamReq.onsuccess = onReadDone
      playerReq.onsuccess = onReadDone
    }
  })
}

/**
 * Generates a deterministic, user-friendly backup filename with timestamp.
 * Format: scoremate_backup_YYYY-MM-DD_HH-mm-ss.json
 */
export function generateBackupFilename(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const yyyy = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const HH = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `scoremate_backup_${yyyy}-${MM}-${dd}_${HH}-${mm}-${ss}.json`
}

/**
 * Delivers a backup file to the user.
 * On web: Triggers browser download.
 * On native (Android/iOS): Saves to cache and opens system Share Sheet.
 * Kept strictly decoupled from database/snapshot creation logic.
 */
export async function triggerFileDownload(content: string, filename: string): Promise<void> {
  await deliverFile({
    filename,
    content,
    mimeType: 'application/json',
  })
}

/**
 * Creates a fresh snapshot and serializes it to formatted JSON without mutating IndexedDB.
 */
export async function exportBackupJson(options: CreateSnapshotOptions = {}): Promise<{
  snapshot: BackupSnapshot
  json: string
  filename: string
}> {
  const snapshot = await createSnapshot(options)
  const json = serializeSnapshot(snapshot)
  const filename = generateBackupFilename(new Date(snapshot.createdAt))
  return { snapshot, json, filename }
}

/**
 * Detects whether an unvalidated JSON payload represents a legacy GullyScorer backup.
 * Legacy formats:
 * 1) CompletedMatch[] (raw array of matches)
 * 2) { active?: string | SavedAppState | null, completed?: CompletedMatch[] }
 */
export function isLegacyBackup(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false

  // If already a v1 envelope, it's not legacy
  if ('$schema' in data || 'backupVersion' in data || 'integrity' in data) {
    return false
  }

  // Format 1: Raw array of completed matches
  if (Array.isArray(data)) {
    if (data.length === 0) return true
    const first = data[0]
    return Boolean(
      first &&
        typeof first === 'object' &&
        'teamOne' in first &&
        'teamTwo' in first &&
        ('result' in first || 'savedAt' in first)
    )
  }

  // Format 2: Object with completed array and/or active property
  const obj = data as Record<string, unknown>
  if ('completed' in obj || 'active' in obj) {
    if (obj.completed && !Array.isArray(obj.completed)) return false
    return true
  }

  return false
}

/**
 * Migrates legacy ScoreMate/GullyScorer backup payloads to canonical BackupSnapshot v1.
 * Preserves all original match IDs, dates, scores, and results, generating a valid v1 checksum.
 */
export async function migrateLegacyBackup(
  legacyData: unknown,
  options: { ownerUid?: string | null; deviceId?: string } = {}
): Promise<BackupSnapshot> {
  if (!isLegacyBackup(legacyData)) {
    throw new BackupValidationError(
      'VALIDATION_INVALID_ENTITY',
      'The provided data is not a recognizable legacy ScoreMate backup.'
    )
  }

  let completedList: CompletedMatch[] = []
  let activeData: unknown = null

  if (Array.isArray(legacyData)) {
    completedList = legacyData as CompletedMatch[]
  } else if (typeof legacyData === 'object' && legacyData !== null) {
    const obj = legacyData as Record<string, unknown>
    if (Array.isArray(obj.completed)) {
      completedList = obj.completed as CompletedMatch[]
    }
    if (obj.active) {
      if (typeof obj.active === 'string') {
        try {
          activeData = JSON.parse(obj.active)
        } catch {
          activeData = null
        }
      } else if (typeof obj.active === 'object') {
        activeData = obj.active
      }
    }
  }

  const matches: PersistedMatchRecord[] = []

  // 1. Migrate Completed Matches
  for (let idx = 0; idx < completedList.length; idx++) {
    const item = completedList[idx]
    if (!item || typeof item !== 'object') continue

    if (!item.teamOne || !item.teamTwo) {
      throw new BackupValidationError(
        'VALIDATION_INVALID_ENTITY',
        `Legacy completed match at index ${idx} is missing required team names.`
      )
    }

    const matchId = String(item.id || generateUUID())
    const savedAt = item.savedAt || new Date().toISOString()

    const matchRecord: PersistedMatchRecord = {
      schemaVersion: 1,
      matchId,
      status: 'completed',
      ownerUid: options.ownerUid ?? null,
      createdAt: savedAt,
      updatedAt: savedAt,
      completedAt: savedAt,
      teamOne: String(item.teamOne),
      teamTwo: String(item.teamTwo),
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
      score: item.secondInningsScore ?? null,
      history: [],
      inningsNumber: 2,
      firstBattingHome: item.firstBattingHome ?? true,
      firstInningsScore: item.firstInningsScore ?? null,
      matchResult: item.result ?? { winner: '', margin: '' },
      battingRoster: [],
      bowlingRoster: [],
      playerOfMatch: item.playerOfMatch,
    }

    matches.push(matchRecord)
  }

  // 2. Migrate Active In-Progress Match (if present)
  if (activeData && typeof activeData === 'object') {
    const state = activeData as SavedAppState
    if (state.teamOne && state.teamTwo) {
      const activeRecord: PersistedMatchRecord = {
        schemaVersion: 1,
        matchId: generateUUID(),
        status: 'in_progress',
        ownerUid: options.ownerUid ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        teamOne: String(state.teamOne),
        teamTwo: String(state.teamTwo),
        overs: String(state.overs || '8'),
        teamSize: String(state.teamSize || '11'),
        lastManBatting: Boolean(state.lastManBatting),
        venue: String(state.venue || ''),
        competition: String(state.competition || ''),
        tossCaller: state.tossCaller ?? null,
        tossCall: state.tossCall ?? null,
        tossWinner: state.tossWinner ?? null,
        decision: state.decision || 'bat',
        homePlayers: state.homePlayers || [],
        visitorPlayers: state.visitorPlayers || [],
        openingStriker: state.openingStriker || '',
        openingNonStriker: state.openingNonStriker || '',
        openingBowler: state.openingBowler || '',
        score: state.score ?? null,
        history: state.history || [],
        inningsNumber: state.inningsNumber || 1,
        firstBattingHome: state.firstBattingHome ?? true,
        firstInningsScore: state.firstInningsScore ?? null,
        matchResult: state.matchResult ?? null,
        battingRoster: state.battingRoster || [],
        bowlingRoster: state.bowlingRoster || [],
        screen: state.screen,
      }
      matches.push(activeRecord)
    }
  }

  const payload: BackupDataPayload = {
    matches,
    teams: [],
    players: [],
  }

  const checksum = await computeChecksum(payload)

  const integrity: BackupIntegrity = {
    algorithm: 'SHA-256',
    canonicalization: 'RFC-8785-ES6-KEY-SORT',
    checksum,
  }

  const metadata: BackupMetadata = {
    matchCount: matches.length,
    teamCount: 0,
    playerCount: 0,
    hasActiveMatch: matches.some((m) => m.status === 'in_progress'),
    databaseVersion: DB_VERSION,
  }

  const snapshot: BackupSnapshot = {
    $schema: BACKUP_SCHEMA_URL,
    backupVersion: BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    deviceId: options.deviceId || getOrCreateDeviceId(),
    provenanceOwnerUid: options.ownerUid ?? null,
    integrity,
    metadata,
    data: payload,
  }

  return snapshot
}

/**
 * High-level entry point for importing a local backup file (File, Blob, or JSON string).
 * Enforces the 50 MB size limit before reading/parsing, validates data completely,
 * automatically detects and migrates legacy formats, and restores into IndexedDB.
 */
export async function importBackupFile(
  fileOrContent: File | Blob | string,
  options: ExtendedRestoreOptions = { mode: 'merge' }
): Promise<RestoreResult> {
  let content: string

  // Size guard before processing
  if (typeof fileOrContent === 'object' && fileOrContent !== null && 'size' in fileOrContent) {
    const size = (fileOrContent as Blob).size
    if (size > MAX_BACKUP_SIZE_BYTES) {
      throw new BackupValidationError(
        'VALIDATION_FILE_TOO_LARGE',
        `File exceeds 50 MB limit (size: ${(size / 1024 / 1024).toFixed(2)} MB)`
      )
    }

    if (typeof (fileOrContent as Blob).text === 'function') {
      content = await (fileOrContent as Blob).text()
    } else {
      content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(fileOrContent as Blob)
      })
    }
  } else if (typeof fileOrContent === 'string') {
    if (fileOrContent.length > MAX_BACKUP_SIZE_BYTES) {
      throw new BackupValidationError(
        'VALIDATION_FILE_TOO_LARGE',
        `Content exceeds 50 MB limit (size: ${(fileOrContent.length / 1024 / 1024).toFixed(2)} MB)`
      )
    }
    content = fileOrContent
  } else {
    throw new BackupValidationError('VALIDATION_INVALID_JSON', 'Input must be a File, Blob, or JSON string.')
  }

  // Parse JSON syntax
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    throw new BackupValidationError('VALIDATION_INVALID_JSON', 'Backup content is not valid JSON', err)
  }

  // Migrate if legacy format
  let candidate: BackupSnapshot
  if (isLegacyBackup(parsed)) {
    candidate = await migrateLegacyBackup(parsed)
  } else {
    candidate = parsed as BackupSnapshot
  }

  // Validate and restore atomically
  return restoreBackup(candidate, options)
}

