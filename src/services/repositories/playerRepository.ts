import { STORES, type PersistedPlayerRecord } from '../../types/database.ts'
import { withTransaction, openDatabase, DatabaseError } from '../localDatabase.ts'

export const playerRepository = {
  async savePlayer(player: PersistedPlayerRecord): Promise<void> {
    const record: PersistedPlayerRecord = {
      ...player,
      updatedAt: player.updatedAt || new Date().toISOString(),
    }
    await withTransaction(STORES.PLAYERS, 'readwrite', (store) => {
      return store.put(record)
    })
  },

  async getPlayer(playerId: string): Promise<PersistedPlayerRecord | null> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PLAYERS, 'readonly')
      const store = transaction.objectStore(STORES.PLAYERS)
      const request = store.get(playerId)

      request.onsuccess = () => {
        resolve((request.result as PersistedPlayerRecord) || null)
      }
      request.onerror = () => {
        reject(new DatabaseError(`Failed to retrieve player ${playerId}`, request.error))
      }
    })
  },

  async getPlayerByName(name: string): Promise<PersistedPlayerRecord | null> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PLAYERS, 'readonly')
      const store = transaction.objectStore(STORES.PLAYERS)
      const index = store.index('name')
      const request = index.get(name)

      request.onsuccess = () => {
        resolve((request.result as PersistedPlayerRecord) || null)
      }
      request.onerror = () => {
        reject(new DatabaseError(`Failed to get player by name ${name}`, request.error))
      }
    })
  },

  async listPlayers(filter?: {
    teamId?: string
    ownerUid?: string | null
  }): Promise<PersistedPlayerRecord[]> {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PLAYERS, 'readonly')
      const store = transaction.objectStore(STORES.PLAYERS)

      let request: IDBRequest<PersistedPlayerRecord[]>
      if (filter?.teamId) {
        const index = store.index('teamId')
        request = index.getAll(filter.teamId)
      } else {
        request = store.getAll()
      }

      request.onsuccess = () => {
        let results = (request.result as PersistedPlayerRecord[]) || []
        if (filter?.ownerUid !== undefined) {
          results = results.filter((p) => p.ownerUid === filter.ownerUid)
        }
        results.sort((a, b) => a.name.localeCompare(b.name))
        resolve(results)
      }
      request.onerror = () => {
        reject(new DatabaseError('Failed to list players', request.error))
      }
    })
  },

  async deletePlayer(playerId: string): Promise<void> {
    await withTransaction(STORES.PLAYERS, 'readwrite', (store) => {
      return store.delete(playerId)
    })
  },
}
