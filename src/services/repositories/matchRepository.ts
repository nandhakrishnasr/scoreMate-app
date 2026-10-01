import { STORES, type MatchLifecycleStatus, type PersistedMatchRecord } from '../../types/database.ts'
import { withTransaction, openDatabase, DatabaseError } from '../localDatabase.ts'

export const matchRepository = {
  async saveMatch(record: PersistedMatchRecord): Promise<void> {
    const updatedRecord: PersistedMatchRecord = {
      ...record,
      updatedAt: record.updatedAt || new Date().toISOString(),
    }
    await withTransaction(STORES.MATCHES, 'readwrite', (store) => {
      return store.put(updatedRecord)
    })
  },

  async getMatch(matchId: string): Promise<PersistedMatchRecord | null> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.MATCHES, 'readonly')
      const store = transaction.objectStore(STORES.MATCHES)
      const request = store.get(matchId)

      request.onsuccess = () => {
        resolve((request.result as PersistedMatchRecord) || null)
      }
      request.onerror = () => {
        reject(new DatabaseError(`Failed to retrieve match ${matchId}`, request.error))
      }
    })
  },

  async updateMatch(
    matchId: string,
    updates: Partial<PersistedMatchRecord>
  ): Promise<void> {
    const existing = await this.getMatch(matchId)
    if (!existing) {
      throw new DatabaseError(`Cannot update match ${matchId}: record not found`)
    }

    const merged: PersistedMatchRecord = {
      ...existing,
      ...updates,
      matchId, // Keep immutable
      updatedAt: new Date().toISOString(),
    }

    await withTransaction(STORES.MATCHES, 'readwrite', (store) => {
      return store.put(merged)
    })
  },

  async deleteMatch(matchId: string): Promise<void> {
    await withTransaction(STORES.MATCHES, 'readwrite', (store) => {
      return store.delete(matchId)
    })
  },

  async listMatches(filter?: {
    status?: MatchLifecycleStatus
    ownerUid?: string | null
  }): Promise<PersistedMatchRecord[]> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.MATCHES, 'readonly')
      const store = transaction.objectStore(STORES.MATCHES)

      let request: IDBRequest<PersistedMatchRecord[]>
      if (filter?.status) {
        const index = store.index('status')
        request = index.getAll(filter.status)
      } else {
        request = store.getAll()
      }

      request.onsuccess = () => {
        let results = (request.result as PersistedMatchRecord[]) || []
        if (filter?.ownerUid !== undefined) {
          results = results.filter((m) => m.ownerUid === filter.ownerUid)
        }
        // Sort by updatedAt desc
        results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        resolve(results)
      }
      request.onerror = () => {
        reject(new DatabaseError('Failed to list matches', request.error))
      }
    })
  },

  async getActiveMatch(): Promise<PersistedMatchRecord | null> {
    const activeList = await this.listMatches({ status: 'in_progress' })
    return activeList[0] || null
  },

  async markMatchAbandoned(matchId: string): Promise<void> {
    const match = await this.getMatch(matchId)
    if (!match) return
    match.status = 'abandoned'
    match.updatedAt = new Date().toISOString()
    await withTransaction(STORES.MATCHES, 'readwrite', (store) => {
      return store.put(match)
    })
  },
}
