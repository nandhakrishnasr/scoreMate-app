import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  type Firestore,
} from 'firebase/firestore'
import { firebaseApp } from './firebase.ts'
import type {
  PersistedMatchRecord,
  PersistedTeamRecord,
  PersistedPlayerRecord,
} from '../types/database.ts'

export class FirestoreError extends Error {
  readonly code?: string
  readonly cause?: unknown

  constructor(message: string, code?: string, cause?: unknown) {
    super(message)
    this.name = 'FirestoreError'
    this.code = code
    this.cause = cause
  }
}

// Canonical Firestore instance
export const firestoreDb: Firestore = getFirestore(firebaseApp)

// Pluggable adapter interface for modular testing and real Firestore operation
export interface FirestoreAdapter {
  getDoc(path: string, ...pathSegments: string[]): Promise<unknown | null>
  setDoc(data: Record<string, unknown>, path: string, ...pathSegments: string[]): Promise<void>
  listDocs(path: string, ...pathSegments: string[]): Promise<unknown[]>
}

// Default production Firestore adapter using modular Firebase JS SDK
const defaultAdapter: FirestoreAdapter = {
  async getDoc(path: string, ...pathSegments: string[]): Promise<unknown | null> {
    const docRef = doc(firestoreDb, path, ...pathSegments)
    const snapshot = await getDoc(docRef)
    return snapshot.exists() ? snapshot.data() : null
  },
  async setDoc(data: Record<string, unknown>, path: string, ...pathSegments: string[]): Promise<void> {
    const docRef = doc(firestoreDb, path, ...pathSegments)
    await setDoc(docRef, data, { merge: false })
  },
  async listDocs(path: string, ...pathSegments: string[]): Promise<unknown[]> {
    const colRef = collection(firestoreDb, path, ...pathSegments)
    const snapshot = await getDocs(colRef)
    return snapshot.docs.map((d) => d.data())
  },
}

let activeAdapter: FirestoreAdapter = defaultAdapter

export function setFirestoreAdapter(adapter: FirestoreAdapter | null): void {
  activeAdapter = adapter || defaultAdapter
}

/**
 * Strips local synchronization metadata prior to persisting into Firestore.
 * Keeps cloud document data strictly limited to canonical application state.
 */
export function stripSyncMetadata<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  const { lastSyncedAt, syncStatus, syncError, ...canonical } = record as Record<string, unknown>
  void lastSyncedAt
  void syncStatus
  void syncError
  return canonical
}

export const firestoreService = {
  // --- MATCHES: users/{uid}/matches/{matchId} ---

  async getMatch(uid: string, matchId: string): Promise<PersistedMatchRecord | null> {
    if (!uid || !matchId) return null
    try {
      const data = await activeAdapter.getDoc('users', uid, 'matches', matchId)
      return (data as PersistedMatchRecord) || null
    } catch (err) {
      throw new FirestoreError(`Failed to get match ${matchId} from Firestore`, 'GET_MATCH_FAILED', err)
    }
  },

  async setMatch(uid: string, matchId: string, record: PersistedMatchRecord): Promise<void> {
    if (!uid || !matchId) {
      throw new FirestoreError('Missing uid or matchId for setMatch', 'INVALID_ARGUMENT')
    }
    try {
      const canonical = stripSyncMetadata(record as unknown as Record<string, unknown>)
      await activeAdapter.setDoc(canonical, 'users', uid, 'matches', matchId)
    } catch (err) {
      throw new FirestoreError(`Failed to save match ${matchId} to Firestore`, 'SET_MATCH_FAILED', err)
    }
  },

  async listMatches(uid: string): Promise<PersistedMatchRecord[]> {
    if (!uid) return []
    try {
      const list = await activeAdapter.listDocs('users', uid, 'matches')
      return list as PersistedMatchRecord[]
    } catch (err) {
      throw new FirestoreError('Failed to list matches from Firestore', 'LIST_MATCHES_FAILED', err)
    }
  },

  // --- TEAMS: users/{uid}/teams/{teamId} ---

  async getTeam(uid: string, teamId: string): Promise<PersistedTeamRecord | null> {
    if (!uid || !teamId) return null
    try {
      const data = await activeAdapter.getDoc('users', uid, 'teams', teamId)
      return (data as PersistedTeamRecord) || null
    } catch (err) {
      throw new FirestoreError(`Failed to get team ${teamId} from Firestore`, 'GET_TEAM_FAILED', err)
    }
  },

  async setTeam(uid: string, teamId: string, record: PersistedTeamRecord): Promise<void> {
    if (!uid || !teamId) {
      throw new FirestoreError('Missing uid or teamId for setTeam', 'INVALID_ARGUMENT')
    }
    try {
      const canonical = stripSyncMetadata(record as unknown as Record<string, unknown>)
      await activeAdapter.setDoc(canonical, 'users', uid, 'teams', teamId)
    } catch (err) {
      throw new FirestoreError(`Failed to save team ${teamId} to Firestore`, 'SET_TEAM_FAILED', err)
    }
  },

  async listTeams(uid: string): Promise<PersistedTeamRecord[]> {
    if (!uid) return []
    try {
      const list = await activeAdapter.listDocs('users', uid, 'teams')
      return list as PersistedTeamRecord[]
    } catch (err) {
      throw new FirestoreError('Failed to list teams from Firestore', 'LIST_TEAMS_FAILED', err)
    }
  },

  // --- PLAYERS: users/{uid}/players/{playerId} ---

  async getPlayer(uid: string, playerId: string): Promise<PersistedPlayerRecord | null> {
    if (!uid || !playerId) return null
    try {
      const data = await activeAdapter.getDoc('users', uid, 'players', playerId)
      return (data as PersistedPlayerRecord) || null
    } catch (err) {
      throw new FirestoreError(`Failed to get player ${playerId} from Firestore`, 'GET_PLAYER_FAILED', err)
    }
  },

  async setPlayer(uid: string, playerId: string, record: PersistedPlayerRecord): Promise<void> {
    if (!uid || !playerId) {
      throw new FirestoreError('Missing uid or playerId for setPlayer', 'INVALID_ARGUMENT')
    }
    try {
      const canonical = stripSyncMetadata(record as unknown as Record<string, unknown>)
      await activeAdapter.setDoc(canonical, 'users', uid, 'players', playerId)
    } catch (err) {
      throw new FirestoreError(`Failed to save player ${playerId} to Firestore`, 'SET_PLAYER_FAILED', err)
    }
  },

  async listPlayers(uid: string): Promise<PersistedPlayerRecord[]> {
    if (!uid) return []
    try {
      const list = await activeAdapter.listDocs('users', uid, 'players')
      return list as PersistedPlayerRecord[]
    } catch (err) {
      throw new FirestoreError('Failed to list players from Firestore', 'LIST_PLAYERS_FAILED', err)
    }
  },
}
