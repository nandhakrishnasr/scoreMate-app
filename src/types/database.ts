import type {
  ScoreState,
  CompletedMatch,
  MatchResult,
  SquadPlayer,
  Screen,
  PlayerOfMatch,
} from './match.ts'

export const DB_NAME = 'scoremate_local_db'
export const DB_VERSION = 2

export const STORES = {
  MATCHES: 'matches',
  TEAMS: 'teams',
  PLAYERS: 'players',
  SETTINGS: 'settings',
} as const

export interface PersistedSettingRecord<T = unknown> {
  key: string
  value: T
  updatedAt: string
}

export type MatchLifecycleStatus = 'in_progress' | 'completed' | 'abandoned'
export type SyncStatus = 'pending' | 'synced' | 'error'

export interface PersistedMatchRecord {
  schemaVersion: number
  matchId: string
  status: MatchLifecycleStatus
  ownerUid: string | null
  createdAt: string
  updatedAt: string
  completedAt?: string | null

  // Core setup and metadata
  teamOne: string
  teamTwo: string
  teamOneId?: string
  teamTwoId?: string
  overs: string
  teamSize: string
  lastManBatting: boolean
  venue: string
  competition: string
  tossCaller: 'host' | 'visitor' | null
  tossCall: 'Heads' | 'Tails' | null
  tossWinner: 'host' | 'visitor' | null
  decision: 'bat' | 'bowl'

  // Squads and opening assignments
  homePlayers: SquadPlayer[]
  visitorPlayers: SquadPlayer[]
  openingStriker: string
  openingNonStriker: string
  openingBowler: string

  // Dynamic scoring state
  score: ScoreState | null
  history: ScoreState[]
  inningsNumber: 1 | 2
  firstBattingHome: boolean
  firstInningsScore: ScoreState | null
  matchResult: MatchResult | null
  battingRoster: SquadPlayer[]
  bowlingRoster: SquadPlayer[]

  // Screen state for recovery
  screen?: Screen
  playerOfMatch?: PlayerOfMatch

  // Local synchronization metadata (not stored as canonical cloud data)
  lastSyncedAt?: string | null
  syncStatus?: SyncStatus
  syncError?: string | null
}

export interface PersistedTeamRecord {
  schemaVersion: number
  id: string
  name: string
  ownerUid: string | null
  createdAt: string
  updatedAt: string
  image?: string
  playerIds?: string[]

  // Local synchronization metadata
  lastSyncedAt?: string | null
  syncStatus?: SyncStatus
  syncError?: string | null
}

export interface PersistedPlayerRecord {
  schemaVersion: number
  id: string
  name: string
  hand: 'Right' | 'Left'
  ownerUid: string | null
  teamId?: string
  image?: string
  createdAt: string
  updatedAt: string

  // Local synchronization metadata
  lastSyncedAt?: string | null
  syncStatus?: SyncStatus
  syncError?: string | null
}

export function toCompletedMatch(record: PersistedMatchRecord): CompletedMatch {
  return {
    id: record.matchId,
    savedAt: record.completedAt ?? record.updatedAt,
    teamOne: record.teamOne,
    teamTwo: record.teamTwo,
    firstBattingHome: record.firstBattingHome,
    firstInningsScore: record.firstInningsScore,
    secondInningsScore: record.score,
    result: record.matchResult ?? { winner: '', margin: '' },
    playerOfMatch: record.playerOfMatch,
    venue: record.venue,
    competition: record.competition,
  }
}

// Backup & Snapshot Type Definitions (Phase 4)
export interface BackupIntegrity {
  algorithm: 'SHA-256'
  canonicalization: 'RFC-8785-ES6-KEY-SORT'
  checksum: string
}

export interface BackupMetadata {
  matchCount: number
  teamCount: number
  playerCount: number
  hasActiveMatch: boolean
  databaseVersion: number
}

export interface BackupDataPayload {
  matches: PersistedMatchRecord[]
  teams: PersistedTeamRecord[]
  players: PersistedPlayerRecord[]
}

export interface BackupSnapshot {
  $schema: string
  backupVersion: number
  appVersion: string
  createdAt: string
  deviceId: string
  provenanceOwnerUid: string | null
  integrity: BackupIntegrity
  metadata: BackupMetadata
  data: BackupDataPayload
}

export type RestoreMode = 'merge' | 'replace'

export interface RestoreOptions {
  mode: RestoreMode
  overwriteActiveMatch?: boolean
}

export interface RestoreResult {
  mode: RestoreMode
  matchesAdded: number
  matchesUpdated: number
  teamsAdded: number
  teamsUpdated: number
  playersAdded: number
  playersUpdated: number
  totalRestored: number
}

export type BackupValidationErrorCode =
  | 'VALIDATION_FILE_TOO_LARGE'
  | 'VALIDATION_INVALID_JSON'
  | 'VALIDATION_INVALID_ENVELOPE'
  | 'VALIDATION_UNSUPPORTED_VERSION'
  | 'VALIDATION_INVALID_INTEGRITY'
  | 'VALIDATION_CHECKSUM_MISMATCH'
  | 'VALIDATION_INVALID_ENTITY'
  | 'VALIDATION_DUPLICATE_ID'
  | 'VALIDATION_MISSING_REFERENCE'
  | 'VALIDATION_INVALID_LIFECYCLE'

export class BackupValidationError extends Error {
  readonly code: BackupValidationErrorCode
  readonly details?: unknown

  constructor(code: BackupValidationErrorCode, message: string, details?: unknown) {
    super(`[${code}] ${message}`)
    this.name = 'BackupValidationError'
    this.code = code
    this.details = details
  }
}

export interface LegacyBackupPayload {
  active?: string | Record<string, unknown> | null
  completed?: CompletedMatch[]
}



